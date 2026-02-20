import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveSourceDbUrls } from "./_legacy-db-env.mjs";

const { Client } = pg;

const NS_CATALOG_PRODUCT = "1b2c8dda-1d99-57f5-bdc1-b9fb772d8186";
const NS_CATALOG_VARIANT = "6b647a19-b987-5dd4-8c1e-94bceb859370";

const { opsDbUrl: OPS_DB_URL, balisnapDbUrl: BALISNAP_DB_URL, bstadminDbUrl: BSTADMIN_DB_URL } =
  resolveSourceDbUrls(process.env);
const BATCH_CODE = process.env.PHASE2_BATCH_CODE || "C";
const DRY_RUN = readBoolean("CATALOG_BACKFILL_DRY_RUN", false);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRoot = path.resolve(__dirname, "../../../reports/recon");

function readBoolean(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) {
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function nowFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const out = String(value).replace(/\s+/g, " ").trim();
  return out || null;
}

function normSlug(value) {
  const out = normText(value);
  if (!out) {
    return "";
  }
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normCurrency(value, fallback = "USD") {
  const out = normText(value);
  return out ? out.toUpperCase().slice(0, 3) : fallback;
}

function parseNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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

function makeUnmappedQueueKey(queueType, sourceSystem, sourceTable, sourcePk, reasonCode) {
  return uuidV5(
    NS_CATALOG_VARIANT,
    `unmapped:${queueType}:${sourceSystem}:${sourceTable}:${sourcePk}:${reasonCode}`
  );
}

async function safeQueryRows(client, sql, warnings, warningText) {
  try {
    const result = await client.query(sql);
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`${warningText}: ${message}`);
    return [];
  }
}

