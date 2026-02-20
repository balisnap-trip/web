import { createHash, createHmac, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/catalog-publish-workflow");

const baseUrl = readText(process.env.CORE_API_BASE_URL, "http://127.0.0.1:4000").replace(/\/+$/, "");
const adminToken = readText(process.env.CORE_API_ADMIN_TOKEN);
const adminRole = readText(process.env.CORE_API_ADMIN_ROLE, "MANAGER").toUpperCase();
const publishSecret = readText(process.env.CATALOG_PUBLISH_SECRET);
const timeoutMs = readNumber(process.env.GATE_CATALOG_PUBLISH_TIMEOUT_MS, 15_000, 1_000);
const runFailedScenario = readBoolean(process.env.GATE_CATALOG_PUBLISH_RUN_FAILED_SCENARIO, true);
const expectedSignatureRequired = readBoolean(
  process.env.GATE_CATALOG_PUBLISH_EXPECT_SIGNATURE_REQUIRED,
  false
);

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

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

function normalizePathForSignature(url) {
  const parsed = new URL(url);
  return parsed.pathname;
}

function signHeaders(method, urlPath, serializedBody) {
  if (!publishSecret) {
    return {};
  }

  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const idempotencyKey = randomUUID();
  const payloadHash = createHash("sha256").update(serializedBody).digest("hex");
  const canonical = [method.toUpperCase(), urlPath, timestamp, nonce, idempotencyKey, payloadHash].join("\n");
  const signature = createHmac("sha256", publishSecret).update(canonical).digest("hex");

  return {
    "x-signature": signature,
    "x-signature-algorithm": "HMAC-SHA256",
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-idempotency-key": idempotencyKey
  };
}

async function requestJson(method, requestPath, body, options = {}) {
  const url = resolveUrl(requestPath);
  const serializedBody = body === undefined ? "" : JSON.stringify(body);
  const headers = {
    "content-type": "application/json"
  };

  if (options.adminAuth !== false) {
    headers.authorization = `Bearer ${adminToken}`;
    headers["x-admin-role"] = adminRole;
    headers["x-actor"] = "catalog-publish-gate";
  }

  if (options.signPublish !== false && publishSecret) {
    Object.assign(headers, signHeaders(method, normalizePathForSignature(url), serializedBody || "{}"));
  }

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

function isHex64(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
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
  lines.push("# Catalog Publish Workflow Gate Report");
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

async function run() {
  if (!adminToken) {
    throw new Error("Missing CORE_API_ADMIN_TOKEN");
  }

  const startedAt = new Date().toISOString();
  const checks = [];
  const steps = [];
  let primaryJobId = "";
  let failedJobId = "";

  const healthStep = await requestJson("GET", "/health", undefined, {
    adminAuth: false,
    signPublish: false
  });
  steps.push({
    name: "health",
    path: "/health",
    method: "GET",
    ...healthStep
  });
  checks.push(
    createCheck(
      "CP-00_health_reachable",
      healthStep.ok,
      `status=${healthStep.status ?? "n/a"} error=${healthStep.error || "none"}`
    )
  );

  if (expectedSignatureRequired) {
    const unsignedDraftStep = await requestJson(
      "POST",
      "/v1/catalog/publish/jobs",
      { note: "unsigned-check" },
      {
        signPublish: false
      }
    );
    steps.push({
      name: "create_draft_unsigned",
      path: "/v1/catalog/publish/jobs",
      method: "POST",
      ...unsignedDraftStep
    });
    checks.push(
      createCheck(
        "CP-00_signature_required_guard",
        unsignedDraftStep.ok === false && (unsignedDraftStep.status === 401 || unsignedDraftStep.status === 400),
        `status=${unsignedDraftStep.status ?? "n/a"} error=${unsignedDraftStep.error || "none"}`
      )
    );
  }

  const createDraftStep = await requestJson("POST", "/v1/catalog/publish/jobs", {
    note: `gate-run-${Date.now()}`
  });
  steps.push({
    name: "create_draft",
    path: "/v1/catalog/publish/jobs",
    method: "POST",
    ...createDraftStep
  });

  if (createDraftStep.ok && createDraftStep.data?.jobId) {
    primaryJobId = String(createDraftStep.data.jobId);
  }

  checks.push(
    createCheck(
      "CP-01_create_draft",
      createDraftStep.ok && createDraftStep.data?.status === "DRAFT" && Boolean(primaryJobId),
      `status=${createDraftStep.status ?? "n/a"} jobStatus=${createDraftStep.data?.status || "none"} error=${createDraftStep.error || "none"}`
    )
  );

  if (!primaryJobId) {
    throw new Error("Failed to create primary publish draft job");
  }

  const getDraftStep = await requestJson("GET", `/v1/catalog/publish/jobs/${primaryJobId}`);
  steps.push({
    name: "get_draft",
    path: `/v1/catalog/publish/jobs/${primaryJobId}`,
    method: "GET",
    ...getDraftStep
  });
  checks.push(
    createCheck(
      "CP-02_get_draft",
      getDraftStep.ok && getDraftStep.data?.status === "DRAFT",
      `status=${getDraftStep.status ?? "n/a"} jobStatus=${getDraftStep.data?.status || "none"}`
    )
  );

  const submitReviewStep = await requestJson(
    "POST",
    `/v1/catalog/publish/jobs/${primaryJobId}/submit-review`,
    {}
  );
  steps.push({
    name: "submit_review",
    path: `/v1/catalog/publish/jobs/${primaryJobId}/submit-review`,
    method: "POST",
    ...submitReviewStep
  });
  checks.push(
    createCheck(
      "CP-03_submit_review",
      submitReviewStep.ok && submitReviewStep.data?.status === "IN_REVIEW",
      `status=${submitReviewStep.status ?? "n/a"} jobStatus=${submitReviewStep.data?.status || "none"}`
    )
  );

  const publishStep = await requestJson("POST", `/v1/catalog/publish/jobs/${primaryJobId}/publish`, {});
  steps.push({
    name: "publish",
    path: `/v1/catalog/publish/jobs/${primaryJobId}/publish`,
    method: "POST",
    ...publishStep
  });
  checks.push(
    createCheck(
      "CP-04_publish",
      publishStep.ok && publishStep.data?.status === "PUBLISHED",
      `status=${publishStep.status ?? "n/a"} jobStatus=${publishStep.data?.status || "none"} error=${publishStep.error || "none"}`
    )
  );
  checks.push(
    createCheck(
      "CP-04_publish_artifact_fields",
      publishStep.ok && Boolean(publishStep.data?.snapshotPath) && isHex64(publishStep.data?.checksum),
      `snapshotPath=${publishStep.data?.snapshotPath || "none"} checksum=${publishStep.data?.checksum || "none"}`
    )
  );

  const listStep = await requestJson("GET", "/v1/catalog/publish/jobs?limit=20");
  steps.push({
    name: "list_jobs",
    path: "/v1/catalog/publish/jobs?limit=20",
    method: "GET",
    ...listStep
  });
  const listedPrimaryJob = Array.isArray(listStep.data)
    ? listStep.data.find((job) => String(job.jobId) === primaryJobId)
    : null;
  checks.push(
    createCheck(
      "CP-05_list_contains_published_job",
      listStep.ok && listedPrimaryJob?.status === "PUBLISHED",
      `listed=${Boolean(listedPrimaryJob)} status=${listedPrimaryJob?.status || "none"}`
    )
  );

  const retryPublishedStep = await requestJson(
    "POST",
    `/v1/catalog/publish/jobs/${primaryJobId}/retry`,
    {}
  );
  steps.push({
    name: "retry_published_invalid",
    path: `/v1/catalog/publish/jobs/${primaryJobId}/retry`,
    method: "POST",
    ...retryPublishedStep
  });
  checks.push(
    createCheck(
      "CP-06_retry_guard_for_published",
      retryPublishedStep.ok === false && retryPublishedStep.status === 409,
      `status=${retryPublishedStep.status ?? "n/a"} error=${retryPublishedStep.error || "none"}`
    )
  );

  if (runFailedScenario) {
    const invalidItemId = randomUUID();
    const createFailedDraftStep = await requestJson("POST", "/v1/catalog/publish/jobs", {
      note: `gate-failed-${Date.now()}`,
      itemIds: [invalidItemId]
    });
    steps.push({
      name: "create_failed_draft",
      path: "/v1/catalog/publish/jobs",
      method: "POST",
      ...createFailedDraftStep
    });

    if (createFailedDraftStep.ok && createFailedDraftStep.data?.jobId) {
      failedJobId = String(createFailedDraftStep.data.jobId);
    }

    checks.push(
      createCheck(
        "CP-07_create_failed_scenario_draft",
        createFailedDraftStep.ok && createFailedDraftStep.data?.status === "DRAFT" && Boolean(failedJobId),
        `status=${createFailedDraftStep.status ?? "n/a"} jobStatus=${createFailedDraftStep.data?.status || "none"}`
      )
    );

    if (failedJobId) {
      const submitFailedReviewStep = await requestJson(
        "POST",
        `/v1/catalog/publish/jobs/${failedJobId}/submit-review`,
        {}
      );
      steps.push({
        name: "submit_failed_review",
        path: `/v1/catalog/publish/jobs/${failedJobId}/submit-review`,
        method: "POST",
        ...submitFailedReviewStep
      });
      checks.push(
        createCheck(
          "CP-08_submit_failed_scenario_review",
          submitFailedReviewStep.ok && submitFailedReviewStep.data?.status === "IN_REVIEW",
          `status=${submitFailedReviewStep.status ?? "n/a"} jobStatus=${submitFailedReviewStep.data?.status || "none"}`
        )
      );

      const publishFailedStep = await requestJson(
        "POST",
        `/v1/catalog/publish/jobs/${failedJobId}/publish`,
        {}
      );
      steps.push({
        name: "publish_failed",
        path: `/v1/catalog/publish/jobs/${failedJobId}/publish`,
        method: "POST",
        ...publishFailedStep
      });
      checks.push(
        createCheck(
          "CP-09_publish_invalid_item_rejected",
          publishFailedStep.ok === false && publishFailedStep.status === 400,
          `status=${publishFailedStep.status ?? "n/a"} error=${publishFailedStep.error || "none"}`
        )
      );

      const getFailedStep = await requestJson("GET", `/v1/catalog/publish/jobs/${failedJobId}`);
      steps.push({
        name: "get_failed_job",
        path: `/v1/catalog/publish/jobs/${failedJobId}`,
        method: "GET",
        ...getFailedStep
      });
      checks.push(
        createCheck(
          "CP-10_failed_status_recorded",
          getFailedStep.ok && getFailedStep.data?.status === "FAILED" && Boolean(getFailedStep.data?.failureReason),
          `status=${getFailedStep.status ?? "n/a"} jobStatus=${getFailedStep.data?.status || "none"} failureReason=${getFailedStep.data?.failureReason || "none"}`
        )
      );

      const retryFailedStep = await requestJson("POST", `/v1/catalog/publish/jobs/${failedJobId}/retry`, {});
      steps.push({
        name: "retry_failed_job",
        path: `/v1/catalog/publish/jobs/${failedJobId}/retry`,
        method: "POST",
        ...retryFailedStep
      });
      checks.push(
        createCheck(
          "CP-11_retry_failed_job_executes",
          retryFailedStep.ok === false && retryFailedStep.status === 400,
          `status=${retryFailedStep.status ?? "n/a"} error=${retryFailedStep.error || "none"}`
        )
      );
    }
  }

  const failedChecks = checks.filter((check) => !check.passed);
  const report = {
    gate: "EP-010_CATALOG_PUBLISH_WORKFLOW",
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedChecks.length === 0 ? "PASS" : "FAIL",
    config: {
      baseUrl,
      timeoutMs,
      adminRole,
      runFailedScenario,
      expectedSignatureRequired,
      signedRequests: Boolean(publishSecret)
    },
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      primaryJobId,
      failedJobId: failedJobId || null
    },
    checks,
    steps: steps.map((step) => summarizeStep(step))
  };

  const reportPaths = await writeReport(report);
  console.log(`GATE_RESULT=${report.result}`);
  console.log(`GATE_REPORT_JSON=${reportPaths.jsonPath}`);
  console.log(`GATE_REPORT_MD=${reportPaths.mdPath}`);

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
    gate: "EP-010_CATALOG_PUBLISH_WORKFLOW",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    result: "FAIL",
    config: {
      baseUrl,
      timeoutMs,
      adminRole,
      runFailedScenario,
      expectedSignatureRequired,
      signedRequests: Boolean(publishSecret)
    },
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 1,
      primaryJobId: null,
      failedJobId: null
    },
    checks: [
      {
        name: "CP-UNHANDLED",
        passed: false,
        detail: message
      }
    ],
    steps: []
  };

  try {
    const reportPaths = await writeReport(report);
    console.log("GATE_RESULT=FAIL");
    console.log(`GATE_REPORT_JSON=${reportPaths.jsonPath}`);
    console.log(`GATE_REPORT_MD=${reportPaths.mdPath}`);
    console.error(`FAILED_CHECK=CP-UNHANDLED detail=${message}`);
  } catch {
    console.error(`GATE_RESULT=FAIL ${message}`);
  }

  process.exit(1);
});
