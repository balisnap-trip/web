import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const connectionString = resolveOpsDbUrl(process.env);
const batchCode = process.env.PHASE2_BATCH_CODE || "D";
const maxPaxMismatchRatioPercent = readNumber("GATE_BOOKING_MAX_PAX_MISMATCH_RATIO_PERCENT", 1, 0);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/booking-bridge");

function readNumber(key, fallback, minValue) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue) {
    throw new Error(`${key} must be >= ${minValue}`);
  }
  return value;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Booking Bridge Gate Report (Batch D)");
  lines.push("");
  lines.push(`- batch: ${report.batchCode}`);
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const item of report.checks) {
    lines.push(`| ${item.name} | ${item.passed ? "PASS" : "FAIL"} | ${item.detail} |`);
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.metrics, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(reportRootDir, `${stamp}.json`);
  const mdPath = path.join(reportRootDir, `${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");
  return { jsonPath, mdPath };
}

async function queryMetrics(client) {
  const [totalsResult, duplicateResult, nullCriticalResult, packageRefResult, paxMismatchResult] =
    await Promise.all([
      client.query(`
        select count(*)::int as total_bookings
        from booking_core
      `),
      client.query(`
        with duplicate_groups as (
          select channel_code, external_booking_ref, count(*)::int as total_rows
          from booking_core
          group by channel_code, external_booking_ref
          having count(*) > 1
        )
        select
          count(*)::int as duplicate_groups,
          coalesce(sum(total_rows - 1), 0)::int as duplicate_excess_rows
        from duplicate_groups
      `),
      client.query(`
        select count(*)::int as null_critical_rows
        from booking_core
        where channel_code is null
           or external_booking_ref is null
      `),
      client.query(`
        select count(*)::int as package_ref_type_null_rows
        from booking_core
        where package_ref_type is null
           or btrim(package_ref_type) = ''
      `),
      client.query(`
        with item_pax as (
          select
            booking_key,
            coalesce(sum(coalesce(adult_qty, 0) + coalesce(child_qty, 0)), 0)::int as item_pax
          from booking_item_snapshot
          group by booking_key
        )
        select
          count(*)::int as denominator_rows,
          count(*) filter (
            where abs(
              (coalesce(b.number_of_adult, 0) + coalesce(b.number_of_child, 0))
              - coalesce(i.item_pax, 0)
            ) > 0
          )::int as mismatch_rows
        from booking_core b
        left join item_pax i on i.booking_key = b.booking_key
      `)
    ]);

  const totalBookings = toNumber(totalsResult.rows[0]?.total_bookings);
  const duplicateGroups = toNumber(duplicateResult.rows[0]?.duplicate_groups);
  const duplicateExcessRows = toNumber(duplicateResult.rows[0]?.duplicate_excess_rows);
  const nullCriticalRows = toNumber(nullCriticalResult.rows[0]?.null_critical_rows);
  const packageRefTypeNullRows = toNumber(packageRefResult.rows[0]?.package_ref_type_null_rows);
  const paxMismatchDenominator = toNumber(paxMismatchResult.rows[0]?.denominator_rows);
  const paxMismatchRows = toNumber(paxMismatchResult.rows[0]?.mismatch_rows);
  const paxMismatchRatioPercent =
    paxMismatchDenominator > 0
      ? Number(((paxMismatchRows / paxMismatchDenominator) * 100).toFixed(2))
      : null;

  return {
    totalBookings,
    duplicateGroups,
    duplicateExcessRows,
    nullCriticalRows,
    packageRefTypeNullRows,
    paxMismatchRows,
    paxMismatchDenominator,
    paxMismatchRatioPercent
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
    const metrics = await queryMetrics(client);

    const d01Passed = metrics.duplicateGroups === 0 && metrics.duplicateExcessRows === 0;
    const d02Passed = metrics.nullCriticalRows === 0;
    const d03Passed =
      metrics.paxMismatchDenominator > 0 &&
      metrics.paxMismatchRatioPercent !== null &&
      metrics.paxMismatchRatioPercent <= maxPaxMismatchRatioPercent;
    const d04Passed = metrics.packageRefTypeNullRows === 0;

    const checks = [
      check(
        "D-01_duplicate_booking_identity",
        d01Passed,
        `groups=${metrics.duplicateGroups}, excessRows=${metrics.duplicateExcessRows}`
      ),
      check(
        "D-02_null_critical_identity",
        d02Passed,
        `nullCriticalRows=${metrics.nullCriticalRows}`
      ),
      check(
        "D-03_pax_mismatch_ratio_percent",
        d03Passed,
        `ratio=${metrics.paxMismatchRatioPercent ?? "n/a"}, max=${maxPaxMismatchRatioPercent}, mismatchRows=${metrics.paxMismatchRows}, denominator=${metrics.paxMismatchDenominator}`
      ),
      check(
        "D-04_package_ref_type_completeness",
        d04Passed,
        `packageRefTypeNullRows=${metrics.packageRefTypeNullRows}`
      )
    ];

    const report = {
      gate: "BOOKING_BRIDGE_BATCH_D",
      batchCode,
      startedAt,
      endedAt: new Date().toISOString(),
      thresholds: {
        maxPaxMismatchRatioPercent
      },
      metrics,
      checks,
      result: checks.every((item) => item.passed) ? "PASS" : "FAIL"
    };

    const output = await writeReport(report);
    console.log(`BOOKING_BRIDGE_GATE_RESULT=${report.result}`);
    console.log(`BOOKING_BRIDGE_GATE_JSON=${output.jsonPath}`);
    console.log(`BOOKING_BRIDGE_GATE_MD=${output.mdPath}`);

    if (report.result !== "PASS") {
      for (const failed of checks.filter((item) => !item.passed)) {
        console.error(`FAILED_CHECK=${failed.name} ${failed.detail}`);
      }
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(
    `BOOKING_BRIDGE_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
