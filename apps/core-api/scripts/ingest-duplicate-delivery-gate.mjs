import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const connectionString = resolveOpsDbUrl(process.env);
const maxExcessRows = readNumber("GATE_DUPLICATE_MAX_EXCESS_ROWS", 0, 0);
const requireIndexes = readBoolean("GATE_DUPLICATE_REQUIRE_INDEXES", true);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-duplicate-delivery");

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

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const reportPath = path.join(reportRootDir, `${nowTimestampForFile()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function queryMetrics(client) {
  const duplicateIdempotencyResult = await client.query(`
    with duplicate_groups as (
      select idempotency_key, count(*)::int as total_rows
      from ingest_event_log
      group by idempotency_key
      having count(*) > 1
    )
    select
      count(*)::int as group_count,
      coalesce(sum(total_rows - 1), 0)::int as excess_rows
    from duplicate_groups
  `);

  const duplicateSecondaryResult = await client.query(`
    with duplicate_groups as (
      select source_enum, external_booking_ref, event_type, event_time_normalized, count(*)::int as total_rows
      from ingest_event_log
      group by source_enum, external_booking_ref, event_type, event_time_normalized
      having count(*) > 1
    )
    select
      count(*)::int as group_count,
      coalesce(sum(total_rows - 1), 0)::int as excess_rows
    from duplicate_groups
  `);

  const duplicateBookingIdentityResult = await client.query(`
    with duplicate_groups as (
      select channel_code, external_booking_ref, count(*)::int as total_rows
      from booking_core
      group by channel_code, external_booking_ref
      having count(*) > 1
    )
    select
      count(*)::int as group_count,
      coalesce(sum(total_rows - 1), 0)::int as excess_rows
    from duplicate_groups
  `);

  const indexPresenceResult = await client.query(
    `
      select
        indexname,
        indexname = any($1::text[]) as required
      from pg_indexes
      where schemaname = current_schema()
        and indexname = any($1::text[])
    `,
    [["ux_ingest_event_idempotency_key", "ux_ingest_event_secondary_dedup", "ux_booking_core_channel_external_ref"]]
  );

  const presentIndexes = new Set(indexPresenceResult.rows.map((row) => String(row.indexname)));
  const requiredIndexes = [
    "ux_ingest_event_idempotency_key",
    "ux_ingest_event_secondary_dedup",
    "ux_booking_core_channel_external_ref"
  ];
  const missingIndexes = requiredIndexes.filter((indexName) => !presentIndexes.has(indexName));

  return {
    idempotencyDuplicateGroups: toNumber(duplicateIdempotencyResult.rows[0]?.group_count),
    idempotencyDuplicateExcessRows: toNumber(duplicateIdempotencyResult.rows[0]?.excess_rows),
    secondaryDuplicateGroups: toNumber(duplicateSecondaryResult.rows[0]?.group_count),
    secondaryDuplicateExcessRows: toNumber(duplicateSecondaryResult.rows[0]?.excess_rows),
    bookingIdentityDuplicateGroups: toNumber(duplicateBookingIdentityResult.rows[0]?.group_count),
    bookingIdentityDuplicateExcessRows: toNumber(duplicateBookingIdentityResult.rows[0]?.excess_rows),
    requiredIndexes,
    missingIndexes
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
    const failures = [];

    if (metrics.idempotencyDuplicateExcessRows > maxExcessRows) {
      failures.push(
        `idempotency_excess_rows=${metrics.idempotencyDuplicateExcessRows} exceeds max=${maxExcessRows}`
      );
    }
    if (metrics.secondaryDuplicateExcessRows > maxExcessRows) {
      failures.push(
        `secondary_excess_rows=${metrics.secondaryDuplicateExcessRows} exceeds max=${maxExcessRows}`
      );
    }
    if (metrics.bookingIdentityDuplicateExcessRows > maxExcessRows) {
      failures.push(
        `booking_identity_excess_rows=${metrics.bookingIdentityDuplicateExcessRows} exceeds max=${maxExcessRows}`
      );
    }
    if (requireIndexes && metrics.missingIndexes.length > 0) {
      failures.push(`missing_required_indexes=${metrics.missingIndexes.join(",")}`);
    }

    const report = {
      gate: "F-04_DUPLICATE_DELIVERY",
      startedAt,
      endedAt: new Date().toISOString(),
      config: {
        maxExcessRows,
        requireIndexes
      },
      summary: {
        idempotencyDuplicateGroups: metrics.idempotencyDuplicateGroups,
        idempotencyDuplicateExcessRows: metrics.idempotencyDuplicateExcessRows,
        secondaryDuplicateGroups: metrics.secondaryDuplicateGroups,
        secondaryDuplicateExcessRows: metrics.secondaryDuplicateExcessRows,
        bookingIdentityDuplicateGroups: metrics.bookingIdentityDuplicateGroups,
        bookingIdentityDuplicateExcessRows: metrics.bookingIdentityDuplicateExcessRows,
        missingIndexes: metrics.missingIndexes
      },
      result: failures.length === 0 ? "PASS" : "FAIL",
      failures
    };

    const reportPath = await writeReport(report);
    console.log(`GATE_RESULT=${report.result}`);
    console.log(`GATE_REPORT_JSON=${reportPath}`);
    console.log(`DUPLICATE_IDEMPOTENCY_EXCESS_ROWS=${metrics.idempotencyDuplicateExcessRows}`);
    console.log(`DUPLICATE_SECONDARY_EXCESS_ROWS=${metrics.secondaryDuplicateExcessRows}`);
    console.log(`DUPLICATE_BOOKING_IDENTITY_EXCESS_ROWS=${metrics.bookingIdentityDuplicateExcessRows}`);

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
    gate: "F-04_DUPLICATE_DELIVERY",
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      maxExcessRows,
      requireIndexes
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
