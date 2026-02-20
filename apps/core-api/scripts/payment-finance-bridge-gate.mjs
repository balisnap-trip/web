import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveSourceDbUrls } from "./_legacy-db-env.mjs";

const { Client } = pg;

const { opsDbUrl: connectionString, balisnapDbUrl: sourceConnectionString } = resolveSourceDbUrls(process.env);
const batchCode = process.env.PHASE2_BATCH_CODE || "E";
const maxOpsDoneNotPaidRatioPercent = readNumber(
  "GATE_PAYMENT_MAX_OPS_DONE_NOT_PAID_RATIO_PERCENT",
  0.3,
  0
);
const sampleSize = readInt("GATE_PAYMENT_DIRECT_SAMPLE_SIZE", 25, 1, 500);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/payment-finance");

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

function readInt(key, fallback, minValue, maxValue) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(`${key} must be in range ${minValue}..${maxValue}`);
  }
  return Math.trunc(value);
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normUpper(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const out = String(value).trim().toUpperCase();
  return out || null;
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Payment and Finance Bridge Gate Report (Batch E)");
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

async function queryOneWithFallback(client, statements, params) {
  let lastError = null;
  for (const sql of statements) {
    try {
      const result = await client.query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
}

async function queryMetrics(client) {
  const [orphanResult, donePaymentResult, sampleResult, refResult, directTotalResult] = await Promise.all([
    client.query(`
      select count(*)::int as orphan_rows
      from payment_event p
      left join booking_core b on b.booking_key = p.booking_key
      where b.booking_key is null
    `),
    client.query(`
      select
        count(*) filter (where ops_fulfillment_status = 'DONE')::int as ops_done_total,
        count(*) filter (
          where ops_fulfillment_status = 'DONE'
            and customer_payment_status <> 'PAID'
        )::int as ops_done_not_paid
      from booking_core
    `),
    client.query(
      `
        select
          p.payment_key::text as payment_key,
          p.booking_key::text as booking_key,
          p.payment_ref,
          p.gateway_capture_id,
          p.gateway_order_id,
          p.amount,
          p.currency_code,
          p.payment_time
        from payment_event p
        join booking_core b on b.booking_key = p.booking_key
        where b.channel_code = 'DIRECT'
        order by p.payment_time desc, p.created_at desc
        limit $1
      `,
      [sampleSize]
    ),
    client.query(`
      select
        entity_key::text as booking_key,
        external_ref
      from channel_external_refs
      where entity_type = 'BOOKING'
        and external_ref_kind = 'BALISNAP_BOOKING_ID'
    `),
    client.query(`
      select count(*)::int as direct_payment_total
      from payment_event p
      join booking_core b on b.booking_key = p.booking_key
      where b.channel_code = 'DIRECT'
    `)
  ]);

  const opsDoneTotal = toNumber(donePaymentResult.rows[0]?.ops_done_total);
  const opsDoneNotPaid = toNumber(donePaymentResult.rows[0]?.ops_done_not_paid);
  const opsDoneNotPaidRatioPercent =
    opsDoneTotal > 0 ? Number(((opsDoneNotPaid / opsDoneTotal) * 100).toFixed(4)) : null;

  const balisnapBookingIdByBookingKey = new Map(
    refResult.rows
      .map((row) => [String(row.booking_key), String(row.external_ref)])
      .filter((row) => row[0] && row[1])
  );

  return {
    orphanRows: toNumber(orphanResult.rows[0]?.orphan_rows),
    opsDoneTotal,
    opsDoneNotPaid,
    opsDoneNotPaidRatioPercent,
    directPaymentTotal: toNumber(directTotalResult.rows[0]?.direct_payment_total),
    directSamples: sampleResult.rows.map((row) => ({
      paymentKey: String(row.payment_key),
      bookingKey: String(row.booking_key),
      paymentRef: row.payment_ref,
      gatewayCaptureId: row.gateway_capture_id,
      gatewayOrderId: row.gateway_order_id,
      amount: toNumber(row.amount),
      currencyCode: normUpper(row.currency_code) || "USD",
      paymentTime: row.payment_time
    })),
    balisnapBookingIdByBookingKey
  };
}

async function findSourcePayment(sourceClient, sample, bookingId) {
  const byPaymentRef = sample.paymentRef
    ? await queryOneWithFallback(
        sourceClient,
        [
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public."Payment" where payment_ref = $1 limit 1`,
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public.payment where payment_ref = $1 limit 1`
        ],
        [sample.paymentRef]
      )
    : null;
  if (byPaymentRef) {
    return byPaymentRef;
  }

  const byCaptureId = sample.gatewayCaptureId
    ? await queryOneWithFallback(
        sourceClient,
        [
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public."Payment" where gateway_capture_id = $1 limit 1`,
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public.payment where gateway_capture_id = $1 limit 1`
        ],
        [sample.gatewayCaptureId]
      )
    : null;
  if (byCaptureId) {
    return byCaptureId;
  }

  const byOrderId = sample.gatewayOrderId
    ? await queryOneWithFallback(
        sourceClient,
        [
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public."Payment" where gateway_order_id = $1 limit 1`,
          `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public.payment where gateway_order_id = $1 limit 1`
        ],
        [sample.gatewayOrderId]
      )
    : null;
  if (byOrderId) {
    return byOrderId;
  }

  if (!bookingId) {
    return null;
  }

  return queryOneWithFallback(
    sourceClient,
    [
      `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public."Payment" where booking_id::text = $1 and amount = $2 and upper(currency_code) = $3 limit 1`,
      `select payment_id::text as payment_id, booking_id::text as booking_id, amount, currency_code from public.payment where booking_id::text = $1 and amount = $2 and upper(currency_code) = $3 limit 1`
    ],
    [bookingId, sample.amount, sample.currencyCode]
  );
}

async function run() {
  if (!connectionString) {
    throw new Error("Missing OPS_DB_URL environment variable (or legacy DATABASE_URL)");
  }

  const startedAt = new Date().toISOString();
  const client = new Client({ connectionString });
  const sourceClient = new Client({ connectionString: sourceConnectionString });
  await Promise.all([client.connect(), sourceClient.connect()]);

  try {
    const metrics = await queryMetrics(client);

    let sampleMatched = 0;
    let sampleMismatched = 0;
    const sampleErrors = [];

    for (const sample of metrics.directSamples) {
      const bookingId = metrics.balisnapBookingIdByBookingKey.get(sample.bookingKey) || null;
      const sourcePayment = await findSourcePayment(sourceClient, sample, bookingId);
      if (!sourcePayment) {
        sampleMismatched += 1;
        sampleErrors.push({
          paymentKey: sample.paymentKey,
          reason: "SOURCE_PAYMENT_NOT_FOUND"
        });
        continue;
      }

      const amountMatch = toNumber(sourcePayment.amount) === sample.amount;
      const currencyMatch = (normUpper(sourcePayment.currency_code) || "USD") === sample.currencyCode;
      const bookingMatch = bookingId ? String(sourcePayment.booking_id) === String(bookingId) : true;
      if (amountMatch && currencyMatch && bookingMatch) {
        sampleMatched += 1;
      } else {
        sampleMismatched += 1;
        sampleErrors.push({
          paymentKey: sample.paymentKey,
          reason: "SOURCE_PAYLOAD_MISMATCH",
          amountMatch,
          currencyMatch,
          bookingMatch
        });
      }
    }

    const sampleCount = metrics.directSamples.length;
    const sampleAccuracyPercent =
      sampleCount > 0 ? Number(((sampleMatched / sampleCount) * 100).toFixed(2)) : null;

    const e01Passed = metrics.orphanRows === 0;
    const e02Passed =
      metrics.opsDoneTotal === 0 ||
      (metrics.opsDoneNotPaidRatioPercent !== null &&
        metrics.opsDoneNotPaidRatioPercent <= maxOpsDoneNotPaidRatioPercent);
    const e03Passed =
      sampleCount === 0
        ? metrics.directPaymentTotal === 0
        : sampleMismatched === 0 && sampleAccuracyPercent === 100;

    const checks = [
      check("E-01_orphan_payment_event", e01Passed, `orphanRows=${metrics.orphanRows}`),
      check(
        "E-02_ops_done_not_paid_ratio_percent",
        e02Passed,
        `ratio=${metrics.opsDoneNotPaidRatioPercent ?? "n/a"}, max=${maxOpsDoneNotPaidRatioPercent}, opsDone=${metrics.opsDoneTotal}, mismatch=${metrics.opsDoneNotPaid}`
      ),
      check(
        "E-03_sample_audit_payment_direct_accuracy_percent",
        e03Passed,
        sampleCount === 0
          ? `accuracy=n/a, sampleSize=0, directPaymentTotal=${metrics.directPaymentTotal}`
          : `accuracy=${sampleAccuracyPercent ?? "n/a"}%, matched=${sampleMatched}, mismatched=${sampleMismatched}, sampleSize=${sampleCount}`
      )
    ];

    const report = {
      gate: "PAYMENT_FINANCE_BATCH_E",
      batchCode,
      startedAt,
      endedAt: new Date().toISOString(),
      thresholds: {
        maxOpsDoneNotPaidRatioPercent,
        sampleSize
      },
      metrics: {
        orphanRows: metrics.orphanRows,
        opsDoneTotal: metrics.opsDoneTotal,
        opsDoneNotPaid: metrics.opsDoneNotPaid,
        opsDoneNotPaidRatioPercent: metrics.opsDoneNotPaidRatioPercent,
        directPaymentTotal: metrics.directPaymentTotal,
        sampleCount,
        sampleMatched,
        sampleMismatched,
        sampleAccuracyPercent,
        sampleErrors: sampleErrors.slice(0, 100)
      },
      checks,
      result: checks.every((item) => item.passed) ? "PASS" : "FAIL"
    };

    const output = await writeReport(report);
    console.log(`PAYMENT_FINANCE_GATE_RESULT=${report.result}`);
    console.log(`PAYMENT_FINANCE_GATE_JSON=${output.jsonPath}`);
    console.log(`PAYMENT_FINANCE_GATE_MD=${output.mdPath}`);

    if (report.result !== "PASS") {
      for (const item of checks.filter((row) => !row.passed)) {
        console.error(`FAILED_CHECK=${item.name} ${item.detail}`);
      }
      process.exit(1);
    }
  } finally {
    await Promise.all([client.end().catch(() => {}), sourceClient.end().catch(() => {})]);
  }
}

run().catch((error) => {
  console.error(`PAYMENT_FINANCE_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