async function writeReport(report) {
  const dir = path.join(reportRoot, BATCH_CODE);
  await mkdir(dir, { recursive: true });
  const stamp = nowFileTimestamp();
  const jsonPath = path.join(dir, `${stamp}-catalog-bridge-backfill.json`);
  const mdPath = path.join(dir, `${stamp}-catalog-bridge-backfill.md`);

  const lines = [
    "# Catalog Bridge Backfill",
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
    ...(report.warnings.length ? report.warnings.map((x) => `- ${x}`) : ["- none"]),
    ""
  ];

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${lines.join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

async function countTargets(client) {
  const [p, v, r, u] = await Promise.all([
    client.query("select count(*)::int as count from catalog_product"),
    client.query("select count(*)::int as count from catalog_variant"),
    client.query("select count(*)::int as count from catalog_variant_rate"),
    client.query("select count(*)::int as count from unmapped_queue where status='OPEN'")
  ]);
  return {
    catalogProduct: Number(p.rows[0]?.count || 0),
    catalogVariant: Number(v.rows[0]?.count || 0),
    catalogVariantRate: Number(r.rows[0]?.count || 0),
    unmappedOpen: Number(u.rows[0]?.count || 0)
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
    const [bProducts, bVariants, bRates, aPackages] = await Promise.all([
      safeQueryRows(
        balisnap,
        `select product_id::text as product_id, legacy_package_id::text as legacy_package_id, product_name, slug, category, short_description, description, is_active, is_featured, thumbnail_url, color_code, priority, country_code, region, base_meeting_point from public."TourProduct"`,
        warnings,
        "Skip balisnap TourProduct"
      ),
      safeQueryRows(
        balisnap,
        `select variant_id::text as variant_id, product_id::text as product_id, legacy_package_id::text as legacy_package_id, variant_code, variant_name, service_type, duration_days, duration_nights, min_pax, max_pax, currency_code, is_default, is_active, booking_cutoff_hours, cancellation_policy from public."TourVariant"`,
        warnings,
        "Skip balisnap TourVariant"
      ),
      safeQueryRows(
        balisnap,
        `select rate_plan_id::text as rate_plan_id, variant_id::text as variant_id, traveler_type, price, currency_code, min_quantity, max_quantity, valid_from, valid_to, is_active from public."VariantRatePlan"`,
        warnings,
        "Skip balisnap VariantRatePlan"
      ),
      safeQueryRows(
        bstadmin,
        `select p.package_id::text as package_id, p.package_name, p.slug, p.short_description, p.description, p.duration_days, p.price_per_person, p.price_per_child, p.min_booking, p.max_booking, p.is_featured, p.thumbnail_url, p.color_code, p.priority, p.base_currency, coalesce(t.is_active, true) as tour_is_active, (select ti.url from public.tour_images ti where ti.tour_id = p.package_id order by ti.image_id asc limit 1) as cover_image_url from public.tour_packages p left join public.tours t on t.tour_id = p.tour_id`,
        warnings,
        "Skip bstadmin tour_packages"
      )
    ]);

    if (bProducts.length === 0 && aPackages.length === 0) {
      throw new Error("No catalog source rows extracted from balisnap/bstadmin.");
    }

    const productsByKey = new Map();
    const productByLegacyPackage = new Map();
    const productByProductId = new Map();
    const productBySlug = new Map();
    const unmapped = [];

    for (const row of bProducts) {
      const productId = String(row.product_id);
      const key = uuidV5(NS_CATALOG_PRODUCT, `balisnap:TourProduct:${productId}`);
      const slug = normSlug(row.slug) || `balisnap-product-${productId}`;
      productsByKey.set(key, {
        productKey: key,
        slug,
        name: normText(row.product_name) || `Product ${productId}`,
        productCategory: normText(row.category),
        shortDescription: normText(row.short_description),
        description: normText(row.description),
        isActive: parseBool(row.is_active, true),
        isFeatured: parseBool(row.is_featured, false),
        thumbnailUrl: normText(row.thumbnail_url),
        colorCode: normText(row.color_code),
        priority: parseNum(row.priority, null),
        countryCode: normText(row.country_code)?.toUpperCase().slice(0, 2) || "ID",
        region: normText(row.region),
        baseMeetingPoint: normText(row.base_meeting_point)
      });
      productByProductId.set(productId, key);
      productBySlug.set(slug, key);
      if (normText(row.legacy_package_id)) {
        productByLegacyPackage.set(String(row.legacy_package_id), key);
      }
    }

    const packageById = new Map();
    for (const row of aPackages) {
      packageById.set(String(row.package_id), row);
      const packageId = String(row.package_id);
      const slug = normSlug(row.slug);
      const matched = productByLegacyPackage.get(packageId) || (slug ? productBySlug.get(slug) : "");
      if (!matched) {
        unmapped.push({
          queueKey: makeUnmappedQueueKey(
            "PRODUCT_MAPPING",
            "bstadmin",
            "tour_packages",
            packageId,
            "NO_MATCH"
          ),
          queueType: "PRODUCT_MAPPING",
          sourceSystem: "bstadmin",
          sourceTable: "tour_packages",
          sourcePk: packageId,
          reasonCode: "NO_MATCH",
          reasonDetail: "No balisnap match via legacy_package_id/slug",
          payload: {
            packageSlug: normText(row.slug),
            packageName: normText(row.package_name)
          }
        });

        const key = uuidV5(NS_CATALOG_PRODUCT, `bstadmin:tour_packages:${packageId}`);
        const fallbackSlug = slug || `bstadmin-package-${packageId}`;
        productsByKey.set(key, {
          productKey: key,
          slug: fallbackSlug,
          name: normText(row.package_name) || `Package ${packageId}`,
          productCategory: null,
          shortDescription: normText(row.short_description),
          description: normText(row.description),
          isActive: parseBool(row.tour_is_active, true),
          isFeatured: parseBool(row.is_featured, false),
          thumbnailUrl: normText(row.thumbnail_url) || normText(row.cover_image_url),
          colorCode: normText(row.color_code),
          priority: parseNum(row.priority, null),
          countryCode: "ID",
          region: null,
          baseMeetingPoint: null
        });
        productByLegacyPackage.set(packageId, key);
      }
    }

    const variantsByKey = new Map();
    const variantByVariantId = new Map();
    const variantByLegacyPackage = new Map();

    for (const row of bVariants) {
      const variantId = String(row.variant_id);
      const legacyPackageId = normText(row.legacy_package_id);
      const productKey = productByProductId.get(String(row.product_id)) || (legacyPackageId ? productByLegacyPackage.get(legacyPackageId) : "");
      if (!productKey) {
        unmapped.push({
          queueKey: makeUnmappedQueueKey(
            "VARIANT_MAPPING",
            "balisnap",
            "TourVariant",
            variantId,
            "NO_MATCH"
          ),
          queueType: "VARIANT_MAPPING",
          sourceSystem: "balisnap",
          sourceTable: "TourVariant",
          sourcePk: variantId,
          reasonCode: "NO_MATCH",
          reasonDetail: "Parent product mapping not found",
          payload: {
            productId: normText(row.product_id),
            legacyPackageId
          }
        });
        continue;
      }
      const key = uuidV5(NS_CATALOG_VARIANT, `balisnap:TourVariant:${variantId}`);
      variantsByKey.set(key, {
        variantKey: key,
        productKey,
        code: normText(row.variant_code)?.toUpperCase() || `VARIANT-${variantId}`,
        name: normText(row.variant_name) || `Variant ${variantId}`,
        serviceType: normText(row.service_type)?.toUpperCase() || "PRIVATE",
        durationDays: Math.max(1, parseIntOr(row.duration_days, 1)),
        durationNights: parseNum(row.duration_nights, null),
        minPax: Math.max(1, parseIntOr(row.min_pax, 1)),
        maxPax: parseNum(row.max_pax, null),
        currencyCode: normCurrency(row.currency_code, "USD"),
        isDefault: parseBool(row.is_default, false),
        isActive: parseBool(row.is_active, true),
        bookingCutoffHours: Math.max(0, parseIntOr(row.booking_cutoff_hours, 24)),
        cancellationPolicy: normText(row.cancellation_policy),
        legacyPackageId
      });
      variantByVariantId.set(variantId, key);
      if (legacyPackageId) {
        variantByLegacyPackage.set(legacyPackageId, key);
      }
    }

    for (const row of aPackages) {
      const packageId = String(row.package_id);
      if (variantByLegacyPackage.has(packageId)) {
        continue;
      }
      const productKey = productByLegacyPackage.get(packageId);
      if (!productKey) {
        continue;
      }
      const key = uuidV5(NS_CATALOG_VARIANT, `bstadmin:tour_packages:${packageId}`);
      variantsByKey.set(key, {
        variantKey: key,
        productKey,
        code: `PKG-${packageId}`,
        name: normText(row.package_name) || `Package ${packageId}`,
        serviceType: "PRIVATE",
        durationDays: Math.max(1, parseIntOr(row.duration_days, 1)),
        durationNights: null,
        minPax: Math.max(1, parseIntOr(row.min_booking, 1)),
        maxPax: parseNum(row.max_booking, null),
        currencyCode: normCurrency(row.base_currency, "USD"),
        isDefault: true,
        isActive: true,
        bookingCutoffHours: 24,
        cancellationPolicy: null,
        legacyPackageId: packageId
      });
      variantByLegacyPackage.set(packageId, key);
    }

    const ratesByKey = new Map();
    const hasRateByVariant = new Map();

    for (const row of bRates) {
      const keyVariant = variantByVariantId.get(String(row.variant_id));
      if (!keyVariant) {
        unmapped.push({
          queueKey: makeUnmappedQueueKey(
            "VARIANT_MAPPING",
            "balisnap",
            "VariantRatePlan",
            String(row.rate_plan_id),
            "NO_MATCH"
          ),
          queueType: "VARIANT_MAPPING",
          sourceSystem: "balisnap",
          sourceTable: "VariantRatePlan",
          sourcePk: String(row.rate_plan_id),
          reasonCode: "NO_MATCH",
          reasonDetail: "Parent variant mapping not found",
          payload: {
            variantId: normText(row.variant_id)
          }
        });
        continue;
      }
      const price = parseNum(row.price, null);
      if (price === null) {
        unmapped.push({
          queueKey: makeUnmappedQueueKey(
            "CATALOG_EXTENDED_METADATA",
            "balisnap",
            "VariantRatePlan",
            String(row.rate_plan_id),
            "INVALID_SOURCE"
          ),
          queueType: "CATALOG_EXTENDED_METADATA",
          sourceSystem: "balisnap",
          sourceTable: "VariantRatePlan",
          sourcePk: String(row.rate_plan_id),
          reasonCode: "INVALID_SOURCE",
          reasonDetail: "Rate price missing/invalid",
          payload: {
            variantId: normText(row.variant_id)
          }
        });
        continue;
      }
      const keyRate = uuidV5(NS_CATALOG_VARIANT, `balisnap:VariantRatePlan:${row.rate_plan_id}`);
      ratesByKey.set(keyRate, {
        variantRateKey: keyRate,
        variantKey: keyVariant,
        travelerType: normText(row.traveler_type)?.toUpperCase() || "ADULT",
        currencyCode: normCurrency(row.currency_code, "USD"),
        price,
        minQuantity: parseNum(row.min_quantity, null),
        maxQuantity: parseNum(row.max_quantity, null),
        validFrom: row.valid_from || null,
        validTo: row.valid_to || null,
        isActive: parseBool(row.is_active, true)
      });
      hasRateByVariant.set(keyVariant, true);
    }

    for (const variant of variantsByKey.values()) {
      if (hasRateByVariant.get(variant.variantKey)) {
        continue;
      }
      const pkg = variant.legacyPackageId ? packageById.get(variant.legacyPackageId) : null;
      const adult = pkg ? parseNum(pkg.price_per_person, null) : null;
      if (adult !== null && adult > 0) {
        const keyRate = uuidV5(NS_CATALOG_VARIANT, `fallback:adult:${variant.variantKey}`);
        ratesByKey.set(keyRate, {
          variantRateKey: keyRate,
          variantKey: variant.variantKey,
          travelerType: "ADULT",
          currencyCode: normCurrency(pkg.base_currency, variant.currencyCode),
          price: adult,
          minQuantity: null,
          maxQuantity: null,
          validFrom: null,
          validTo: null,
          isActive: true
        });
      }
      if (!(adult !== null && adult > 0)) {
        unmapped.push({
          queueKey: makeUnmappedQueueKey(
            "CATALOG_EXTENDED_METADATA",
            pkg ? "bstadmin" : "balisnap",
            pkg ? "tour_packages" : "TourVariant",
            pkg ? String(pkg.package_id) : variant.variantKey,
            "NO_RATE_AVAILABLE"
          ),
          queueType: "CATALOG_EXTENDED_METADATA",
          sourceSystem: pkg ? "bstadmin" : "balisnap",
          sourceTable: pkg ? "tour_packages" : "TourVariant",
          sourcePk: pkg ? String(pkg.package_id) : variant.variantKey,
          reasonCode: "NO_RATE_AVAILABLE",
          reasonDetail: "Variant has no active rate and no fallback package price",
          payload: {
            variantKey: variant.variantKey,
            legacyPackageId: variant.legacyPackageId
          }
        });
      }
    }

    const products = [...productsByKey.values()];
    const variants = [...variantsByKey.values()];
    const rates = [...ratesByKey.values()];
    const unmappedDeduped = [...new Map(unmapped.map((x) => [x.queueKey, x])).values()];

    if (products.length === 0 || variants.length === 0) {
      throw new Error(`Backfill output invalid product=${products.length} variant=${variants.length}`);
    }

    const before = await countTargets(target);
    let after = before;

    if (!DRY_RUN) {
      await target.query("begin");
      try {
        for (const p of products) {
          await target.query(
            `insert into catalog_product (product_key, slug, name, product_category, short_description, description, is_active, is_featured, thumbnail_url, color_code, priority, country_code, region, base_meeting_point)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             on conflict (product_key) do update set
               slug=excluded.slug, name=excluded.name, product_category=excluded.product_category, short_description=excluded.short_description, description=excluded.description,
               is_active=excluded.is_active, is_featured=excluded.is_featured, thumbnail_url=excluded.thumbnail_url, color_code=excluded.color_code, priority=excluded.priority,
               country_code=excluded.country_code, region=excluded.region, base_meeting_point=excluded.base_meeting_point, updated_at=now()`,
            [p.productKey, p.slug, p.name, p.productCategory, p.shortDescription, p.description, p.isActive, p.isFeatured, p.thumbnailUrl, p.colorCode, p.priority, p.countryCode, p.region, p.baseMeetingPoint]
          );
        }
        for (const v of variants) {
          await target.query(
            `insert into catalog_variant (variant_key, product_key, code, name, service_type, duration_days, duration_nights, min_pax, max_pax, currency_code, is_default, is_active, booking_cutoff_hours, cancellation_policy)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             on conflict (variant_key) do update set
               product_key=excluded.product_key, code=excluded.code, name=excluded.name, service_type=excluded.service_type, duration_days=excluded.duration_days, duration_nights=excluded.duration_nights,
               min_pax=excluded.min_pax, max_pax=excluded.max_pax, currency_code=excluded.currency_code, is_default=excluded.is_default, is_active=excluded.is_active,
               booking_cutoff_hours=excluded.booking_cutoff_hours, cancellation_policy=excluded.cancellation_policy, updated_at=now()`,
            [v.variantKey, v.productKey, v.code, v.name, v.serviceType, v.durationDays, v.durationNights, v.minPax, v.maxPax, v.currencyCode, v.isDefault, v.isActive, v.bookingCutoffHours, v.cancellationPolicy]
          );
        }
        for (const r of rates) {
          await target.query(
            `insert into catalog_variant_rate (variant_rate_key, variant_key, traveler_type, currency_code, price, min_quantity, max_quantity, valid_from, valid_to, is_active)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             on conflict (variant_rate_key) do update set
               variant_key=excluded.variant_key, traveler_type=excluded.traveler_type, currency_code=excluded.currency_code, price=excluded.price, min_quantity=excluded.min_quantity,
               max_quantity=excluded.max_quantity, valid_from=excluded.valid_from, valid_to=excluded.valid_to, is_active=excluded.is_active, updated_at=now()`,
            [r.variantRateKey, r.variantKey, r.travelerType, r.currencyCode, r.price, r.minQuantity, r.maxQuantity, r.validFrom, r.validTo, r.isActive]
          );
        }
        for (const u of unmappedDeduped) {
          await target.query(
            `insert into unmapped_queue (queue_key, queue_type, channel_code, source_system, source_table, source_pk, reason_code, reason_detail, status, payload)
             values ($1,$2,null,$3,$4,$5,$6,$7,'OPEN',$8::jsonb)
             on conflict (queue_key) do update set
               queue_type=excluded.queue_type, source_system=excluded.source_system, source_table=excluded.source_table, source_pk=excluded.source_pk,
               reason_code=excluded.reason_code, reason_detail=excluded.reason_detail, status='OPEN', payload=excluded.payload, resolved_by=null, resolved_at=null, updated_at=now()`,
            [u.queueKey, u.queueType, u.sourceSystem, u.sourceTable, u.sourcePk, u.reasonCode, u.reasonDetail, JSON.stringify(u.payload || {})]
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
      gate: "EP-004_CATALOG_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt,
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "PASS",
      counts: {
        extracted: {
          balisnapProducts: bProducts.length,
          balisnapVariants: bVariants.length,
          balisnapRates: bRates.length,
          bstadminPackages: aPackages.length
        },
        prepared: {
          catalogProducts: products.length,
          catalogVariants: variants.length,
          catalogVariantRates: rates.length,
          unmappedQueueOpenEntries: unmappedDeduped.length
        },
        before,
        after
      },
      warnings
    };

    const output = await writeReport(report);
    console.log("CATALOG_BRIDGE_BACKFILL_RESULT=PASS");
    console.log(`CATALOG_BRIDGE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`CATALOG_BRIDGE_BACKFILL_MD=${output.mdPath}`);
  } finally {
    await Promise.all([target.end().catch(() => {}), balisnap.end().catch(() => {}), bstadmin.end().catch(() => {})]);
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const output = await writeReport({
      gate: "EP-004_CATALOG_BRIDGE_BACKFILL",
      batchCode: BATCH_CODE,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      dryRun: DRY_RUN,
      result: "FAIL",
      counts: {},
      warnings: [message]
    });
    console.log(`CATALOG_BRIDGE_BACKFILL_JSON=${output.jsonPath}`);
    console.log(`CATALOG_BRIDGE_BACKFILL_MD=${output.mdPath}`);
  } catch {
    // ignore fail-report write error
  }
  console.error(`CATALOG_BRIDGE_BACKFILL_RESULT=FAIL ${message}`);
  process.exit(1);
});
