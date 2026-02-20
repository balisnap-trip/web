import { createHash, createHmac, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const serviceToken = process.env.INGEST_SERVICE_TOKEN || "dev-service-token";
const serviceSecret = process.env.INGEST_SERVICE_SECRET || "dev-service-secret";
const adminToken = process.env.CORE_API_ADMIN_TOKEN || "dev-admin-token";
const adminRole = (process.env.CORE_API_ADMIN_ROLE || "ADMIN").toUpperCase();
const actor = process.env.INGEST_REPLAY_DRILL_ACTOR || "ingest-replay-drill";
const pollIntervalMs = readNumber("INGEST_REPLAY_DRILL_POLL_INTERVAL_MS", 1_000, 100);
const pollTimeoutMs = readNumber("INGEST_REPLAY_DRILL_POLL_TIMEOUT_MS", 45_000, 1_000);
const requestTimeoutMs = readNumber("INGEST_REPLAY_DRILL_REQUEST_TIMEOUT_MS", 10_000, 1_000);
const auditFetchLimit = readNumber("INGEST_REPLAY_DRILL_AUDIT_LIMIT", 200, 50);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-replay-drill");

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

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function signRequest(input) {
  const canonicalString = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.idempotencyKey,
    sha256Hex(input.body)
  ].join("\n");

  return createHmac("sha256", serviceSecret).update(canonicalString).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(endpointPath, options = {}) {
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  const rawText = await response.text();

  let json = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = {
      raw: rawText
    };
  }

  return {
    status: response.status,
    ok: response.ok,
    json
  };
}

function assertStatus(response, expectedStatus, context) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `${context}. expected=${expectedStatus} actual=${response.status} body=${JSON.stringify(response.json)}`
    );
  }
}

function assertAuditContains(events, eventType) {
  const found = events.some((event) => event?.eventType === eventType);
  if (!found) {
    throw new Error(`AUDIT_EVENT_MISSING:${eventType}`);
  }
}

