import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { resolveOpsDbUrl } from "./_legacy-db-env.mjs";

const { Client } = pg;

const connectionString = resolveOpsDbUrl(process.env);
const batchCode = process.env.PHASE2_BATCH_CODE || "C";
const maxOrphanRatioPercent = readNumber("GATE_CATALOG_MAX_ORPHAN_RATIO_PERCENT", 0.5, 0);
const maxUnmappedRatioPercent = readNumber("GATE_CATALOG_MAX_UNMAPPED_RATIO_PERCENT", 5, 0);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/catalog-bridge");

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

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createCheck(name, passed, detail) {
  return { name, passed, detail };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Catalog Bridge Gate Report (Batch C)");
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
  await mkdir(reportRootDir, { recursive: true });
  const timestamp = nowTimestampForFile();
  const jsonPath = path.join(reportRootDir, `${timestamp}.json`);
  const mdPath = path.join(reportRootDir, `${timestamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");
  return { jsonPath, mdPath };
}

async function queryMetrics(client) {
  const [totalsResult, orphanResult, unmappedResult, rateCoverageResult] = await Promise.all([
    client.query(`
      select
        (select count(*) from catalog_product)::int as total_products,
        (select count(*) from catalog_variant)::int as total_variants
    `),
    client.query(`
      with product_without_variant as (
        select count(*)::int as count
        from catalog_product p
        where not exists (
          select 1 from catalog_variant v where v.product_key = p.product_key
        )
      ),
      variant_without_product as (
        select count(*)::int as count
        from catalog_variant v
        left join catalog_product p on p.product_key = v.product_key
        where p.product_key is null
      )
      select
        (select count from product_without_variant)::int as product_orphan_rows,
        (select count from variant_without_product)::int as variant_orphan_rows
    `),
    client.query(`
      select count(*)::int as unmapped_rows
      from unmapped_queue
      where status = 'OPEN'
        and queue_type in ('PRODUCT_MAPPING', 'VARIANT_MAPPING', 'CATALOG_EXTENDED_METADATA')
    `),
    client.query(`
      with coverage as (
        select
          v.variant_key,
          exists (
            select 1
            from catalog_variant_rate r
            where r.variant_key = v.variant_key
              and r.is_active = true
          ) as has_active_rate
        from catalog_variant v
      )
      select
        count(*)::int as total_variants,
        count(*) filter (where has_active_rate)::int as variants_with_rate
      from coverage
    `)
  ]);

  const totalProducts = toNumber(totalsResult.rows[0]?.total_products);
  const totalVariants = toNumber(totalsResult.rows[0]?.total_variants);
  const denominator = totalProducts + totalVariants;

  const productOrphanRows = toNumber(orphanResult.rows[0]?.product_orphan_rows);
  const variantOrphanRows = toNumber(orphanResult.rows[0]?.variant_orphan_rows);
  const orphanRows = productOrphanRows + variantOrphanRows;
  const orphanRatioPercent = denominator > 0 ? Number(((orphanRows / denominator) * 100).toFixed(2)) : null;

  const unmappedRows = toNumber(unmappedResult.rows[0]?.unmapped_rows);
  const unmappedRatioPercent =
    denominator > 0 ? Number(((unmappedRows / denominator) * 100).toFixed(2)) : null;

  const variantsWithRate = toNumber(rateCoverageResult.rows[0]?.variants_with_rate);
  const variantCoveragePercent =
    totalVariants > 0 ? Number(((variantsWithRate / totalVariants) * 100).toFixed(2)) : null;

  return {
    totalProducts,
    totalVariants,
    denominator,
    productOrphanRows,
    variantOrphanRows,
    orphanRows,
    orphanRatioPercent,
    unmappedRows,
    unmappedRatioPercent,
    variantsWithRate,
    variantCoveragePercent
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

    const c01Passed =
      metrics.denominator > 0 &&
      metrics.orphanRatioPercent !== null &&
      metrics.orphanRatioPercent <= maxOrphanRatioPercent;
    const c02Passed =
      metrics.denominator > 0 &&
      metrics.unmappedRatioPercent !== null &&
      metrics.unmappedRatioPercent <= maxUnmappedRatioPercent;
    const c03Passed =
      metrics.totalVariants > 0 &&
      metrics.variantsWithRate === metrics.totalVariants &&
      metrics.variantCoveragePercent === 100;

    const checks = [
      createCheck(
        "C-01_orphan_ratio_percent",
        c01Passed,
        `ratio=${metrics.orphanRatioPercent ?? "n/a"}, max=${maxOrphanRatioPercent}, orphanRows=${metrics.orphanRows}, denominator=${metrics.denominator}`
      ),
      createCheck(
        "C-02_unmapped_ratio_percent",
        c02Passed,
        `ratio=${metrics.unmappedRatioPercent ?? "n/a"}, max=${maxUnmappedRatioPercent}, unmappedRows=${metrics.unmappedRows}, denominator=${metrics.denominator}`
      ),
      createCheck(
        "C-03_variant_active_rate_coverage",
        c03Passed,
        `coverage=${metrics.variantCoveragePercent ?? "n/a"}%, variantsWithRate=${metrics.variantsWithRate}, totalVariants=${metrics.totalVariants}`
      )
    ];

    const report = {
      gate: "CATALOG_BRIDGE_BATCH_C",
      batchCode,
      startedAt,
      endedAt: new Date().toISOString(),
      thresholds: {
        maxOrphanRatioPercent,
        maxUnmappedRatioPercent
      },
      metrics,
      checks,
      result: checks.every((item) => item.passed) ? "PASS" : "FAIL"
    };

    const output = await writeReport(report);
    console.log(`CATALOG_BRIDGE_GATE_RESULT=${report.result}`);
    console.log(`CATALOG_BRIDGE_GATE_JSON=${output.jsonPath}`);
    console.log(`CATALOG_BRIDGE_GATE_MD=${output.mdPath}`);

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
  console.error(
    `CATALOG_BRIDGE_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
