import { createHash, createHmac, randomUUID } from "crypto";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const serviceToken = process.env.INGEST_SERVICE_TOKEN || "dev-service-token";
const serviceSecret = process.env.INGEST_SERVICE_SECRET || "dev-service-secret";
const actor = process.env.INGEST_SMOKE_ACTOR || "smoke-runner";

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

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = {
      raw: text
    };
  }

  return {
    status: response.status,
    json
  };
}

function assertStatus(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. expected=${expected} actual=${actual}`);
  }
}

function assertAuditContains(events, eventType) {
  const found = events.some((event) => event?.eventType === eventType);
  if (!found) {
    throw new Error(`audit event not found: ${eventType}`);
  }
}

async function run() {
  const path = "/v1/ingest/bookings/events";
  const payload = {
    payloadVersion: "v1",
    eventType: "CREATED",
    eventTime: new Date().toISOString(),
    source: "DIRECT",
    externalBookingRef: `SMOKE-${Date.now()}`,
    customer: {
      name: "Smoke Tester",
      email: "smoke@example.com",
      phone: "+628123456789"
    },
    booking: {
      tourDate: "2026-03-01",
      tourTime: "09:00",
      adult: 2,
      child: 1,
      currency: "USD",
      totalPrice: 150,
      pickupLocation: "Kuta",
      meetingPoint: "Hotel Lobby",
      note: "contract smoke test"
    },
    raw: {
      providerPayload: {
        mode: "smoke"
      }
    }
  };

  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const idempotencyKey = randomUUID();
  const signature = signRequest({
    method: "POST",
    path,
    timestamp,
    nonce,
    idempotencyKey,
    body
  });

  const ingest = await requestJson(path, {
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
  assertStatus(ingest.status, 202, "Ingest request failed");

  const eventId = ingest.json?.data?.eventId;
  if (!eventId) {
    throw new Error("eventId missing from ingest response");
  }

  const status1 = await requestJson(`/v1/ingest/bookings/events/${eventId}`);
  assertStatus(status1.status, 200, "Event status lookup failed");

  const failResponse = await requestJson(`/v1/ingest/bookings/events/${eventId}/fail`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-actor": actor
    },
    body: JSON.stringify({
      reasonCode: "SMOKE_FAILURE",
      reasonDetail: "forced by smoke test",
      poisonMessage: false
    })
  });
  assertStatus(failResponse.status, 202, "Fail-to-DLQ endpoint failed");

  const deadLetterKey = failResponse.json?.data?.deadLetterKey;
  if (!deadLetterKey) {
    throw new Error("deadLetterKey missing after fail endpoint");
  }

  const readyResponse = await requestJson(
    `/v1/ingest/dead-letter/${deadLetterKey}/status/READY`,
    {
      method: "PATCH",
      headers: {
        "x-actor": actor
      }
    }
  );
  assertStatus(readyResponse.status, 200, "Dead-letter status update to READY failed");

  const replayResponse = await requestJson(`/v1/ingest/bookings/events/${eventId}/replay`, {
    method: "POST",
    headers: {
      "x-actor": actor
    }
  });
  assertStatus(replayResponse.status, 202, "Replay endpoint failed");

  const deadLetterList = await requestJson("/v1/ingest/dead-letter?status=READY&limit=20");
  assertStatus(deadLetterList.status, 200, "Dead-letter list endpoint failed");

  const metricsResponse = await requestJson("/v1/ingest/metrics/queue");
  assertStatus(metricsResponse.status, 200, "Ingest metrics endpoint failed");
  if (!metricsResponse.json?.data?.queue || !metricsResponse.json?.data?.deadLetter) {
    throw new Error("Invalid ingest metrics payload");
  }

  const processingMetricsResponse = await requestJson("/v1/ingest/metrics/processing?windowMinutes=60");
  assertStatus(processingMetricsResponse.status, 200, "Ingest processing metrics endpoint failed");
  if (
    !processingMetricsResponse.json?.data?.totals ||
    !processingMetricsResponse.json?.data?.latenciesMs
  ) {
    throw new Error("Invalid ingest processing metrics payload");
  }

  const auditResponse = await requestJson("/v1/audit/events?limit=100");
  assertStatus(auditResponse.status, 200, "Audit endpoint failed");
  const auditEvents = Array.isArray(auditResponse.json?.data)
    ? auditResponse.json.data.filter((event) => event?.actor === actor)
    : [];

  assertAuditContains(auditEvents, "INGEST_EVENT_MARKED_FAILED");
  assertAuditContains(auditEvents, "INGEST_DEAD_LETTER_STATUS_UPDATED");
  assertAuditContains(auditEvents, "INGEST_REPLAY_REQUESTED");

  console.log("SMOKE_TEST_RESULT=PASS");
  console.log(`EVENT_ID=${eventId}`);
  console.log(`DEAD_LETTER_KEY=${deadLetterKey}`);
  console.log(`AUDIT_ACTOR=${actor}`);
  console.log(`BASE_URL=${baseUrl}`);
}

run().catch((error) => {
  console.error(`SMOKE_TEST_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