async function pollDeadLetter(deadLetterKey) {
  const statuses = [];
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt <= pollTimeoutMs) {
    const detail = await requestJson(`/v1/ingest/dead-letter/${deadLetterKey}`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole
      }
    });
    assertStatus(detail, 200, "dead-letter detail fetch failed");

    const status = detail.json?.data?.status;
    if (typeof status === "string") {
      statuses.push({
        at: new Date().toISOString(),
        status
      });
    }
    lastSnapshot = detail.json?.data ?? null;

    if (status === "SUCCEEDED" || status === "FAILED") {
      return {
        settled: true,
        statuses,
        lastSnapshot
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    settled: false,
    statuses,
    lastSnapshot
  };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Ingest Replay Drill Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push(`- eventId: ${report.summary.eventId ?? "n/a"}`);
  lines.push(`- deadLetterKey: ${report.summary.deadLetterKey ?? "n/a"}`);
  lines.push("");
  lines.push("## Lifecycle");
  lines.push("");
  lines.push("| Timestamp | Status |");
  lines.push("|---|---|");
  for (const item of report.summary.deadLetterLifecycle) {
    lines.push(`| ${item.at} | ${item.status} |`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- replayQueued: ${String(report.summary.replayQueued)}`);
  lines.push(`- replayProcessedInline: ${String(report.summary.replayProcessedInline)}`);
  lines.push(`- finalDeadLetterStatus: ${report.summary.finalDeadLetterStatus ?? "n/a"}`);
  lines.push(`- finalEventProcessStatus: ${report.summary.finalEventProcessStatus ?? "n/a"}`);
  lines.push(`- auditEventsValidated: ${String(report.summary.auditEventsValidated)}`);
  lines.push("");
  if (report.failures.length > 0) {
    lines.push("## Failures");
    lines.push("");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const timestamp = nowTimestampForFile();
  const jsonPath = path.join(reportRootDir, `${timestamp}.json`);
  const mdPath = path.join(reportRootDir, `${timestamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");
  return {
    jsonPath,
    mdPath
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const failures = [];
  const summary = {
    eventId: null,
    deadLetterKey: null,
    replayQueued: false,
    replayProcessedInline: false,
    finalDeadLetterStatus: null,
    finalEventProcessStatus: null,
    auditEventsValidated: false,
    deadLetterLifecycle: []
  };

  try {
    const ingestPath = "/v1/ingest/bookings/events";
    const payload = {
      payloadVersion: "v1",
      eventType: "CREATED",
      eventTime: new Date().toISOString(),
      source: "DIRECT",
      externalBookingRef: `REPLAY-DRILL-${Date.now()}`,
      customer: {
        name: "Replay Drill",
        email: "replay-drill@example.com",
        phone: "+628123456789"
      },
      booking: {
        tourDate: "2026-03-01",
        tourTime: "09:00",
        adult: 2,
        child: 1,
        currency: "USD",
        totalPrice: 180,
        pickupLocation: "Kuta",
        meetingPoint: "Hotel Lobby",
        note: "ingest replay drill"
      },
      raw: {
        providerPayload: {
          mode: "replay-drill"
        }
      }
    };

    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const idempotencyKey = randomUUID();
    const signature = signRequest({
      method: "POST",
      path: ingestPath,
      timestamp,
      nonce,
      idempotencyKey,
      body
    });

    const ingestResponse = await requestJson(ingestPath, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken}`,
        "x-signature-algorithm": "HMAC-SHA256",
        "x-signature": signature,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-idempotency-key": idempotencyKey
      },
      body
    });
    assertStatus(ingestResponse, 202, "ingest request failed");

    const eventId = ingestResponse.json?.data?.eventId;
    if (!eventId) {
      throw new Error("EVENT_ID_MISSING");
    }
    summary.eventId = eventId;

    const failResponse = await requestJson(`/v1/ingest/bookings/events/${eventId}/fail`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole,
        "x-actor": actor,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        reasonCode: "REPLAY_DRILL_FAIL",
        reasonDetail: "forced fail for replay drill",
        poisonMessage: false
      })
    });
    assertStatus(failResponse, 202, "force fail endpoint failed");

    const deadLetterKey = failResponse.json?.data?.deadLetterKey;
    if (!deadLetterKey) {
      throw new Error("DEAD_LETTER_KEY_MISSING");
    }
    summary.deadLetterKey = deadLetterKey;

    const readyResponse = await requestJson(`/v1/ingest/dead-letter/${deadLetterKey}/status/READY`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole,
        "x-actor": actor
      }
    });
    assertStatus(readyResponse, 200, "dead-letter READY update failed");

    const replayResponse = await requestJson(`/v1/ingest/bookings/events/${eventId}/replay`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole,
        "x-actor": actor
      }
    });
    assertStatus(replayResponse, 202, "replay endpoint failed");

    summary.replayQueued = replayResponse.json?.data?.queued === true;
    summary.replayProcessedInline = replayResponse.json?.data?.processedInline === true;

    const pollResult = await pollDeadLetter(deadLetterKey);
    summary.deadLetterLifecycle = pollResult.statuses;
    summary.finalDeadLetterStatus = pollResult.lastSnapshot?.status ?? null;
    if (!pollResult.settled) {
      failures.push("dead-letter status did not settle to SUCCEEDED/FAILED within timeout");
    } else if (summary.finalDeadLetterStatus !== "SUCCEEDED") {
      failures.push(`final dead-letter status is ${summary.finalDeadLetterStatus}`);
    }

    const eventStatusResponse = await requestJson(`/v1/ingest/bookings/events/${eventId}`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole
      }
    });
    assertStatus(eventStatusResponse, 200, "event status lookup failed");
    summary.finalEventProcessStatus = eventStatusResponse.json?.data?.processStatus ?? null;
    if (summary.finalEventProcessStatus !== "DONE") {
      failures.push(`event process status is ${summary.finalEventProcessStatus}`);
    }

    const auditResponse = await requestJson(`/v1/audit/events?limit=${auditFetchLimit}`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
        "x-admin-role": adminRole
      }
    });
    assertStatus(auditResponse, 200, "audit event fetch failed");

    const events = Array.isArray(auditResponse.json?.data)
      ? auditResponse.json.data.filter((item) => item?.actor === actor)
      : [];
    assertAuditContains(events, "INGEST_EVENT_MARKED_FAILED");
    assertAuditContains(events, "INGEST_DEAD_LETTER_STATUS_UPDATED");
    assertAuditContains(events, "INGEST_REPLAY_REQUESTED");
    summary.auditEventsValidated = true;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const report = {
    gate: "T-007-04_REPLAY_DRILL",
    startedAt,
    endedAt: new Date().toISOString(),
    baseUrl,
    actor,
    config: {
      pollIntervalMs,
      pollTimeoutMs,
      requestTimeoutMs,
      auditFetchLimit
    },
    summary,
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };

  const paths = await writeReport(report);
  console.log(`GATE_RESULT=${report.result}`);
  console.log(`GATE_REPORT_JSON=${paths.jsonPath}`);
  console.log(`GATE_REPORT_MD=${paths.mdPath}`);
  console.log(`INGEST_REPLAY_DRILL_RESULT=${report.result}`);
  console.log(`INGEST_REPLAY_DRILL_REPORT_JSON=${paths.jsonPath}`);
  console.log(`INGEST_REPLAY_DRILL_REPORT_MD=${paths.mdPath}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAILURE=${failure}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
