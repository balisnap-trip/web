import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../reports/gates/ops-assignment-sync");

const DEFAULT_CORE_API_BASE_URL = "http://localhost:4000";
const DEFAULT_CORE_API_ADMIN_TOKEN = "dev-admin-token";
const DEFAULT_CORE_API_ADMIN_ROLE = "ADMIN";
const DEFAULT_TIMEOUT_MS = 10000;
const TERMINAL_STATUSES = new Set(["DONE", "COMPLETED", "CANCELLED", "NO_SHOW"]);

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function readNumber(rawValue, fallback, minValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    throw new Error(`Invalid numeric value '${rawValue}' (expected >= ${minValue})`);
  }
  return parsed;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toOptionalDriverId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeStatus(value) {
  const out = normalizeText(value);
  return out ? out.toUpperCase() : null;
}

function computeExpectedStatus(currentStatus, assignedDriverId, customerPaymentStatus) {
  const normalizedCurrent = normalizeStatus(currentStatus);
  if (normalizedCurrent && TERMINAL_STATUSES.has(normalizedCurrent)) {
    return normalizedCurrent;
  }
  if (assignedDriverId && normalizeStatus(customerPaymentStatus) === "PAID") {
    return "READY";
  }
  return "ATTENTION";
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Ops Assignment Sync Drill");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Drill Data");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.data, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Failures");
  lines.push("");
  if (report.failures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
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

function buildUrl(baseUrl, apiPath) {
  return `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
}

async function requestCoreApi(config, apiPath, init = {}) {
  const response = await fetch(buildUrl(config.baseUrl, apiPath), {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      "x-admin-role": config.role,
      "content-type": "application/json",
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  const rawText = await response.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      parsed?.error?.message || parsed?.message || `CORE_API_HTTP_${response.status}`;
    return {
      ok: false,
      status: response.status,
      data: null,
      error: message
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed?.data ?? null,
    error: null
  };
}

function pickCandidate(rows) {
  const preferred = rows.find(
    (row) =>
      toOptionalDriverId(row.assignedDriverId) === null &&
      normalizeStatus(row.opsFulfillmentStatus) === "ATTENTION"
  );
  if (preferred) {
    return preferred;
  }

  const fallback = rows.find(
    (row) =>
      toOptionalDriverId(row.assignedDriverId) === null &&
      !TERMINAL_STATUSES.has(normalizeStatus(row.opsFulfillmentStatus) || "")
  );
  if (fallback) {
    return fallback;
  }

  return null;
}

async function run() {
  const startedAt = new Date().toISOString();
  const config = {
    baseUrl: normalizeText(process.env.CORE_API_BASE_URL) || DEFAULT_CORE_API_BASE_URL,
    token: normalizeText(process.env.CORE_API_ADMIN_TOKEN) || DEFAULT_CORE_API_ADMIN_TOKEN,
    role: (normalizeText(process.env.CORE_API_ADMIN_ROLE) || DEFAULT_CORE_API_ADMIN_ROLE).toUpperCase(),
    timeoutMs: Math.floor(readNumber(process.env.CORE_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000)),
    driverId: Math.floor(readNumber(process.env.OPS_ASSIGNMENT_DRILL_DRIVER_ID, 99991, 1))
  };

  const failures = [];
  const drillData = {
    candidate: null,
    assign: null,
    syncAfterAssign: null,
    detailAfterAssign: null,
    unassign: null,
    syncAfterUnassign: null,
    detailAfterUnassign: null
  };

  const listResult = await requestCoreApi(config, "/v1/ops/bookings");
  if (!listResult.ok || !Array.isArray(listResult.data)) {
    throw new Error(
      `LIST_FETCH_FAILED status=${listResult.status} error=${listResult.error || "unknown"}`
    );
  }

  const candidate = pickCandidate(listResult.data);
  if (!candidate) {
    throw new Error("NO_UNASSIGNED_NON_TERMINAL_BOOKING_FOR_DRILL");
  }

  const candidateId = normalizeText(candidate.externalBookingRef) || normalizeText(candidate.bookingKey);
  if (!candidateId) {
    throw new Error("CANDIDATE_ID_EMPTY");
  }

  drillData.candidate = {
    bookingKey: candidate.bookingKey,
    externalBookingRef: candidate.externalBookingRef,
    opsFulfillmentStatus: candidate.opsFulfillmentStatus,
    customerPaymentStatus: candidate.customerPaymentStatus,
    assignedDriverId: candidate.assignedDriverId
  };

  const initialStatus = normalizeStatus(candidate.opsFulfillmentStatus);
  const initialPaymentStatus = normalizeStatus(candidate.customerPaymentStatus);
  const expectedAfterAssign = computeExpectedStatus(
    initialStatus,
    config.driverId,
    initialPaymentStatus
  );

  const assignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}/assign`,
    {
      method: "POST",
      body: JSON.stringify({ driverId: config.driverId })
    }
  );
  drillData.assign = {
    ok: assignResult.ok,
    status: assignResult.status,
    error: assignResult.error
  };
  if (!assignResult.ok) {
    failures.push(`assign_failed status=${assignResult.status} error=${assignResult.error}`);
  }

  const syncAfterAssignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}/status/sync`,
    { method: "POST" }
  );
  drillData.syncAfterAssign = {
    ok: syncAfterAssignResult.ok,
    status: syncAfterAssignResult.status,
    error: syncAfterAssignResult.error
  };
  if (!syncAfterAssignResult.ok) {
    failures.push(
      `sync_after_assign_failed status=${syncAfterAssignResult.status} error=${syncAfterAssignResult.error}`
    );
  }

  const detailAfterAssignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}`
  );
  if (!detailAfterAssignResult.ok || !detailAfterAssignResult.data) {
    failures.push(
      `detail_after_assign_failed status=${detailAfterAssignResult.status} error=${detailAfterAssignResult.error}`
    );
  } else {
    const detail = detailAfterAssignResult.data;
    const actualDriverId = toOptionalDriverId(detail.assignedDriverId);
    const actualStatus = normalizeStatus(detail.opsFulfillmentStatus);
    const paymentStatusAfterAssign = normalizeStatus(detail.customerPaymentStatus);
    drillData.detailAfterAssign = {
      assignedDriverId: actualDriverId,
      opsFulfillmentStatus: actualStatus,
      customerPaymentStatus: paymentStatusAfterAssign,
      expectedStatus: expectedAfterAssign
    };

    if (actualDriverId !== config.driverId) {
      failures.push(`assign_driver_mismatch expected=${config.driverId} actual=${actualDriverId}`);
    }
    if (actualStatus !== expectedAfterAssign) {
      failures.push(`status_after_assign_mismatch expected=${expectedAfterAssign} actual=${actualStatus}`);
    }
  }

  const unassignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}/unassign`,
    { method: "POST" }
  );
  drillData.unassign = {
    ok: unassignResult.ok,
    status: unassignResult.status,
    error: unassignResult.error
  };
  if (!unassignResult.ok) {
    failures.push(`unassign_failed status=${unassignResult.status} error=${unassignResult.error}`);
  }

  const syncAfterUnassignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}/status/sync`,
    { method: "POST" }
  );
  drillData.syncAfterUnassign = {
    ok: syncAfterUnassignResult.ok,
    status: syncAfterUnassignResult.status,
    error: syncAfterUnassignResult.error
  };
  if (!syncAfterUnassignResult.ok) {
    failures.push(
      `sync_after_unassign_failed status=${syncAfterUnassignResult.status} error=${syncAfterUnassignResult.error}`
    );
  }

  const detailAfterUnassignResult = await requestCoreApi(
    config,
    `/v1/ops/bookings/${encodeURIComponent(candidateId)}`
  );
  if (!detailAfterUnassignResult.ok || !detailAfterUnassignResult.data) {
    failures.push(
      `detail_after_unassign_failed status=${detailAfterUnassignResult.status} error=${detailAfterUnassignResult.error}`
    );
  } else {
    const detail = detailAfterUnassignResult.data;
    const actualDriverId = toOptionalDriverId(detail.assignedDriverId);
    const expectedAfterUnassign = computeExpectedStatus(
      expectedAfterAssign,
      null,
      initialPaymentStatus
    );
    const actualStatus = normalizeStatus(detail.opsFulfillmentStatus);
    const paymentStatusAfterUnassign = normalizeStatus(detail.customerPaymentStatus);
    drillData.detailAfterUnassign = {
      assignedDriverId: actualDriverId,
      opsFulfillmentStatus: actualStatus,
      customerPaymentStatus: paymentStatusAfterUnassign,
      expectedStatus: expectedAfterUnassign
    };

    if (actualDriverId !== null) {
      failures.push(`unassign_driver_mismatch expected=null actual=${actualDriverId}`);
    }
    if (actualStatus !== expectedAfterUnassign) {
      failures.push(`status_after_unassign_mismatch expected=${expectedAfterUnassign} actual=${actualStatus}`);
    }
  }

  const report = {
    gate: "BG-ASSIGNMENT_SYNC_DRILL",
    startedAt,
    endedAt: new Date().toISOString(),
    config: {
      coreApiBaseUrl: config.baseUrl,
      coreApiAdminRole: config.role,
      timeoutMs: config.timeoutMs,
      driverId: config.driverId
    },
    data: drillData,
    failures,
    result: failures.length === 0 ? "PASS" : "FAIL"
  };

  const output = await writeReport(report);
  console.log(`OPS_ASSIGNMENT_SYNC_DRILL_RESULT=${report.result}`);
  console.log(`OPS_ASSIGNMENT_SYNC_DRILL_JSON=${output.jsonPath}`);
  console.log(`OPS_ASSIGNMENT_SYNC_DRILL_MD=${output.mdPath}`);

  if (report.result !== "PASS") {
    for (const failure of failures) {
      console.error(`FAILED_CHECK=${failure}`);
    }
    process.exit(1);
  }
}

run().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const report = {
    gate: "BG-ASSIGNMENT_SYNC_DRILL",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    config: {},
    data: {},
    failures: [message],
    result: "FAIL"
  };
  try {
    const output = await writeReport(report);
    console.log(`OPS_ASSIGNMENT_SYNC_DRILL_JSON=${output.jsonPath}`);
    console.log(`OPS_ASSIGNMENT_SYNC_DRILL_MD=${output.mdPath}`);
  } catch {
    // ignore write fail report error
  }
  console.error(`OPS_ASSIGNMENT_SYNC_DRILL_RESULT=FAIL ${message}`);
  process.exit(1);
});
