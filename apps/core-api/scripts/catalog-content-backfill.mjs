import { resolveSourceDbUrls } from "./_legacy-db-env.mjs";
import pg from "pg";

const { Client } = pg;

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeSlug(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCode(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : "";
}

function toInt(value, fallback, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return fallback;
  }
  return normalized;
}

function createEmptyContent() {
  return {
    slides: [],
    itinerary: [],
    highlights: [],
    inclusions: [],
    exclusions: [],
    additionalInfo: [],
    optionalFeatures: [],
    faqs: []
  };
}

function createBucket() {
  return {
    content: createEmptyContent(),
    highlightsMeta: [],
    inclusionsMeta: [],
    exclusionsMeta: [],
    additionalInfoMeta: [],
    optionalFeaturesMeta: []
  };
}

function uniqueSortedStrings(rows) {
  const sorted = [...rows].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.text.localeCompare(right.text);
  });
  const output = [];
  const seen = new Set();
  for (const row of sorted) {
    if (!row.text || seen.has(row.text)) {
      continue;
    }
    seen.add(row.text);
    output.push(row.text);
  }
  return output;
}

async function run() {
  const { opsDbUrl, balisnapDbUrl } = resolveSourceDbUrls(process.env);
  if (!opsDbUrl) {
    throw new Error("Missing OPS_DB_URL");
  }
  if (!balisnapDbUrl) {
    throw new Error("Missing BALISNAP_DB_URL");
  }

  const ops = new Client({ connectionString: opsDbUrl });
  const source = new Client({ connectionString: balisnapDbUrl });
  await Promise.all([ops.connect(), source.connect()]);

  try {
    await ops.query(`
      create table if not exists catalog_product_content (
        product_key uuid primary key references catalog_product(product_key) on delete cascade,
        payload jsonb not null default '{}'::jsonb,
        updated_by varchar(191),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    const [
      sourceProductsResult,
      sourceVariantsResult,
      sourceSlidesResult,
      sourceItineraryResult,
      sourceHighlightsResult,
      sourceInclusionsResult,
      sourceExclusionsResult,
      sourceAdditionalInfoResult,
      sourceOptionalFeaturesResult,
      opsProductsResult,
      opsVariantsResult
    ] = await Promise.all([
      source.query(`
        select
          p.product_id::text as product_id,
          p.slug
        from public."TourProduct" p
      `),
      source.query(`
        select
          v.variant_id::text as variant_id,
          v.product_id::text as product_id,
          v.variant_code
        from public."TourVariant" v
      `),
      source.query(`
        select
          m.product_id::text as product_id,
          m.url,
          m.alt_text,
          m.sort_order,
          m.is_cover
        from public."TourProductMedia" m
        order by m.sort_order asc nulls last, m.media_id asc
      `),
      source.query(`
        select
          i.variant_id::text as variant_id,
          i.day,
          i.sort_order,
          i.title,
          i.description,
          i.location,
          i.start_time,
          i.end_time
        from public."VariantItinerary" i
        order by i.day asc, i.sort_order asc nulls last, i.itinerary_id asc
      `),
      source.query(`
        select
          h.variant_id::text as variant_id,
          h.description,
          h.sort_order
        from public."VariantHighlight" h
        order by h.sort_order asc nulls last, h.highlight_id asc
      `),
      source.query(`
        select
          i.variant_id::text as variant_id,
          i.note,
          i.sort_order
        from public."VariantInclusion" i
        order by i.sort_order asc nulls last, i.inclusion_id asc
      `),
      source.query(`
        select
          e.variant_id::text as variant_id,
          e.note,
          e.sort_order
        from public."VariantExclusion" e
        order by e.sort_order asc nulls last, e.exclusion_id asc
      `),
      source.query(`
        select
          a.variant_id::text as variant_id,
          a.description,
          a.sort_order
        from public."VariantAdditionalInfo" a
        order by a.sort_order asc nulls last, a.info_id asc
      `),
      source.query(`
        select
          f.variant_id::text as variant_id,
          f.description,
          f.sort_order
        from public."VariantOptionalFeature" f
        order by f.sort_order asc nulls last, f.feature_id asc
      `),
      ops.query(`
        select
          p.product_key::text as item_id,
          p.slug
        from catalog_product p
      `),
      ops.query(`
        select
          v.variant_key::text as variant_id,
          p.slug,
          v.code
        from catalog_variant v
        join catalog_product p
          on p.product_key = v.product_key
      `)
    ]);

    const sourceProductIdToSlug = new Map();
    for (const row of sourceProductsResult.rows) {
      const slug = normalizeSlug(row.slug);
      if (!slug) {
        continue;
      }
      sourceProductIdToSlug.set(String(row.product_id), slug);
    }

    const sourceVariantMetaById = new Map();
    for (const row of sourceVariantsResult.rows) {
      const productSlug = sourceProductIdToSlug.get(String(row.product_id));
      if (!productSlug) {
        continue;
      }
      sourceVariantMetaById.set(String(row.variant_id), {
        productSlug,
        variantCode: normalizeCode(row.variant_code)
      });
    }

    const opsItemIdBySlug = new Map();
    for (const row of opsProductsResult.rows) {
      const slug = normalizeSlug(row.slug);
      if (!slug) {
        continue;
      }
      opsItemIdBySlug.set(slug, String(row.item_id));
    }

    const opsVariantIdBySlugAndCode = new Map();
    for (const row of opsVariantsResult.rows) {
      const slug = normalizeSlug(row.slug);
      const code = normalizeCode(row.code);
      if (!slug || !code) {
        continue;
      }
      opsVariantIdBySlugAndCode.set(`${slug}|${code}`, String(row.variant_id));
    }

    const bucketsBySlug = new Map();
    const ensureBucket = (slug) => {
      if (!bucketsBySlug.has(slug)) {
        bucketsBySlug.set(slug, createBucket());
      }
      return bucketsBySlug.get(slug);
    };

    for (const row of sourceSlidesResult.rows) {
      const slug = sourceProductIdToSlug.get(String(row.product_id));
      if (!slug) {
        continue;
      }
      const url = normalizeText(row.url);
      if (!url) {
        continue;
      }
      const bucket = ensureBucket(slug);
      bucket.content.slides.push({
        url,
        altText: normalizeText(row.alt_text),
        isCover: Boolean(row.is_cover),
        sortOrder: toInt(row.sort_order, bucket.content.slides.length + 1, 0)
      });
    }

    for (const row of sourceItineraryResult.rows) {
      const variantMeta = sourceVariantMetaById.get(String(row.variant_id));
      if (!variantMeta) {
        continue;
      }
      const title = normalizeText(row.title);
      if (!title) {
        continue;
      }
      const bucket = ensureBucket(variantMeta.productSlug);
      const variantId = opsVariantIdBySlugAndCode.get(
        `${variantMeta.productSlug}|${variantMeta.variantCode}`
      );
      bucket.content.itinerary.push({
        variantId: variantId || null,
        day: toInt(row.day, 1, 1),
        sortOrder: toInt(row.sort_order, bucket.content.itinerary.length + 1, 0),
        title,
        description: normalizeText(row.description),
        location: normalizeText(row.location),
        startTime: normalizeText(row.start_time),
        endTime: normalizeText(row.end_time)
      });
    }

    const pushMeta = (rows, metaKey, textField) => {
      for (const row of rows) {
        const variantMeta = sourceVariantMetaById.get(String(row.variant_id));
        if (!variantMeta) {
          continue;
        }
        const text = normalizeText(row[textField]);
        if (!text) {
          continue;
        }
        const bucket = ensureBucket(variantMeta.productSlug);
        bucket[metaKey].push({
          text,
          sortOrder: toInt(row.sort_order, 0, 0)
        });
      }
    };

    pushMeta(sourceHighlightsResult.rows, "highlightsMeta", "description");
    pushMeta(sourceInclusionsResult.rows, "inclusionsMeta", "note");
    pushMeta(sourceExclusionsResult.rows, "exclusionsMeta", "note");
    pushMeta(sourceAdditionalInfoResult.rows, "additionalInfoMeta", "description");
    pushMeta(sourceOptionalFeaturesResult.rows, "optionalFeaturesMeta", "description");

    let upsertedRows = 0;
    const missingOpsProducts = [];

    await ops.query("begin");
    try {
      for (const [slug, bucket] of bucketsBySlug.entries()) {
        const itemId = opsItemIdBySlug.get(slug);
        if (!itemId) {
          missingOpsProducts.push(slug);
          continue;
        }

        bucket.content.slides.sort((left, right) => left.sortOrder - right.sortOrder);
        bucket.content.itinerary.sort((left, right) => {
          if (left.day !== right.day) {
            return left.day - right.day;
          }
          return left.sortOrder - right.sortOrder;
        });
        bucket.content.highlights = uniqueSortedStrings(bucket.highlightsMeta);
        bucket.content.inclusions = uniqueSortedStrings(bucket.inclusionsMeta);
        bucket.content.exclusions = uniqueSortedStrings(bucket.exclusionsMeta);
        bucket.content.additionalInfo = uniqueSortedStrings(bucket.additionalInfoMeta);
        bucket.content.optionalFeatures = uniqueSortedStrings(bucket.optionalFeaturesMeta);

        if (bucket.content.slides.length > 0 && !bucket.content.slides.some((slide) => slide.isCover)) {
          bucket.content.slides[0].isCover = true;
        }

        await ops.query(
          `
            insert into catalog_product_content (
              product_key,
              payload,
              updated_by
            ) values (
              $1::uuid,
              $2::jsonb,
              $3
            )
            on conflict (product_key) do update
            set payload = excluded.payload,
                updated_by = excluded.updated_by,
                updated_at = now()
          `,
          [itemId, JSON.stringify(bucket.content), "catalog-content-backfill"]
        );
        upsertedRows += 1;
      }
      await ops.query("commit");
    } catch (error) {
      await ops.query("rollback");
      throw error;
    }

    console.log("CATALOG_CONTENT_BACKFILL_RESULT=PASS");
    console.log(`CATALOG_CONTENT_BACKFILL_SOURCE_PRODUCTS=${sourceProductsResult.rowCount}`);
    console.log(`CATALOG_CONTENT_BACKFILL_SOURCE_VARIANTS=${sourceVariantsResult.rowCount}`);
    console.log(`CATALOG_CONTENT_BACKFILL_UPSERTED_ROWS=${upsertedRows}`);
    console.log(`CATALOG_CONTENT_BACKFILL_MISSING_OPS_PRODUCTS=${missingOpsProducts.length}`);
    if (missingOpsProducts.length > 0) {
      console.log(`CATALOG_CONTENT_BACKFILL_MISSING_OPS_SLUGS=${missingOpsProducts.join(",")}`);
    }
  } finally {
    await Promise.all([ops.end().catch(() => {}), source.end().catch(() => {})]);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CATALOG_CONTENT_BACKFILL_RESULT=FAIL ${message}`);
  process.exit(1);
});
