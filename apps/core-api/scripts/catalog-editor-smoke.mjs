import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/smoke/catalog-editor");

const baseUrl = readText(process.env.CORE_API_BASE_URL, "http://127.0.0.1:4000").replace(/\/+$/, "");
const adminToken = readText(process.env.CORE_API_ADMIN_TOKEN, "dev-admin-token");
const adminRole = readText(process.env.CORE_API_ADMIN_ROLE, "MANAGER").toUpperCase();
const actor = readText(process.env.CATALOG_EDITOR_SMOKE_ACTOR, "catalog-editor-smoke");
const timeoutMs = readNumber(process.env.CATALOG_EDITOR_SMOKE_TIMEOUT_MS, 15000, 1000);

function readText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized || fallback;
}

function readNumber(value, fallback, min) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.floor(parsed);
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createCheck(name, passed, detail) {
  return { name, passed, detail };
}

function resolveUrl(requestPath) {
  return `${baseUrl}${requestPath.startsWith("/") ? requestPath : `/${requestPath}`}`;
}

function createHeaders() {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${adminToken}`,
    "x-admin-role": adminRole,
    "x-actor": actor
  };
}

async function requestJson(method, requestPath, body, options = {}) {
  const url = resolveUrl(requestPath);
  const serializedBody = body === undefined ? "" : JSON.stringify(body);
  const headers = options.auth === false ? { "content-type": "application/json" } : createHeaders();

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : serializedBody || "{}",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      data: null,
      error: message,
      raw: null,
      url,
      method,
      requestPath
    };
  }

  const durationMs = Date.now() - startedAt;
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const errorMessage =
    parsed?.error?.message || parsed?.message || parsed?.error?.code || (!response.ok ? `HTTP_${response.status}` : null);

  return {
    ok: response.ok,
    status: response.status,
    durationMs,
    data: parsed?.data ?? null,
    error: errorMessage,
    raw,
    url,
    method,
    requestPath
  };
}

function summarizeStep(step) {
  return {
    name: step.name,
    status: step.status,
    ok: step.ok,
    error: step.error || null,
    durationMs: step.durationMs,
    path: step.path,
    method: step.method
  };
}

function createMarkdown(report, jsonPath) {
  const lines = [];
  lines.push("# Catalog Editor Smoke Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Config");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.config, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const check of report.checks) {
    lines.push(`| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${check.detail} |`);
  }
  lines.push("");
  lines.push("## API Steps");
  lines.push("");
  lines.push("| Step | HTTP | Result | Duration (ms) | Error |");
  lines.push("|---|---:|---|---:|---|");
  for (const step of report.steps) {
    lines.push(
      `| ${step.name} | ${step.status ?? "n/a"} | ${step.ok ? "PASS" : "FAIL"} | ${step.durationMs} | ${step.error || "n/a"} |`
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.summary, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const stamp = nowTimestampForFile();
  const jsonPath = path.join(reportRootDir, `${stamp}.json`);
  const mdPath = path.join(reportRootDir, `${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdown(report, jsonPath), "utf8");
  return { jsonPath, mdPath };
}

function findVariantByCode(item, code) {
  if (!item || !Array.isArray(item.variants)) {
    return null;
  }
  return item.variants.find((variant) => String(variant?.code || "").toUpperCase() === code.toUpperCase()) || null;
}

function findRate(item, variantId, travelerType) {
  if (!item || !Array.isArray(item.variants)) {
    return null;
  }
  const variant = item.variants.find((entry) => String(entry?.variantId || "") === String(variantId));
  if (!variant || !Array.isArray(variant.rates)) {
    return null;
  }
  return (
    variant.rates.find(
      (rate) => String(rate?.travelerType || "").toUpperCase() === travelerType.toUpperCase()
    ) || null
  );
}

