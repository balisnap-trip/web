import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveSourceDbUrls } from "./_legacy-db-env.mjs";

const { Client } = pg;

const NS_PAYMENT = "2dfcb1f0-47c5-5823-9bc3-c281e0fd702f";

const { opsDbUrl: OPS_DB_URL, balisnapDbUrl: BALISNAP_DB_URL, bstadminDbUrl: BSTADMIN_DB_URL } =
  resolveSourceDbUrls(process.env);
const BATCH_CODE = process.env.PHASE2_BATCH_CODE || "E";
const DRY_RUN = readBoolean("PAYMENT_BACKFILL_DRY_RUN", false);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRoot = path.resolve(__dirname, "../../../reports/recon");

function readBoolean(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const out = String(value).replace(/\s+/g, " ").trim();
  return out || null;
}

function normUpper(value) {
  const out = normText(value);
  return out ? out.toUpperCase() : null;
}

function normCurrency(value, fallback = "USD") {
  const out = normUpper(value);
  return out ? out.slice(0, 3) : fallback;
}

function parseNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOr(value, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string" && value.trim() === "") {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "t"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "f"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseIso(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseUuidToBytes(uuid) {
  const hex = String(uuid).replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function uuidV5(namespace, name) {
  const hash = createHash("sha1")
    .update(parseUuidToBytes(namespace))
    .update(Buffer.from(String(name), "utf8"))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

function normalizePaymentStatus(valueV2, valueLegacy) {
  const v2 = normUpper(valueV2);
  if (v2) {
    if (["PAID", "CONFIRMED", "COMPLETED"].includes(v2)) {
      return "PAID";
    }
    if (["FAILED", "CANCELLED"].includes(v2)) {
      return "FAILED";
    }
    if (v2 === "REFUNDED") {
      return "REFUNDED";
    }
    if (v2 === "DRAFT") {
      return "DRAFT";
    }
  }

  const legacy = normUpper(valueLegacy);
  if (legacy && ["PAID", "COMPLETED", "CAPTURED", "SUCCESS", "CONFIRMED"].includes(legacy)) {
    return "PAID";
  }
  if (legacy && ["FAILED", "CANCELLED"].includes(legacy)) {
    return "FAILED";
  }

  return "PENDING_PAYMENT";
}

function normalizeMethod(method) {
  const normalized = normUpper(method);
  if (!normalized) {
    return "UNKNOWN";
  }
  if (normalized.includes("PAYPAL")) {
    return "PAYPAL";
  }
  if (normalized.includes("BANK")) {
    return "BANK_TRANSFER";
  }
  if (normalized.includes("CARD")) {
    return "CARD";
  }
  return normalized.slice(0, 32);
}

function aggregatePaymentStatus(statuses) {
  if (statuses.has("REFUNDED")) {
    return "REFUNDED";
  }
  if (statuses.has("PAID")) {
    return "PAID";
  }
  if (statuses.has("FAILED")) {
    return "FAILED";
  }
  if (statuses.has("DRAFT")) {
    return "DRAFT";
  }
  return "PENDING_PAYMENT";
}

function enforceNoDowngrade(currentStatus, nextStatus) {
  if (currentStatus === "PAID" && (nextStatus === "PENDING_PAYMENT" || nextStatus === "DRAFT")) {
    return currentStatus;
  }
  return nextStatus;
}

async function queryRowsWithFallback(client, queries, warnings, label) {
  let lastError = null;
  for (const sql of queries) {
    try {
      const result = await client.query(sql);
      return result.rows;
    } catch (error) {
      lastError = error;
    }
  }
  warnings.push(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  return [];
}

async function writeReport(report) {
  const dir = path.join(reportRoot, BATCH_CODE);
  await mkdir(dir, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(dir, `${stamp}-payment-finance-bridge-backfill.json`);
  const mdPath = path.join(dir, `${stamp}-payment-finance-bridge-backfill.md`);
  const md = [
    "# Payment and Finance Bridge Backfill",
    "",
    `- result: ${report.result}`,
    `- batch: ${report.batchCode}`,
    `- dryRun: ${report.dryRun}`,
    `- startedAt: ${report.startedAt}`,
    `- endedAt: ${report.endedAt}`,
    "",
    "## Counts",
    "```json",
    JSON.stringify(report.counts, null, 2),
    "```",
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((item) => `- ${item}`) : ["- none"]),
    ""
  ];
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${md.join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

async function countTargets(client) {
  const [paymentEvent, financeBridge, paidBooking] = await Promise.all([
    client.query("select count(*)::int as count from payment_event"),
    client.query("select count(*)::int as count from ops_finance_bridge"),
    client.query("select count(*)::int as count from booking_core where customer_payment_status = 'PAID'")
  ]);

  return {
    paymentEvent: Number(paymentEvent.rows[0]?.count || 0),
    opsFinanceBridge: Number(financeBridge.rows[0]?.count || 0),
    paidBookings: Number(paidBooking.rows[0]?.count || 0)
  };
}

async function run() {
  if (!OPS_DB_URL) {
    throw new Error("Missing OPS_DB_URL (or legacy DATABASE_URL)");
  }

  const warnings = [];
  const startedAt = new Date().toISOString();

  const target = new Client({ connectionString: OPS_DB_URL });
  const balisnap = new Client({ connectionString: BALISNAP_DB_URL });
  const bstadmin = new Client({ connectionString: BSTADMIN_DB_URL });

  await Promise.all([target.connect(), balisnap.connect(), bstadmin.connect()]);

  try {
    const [paymentRowsSource, financeRowsSource, bstadminPaidRows, bookingRefs, bookingCoreRows] =
      await Promise.all([
        queryRowsWithFallback(
          balisnap,
          [
            `
              select
                p.payment_id::text as payment_id,
                p.booking_id::text as booking_id,
                b.booking_ref::text as booking_ref,
                p.payment_date,
                p.amount,
                p.currency_code,
                p.payment_method,
                p.payment_status::text as payment_status,
                p.payment_status_v2::text as payment_status_v2,
                p.gateway,
                p.gateway_order_id,
                p.gateway_capture_id,
                p.payment_ref,
                p.raw_payload
              from public."Payment" p
              left join public."Booking" b on b.booking_id = p.booking_id
            `,
            `
              select
                p.payment_id::text as payment_id,
                p.booking_id::text as booking_id,
                b.booking_ref::text as booking_ref,
                p.payment_date,
                p.amount,
                p.currency_code,
                p.payment_method,
                p.payment_status::text as payment_status,
                null::text as payment_status_v2,
                p.gateway,
                p.gateway_order_id,
                p.gateway_capture_id,
                p.payment_ref,
                p.raw_payload
              from public.payment p
              left join public.booking b on b.booking_id = p.booking_id
            `
          ],
          warnings,
          "balisnap payment source"
        ),
        queryRowsWithFallback(
          bstadmin,
          [
            `
              select
                f.booking_id::text as booking_id,
                f.booking_finance_id::text as booking_finance_id,
                f.pattern_id::text as pattern_id,
                f.validated_at,
                f.is_locked,
                case
                  when count(fi.finance_item_id) = 0 then 'PENDING'
                  when bool_and(coalesce(fi.paid, false)) then 'SETTLED'
                  else 'PENDING'
                end as settlement_status
              from public.booking_finances f
              left join public.booking_finance_items fi on fi.booking_finance_id = f.booking_finance_id
              group by f.booking_id, f.booking_finance_id, f.pattern_id, f.validated_at, f.is_locked
            `,
            `
              select
                f.booking_id::text as booking_id,
                f.id::text as booking_finance_id,
                f.pattern_id::text as pattern_id,
                f.validated_at,
                f.is_locked,
                case
                  when count(fi.id) = 0 then 'PENDING'
                  when bool_and(coalesce(fi.paid, false)) then 'SETTLED'
                  else 'PENDING'
                end as settlement_status
              from public."BookingFinance" f
              left join public."BookingFinanceItem" fi on fi.booking_finance_id = f.id
              group by f.booking_id, f.id, f.pattern_id, f.validated_at, f.is_locked
            `
          ],
          warnings,
          "bstadmin finance source"
        ),
        queryRowsWithFallback(
          bstadmin,
          [
            `
              select
                b.booking_id::text as booking_id,
                b.source::text as source,
                b.is_paid,
                b.paid_at
              from public.bookings b
            `,
            `
              select
                b.booking_id::text as booking_id,
                b.source::text as source,
                b.is_paid,
                b.paid_at
              from public."Booking" b
            `
          ],
          warnings,
          "bstadmin paid source"
        ),
        queryRowsWithFallback(
          target,
          [
            `
              select
                entity_key::text as booking_key,
                channel_code,
                external_ref_kind,
                external_ref
              from channel_external_refs
              where entity_type = 'BOOKING'
                and external_ref_kind in ('BALISNAP_BOOKING_ID', 'BSTADMIN_BOOKING_ID', 'BOOKING_REF')
            `
          ],
          warnings,
          "target booking refs"
        ),
        queryRowsWithFallback(
          target,
          [
            `
              select
                booking_key::text as booking_key,
                channel_code,
                external_booking_ref,
                customer_payment_status,
                ops_fulfillment_status
              from booking_core
            `
          ],
          warnings,
          "target booking_core"
        )
      ]);

    if (paymentRowsSource.length === 0 && financeRowsSource.length === 0) {
      throw new Error("No payment/finance source rows extracted from balisnap/bstadmin.");
    }

    const bookingByKey = new Map(
      bookingCoreRows.map((row) => [
        String(row.booking_key),
        {
          channelCode: normUpper(row.channel_code) || "MANUAL",
          externalBookingRef: normUpper(row.external_booking_ref) || "",
          customerPaymentStatus: normUpper(row.customer_payment_status) || "PENDING_PAYMENT",
          opsFulfillmentStatus: normUpper(row.ops_fulfillment_status) || "NEW"
        }
      ])
    );

    const bookingKeyByBalisnapBookingId = new Map();
    const bookingKeyByBstadminBookingId = new Map();
    const bookingKeyByDirectBookingRef = new Map();

    for (const row of bookingRefs) {
      const bookingKey = normText(row.booking_key);
      const refKind = normUpper(row.external_ref_kind);
      const refValue = normText(row.external_ref);
      if (!bookingKey || !refKind || !refValue) {
        continue;
      }
      if (refKind === "BALISNAP_BOOKING_ID") {
        bookingKeyByBalisnapBookingId.set(refValue, bookingKey);
      } else if (refKind === "BSTADMIN_BOOKING_ID") {
        bookingKeyByBstadminBookingId.set(refValue, bookingKey);
      } else if (refKind === "BOOKING_REF" && normUpper(row.channel_code) === "DIRECT") {
        bookingKeyByDirectBookingRef.set(normUpper(refValue), bookingKey);
      }
    }

    const preparedPaymentEvents = [];
    const orphanSourcePayments = [];
    const paymentAggregateByBooking = new Map();

    for (const row of paymentRowsSource) {
      const paymentId = normText(row.payment_id);
      const bookingId = normText(row.booking_id);
      const bookingRef = normUpper(row.booking_ref);
      const bookingKey =
        (bookingId ? bookingKeyByBalisnapBookingId.get(bookingId) : null) ||
        (bookingRef ? bookingKeyByDirectBookingRef.get(bookingRef) : null) ||
        null;

      if (!paymentId || !bookingKey) {
        orphanSourcePayments.push({
          paymentId,
          bookingId,
          bookingRef
        });
        continue;
      }

      const normalizedStatus = normalizePaymentStatus(row.payment_status_v2, row.payment_status);
      const paymentTime = parseIso(row.payment_date) || new Date().toISOString();

      preparedPaymentEvents.push({
        paymentKey: uuidV5(NS_PAYMENT, `balisnap:Payment:${paymentId}`),
        bookingKey,
        paymentTime,
        amount: parseNum(row.amount, 0),
        currencyCode: normCurrency(row.currency_code, "USD"),
        method: normalizeMethod(row.payment_method),
        gateway: normText(row.gateway),
        gatewayOrderId: normText(row.gateway_order_id),
        gatewayCaptureId: normText(row.gateway_capture_id),
        paymentRef: normText(row.payment_ref),
        statusRaw: normText(`${row.payment_status ?? ""}|${row.payment_status_v2 ?? ""}`) || null,
        paymentStatusV2: normalizedStatus,
        rawPayload: row.raw_payload || null
      });

      const aggregate = paymentAggregateByBooking.get(bookingKey) || {
        statuses: new Set(),
        latestPaidAt: null
      };
      aggregate.statuses.add(normalizedStatus);
      if (normalizedStatus === "PAID") {
        const paidAt = paymentTime;
        if (!aggregate.latestPaidAt || new Date(paidAt).getTime() > new Date(aggregate.latestPaidAt).getTime()) {
          aggregate.latestPaidAt = paidAt;
        }
      }
      paymentAggregateByBooking.set(bookingKey, aggregate);
    }

    const preparedFinanceBridgeRows = [];
    for (const row of financeRowsSource) {
      const bookingId = normText(row.booking_id);
      const bookingFinanceId = normText(row.booking_finance_id);
      const bookingKey = bookingId ? bookingKeyByBstadminBookingId.get(bookingId) || null : null;
      if (!bookingKey || !bookingFinanceId) {
        continue;
      }
      preparedFinanceBridgeRows.push({
        financeBridgeKey: uuidV5(NS_PAYMENT, `bstadmin:booking_finances:${bookingFinanceId}`),
        bookingKey,
        bookingFinanceId: parseIntOr(row.booking_finance_id, null),
        patternId: parseIntOr(row.pattern_id, null),
        validatedAt: parseIso(row.validated_at),
        isLocked: parseBool(row.is_locked, false),
        settlementStatus: normUpper(row.settlement_status) || "PENDING",
        lastReconciledAt: new Date().toISOString()
      });
    }

    const nonDirectPaymentCandidates = new Map();
    for (const row of bstadminPaidRows) {
      const bookingId = normText(row.booking_id);
      const bookingKey = bookingId ? bookingKeyByBstadminBookingId.get(bookingId) || null : null;
      if (!bookingKey) {
        continue;
      }
      const source = normUpper(row.source) || "MANUAL";
      if (source === "DIRECT") {
        continue;
      }
      nonDirectPaymentCandidates.set(bookingKey, {
        isPaid: parseBool(row.is_paid, false),
        paidAt: parseIso(row.paid_at)
      });
    }

    const bookingStatusUpdates = [];
    for (const [bookingKey, booking] of bookingByKey.entries()) {
      let candidateStatus = null;
      let candidatePaidAt = null;

      if (booking.channelCode === "DIRECT") {
        const aggregate = paymentAggregateByBooking.get(bookingKey);
        if (aggregate) {
          candidateStatus = aggregatePaymentStatus(aggregate.statuses);
          candidatePaidAt = aggregate.latestPaidAt;
        }
      } else {
        const nonDirect = nonDirectPaymentCandidates.get(bookingKey);
        if (nonDirect) {
          candidateStatus = nonDirect.isPaid ? "PAID" : "PENDING_PAYMENT";
          candidatePaidAt = nonDirect.paidAt;
        }
      }

      if (!candidateStatus) {
        continue;
      }

      const nextStatus = enforceNoDowngrade(booking.customerPaymentStatus, candidateStatus);
      if (nextStatus !== booking.customerPaymentStatus || (nextStatus === "PAID" && candidatePaidAt)) {
        bookingStatusUpdates.push({
          bookingKey,
          nextStatus,
          opsFulfillmentStatus: booking.opsFulfillmentStatus,
          paidAt: nextStatus === "PAID" ? candidatePaidAt : null
        });
      }
    }

    const before = await countTargets(target);
    let after = before;

    if (!DRY_RUN) {
      await target.query("begin");
      try {
        for (const row of preparedPaymentEvents) {
          await target.query(
            `
              insert into payment_event (
                payment_key,
                booking_key,
                payment_time,
                amount,
                currency_code,
                method,
                gateway,
                gateway_order_id,
                gateway_capture_id,
                payment_ref,
                status_raw,
                payment_status_v2,
                raw_payload
              ) values (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb
              )
              on conflict (payment_key) do update set
                booking_key = excluded.booking_key,
                payment_time = excluded.payment_time,
                amount = excluded.amount,
                currency_code = excluded.currency_code,
                method = excluded.method,
                gateway = excluded.gateway,
                gateway_order_id = excluded.gateway_order_id,
                gateway_capture_id = excluded.gateway_capture_id,
                payment_ref = excluded.payment_ref,
                status_raw = excluded.status_raw,
                payment_status_v2 = excluded.payment_status_v2,
                raw_payload = excluded.raw_payload,
                updated_at = now()
            `,
            [
              row.paymentKey,
              row.bookingKey,
              row.paymentTime,
              row.amount,
              row.currencyCode,
              row.method,
              row.gateway,
              row.gatewayOrderId,
              row.gatewayCaptureId,
              row.paymentRef,
              row.statusRaw,
              row.paymentStatusV2,
              row.rawPayload ? JSON.stringify(row.rawPayload) : null
            ]
          );
        }

        for (const row of preparedFinanceBridgeRows) {
          await target.query(
            `
              insert into ops_finance_bridge (
                finance_bridge_key,
                booking_key,
                booking_finance_id,
                pattern_id,
                validated_at,
                is_locked,
                settlement_status,
                last_reconciled_at
              ) values (
                $1,$2,$3,$4,$5,$6,$7,$8
              )
              on conflict (booking_key) do update set
                finance_bridge_key = excluded.finance_bridge_key,
                booking_finance_id = excluded.booking_finance_id,
                pattern_id = excluded.pattern_id,
                validated_at = excluded.validated_at,
                is_locked = excluded.is_locked,
                settlement_status = excluded.settlement_status,
                last_reconciled_at = excluded.last_reconciled_at,
                updated_at = now()
            `,
            [
              row.financeBridgeKey,
              row.bookingKey,
              row.bookingFinanceId,
              row.patternId,
              row.validatedAt,
              row.isLocked,
              row.settlementStatus,
              row.lastReconciledAt
            ]
          );
        }

        for (const row of bookingStatusUpdates) {
          await target.query(
            `
              update booking_core
              set customer_payment_status = $2,
                  updated_at = now()
              where booking_key = $1
            `,
            [row.bookingKey, row.nextStatus]
          );

          await target.query(
            `
              insert into ops_booking_state (
                booking_key,
                ops_fulfillment_status,
                is_paid_flag,
                paid_at,
                updated_from_source
              ) values (
                $1,$2,$3,$4,'payment-finance-bridge'
              )
              on conflict (booking_key) do update set
                is_paid_flag = excluded.is_paid_flag,
                paid_at = coalesce(excluded.paid_at, ops_booking_state.paid_at),
                updated_from_source = excluded.updated_from_source,
                updated_at = now()
            `,
            [
              row.bookingKey,
              row.opsFulfillmentStatus,
              row.nextStatus === "PAID",
              row.paidAt
            ]
          );
        }

        await target.query("commit");
      } catch (error) {
        await target.query("rollback");
        throw error;
      }
      after = await countTargets(target);
    }

    const report = {
      gate: "EP-006_PAYMENT_FINANCE_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt,
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "PASS",
      counts: {
        extracted: {
          sourcePayments: paymentRowsSource.length,
          sourceFinanceRows: financeRowsSource.length,
          sourceNonDirectPaidRows: bstadminPaidRows.length
        },
        prepared: {
          paymentEvents: preparedPaymentEvents.length,
          financeBridgeRows: preparedFinanceBridgeRows.length,
          bookingStatusUpdates: bookingStatusUpdates.length,
          orphanSourcePayments: orphanSourcePayments.length
        },
        before,
        after
      },
      warnings: [
        ...warnings,
        ...(orphanSourcePayments.length > 0
          ? [`orphan source payments=${orphanSourcePayments.length}`]
          : [])
      ]
    };

    const output = await writeReport(report);
    console.log("PAYMENT_FINANCE_BACKFILL_RESULT=PASS");
    console.log(`PAYMENT_FINANCE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`PAYMENT_FINANCE_BACKFILL_MD=${output.mdPath}`);
  } finally {
    await Promise.all([
      target.end().catch(() => {}),
      balisnap.end().catch(() => {}),
      bstadmin.end().catch(() => {})
    ]);
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const output = await writeReport({
      gate: "EP-006_PAYMENT_FINANCE_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "FAIL",
      counts: {},
      warnings: [message]
    });
    console.log(`PAYMENT_FINANCE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`PAYMENT_FINANCE_BACKFILL_MD=${output.mdPath}`);
  } catch {
    // ignore write fail report error
  }
  console.error(`PAYMENT_FINANCE_BACKFILL_RESULT=FAIL ${message}`);
  process.exit(1);
});
