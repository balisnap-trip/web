import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveSourceDbUrls } from "./_legacy-db-env.mjs";

const { Client } = pg;

const NS_BOOKING = "1396788e-dfe4-558e-977f-cbac85111c4c";
const NS_CATALOG_VARIANT = "6b647a19-b987-5dd4-8c1e-94bceb859370";

const { opsDbUrl: OPS_DB_URL, balisnapDbUrl: BALISNAP_DB_URL, bstadminDbUrl: BSTADMIN_DB_URL } =
  resolveSourceDbUrls(process.env);
const BATCH_CODE = process.env.PHASE2_BATCH_CODE || "D";
const DRY_RUN = readBoolean("BOOKING_BACKFILL_DRY_RUN", false);

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

function parseDateOnly(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
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

function isValidEmail(value) {
  const raw = normText(value);
  if (!raw) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function isPlaceholderName(value) {
  const raw = normText(value);
  if (!raw) {
    return true;
  }
  return ["guest", "customer", "unknown", "n/a", "na", "-", "test"].includes(raw.toLowerCase());
}

function isPlaceholderEmail(value) {
  const raw = normText(value);
  if (!raw) {
    return true;
  }
  const normalized = raw.toLowerCase();
  return (
    normalized.endsWith("@example.com") ||
    ["-", "n/a", "na", "unknown", "test@test.com"].includes(normalized)
  );
}

function normalizeChannelCode(value) {
  const out = normUpper(value);
  if (out && ["DIRECT", "GYG", "VIATOR", "BOKUN", "TRIPDOTCOM", "MANUAL"].includes(out)) {
    return out;
  }
  return "MANUAL";
}

function toPaymentStatus(valueV2, valueLegacy, paidFlag) {
  const v2 = normUpper(valueV2);
  if (v2) {
    if (["PAID", "CONFIRMED", "COMPLETED"].includes(v2)) {
      return "PAID";
    }
    if (v2 === "REFUNDED") {
      return "REFUNDED";
    }
    if (["FAILED", "CANCELLED"].includes(v2)) {
      return "FAILED";
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
  if (paidFlag) {
    return "PAID";
  }
  return "PENDING_PAYMENT";
}

function toOpsStatusBstadmin(value) {
  const out = normUpper(value);
  if (
    out &&
    ["NEW", "READY", "ATTENTION", "UPDATED", "COMPLETED", "DONE", "CANCELLED", "NO_SHOW"].includes(
      out
    )
  ) {
    return out;
  }
  return "NEW";
}

function toOpsStatusFallback(status, paymentStatus) {
  const out = normUpper(status);
  if (out === "CANCELLED") {
    return "CANCELLED";
  }
  if (["DONE", "COMPLETED"].includes(out)) {
    return out;
  }
  if (paymentStatus === "PAID") {
    return "READY";
  }
  return "NEW";
}

async function queryRows(client, sql, warnings, label) {
  try {
    const result = await client.query(sql);
    return result.rows;
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function pickContact(sources) {
  const sorted = [...sources].sort((a, b) => {
    const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tB - tA;
  });

  const getFirst = (selector, predicate = (value) => Boolean(value)) => {
    for (const source of sorted) {
      const value = selector(source);
      if (predicate(value)) {
        return value;
      }
    }
    return null;
  };

  const mainName =
    getFirst((source) => source.contact.mainName, (value) => Boolean(value && !isPlaceholderName(value))) ||
    getFirst((source) => source.contact.mainName);
  const mainEmail =
    getFirst(
      (source) => source.contact.mainEmail,
      (value) => Boolean(value && isValidEmail(value) && !isPlaceholderEmail(value))
    ) || getFirst((source) => source.contact.mainEmail);
  const phone = getFirst((source) => source.contact.phone);
  const pickupLocation = getFirst((source) => source.contact.pickupLocation);
  const meetingPoint = getFirst((source) => source.contact.meetingPoint);

  return {
    mainName,
    mainEmail,
    phone,
    pickupLocation,
    meetingPoint,
    isPlaceholderName: isPlaceholderName(mainName),
    isPlaceholderEmail: isPlaceholderEmail(mainEmail) || !isValidEmail(mainEmail),
    updatedFromSource: sorted[0]?.sourceSystem || "unknown"
  };
}

function writeIdentity(map, row) {
  const key = `${row.channelCode}::${row.externalBookingRef}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      channelCode: row.channelCode,
      externalBookingRef: row.externalBookingRef,
      primary: row,
      sources: [row]
    });
    return;
  }
  existing.sources.push(row);
  const currentScore = (existing.primary.customerPaymentStatus === "PAID" ? 10 : 0) + existing.primary.paymentScore;
  const nextScore = (row.customerPaymentStatus === "PAID" ? 10 : 0) + row.paymentScore;
  if (nextScore > currentScore) {
    existing.primary = row;
    return;
  }
  if (nextScore === currentScore && row.sourceSystem === "bstadmin") {
    existing.primary = row;
  }
}

async function writeReport(report) {
  const dir = path.join(reportRoot, BATCH_CODE);
  await mkdir(dir, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(dir, `${stamp}-booking-bridge-backfill.json`);
  const mdPath = path.join(dir, `${stamp}-booking-bridge-backfill.md`);
  const md = [
    "# Booking Bridge Backfill",
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

async function ensureChannelRegistry(client) {
  await client.query(`
    insert into channel_registry (channel_code, channel_name, is_active)
    values
      ('DIRECT', 'Direct Website', true),
      ('GYG', 'GetYourGuide', true),
      ('VIATOR', 'Viator', true),
      ('BOKUN', 'Bokun', true),
      ('TRIPDOTCOM', 'Trip.com', true),
      ('MANUAL', 'Manual Ops Input', true)
    on conflict (channel_code) do update set
      channel_name = excluded.channel_name,
      is_active = excluded.is_active,
      updated_at = now()
  `);
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
    const [bsBookings, bsItems, bsTravelers, bsPayments, opsBookings, opsFinances, variants] = await Promise.all([
      queryRows(
        balisnap,
        `
          select
            b.booking_id::text as booking_id,
            b.booking_ref::text as booking_ref,
            b.package_id::text as package_id,
            b.booking_date,
            b.created_at,
            b.updated_at,
            b.currency_code,
            b.total_price,
            b.number_of_adult,
            b.number_of_child,
            b.status,
            b.status_v2::text as status_v2,
            b.main_contact_name,
            b.main_contact_email,
            b.phone_number,
            b.meeting_point,
            b.note
          from public."Booking" b
        `,
        warnings,
        "balisnap booking"
      ),
      queryRows(
        balisnap,
        `
          select
            i.booking_item_id::text as booking_item_id,
            i.booking_id::text as booking_id,
            i.variant_id::text as variant_id,
            i.departure_id::text as departure_id,
            i.currency_code,
            i.adult_qty,
            i.child_qty,
            i.infant_qty,
            i.adult_unit_price,
            i.child_unit_price,
            i.discount_amount,
            i.tax_amount,
            i.total_amount,
            i.snapshot
          from public."BookingItem" i
        `,
        warnings,
        "balisnap booking_item"
      ),
      queryRows(
        balisnap,
        `
          select
            t.booking_item_id::text as booking_item_id,
            t.traveler_type,
            t.first_name,
            t.last_name,
            t.email,
            t.phone,
            t.nationality,
            t.passport_number,
            t.special_request,
            t.birth_date
          from public."BookingTraveler" t
        `,
        warnings,
        "balisnap booking_traveler"
      ),
      queryRows(
        balisnap,
        `
          select
            p.booking_id::text as booking_id,
            count(*)::int as payment_count,
            max(case when coalesce(p.payment_status_v2::text, '') in ('PAID', 'CONFIRMED', 'COMPLETED') then 1 else 0 end)::int as has_paid_v2,
            max(case when lower(coalesce(p.payment_status::text, '')) in ('paid', 'completed', 'confirmed', 'captured', 'success') then 1 else 0 end)::int as has_paid_legacy
          from public."Payment" p
          group by p.booking_id
        `,
        warnings,
        "balisnap payment"
      ),
      queryRows(
        bstadmin,
        `
          select
            b.booking_id::text as booking_id,
            b.booking_ref::text as booking_ref,
            b.source::text as source,
            b.package_id::text as package_id,
            b.booking_date,
            b.tour_date,
            b.created_at,
            b.updated_at,
            b.currency,
            b.total_price,
            b.number_of_adult,
            b.number_of_child,
            b.status::text as status,
            b.main_contact_name,
            b.main_contact_email,
            b.phone_number,
            b.pickup_location,
            b.meeting_point,
            b.note,
            b.assigned_driver_id,
            b.assigned_at,
            b.is_paid,
            b.paid_at
          from public.bookings b
        `,
        warnings,
        "bstadmin bookings"
      ),
      queryRows(
        bstadmin,
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
        warnings,
        "bstadmin booking_finances"
      ),
      queryRows(target, `select variant_key::text as variant_key, code from catalog_variant`, warnings, "catalog_variant")
    ]);

    if (bsBookings.length === 0 && opsBookings.length === 0) {
      throw new Error("No booking rows extracted from balisnap/bstadmin.");
    }

    const paymentMap = new Map(bsPayments.map((row) => [String(row.booking_id), row]));
    const financeMap = new Map(opsFinances.map((row) => [String(row.booking_id), row]));
    const variantKeyByPackage = new Map();
    const existingVariantKeys = new Set();
    for (const row of variants) {
      const variantKey = normText(row.variant_key);
      const code = normUpper(row.code);
      if (!variantKey) {
        continue;
      }
      existingVariantKeys.add(variantKey);
      if (code && code.startsWith("PKG-")) {
        variantKeyByPackage.set(code.slice(4), variantKey);
      }
    }

    const bsBookingById = new Map();
    const identityMap = new Map();

    for (const row of bsBookings) {
      const bookingId = normText(row.booking_id);
      if (!bookingId) {
        continue;
      }
      const payment = paymentMap.get(bookingId);
      const hasPaid = Boolean(parseIntOr(payment?.has_paid_v2, 0) || parseIntOr(payment?.has_paid_legacy, 0));
      const paymentStatus = toPaymentStatus(row.status_v2, row.status, hasPaid);
      const record = {
        sourceSystem: "balisnap",
        sourceTable: "Booking",
        sourcePk: bookingId,
        channelCode: "DIRECT",
        externalBookingRef: normUpper(row.booking_ref) || `BS-${bookingId}`,
        packageId: normText(row.package_id),
        bookingCreatedAt: parseIso(row.created_at) || parseIso(row.booking_date) || new Date().toISOString(),
        bookingDate: parseDateOnly(row.booking_date),
        tourDate: parseDateOnly(row.booking_date) || parseDateOnly(row.created_at),
        currencyCode: normCurrency(row.currency_code, "USD"),
        totalPrice: parseNum(row.total_price, 0),
        numberOfAdult: parseIntOr(row.number_of_adult, 0),
        numberOfChild: parseIntOr(row.number_of_child, 0),
        customerPaymentStatus: paymentStatus,
        opsFulfillmentStatus: toOpsStatusFallback(row.status, paymentStatus),
        note: normText(row.note),
        assignedDriverId: null,
        assignedAt: null,
        paidAt: null,
        paymentScore: parseIntOr(payment?.payment_count, 0),
        updatedAt: parseIso(row.updated_at) || parseIso(row.created_at),
        contact: {
          mainName: normText(row.main_contact_name),
          mainEmail: normText(row.main_contact_email),
          phone: normText(row.phone_number),
          pickupLocation: null,
          meetingPoint: normText(row.meeting_point)
        }
      };
      bsBookingById.set(bookingId, record);
      writeIdentity(identityMap, record);
    }

    for (const row of opsBookings) {
      const bookingId = normText(row.booking_id);
      if (!bookingId) {
        continue;
      }
      const paymentStatus = parseBool(row.is_paid, false) ? "PAID" : "PENDING_PAYMENT";
      const record = {
        sourceSystem: "bstadmin",
        sourceTable: "bookings",
        sourcePk: bookingId,
        channelCode: normalizeChannelCode(row.source),
        externalBookingRef: normUpper(row.booking_ref) || `OPS-${bookingId}`,
        packageId: normText(row.package_id),
        bookingCreatedAt: parseIso(row.created_at) || parseIso(row.booking_date) || new Date().toISOString(),
        bookingDate: parseDateOnly(row.booking_date),
        tourDate: parseDateOnly(row.tour_date) || parseDateOnly(row.booking_date),
        currencyCode: normCurrency(row.currency, "USD"),
        totalPrice: parseNum(row.total_price, 0),
        numberOfAdult: parseIntOr(row.number_of_adult, 0),
        numberOfChild: parseIntOr(row.number_of_child, 0),
        customerPaymentStatus: paymentStatus,
        opsFulfillmentStatus: toOpsStatusBstadmin(row.status),
        note: normText(row.note),
        assignedDriverId: parseIntOr(row.assigned_driver_id, null),
        assignedAt: parseIso(row.assigned_at),
        paidAt: parseIso(row.paid_at),
        paymentScore: parseBool(row.is_paid, false) ? 2 : 0,
        updatedAt: parseIso(row.updated_at) || parseIso(row.created_at),
        contact: {
          mainName: normText(row.main_contact_name),
          mainEmail: normText(row.main_contact_email),
          phone: normText(row.phone_number),
          pickupLocation: normText(row.pickup_location),
          meetingPoint: normText(row.meeting_point)
        }
      };
      writeIdentity(identityMap, record);
    }

    const travelerByItem = new Map();
    for (const row of bsTravelers) {
      const bookingItemId = normText(row.booking_item_id);
      if (!bookingItemId) {
        continue;
      }
      const bucket = travelerByItem.get(bookingItemId) || [];
      bucket.push(row);
      travelerByItem.set(bookingItemId, bucket);
    }

    const itemsByIdentity = new Map();
    for (const row of bsItems) {
      const bookingId = normText(row.booking_id);
      const booking = bookingId ? bsBookingById.get(bookingId) : null;
      if (!booking) {
        continue;
      }
      const key = `${booking.channelCode}::${booking.externalBookingRef}`;
      const bucket = itemsByIdentity.get(key) || [];
      bucket.push({
        ...row,
        travelers: travelerByItem.get(normText(row.booking_item_id) || "") || []
      });
      itemsByIdentity.set(key, bucket);
    }

    const bookingCoreRows = [];
    const bookingContactRows = [];
    const bookingPartyRows = [];
    const bookingItemRows = [];
    const channelRefRows = [];
    const opsStateRows = [];
    const opsFinanceRows = [];

    for (const identity of identityMap.values()) {
      const bookingKey = uuidV5(
        NS_BOOKING,
        `canonical:booking_identity:${identity.channelCode}:${identity.externalBookingRef}`
      );
      const packageId = normText(identity.primary.packageId);
      const packageRefKey = packageId ? variantKeyByPackage.get(packageId) || null : null;
      const packageRefType = packageRefKey ? "CATALOG_VARIANT" : "LEGACY_PACKAGE";
      const contact = pickContact(identity.sources);
      const sourceItems = itemsByIdentity.get(`${identity.channelCode}::${identity.externalBookingRef}`) || [];

      let adultQty = 0;
      let childQty = 0;
      let infantQty = 0;
      const travelerRows = [];

      if (sourceItems.length > 0) {
        for (const item of sourceItems) {
          adultQty += parseIntOr(item.adult_qty, 0);
          childQty += parseIntOr(item.child_qty, 0);
          infantQty += parseIntOr(item.infant_qty, 0);
          for (const row of item.travelers) {
            travelerRows.push({
              travelerType: normUpper(row.traveler_type) || "ADULT",
              firstName: normText(row.first_name),
              lastName: normText(row.last_name),
              email: normText(row.email),
              phone: normText(row.phone),
              nationality: normText(row.nationality),
              passportNumber: normText(row.passport_number),
              specialRequest: normText(row.special_request),
              birthDate: parseDateOnly(row.birth_date)
            });
          }

          const variantExternalId = normText(item.variant_id);
          const candidateVariantKey = variantExternalId
            ? uuidV5(NS_CATALOG_VARIANT, `balisnap:TourVariant:${variantExternalId}`)
            : null;
          bookingItemRows.push({
            bookingItemKey: uuidV5(NS_BOOKING, `balisnap:BookingItem:${item.booking_item_id}`),
            bookingKey,
            variantKey:
              candidateVariantKey && existingVariantKeys.has(candidateVariantKey)
                ? candidateVariantKey
                : null,
            variantExternalId,
            departureExternalId: normText(item.departure_id),
            currencyCode: normCurrency(item.currency_code, identity.primary.currencyCode),
            adultQty: parseIntOr(item.adult_qty, 0),
            childQty: parseIntOr(item.child_qty, 0),
            infantQty: parseIntOr(item.infant_qty, 0),
            adultUnitPrice: parseNum(item.adult_unit_price, 0),
            childUnitPrice: parseNum(item.child_unit_price, 0),
            discountAmount: parseNum(item.discount_amount, 0),
            taxAmount: parseNum(item.tax_amount, 0),
            totalAmount: parseNum(item.total_amount, 0),
            snapshotJson: item.snapshot || null
          });
        }
      } else {
        adultQty = identity.primary.numberOfAdult;
        childQty = identity.primary.numberOfChild;
        infantQty = 0;
        const pax = adultQty + childQty;
        const adultUnitPrice =
          pax > 0
            ? Number((identity.primary.totalPrice / pax).toFixed(2))
            : identity.primary.totalPrice;
        bookingItemRows.push({
          bookingItemKey: uuidV5(NS_BOOKING, `${identity.primary.sourceSystem}:${identity.primary.sourcePk}:synthetic`),
          bookingKey,
          variantKey: packageRefKey,
          variantExternalId: packageId,
          departureExternalId: null,
          currencyCode: identity.primary.currencyCode,
          adultQty,
          childQty,
          infantQty,
          adultUnitPrice,
          childUnitPrice: 0,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: identity.primary.totalPrice,
          snapshotJson: { synthetic: true, source: identity.primary.sourceSystem }
        });
      }

      bookingCoreRows.push({
        bookingKey,
        channelCode: identity.channelCode,
        sourceEnumCompat: identity.primary.channelCode,
        externalBookingRef: identity.externalBookingRef,
        bookingCreatedAt: identity.primary.bookingCreatedAt,
        bookingDate: identity.primary.bookingDate,
        tourDate:
          identity.primary.tourDate ||
          identity.primary.bookingDate ||
          new Date().toISOString().slice(0, 10),
        currencyCode: identity.primary.currencyCode,
        totalPrice: identity.primary.totalPrice,
        numberOfAdult: identity.primary.numberOfAdult,
        numberOfChild: identity.primary.numberOfChild,
        customerPaymentStatus: identity.primary.customerPaymentStatus,
        opsFulfillmentStatus: identity.primary.opsFulfillmentStatus,
        packageRefType,
        packageRefKey,
        legacyPackageId: packageId ? Number(packageId) : null,
        note: identity.primary.note
      });

      bookingContactRows.push({ bookingKey, ...contact });
      bookingPartyRows.push({
        bookingKey,
        adultQty,
        childQty,
        infantQty,
        travelerRows: travelerRows.length ? travelerRows : null
      });

      channelRefRows.push({
        externalRefKey: uuidV5(NS_BOOKING, `BOOKING_REF:${identity.channelCode}:${identity.externalBookingRef}`),
        entityType: "BOOKING",
        entityKey: bookingKey,
        channelCode: identity.channelCode,
        externalRefKind: "BOOKING_REF",
        externalRef: identity.externalBookingRef,
        sourceSystem: "canonical",
        sourceTable: "booking_core",
        sourcePk: bookingKey
      });
      for (const source of identity.sources) {
        const kind = source.sourceSystem === "balisnap" ? "BALISNAP_BOOKING_ID" : "BSTADMIN_BOOKING_ID";
        channelRefRows.push({
          externalRefKey: uuidV5(NS_BOOKING, `${kind}:${identity.channelCode}:${source.sourcePk}`),
          entityType: "BOOKING",
          entityKey: bookingKey,
          channelCode: identity.channelCode,
          externalRefKind: kind,
          externalRef: source.sourcePk,
          sourceSystem: source.sourceSystem,
          sourceTable: source.sourceTable,
          sourcePk: source.sourcePk
        });
      }

      opsStateRows.push({
        bookingKey,
        opsFulfillmentStatus: identity.primary.opsFulfillmentStatus,
        assignedDriverId: identity.primary.assignedDriverId,
        assignedAt: identity.primary.assignedAt,
        isPaidFlag: identity.primary.customerPaymentStatus === "PAID",
        paidAt: identity.primary.paidAt,
        updatedFromSource: identity.primary.sourceSystem
      });

      const bstadminSource = identity.sources.find((source) => source.sourceSystem === "bstadmin");
      if (bstadminSource) {
        const finance = financeMap.get(bstadminSource.sourcePk);
        if (finance) {
          opsFinanceRows.push({
            financeBridgeKey: uuidV5(NS_BOOKING, `finance:${finance.booking_finance_id}`),
            bookingKey,
            bookingFinanceId: parseIntOr(finance.booking_finance_id, null),
            patternId: parseIntOr(finance.pattern_id, null),
            validatedAt: parseIso(finance.validated_at),
            isLocked: parseBool(finance.is_locked, false),
            settlementStatus: normUpper(finance.settlement_status) || "PENDING",
            lastReconciledAt: new Date().toISOString()
          });
        }
      }
    }

    const report = {
      gate: "EP-005_BOOKING_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt,
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "PASS",
      counts: {
        extracted: {
          balisnapBookings: bsBookings.length,
          balisnapItems: bsItems.length,
          balisnapTravelers: bsTravelers.length,
          bstadminBookings: opsBookings.length,
          bstadminFinances: opsFinances.length
        },
        prepared: {
          bookingCore: bookingCoreRows.length,
          bookingContact: bookingContactRows.length,
          bookingParty: bookingPartyRows.length,
          bookingItemSnapshot: bookingItemRows.length,
          channelExternalRefs: channelRefRows.length,
          opsBookingState: opsStateRows.length,
          opsFinanceBridge: opsFinanceRows.length
        }
      },
      warnings
    };

    if (!DRY_RUN) {
      await target.query("begin");
      try {
        await ensureChannelRegistry(target);

        for (const row of bookingCoreRows) {
          await target.query(
            `
              insert into booking_core (
                booking_key, channel_code, source_enum_compat, external_booking_ref,
                booking_created_at, booking_date, tour_date, currency_code, total_price,
                number_of_adult, number_of_child, customer_payment_status, ops_fulfillment_status,
                package_ref_type, package_ref_key, legacy_package_id, note
              ) values (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::uuid,$16,$17
              )
              on conflict (booking_key) do update set
                channel_code = excluded.channel_code,
                source_enum_compat = excluded.source_enum_compat,
                external_booking_ref = excluded.external_booking_ref,
                booking_created_at = excluded.booking_created_at,
                booking_date = excluded.booking_date,
                tour_date = excluded.tour_date,
                currency_code = excluded.currency_code,
                total_price = excluded.total_price,
                number_of_adult = excluded.number_of_adult,
                number_of_child = excluded.number_of_child,
                customer_payment_status = excluded.customer_payment_status,
                ops_fulfillment_status = excluded.ops_fulfillment_status,
                package_ref_type = excluded.package_ref_type,
                package_ref_key = excluded.package_ref_key,
                legacy_package_id = excluded.legacy_package_id,
                note = excluded.note,
                updated_at = now()
            `,
            [
              row.bookingKey,
              row.channelCode,
              row.sourceEnumCompat,
              row.externalBookingRef,
              row.bookingCreatedAt,
              row.bookingDate,
              row.tourDate,
              row.currencyCode,
              row.totalPrice,
              row.numberOfAdult,
              row.numberOfChild,
              row.customerPaymentStatus,
              row.opsFulfillmentStatus,
              row.packageRefType,
              row.packageRefKey,
              row.legacyPackageId,
              row.note
            ]
          );
        }

        for (const row of bookingContactRows) {
          await target.query(
            `
              insert into booking_contact (
                booking_key, main_name, main_email, phone, pickup_location, meeting_point,
                is_placeholder_name, is_placeholder_email, updated_from_source
              ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              on conflict (booking_key) do update set
                main_name = excluded.main_name,
                main_email = excluded.main_email,
                phone = excluded.phone,
                pickup_location = excluded.pickup_location,
                meeting_point = excluded.meeting_point,
                is_placeholder_name = excluded.is_placeholder_name,
                is_placeholder_email = excluded.is_placeholder_email,
                updated_from_source = excluded.updated_from_source,
                updated_at = now()
            `,
            [
              row.bookingKey,
              row.mainName,
              row.mainEmail,
              row.phone,
              row.pickupLocation,
              row.meetingPoint,
              row.isPlaceholderName,
              row.isPlaceholderEmail,
              row.updatedFromSource
            ]
          );
        }

        for (const row of bookingPartyRows) {
          await target.query(
            `
              insert into booking_party (
                booking_key, adult_qty, child_qty, infant_qty, traveler_rows
              ) values ($1,$2,$3,$4,$5::jsonb)
              on conflict (booking_key) do update set
                adult_qty = excluded.adult_qty,
                child_qty = excluded.child_qty,
                infant_qty = excluded.infant_qty,
                traveler_rows = excluded.traveler_rows,
                updated_at = now()
            `,
            [
              row.bookingKey,
              row.adultQty,
              row.childQty,
              row.infantQty,
              row.travelerRows ? JSON.stringify(row.travelerRows) : null
            ]
          );
        }

        for (const row of bookingItemRows) {
          await target.query(
            `
              insert into booking_item_snapshot (
                booking_item_key, booking_key, variant_key, variant_external_id, departure_external_id,
                currency_code, adult_qty, child_qty, infant_qty, adult_unit_price, child_unit_price,
                discount_amount, tax_amount, total_amount, snapshot_json
              ) values (
                $1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb
              )
              on conflict (booking_item_key) do update set
                booking_key = excluded.booking_key,
                variant_key = excluded.variant_key,
                variant_external_id = excluded.variant_external_id,
                departure_external_id = excluded.departure_external_id,
                currency_code = excluded.currency_code,
                adult_qty = excluded.adult_qty,
                child_qty = excluded.child_qty,
                infant_qty = excluded.infant_qty,
                adult_unit_price = excluded.adult_unit_price,
                child_unit_price = excluded.child_unit_price,
                discount_amount = excluded.discount_amount,
                tax_amount = excluded.tax_amount,
                total_amount = excluded.total_amount,
                snapshot_json = excluded.snapshot_json,
                updated_at = now()
            `,
            [
              row.bookingItemKey,
              row.bookingKey,
              row.variantKey,
              row.variantExternalId,
              row.departureExternalId,
              row.currencyCode,
              row.adultQty,
              row.childQty,
              row.infantQty,
              row.adultUnitPrice,
              row.childUnitPrice,
              row.discountAmount,
              row.taxAmount,
              row.totalAmount,
              row.snapshotJson ? JSON.stringify(row.snapshotJson) : null
            ]
          );
        }

        for (const row of channelRefRows) {
          await target.query(
            `
              insert into channel_external_refs (
                external_ref_key, entity_type, entity_key, channel_code, external_ref_kind, external_ref,
                source_system, source_table, source_pk
              ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              on conflict (entity_type, channel_code, external_ref_kind, external_ref)
              do update set
                entity_key = excluded.entity_key,
                source_system = excluded.source_system,
                source_table = excluded.source_table,
                source_pk = excluded.source_pk,
                updated_at = now()
            `,
            [
              row.externalRefKey,
              row.entityType,
              row.entityKey,
              row.channelCode,
              row.externalRefKind,
              row.externalRef,
              row.sourceSystem,
              row.sourceTable,
              row.sourcePk
            ]
          );
        }

        for (const row of opsStateRows) {
          await target.query(
            `
              insert into ops_booking_state (
                booking_key, ops_fulfillment_status, assigned_driver_id, assigned_at, is_paid_flag, paid_at, updated_from_source
              ) values ($1,$2,$3,$4,$5,$6,$7)
              on conflict (booking_key) do update set
                ops_fulfillment_status = excluded.ops_fulfillment_status,
                assigned_driver_id = excluded.assigned_driver_id,
                assigned_at = excluded.assigned_at,
                is_paid_flag = excluded.is_paid_flag,
                paid_at = excluded.paid_at,
                updated_from_source = excluded.updated_from_source,
                updated_at = now()
            `,
            [
              row.bookingKey,
              row.opsFulfillmentStatus,
              row.assignedDriverId,
              row.assignedAt,
              row.isPaidFlag,
              row.paidAt,
              row.updatedFromSource
            ]
          );
        }

        for (const row of opsFinanceRows) {
          await target.query(
            `
              insert into ops_finance_bridge (
                finance_bridge_key, booking_key, booking_finance_id, pattern_id, validated_at,
                is_locked, settlement_status, last_reconciled_at
              ) values ($1,$2,$3,$4,$5,$6,$7,$8)
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

        await target.query("commit");
      } catch (error) {
        await target.query("rollback");
        throw error;
      }
    }

    const output = await writeReport(report);
    console.log("BOOKING_BRIDGE_BACKFILL_RESULT=PASS");
    console.log(`BOOKING_BRIDGE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`BOOKING_BRIDGE_BACKFILL_MD=${output.mdPath}`);
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
      gate: "EP-005_BOOKING_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "FAIL",
      counts: {},
      warnings: [message]
    });
    console.log(`BOOKING_BRIDGE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`BOOKING_BRIDGE_BACKFILL_MD=${output.mdPath}`);
  } catch {
    // ignore write fail report error
  }
  console.error(`BOOKING_BRIDGE_BACKFILL_RESULT=FAIL ${message}`);
  process.exit(1);
});