async function run() {
  const startedAt = new Date().toISOString();
  const checks = [];
  const steps = [];

  const unique = Date.now();
  const slug = `smoke-catalog-item-${unique}`;
  const itemName = `Smoke Catalog Item ${unique}`;
  const updatedItemName = `Smoke Catalog Item Updated ${unique}`;
  const variantCode = `SMK-${String(unique).slice(-8)}`;
  const variantName = `Smoke Variant ${unique}`;
  const updatedVariantName = `Smoke Variant Updated ${unique}`;

  let itemId = "";
  let variantId = "";
  let rateId = "";

  const healthStep = await requestJson("GET", "/health", undefined, { auth: false });
  steps.push({ name: "health", path: "/health", method: "GET", ...healthStep });
  checks.push(
    createCheck(
      "CE-00_health_reachable",
      healthStep.ok,
      `status=${healthStep.status ?? "n/a"} error=${healthStep.error || "none"}`
    )
  );

  const createItemStep = await requestJson("POST", "/v1/catalog/items", {
    slug,
    name: itemName,
    description: "Catalog editor smoke test item",
    isActive: true,
    isFeatured: false,
    thumbnailUrl: "https://example.com/smoke-item.jpg"
  });
  steps.push({ name: "create_item", path: "/v1/catalog/items", method: "POST", ...createItemStep });
  itemId = createItemStep.ok ? String(createItemStep.data?.itemId || "") : "";
  checks.push(
    createCheck(
      "CE-01_create_item",
      createItemStep.ok && Boolean(itemId),
      `status=${createItemStep.status ?? "n/a"} itemId=${itemId || "none"} error=${createItemStep.error || "none"}`
    )
  );

  if (!itemId) {
    throw new Error("Failed to create catalog item during smoke test");
  }

  const getItemStep = await requestJson("GET", `/v1/catalog/items/id/${itemId}?includeInactive=true`);
  steps.push({
    name: "get_item",
    path: `/v1/catalog/items/id/${itemId}?includeInactive=true`,
    method: "GET",
    ...getItemStep
  });
  checks.push(
    createCheck(
      "CE-02_get_item",
      getItemStep.ok && getItemStep.data?.slug === slug,
      `status=${getItemStep.status ?? "n/a"} slug=${getItemStep.data?.slug || "none"}`
    )
  );

  const patchItemStep = await requestJson("PATCH", `/v1/catalog/items/${itemId}`, {
    name: updatedItemName,
    isFeatured: true
  });
  steps.push({
    name: "patch_item",
    path: `/v1/catalog/items/${itemId}`,
    method: "PATCH",
    ...patchItemStep
  });
  checks.push(
    createCheck(
      "CE-03_patch_item",
      patchItemStep.ok && patchItemStep.data?.name === updatedItemName && patchItemStep.data?.isFeatured === true,
      `status=${patchItemStep.status ?? "n/a"} name=${patchItemStep.data?.name || "none"} featured=${String(
        patchItemStep.data?.isFeatured
      )}`
    )
  );

  const patchItemContentStep = await requestJson("PATCH", `/v1/catalog/items/${itemId}/content`, {
    content: {
      slides: [
        {
          url: "https://example.com/slide-1.jpg",
          altText: "Smoke Slide 1",
          isCover: true,
          sortOrder: 1
        }
      ],
      itinerary: [
        {
          variantId: null,
          day: 1,
          sortOrder: 1,
          title: "Pickup",
          description: "Meet at lobby",
          location: "Hotel",
          startTime: "08:00",
          endTime: "08:30"
        }
      ],
      highlights: ["Private tour"],
      inclusions: ["Driver"],
      exclusions: ["Lunch"],
      additionalInfo: ["Bring sunscreen"],
      optionalFeatures: ["Photo package"],
      faqs: [
        {
          question: "Can children join?",
          answer: "Yes"
        }
      ]
    }
  });
  steps.push({
    name: "patch_item_content",
    path: `/v1/catalog/items/${itemId}/content`,
    method: "PATCH",
    ...patchItemContentStep
  });
  checks.push(
    createCheck(
      "CE-03A_patch_item_content",
      patchItemContentStep.ok &&
        Array.isArray(patchItemContentStep.data?.content?.slides) &&
        patchItemContentStep.data?.content?.slides?.length === 1,
      `status=${patchItemContentStep.status ?? "n/a"} slides=${
        Array.isArray(patchItemContentStep.data?.content?.slides)
          ? patchItemContentStep.data.content.slides.length
          : "n/a"
      }`
    )
  );

  const createVariantStep = await requestJson("POST", `/v1/catalog/items/${itemId}/variants`, {
    code: variantCode,
    name: variantName,
    durationDays: 2,
    currencyCode: "USD",
    isDefault: true,
    isActive: true,
    rates: [
      {
        travelerType: "ADULT",
        currencyCode: "USD",
        price: 101,
        isActive: true
      }
    ]
  });
  steps.push({
    name: "create_variant",
    path: `/v1/catalog/items/${itemId}/variants`,
    method: "POST",
    ...createVariantStep
  });
  const createdVariant = createVariantStep.ok ? findVariantByCode(createVariantStep.data, variantCode) : null;
  variantId = createdVariant ? String(createdVariant.variantId) : "";
  checks.push(
    createCheck(
      "CE-04_create_variant",
      createVariantStep.ok && Boolean(variantId),
      `status=${createVariantStep.status ?? "n/a"} variantId=${variantId || "none"} error=${createVariantStep.error || "none"}`
    )
  );

  if (!variantId) {
    throw new Error("Failed to create catalog variant during smoke test");
  }

  const patchVariantStep = await requestJson("PATCH", `/v1/catalog/variants/${variantId}`, {
    name: updatedVariantName,
    durationDays: 3
  });
  steps.push({
    name: "patch_variant",
    path: `/v1/catalog/variants/${variantId}`,
    method: "PATCH",
    ...patchVariantStep
  });
  const patchedVariant = patchVariantStep.ok ? findVariantByCode(patchVariantStep.data, variantCode) : null;
  checks.push(
    createCheck(
      "CE-05_patch_variant",
      patchVariantStep.ok &&
        Boolean(patchedVariant) &&
        patchedVariant?.name === updatedVariantName &&
        Number(patchedVariant?.durationDays) === 3,
      `status=${patchVariantStep.status ?? "n/a"} name=${patchedVariant?.name || "none"} duration=${patchedVariant?.durationDays || "none"}`
    )
  );

  const createRateStep = await requestJson("POST", `/v1/catalog/variants/${variantId}/rates`, {
    travelerType: "CHILD",
    currencyCode: "USD",
    price: 55,
    isActive: true
  });
  steps.push({
    name: "create_rate",
    path: `/v1/catalog/variants/${variantId}/rates`,
    method: "POST",
    ...createRateStep
  });
  const createdRate = createRateStep.ok ? findRate(createRateStep.data, variantId, "CHILD") : null;
  rateId = createdRate ? String(createdRate.rateId) : "";
  checks.push(
    createCheck(
      "CE-06_create_rate",
      createRateStep.ok && Boolean(rateId),
      `status=${createRateStep.status ?? "n/a"} rateId=${rateId || "none"}`
    )
  );

  if (!rateId) {
    throw new Error("Failed to create catalog rate during smoke test");
  }

  const patchRateStep = await requestJson("PATCH", `/v1/catalog/rates/${rateId}`, {
    price: 57
  });
  steps.push({
    name: "patch_rate",
    path: `/v1/catalog/rates/${rateId}`,
    method: "PATCH",
    ...patchRateStep
  });
  const patchedRate = patchRateStep.ok ? findRate(patchRateStep.data, variantId, "CHILD") : null;
  checks.push(
    createCheck(
      "CE-07_patch_rate",
      patchRateStep.ok && Boolean(patchedRate) && Number(patchedRate?.price) === 57,
      `status=${patchRateStep.status ?? "n/a"} price=${patchedRate?.price || "none"}`
    )
  );

  const deactivateRateStep = await requestJson("DELETE", `/v1/catalog/rates/${rateId}`, {});
  steps.push({
    name: "deactivate_rate",
    path: `/v1/catalog/rates/${rateId}`,
    method: "DELETE",
    ...deactivateRateStep
  });
  const deactivatedRate = deactivateRateStep.ok ? findRate(deactivateRateStep.data, variantId, "CHILD") : null;
  checks.push(
    createCheck(
      "CE-08_deactivate_rate",
      deactivateRateStep.ok && Boolean(deactivatedRate) && deactivatedRate?.isActive === false,
      `status=${deactivateRateStep.status ?? "n/a"} isActive=${String(deactivatedRate?.isActive)}`
    )
  );

  const deactivateVariantStep = await requestJson("DELETE", `/v1/catalog/variants/${variantId}`, {});
  steps.push({
    name: "deactivate_variant",
    path: `/v1/catalog/variants/${variantId}`,
    method: "DELETE",
    ...deactivateVariantStep
  });
  const deactivatedVariant = deactivateVariantStep.ok ? findVariantByCode(deactivateVariantStep.data, variantCode) : null;
  checks.push(
    createCheck(
      "CE-09_deactivate_variant",
      deactivateVariantStep.ok && Boolean(deactivatedVariant) && deactivatedVariant?.isActive === false,
      `status=${deactivateVariantStep.status ?? "n/a"} isActive=${String(deactivatedVariant?.isActive)}`
    )
  );

  const deactivateItemStep = await requestJson("DELETE", `/v1/catalog/items/${itemId}`, {});
  steps.push({
    name: "deactivate_item",
    path: `/v1/catalog/items/${itemId}`,
    method: "DELETE",
    ...deactivateItemStep
  });
  checks.push(
    createCheck(
      "CE-10_deactivate_item",
      deactivateItemStep.ok && deactivateItemStep.data?.isActive === false,
      `status=${deactivateItemStep.status ?? "n/a"} isActive=${String(deactivateItemStep.data?.isActive)}`
    )
  );

  const reactivateRateStep = await requestJson("PATCH", `/v1/catalog/rates/${rateId}`, {
    isActive: true
  });
  steps.push({
    name: "reactivate_rate",
    path: `/v1/catalog/rates/${rateId}`,
    method: "PATCH",
    ...reactivateRateStep
  });
  const reactivatedRate = reactivateRateStep.ok ? findRate(reactivateRateStep.data, variantId, "CHILD") : null;
  checks.push(
    createCheck(
      "CE-11_reactivate_rate",
      reactivateRateStep.ok && Boolean(reactivatedRate) && reactivatedRate?.isActive === true,
      `status=${reactivateRateStep.status ?? "n/a"} isActive=${String(reactivatedRate?.isActive)}`
    )
  );

  const reactivateVariantStep = await requestJson("PATCH", `/v1/catalog/variants/${variantId}`, {
    isActive: true
  });
  steps.push({
    name: "reactivate_variant",
    path: `/v1/catalog/variants/${variantId}`,
    method: "PATCH",
    ...reactivateVariantStep
  });
  const reactivatedVariant = reactivateVariantStep.ok ? findVariantByCode(reactivateVariantStep.data, variantCode) : null;
  checks.push(
    createCheck(
      "CE-12_reactivate_variant",
      reactivateVariantStep.ok && Boolean(reactivatedVariant) && reactivatedVariant?.isActive === true,
      `status=${reactivateVariantStep.status ?? "n/a"} isActive=${String(reactivatedVariant?.isActive)}`
    )
  );

  const reactivateItemStep = await requestJson("PATCH", `/v1/catalog/items/${itemId}`, {
    isActive: true
  });
  steps.push({
    name: "reactivate_item",
    path: `/v1/catalog/items/${itemId}`,
    method: "PATCH",
    ...reactivateItemStep
  });
  checks.push(
    createCheck(
      "CE-13_reactivate_item",
      reactivateItemStep.ok && reactivateItemStep.data?.isActive === true,
      `status=${reactivateItemStep.status ?? "n/a"} isActive=${String(reactivateItemStep.data?.isActive)}`
    )
  );

  const listStep = await requestJson("GET", `/v1/catalog/items?q=${encodeURIComponent(slug)}&page=1&limit=5`);
  steps.push({
    name: "list_items",
    path: `/v1/catalog/items?q=${encodeURIComponent(slug)}&page=1&limit=5`,
    method: "GET",
    ...listStep
  });
  checks.push(
    createCheck(
      "CE-14_list_items_reachable",
      listStep.ok && Array.isArray(listStep.data?.items),
      `status=${listStep.status ?? "n/a"} items=${Array.isArray(listStep.data?.items) ? listStep.data.items.length : "n/a"}`
    )
  );

  const failedChecks = checks.filter((check) => !check.passed);
  const report = {
    smoke: "EP-010_CATALOG_EDITOR_CRUD",
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedChecks.length === 0 ? "PASS" : "FAIL",
    config: {
      baseUrl,
      timeoutMs,
      adminRole,
      actor
    },
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      itemId,
      variantId,
      rateId
    },
    checks,
    steps: steps.map((step) => summarizeStep(step))
  };

  const reportPaths = await writeReport(report);
  console.log(`SMOKE_RESULT=${report.result}`);
  console.log(`SMOKE_REPORT_JSON=${reportPaths.jsonPath}`);
  console.log(`SMOKE_REPORT_MD=${reportPaths.mdPath}`);
  console.log(`SMOKE_ITEM_ID=${itemId}`);
  console.log(`SMOKE_VARIANT_ID=${variantId}`);
  console.log(`SMOKE_RATE_ID=${rateId}`);

  if (failedChecks.length > 0) {
    for (const failedCheck of failedChecks) {
      console.error(`FAILED_CHECK=${failedCheck.name} detail=${failedCheck.detail}`);
    }
    process.exit(1);
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const report = {
    smoke: "EP-010_CATALOG_EDITOR_CRUD",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    result: "FAIL",
    config: {
      baseUrl,
      timeoutMs,
      adminRole,
      actor
    },
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 1,
      itemId: null,
      variantId: null,
      rateId: null
    },
    checks: [
      {
        name: "CE-UNHANDLED",
        passed: false,
        detail: message
      }
    ],
    steps: []
  };

  try {
    const reportPaths = await writeReport(report);
    console.log("SMOKE_RESULT=FAIL");
    console.log(`SMOKE_REPORT_JSON=${reportPaths.jsonPath}`);
    console.log(`SMOKE_REPORT_MD=${reportPaths.mdPath}`);
    console.error(`FAILED_CHECK=CE-UNHANDLED detail=${message}`);
  } catch {
    console.error(`SMOKE_RESULT=FAIL ${message}`);
  }

  process.exit(1);
});
