import { readFileSync } from "fs";
import { mkdir, readdir, writeFile } from "fs/promises";
import { createHash, randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const SCRIPT_ORDER = [
  "000_precheck_readiness.sql",
  "001_create_core_bridge_tables.sql",
  "002_add_indexes_and_unique_constraints.sql",
  "003_seed_required_enums_and_checks.sql",
  "010_seed_channel_registry.sql",
  "011_seed_status_dictionary.sql",
  "012_seed_package_ref_type_dictionary.sql",
  "090_postcheck_reconciliation.sql",
  "091_retention_cleanup.sql"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const phase2Dir = path.resolve(__dirname, "../../../doc/sql-templates/phase2");
const reconRootDir = path.resolve(__dirname, "../../../reports/recon");

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumberOrNull(raw) {
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function applyPrecheckInputs(sqlText) {
  const diskTotalBytes = toNumberOrNull(process.env.PRECHECK_DISK_TOTAL_BYTES);
  const diskUsedBytes = toNumberOrNull(process.env.PRECHECK_DISK_USED_BYTES);

  const totalReplacement = diskTotalBytes === null ? "null" : String(diskTotalBytes);
  const usedReplacement = diskUsedBytes === null ? "null" : String(diskUsedBytes);

  return sqlText
    .replace(/null::numeric as disk_total_bytes/gi, `${totalReplacement}::numeric as disk_total_bytes`)
    .replace(/null::numeric as disk_used_bytes/gi, `${usedReplacement}::numeric as disk_used_bytes`);
}

async function validateSqlDirectory() {
  const files = await readdir(phase2Dir);
  for (const fileName of SCRIPT_ORDER) {
    if (!files.includes(fileName)) {
      throw new Error(`Missing SQL template: ${fileName}`);
    }
  }
}

async function getScriptList() {
  await validateSqlDirectory();

  const include = process.env.PHASE2_INCLUDE_SCRIPTS;
  if (!include) {
    return SCRIPT_ORDER;
  }

  const selected = include
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const invalid = selected.filter((item) => !SCRIPT_ORDER.includes(item));
  if (invalid.length > 0) {
    throw new Error(`Unknown script(s): ${invalid.join(", ")}`);
  }

  return SCRIPT_ORDER.filter((item) => selected.includes(item));
}

function createMarkdownReport(report, jsonReportRelativePath) {
  const lines = [];
  lines.push(`# Phase-2 Migration Report`);
  lines.push("");
  lines.push(`- batch: ${report.batchCode}`);
  lines.push(`- timestamp: ${report.timestamp}`);
  lines.push(`- mode: ${report.mode}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonReportRelativePath}`);
  lines.push("");
  lines.push(`## Precheck`);
  lines.push("");
  if (report.precheck) {
    lines.push(`- long transactions: ${report.precheck.longTxnCount}`);
    lines.push(`- blocking locks: ${report.precheck.blockingPairCount}`);
    lines.push(`- storage status: ${report.precheck.storageStatus}`);
    lines.push(`- free percent: ${report.precheck.freePercent ?? "n/a"}`);
  } else {
    lines.push(`- skipped`);
  }
  lines.push("");
  lines.push("## Scripts");
  lines.push("");

  for (const item of report.scripts) {
    lines.push(
      `- ${item.scriptName}: ${item.status} (checksum=${item.checksum}, durationMs=${item.durationMs})`
    );
    if (item.errorMessage) {
      lines.push(`  error: ${item.errorMessage}`);
    }
  }
  lines.push("");
  if (report.errorMessage) {
    lines.push("## Error");
    lines.push("");
    lines.push(`- ${report.errorMessage}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function writeReconReport(report) {
  const batchDir = path.join(reconRootDir, report.batchCode);
  await mkdir(batchDir, { recursive: true });

  const jsonPath = path.join(batchDir, `${report.timestamp}.json`);
  const markdownPath = path.join(batchDir, `${report.timestamp}.md`);
  const jsonRelative = path.relative(path.resolve(__dirname, "../../../"), jsonPath).replace(/\\/g, "/");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${createMarkdownReport(report, jsonRelative)}\n`, "utf8");

  return {
    jsonPath,
    markdownPath
  };
}

async function hasMigrationRunLog(client) {
  const result = await client.query(
    "select to_regclass('public.migration_run_log')::text as table_name"
  );
  return Boolean(result.rows[0]?.table_name);
}

async function logRunStart(client, metadata) {
  const available = await hasMigrationRunLog(client);
  if (!available) {
    return null;
  }

  const runKey = randomUUID();
  await client.query(
    `
      insert into migration_run_log (
        run_key,
        batch_code,
        script_name,
        script_checksum,
        run_status,
        started_at
      ) values ($1, $2, $3, $4, $5, now())
    `,
    [runKey, metadata.batchCode, metadata.scriptName, metadata.checksum, "STARTED"]
  );
  return runKey;
}

async function logRunFinish(client, runKey, status, errorMessage) {
  if (!runKey) {
    return;
  }

  await client.query(
    `
      update migration_run_log
      set run_status = $2,
          ended_at = now(),
          error_message = $3
      where run_key = $1
    `,
    [runKey, status, errorMessage]
  );
}

function readSql(scriptName) {
  const filePath = path.join(phase2Dir, scriptName);
  const rawSql = readFileSync(filePath, "utf8");
  const sql = scriptName === "000_precheck_readiness.sql" ? applyPrecheckInputs(rawSql) : rawSql;

  return {
    filePath,
    scriptName,
    sql,
    checksum: sha256Hex(sql)
  };
}

async function runReadinessChecks(client) {
  const longTxnResult = await client.query(`
    with long_txn as (
      select pid
      from pg_stat_activity
      where xact_start is not null
        and now() - xact_start > interval '15 minutes'
    )
    select count(*)::int as long_txn_count
    from long_txn
  `);

  const blockingResult = await client.query(`
    with blocking_pairs as (
      select
        blocked.pid as blocked_pid,
        blocker.pid as blocker_pid
      from pg_locks blocked
      join pg_locks blocker
        on blocked.locktype = blocker.locktype
       and blocked.database is not distinct from blocker.database
       and blocked.relation is not distinct from blocker.relation
       and blocked.page is not distinct from blocker.page
       and blocked.tuple is not distinct from blocker.tuple
       and blocked.virtualxid is not distinct from blocker.virtualxid
       and blocked.transactionid is not distinct from blocker.transactionid
       and blocked.classid is not distinct from blocker.classid
       and blocked.objid is not distinct from blocker.objid
       and blocked.objsubid is not distinct from blocker.objsubid
       and blocked.pid <> blocker.pid
      where not blocked.granted
        and blocker.granted
    )
    select count(*)::int as blocking_pair_count
    from blocking_pairs
  `);

  const diskTotalBytes = toNumberOrNull(process.env.PRECHECK_DISK_TOTAL_BYTES);
  const diskUsedBytes = toNumberOrNull(process.env.PRECHECK_DISK_USED_BYTES);
  let storageStatus = "SKIPPED_INPUT_REQUIRED";
  let freePercent = null;

  if (diskTotalBytes !== null && diskUsedBytes !== null && diskTotalBytes > 0) {
    const diskFreeBytes = Math.max(diskTotalBytes - diskUsedBytes, 0);
    freePercent = Math.round((diskFreeBytes / diskTotalBytes) * 10000) / 100;
    storageStatus = freePercent >= 30 ? "PASS" : "FAIL_FREE_LT_30_PERCENT";
  }

  const longTxnCount = longTxnResult.rows[0]?.long_txn_count ?? 0;
  const blockingPairCount = blockingResult.rows[0]?.blocking_pair_count ?? 0;

  if (longTxnCount > 0) {
    throw new Error(`Precheck failed: long transaction count is ${longTxnCount}`);
  }
  if (blockingPairCount > 0) {
    throw new Error(`Precheck failed: blocking lock count is ${blockingPairCount}`);
  }
  if (storageStatus !== "PASS") {
    throw new Error(
      `Precheck failed: storage status ${storageStatus}. Set PRECHECK_DISK_TOTAL_BYTES and PRECHECK_DISK_USED_BYTES with >=30% free space`
    );
  }

  return {
    longTxnCount,
    blockingPairCount,
    storageStatus,
    freePercent
  };
}

function printDryRunDetails(scripts) {
  console.log("PHASE2_DRY_RUN=true");
  console.log(`SQL_DIR=${phase2Dir}`);
  for (const scriptName of scripts) {
    const loaded = readSql(scriptName);
    console.log(`${loaded.scriptName} checksum=${loaded.checksum}`);
  }
}

async function run() {
  const scripts = await getScriptList();
  const dryRun = process.env.PHASE2_DRY_RUN === "true";
  const timestamp = nowTimestampForFile();
  const batchCode = process.env.PHASE2_BATCH_CODE || "phase2";

  const report = {
    batchCode,
    timestamp,
    mode: dryRun ? "dry-run" : "execute",
    result: "PASS",
    precheck: null,
    scripts: [],
    errorMessage: null
  };

  if (dryRun) {
    printDryRunDetails(scripts);
    for (const scriptName of scripts) {
      const loaded = readSql(scriptName);
      report.scripts.push({
        scriptName: loaded.scriptName,
        checksum: loaded.checksum,
        status: "DRY_RUN",
        durationMs: 0,
        errorMessage: null
      });
    }
    const paths = await writeReconReport(report);
    console.log(`REPORT_JSON=${paths.jsonPath}`);
    console.log(`REPORT_MD=${paths.markdownPath}`);
    return;
  }

  const connectionString = resolveOpsDbUrl(process.env);
  if (!connectionString) {
    throw new Error("Missing OPS_DB_URL environment variable (or legacy DATABASE_URL)");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const precheck = await runReadinessChecks(client);
    report.precheck = precheck;
    console.log(
      `Precheck PASS long_txn=${precheck.longTxnCount} blocking_locks=${precheck.blockingPairCount} free_percent=${precheck.freePercent}`
    );

    for (const scriptName of scripts) {
      const loaded = readSql(scriptName);
      const batchCode = loaded.scriptName.split("_")[0];
      const startedAt = Date.now();
      const runKey = await logRunStart(client, {
        batchCode,
        scriptName: loaded.scriptName,
        checksum: loaded.checksum
      });

      try {
        await client.query(loaded.sql);
        await logRunFinish(client, runKey, "SUCCEEDED", null);
        console.log(`PASS ${loaded.scriptName}`);
        report.scripts.push({
          scriptName: loaded.scriptName,
          checksum: loaded.checksum,
          status: "PASS",
          durationMs: Date.now() - startedAt,
          errorMessage: null
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "UNKNOWN_SQL_ERROR";
        await logRunFinish(client, runKey, "FAILED", errorMessage);
        report.result = "FAIL";
        report.errorMessage = `Script failed: ${loaded.scriptName} -> ${errorMessage}`;
        report.scripts.push({
          scriptName: loaded.scriptName,
          checksum: loaded.checksum,
          status: "FAIL",
          durationMs: Date.now() - startedAt,
          errorMessage
        });
        throw new Error(`Script failed: ${loaded.scriptName} -> ${errorMessage}`);
      }
    }
  } catch (error) {
    report.result = "FAIL";
    report.errorMessage = error instanceof Error ? error.message : "PHASE2_MIGRATION_FAILED";
    throw error;
  } finally {
    const paths = await writeReconReport(report);
    console.log(`REPORT_JSON=${paths.jsonPath}`);
    console.log(`REPORT_MD=${paths.markdownPath}`);
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
