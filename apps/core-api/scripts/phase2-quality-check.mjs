import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const connectionString = resolveOpsDbUrl(process.env);
const batchCode = process.env.PHASE2_BATCH_CODE || "phase2";
const opsDoneNotPaidMaxRatio = readNumber("QUALITY_MAX_OPS_DONE_NOT_PAID_RATIO", 0.01, 0);
const unmappedRatioMaxPercent = readNumber("QUALITY_MAX_UNMAPPED_RATIO_PERCENT", 5, 0);
const allowEmptyCatalogDenominator = readBoolean("QUALITY_ALLOW_EMPTY_CATALOG_DENOMINATOR", false);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/recon/quality");

function readNumber(key, fallback, minValue) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue) {
    throw new Error(`${key} must be a number >= ${minValue}`);
  }
  return value;
}

function readBoolean(key, fallback) {
  const raw = process.env[key];
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

function checkResult(name, passed, detail) {
  return {
    name,
    passed,
    detail
  };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Phase-2 Quality Check Report");
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
  for (const check of report.checks) {
    lines.push(`| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${check.detail} |`);
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
  const batchDir = path.join(reportRootDir, report.batchCode);
  await mkdir(batchDir, { recursive: true });

  const timestamp = nowTimestampForFile();
  const jsonPath = path.join(batchDir, `${timestamp}.json`);
  const mdPath = path.join(batchDir, `${timestamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");

  return {
    jsonPath,
    mdPath
  };
}

async function queryMetrics(client) {
  const nullIdentityResult = await client.query(`
    select count(*)::int as count
    from booking_core
    where channel_code is null
       or external_booking_ref is null
  `);

  const duplicateIdentityResult = await client.query(`
    with duplicate_groups as (
      select channel_code, external_booking_ref, count(*)::int as total_rows
      from booking_core
      group by channel_code, external_booking_ref
      having count(*) > 1
    )
    select
      count(*)::int as group_count,
      coalesce(sum(total_rows - 1), 0)::int as excess_row_count
    from duplicate_groups
  `);

  const paymentOrphanResult = await client.query(`
    select count(*)::int as count
    from payment_event p
    left join booking_core b on b.booking_key = p.booking_key
    where b.booking_key is null
  `);

  const opsDoneNotPaidResult = await client.query(`
    select
      count(*) filter (
        where ops_fulfillment_status = 'DONE'
      )::int as ops_done_total,
      count(*) filter (
        where ops_fulfillment_status = 'DONE'
          and customer_payment_status <> 'PAID'
      )::int as ops_done_not_paid
    from booking_core
  `);

  const ingestSecondaryDedupResult = await client.query(`
    with duplicate_groups as (
      select source_enum, external_booking_ref, event_type, event_time_normalized, count(*)::int as total_rows
      from ingest_event_log
      group by source_enum, external_booking_ref, event_type, event_time_normalized
      having count(*) > 1
    )
    select
      count(*)::int as group_count,
      coalesce(sum(total_rows - 1), 0)::int as excess_row_count
    from duplicate_groups
  `);

  const unmappedRatioResult = await client.query(`
    with catalog_total as (
      select (
        (select count(*) from catalog_product) +
        (select count(*) from catalog_variant)
      )::numeric as total_catalog_entities
    ),
    unmapped_total as (
      select count(*)::numeric as unmapped_rows
      from unmapped_queue
      where status = 'OPEN'
        and queue_type in ('PRODUCT_MAPPING', 'VARIANT_MAPPING', 'CATALOG_EXTENDED_METADATA')
    )
    select
      u.unmapped_rows::int as unmapped_rows,
      c.total_catalog_entities::int as total_catalog_entities,
      case
        when c.total_catalog_entities = 0 then null
        else round((u.unmapped_rows / c.total_catalog_entities) * 100, 2)
      end as ratio_percent
    from unmapped_total u
    cross join catalog_total c
  `);

  const opsRow = opsDoneNotPaidResult.rows[0];
  const opsDoneTotal = toNumber(opsRow?.ops_done_total);
  const opsDoneNotPaid = toNumber(opsRow?.ops_done_not_paid);
  const opsDoneNotPaidRatio = opsDoneTotal === 0 ? 0 : opsDoneNotPaid / opsDoneTotal;

  return {
    bookingCoreNullIdentity: toNumber(nullIdentityResult.rows[0]?.count),
    bookingCoreDuplicateIdentityGroups: toNumber(duplicateIdentityResult.rows[0]?.group_count),
    bookingCoreDuplicateIdentityExcessRows: toNumber(duplicateIdentityResult.rows[0]?.excess_row_count),
    paymentOrphanRows: toNumber(paymentOrphanResult.rows[0]?.count),
    opsDoneTotal,
    opsDoneNotPaid,
    opsDoneNotPaidRatio,
    ingestSecondaryDedupDuplicateGroups: toNumber(ingestSecondaryDedupResult.rows[0]?.group_count),
    ingestSecondaryDedupExcessRows: toNumber(ingestSecondaryDedupResult.rows[0]?.excess_row_count),
    unmappedRows: toNumber(unmappedRatioResult.rows[0]?.unmapped_rows),
    totalCatalogEntities: toNumber(unmappedRatioResult.rows[0]?.total_catalog_entities),
    unmappedRatioPercent:
      unmappedRatioResult.rows[0]?.ratio_percent === null
        ? null
        : toNumber(unmappedRatioResult.rows[0]?.ratio_percent)
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
    const checks = [];

    checks.push(
      checkResult(
        "booking_core_null_identity",
        metrics.bookingCoreNullIdentity === 0,
        `count=${metrics.bookingCoreNullIdentity}`
      )
    );
    checks.push(
      checkResult(
        "booking_core_duplicate_identity",
        metrics.bookingCoreDuplicateIdentityGroups === 0,
        `groups=${metrics.bookingCoreDuplicateIdentityGroups}, excessRows=${metrics.bookingCoreDuplicateIdentityExcessRows}`
      )
    );
    checks.push(
      checkResult("payment_orphan_rows", metrics.paymentOrphanRows === 0, `count=${metrics.paymentOrphanRows}`)
    );
    checks.push(
      checkResult(
        "ops_done_not_paid_ratio",
        metrics.opsDoneNotPaidRatio <= opsDoneNotPaidMaxRatio,
        `ratio=${metrics.opsDoneNotPaidRatio.toFixed(6)}, max=${opsDoneNotPaidMaxRatio.toFixed(6)}, opsDone=${metrics.opsDoneTotal}, mismatch=${metrics.opsDoneNotPaid}`
      )
    );
    checks.push(
      checkResult(
        "ingest_secondary_dedup_duplicates",
        metrics.ingestSecondaryDedupDuplicateGroups === 0,
        `groups=${metrics.ingestSecondaryDedupDuplicateGroups}, excessRows=${metrics.ingestSecondaryDedupExcessRows}`
      )
    );

    const hasCatalogDenominator = metrics.totalCatalogEntities > 0;
    const unmappedRatioPassed = hasCatalogDenominator
      ? metrics.unmappedRatioPercent !== null &&
        metrics.unmappedRatioPercent <= unmappedRatioMaxPercent
      : allowEmptyCatalogDenominator && metrics.unmappedRows === 0;

    const unmappedDetail = hasCatalogDenominator
      ? `ratio=${metrics.unmappedRatioPercent ?? "n/a"}, max=${unmappedRatioMaxPercent}, unmapped=${metrics.unmappedRows}, denominator=${metrics.totalCatalogEntities}`
      : allowEmptyCatalogDenominator
        ? `ratio=n/a, max=${unmappedRatioMaxPercent}, unmapped=${metrics.unmappedRows}, denominator=0 (allowed by QUALITY_ALLOW_EMPTY_CATALOG_DENOMINATOR=true)`
        : `ratio=n/a, max=${unmappedRatioMaxPercent}, unmapped=${metrics.unmappedRows}, denominator=0`;

    checks.push(
      checkResult(
        "unmapped_ratio_percent",
        unmappedRatioPassed,
        unmappedDetail
      )
    );

    const report = {
      batchCode,
      startedAt,
      endedAt: new Date().toISOString(),
      result: checks.every((item) => item.passed) ? "PASS" : "FAIL",
      thresholds: {
        opsDoneNotPaidMaxRatio,
        unmappedRatioMaxPercent,
        allowEmptyCatalogDenominator
      },
      metrics,
      checks
    };

    const paths = await writeReport(report);
    console.log(`QUALITY_CHECK_RESULT=${report.result}`);
    console.log(`QUALITY_REPORT_JSON=${paths.jsonPath}`);
    console.log(`QUALITY_REPORT_MD=${paths.mdPath}`);

    if (report.result !== "PASS") {
      for (const check of checks.filter((item) => !item.passed)) {
        console.error(`FAILED_CHECK=${check.name} ${check.detail}`);
      }
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`QUALITY_CHECK_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
