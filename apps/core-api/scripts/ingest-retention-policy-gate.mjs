import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const connectionString = resolveOpsDbUrl(process.env);
const requiredNonceTtlMinutes = readNumber("GATE_RETENTION_REQUIRED_NONCE_TTL_MINUTES", 10, 1);
const requiredIdempotencyTtlDays = readNumber("GATE_RETENTION_REQUIRED_IDEMPOTENCY_TTL_DAYS", 35, 1);
const requiredDlqRetentionDays = readNumber("GATE_RETENTION_REQUIRED_DLQ_RETENTION_DAYS", 30, 1);
const maxStaleDlqRows = readNumber("GATE_RETENTION_MAX_STALE_DLQ_ROWS", 0, 0);
const maxStaleIngestRows = readNumber("GATE_RETENTION_MAX_STALE_INGEST_ROWS", 0, 0);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-retention-policy");

function readNumber(key, fallback, minValue) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue) {
    throw new Error(`${key} must be a number >= ${minValue}`);
  }
  return value;
}

function readBoolean(raw, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const reportPath = path.join(reportRootDir, `${nowTimestampForFile()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function queryMetrics(client, idempotencyTtlDays, dlqRetentionDays) {
  const staleDlqResult = await client.query(
    `
      select count(*)::int as count
      from ingest_dead_letter
      where status in ('RESOLVED', 'SUCCEEDED', 'CLOSED', 'FAILED')
        and updated_at < now() - ($1::int * interval '1 day')
    `,
    [dlqRetentionDays]
  );

  const staleIngestResult = await client.query(
    `
      select count(*)::int as count
      from ingest_event_log l
      where l.created_at < now() - ($1::int * interval '1 day')
        and l.process_status in ('DONE', 'FAILED')
        and not exists (
          select 1
          from ingest_dead_letter d
          where d.event_key = l.event_key
        )
    `,
    [idempotencyTtlDays]
  );

  return {
    staleDlqRows: toNumber(staleDlqResult.rows[0]?.count),
    staleIngestRows: toNumber(staleIngestResult.rows[0]?.count)
  };
}

async function run() {
  if (!connectionString) {
    throw new Error("Missing OPS_DB_URL environment variable (or legacy DATABASE_URL)");
  }

  const startedAt = new Date().toISOString();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const retentionEnabled = readBoolean(process.env.INGEST_RETENTION_ENABLED, true);
    const configuredNonceTtlMinutes = readNumber("INGEST_NONCE_TTL_MINUTES", 10, 1);
    const configuredIdempotencyTtlDays = readNumber("INGEST_IDEMPOTENCY_TTL_DAYS", 35, 1);
    const configuredDlqRetentionDays = readNumber("INGEST_DLQ_RETENTION_DAYS", 30, 1);
    const metrics = await queryMetrics(
      client,
      configuredIdempotencyTtlDays,
      configuredDlqRetentionDays
    );

    const failures = [];
    if (!retentionEnabled) {
      failures.push("INGEST_RETENTION_ENABLED=false");
    }
    if (configuredNonceTtlMinutes !== requiredNonceTtlMinutes) {
      failures.push(
        `nonce_ttl_minutes=${configuredNonceTtlMinutes} expected=${requiredNonceTtlMinutes}`
      );
    }
    if (configuredIdempotencyTtlDays !== requiredIdempotencyTtlDays) {
      failures.push(
        `idempotency_ttl_days=${configuredIdempotencyTtlDays} expected=${requiredIdempotencyTtlDays}`
      );
    }
    if (configuredDlqRetentionDays !== requiredDlqRetentionDays) {
      failures.push(
        `dlq_retention_days=${configuredDlqRetentionDays} expected=${requiredDlqRetentionDays}`
      );
    }
    if (metrics.staleDlqRows > maxStaleDlqRows) {
      failures.push(`stale_dlq_rows=${metrics.staleDlqRows} exceeds max=${maxStaleDlqRows}`);
    }
    if (metrics.staleIngestRows > maxStaleIngestRows) {
      failures.push(
        `stale_ingest_rows=${metrics.staleIngestRows} exceeds max=${maxStaleIngestRows}`
      );
    }

    const report = {
      gate: "F-05_RETENTION_POLICY_ACTIVE",
      startedAt,
      endedAt: new Date().toISOString(),
      config: {
        requiredNonceTtlMinutes,
        requiredIdempotencyTtlDays,
        requiredDlqRetentionDays,
        maxStaleDlqRows,
        maxStaleIngestRows
      },
      summary: {
        retentionEnabled,
        configuredNonceTtlMinutes,
        configuredIdempotencyTtlDays,
        configuredDlqRetentionDays,
        staleDlqRows: metrics.staleDlqRows,
        staleIngestRows: metrics.staleIngestRows
      },
      result: failures.length === 0 ? "PASS" : "FAIL",
      failures
    };

    const reportPath = await writeReport(report);
    console.log(`GATE_RESULT=${report.result}`);
    console.log(`GATE_REPORT_JSON=${reportPath}`);
    console.log(`RETENTION_ENABLED=${retentionEnabled ? "true" : "false"}`);
    console.log(`STALE_DLQ_ROWS=${metrics.staleDlqRows}`);
    console.log(`STALE_INGEST_ROWS=${metrics.staleIngestRows}`);

    if (report.result !== "PASS") {
      for (const failure of failures) {
        console.error(`FAILURE=${failure}`);
      }
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const startedAt = new Date().toISOString();
  const report = {
    gate: "F-05_RETENTION_POLICY_ACTIVE",
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      requiredNonceTtlMinutes,
      requiredIdempotencyTtlDays,
      requiredDlqRetentionDays,
      maxStaleDlqRows,
      maxStaleIngestRows
    },
    summary: null,
    result: "FAIL",
    failures: [message]
  };

  writeReport(report)
    .then((reportPath) => {
      console.log("GATE_RESULT=FAIL");
      console.log(`GATE_REPORT_JSON=${reportPath}`);
      console.error(`FAILURE=${message}`);
      process.exit(1);
    })
    .catch(() => {
      console.error(`GATE_RESULT=FAIL ${message}`);
      process.exit(1);
    });
});
