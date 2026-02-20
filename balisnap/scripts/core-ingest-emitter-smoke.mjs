import { createHash, createHmac, randomUUID } from "crypto";

const DEFAULT_INGEST_PATH = "/v1/ingest/bookings/events";
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAYS_MS = [500, 1_500, 4_000];
const DEFAULT_TIMEOUT_MS = 8_000;

function readText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const out = String(value).trim();
  return out || fallback;
}

function readBool(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const out = String(value).trim().toLowerCase();
  return out === "1" || out === "true" || out === "yes" || out === "on";
}

function readNumber(value, fallback, min = 1) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.floor(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function signRequest(input) {
  const canonical = [
    input.method,
    input.path,
    input.timestamp,
    input.nonce,
    input.idempotencyKey,
    sha256Hex(input.body)
  ].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("hex");
}

function buildRetryDelays(raw) {
  const out = readText(raw);
  if (!out) {
    return DEFAULT_RETRY_DELAYS_MS;
  }
  const parsed = out
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
  return parsed.length > 0 ? parsed : DEFAULT_RETRY_DELAYS_MS;
}

function maskUrl(raw) {
  return raw.replace(/(https?:\/\/[^:\/?#]+):[^@/]+@/i, "$1:***@");
}

async function run() {
  const enabled = readBool(process.env.WEB_EMIT_BOOKING_EVENT_ENABLED, false);
  const forceSend = readBool(process.env.EMITTER_SMOKE_FORCE_SEND, false);
  if (!enabled && !forceSend) {
    console.log("EMITTER_SMOKE_RESULT=SKIPPED feature flag WEB_EMIT_BOOKING_EVENT_ENABLED=false");
    process.exit(0);
  }

  const baseUrl = readText(process.env.CORE_API_BASE_URL);
  const ingestPath = readText(process.env.CORE_API_INGEST_PATH, DEFAULT_INGEST_PATH);
  const token = readText(process.env.INGEST_SERVICE_TOKEN);
  const secret = readText(process.env.INGEST_SERVICE_SECRET);
  const maxAttempts = readNumber(process.env.WEB_EMIT_BOOKING_EVENT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1);
  const timeoutMs = readNumber(process.env.WEB_EMIT_BOOKING_EVENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000);
  const retryDelays = buildRetryDelays(process.env.WEB_EMIT_BOOKING_EVENT_RETRY_DELAYS_MS);

  if (!baseUrl || !token || !secret) {
    throw new Error("Missing CORE_API_BASE_URL / INGEST_SERVICE_TOKEN / INGEST_SERVICE_SECRET");
  }

  const targetUrl = `${baseUrl.replace(/\/+$/, "")}${ingestPath}`;
  const externalBookingRef = `SMOKE-EMITTER-${Date.now()}`;
  const payload = {
    payloadVersion: "v1",
    eventType: "CREATED",
    eventTime: new Date().toISOString(),
    source: "DIRECT",
    externalBookingRef,
    customer: {
      name: "Emitter Smoke",
      email: "emitter-smoke@example.com",
      phone: "+628123456789"
    },
    booking: {
      tourDate: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10),
      tourTime: "09:00",
      adult: 2,
      child: 0,
      currency: "USD",
      totalPrice: 123.45,
      pickupLocation: "Kuta",
      meetingPoint: "Hotel Lobby",
      note: "emitter smoke"
    },
    raw: {
      providerPayload: {
        origin: "balisnap.emitter.smoke"
      }
    }
  };
  const body = JSON.stringify(payload);
  const idempotencyKey = randomUUID();

  let lastStatus = null;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = signRequest({
      method: "POST",
      path: ingestPath,
      timestamp,
      nonce,
      idempotencyKey,
      body,
      secret
    });

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-signature": signature,
          "x-signature-algorithm": "HMAC-SHA256",
          "x-timestamp": timestamp,
          "x-nonce": nonce,
          "x-idempotency-key": idempotencyKey
        },
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });

      const text = await response.text();
      lastStatus = response.status;
      if (response.status === 202) {
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        console.log("EMITTER_SMOKE_RESULT=PASS");
        console.log(`EMITTER_SMOKE_TARGET=${maskUrl(targetUrl)}`);
        console.log(`EMITTER_SMOKE_ATTEMPTS=${attempt}`);
        console.log(`EMITTER_SMOKE_EXTERNAL_REF=${externalBookingRef}`);
        console.log(`EMITTER_SMOKE_EVENT_ID=${json?.data?.eventId ?? ""}`);
        return;
      }

      lastError = `HTTP_${response.status}`;
      if (!(response.status >= 500 || response.status === 429) || attempt === maxAttempts) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts) {
        break;
      }
    }

    const delayMs = retryDelays[Math.min(attempt - 1, retryDelays.length - 1)] || retryDelays[0];
    await sleep(delayMs);
  }

  console.error(
    `EMITTER_SMOKE_RESULT=FAIL status=${lastStatus ?? "n/a"} error=${lastError ?? "UNKNOWN_ERROR"}`
  );
  process.exit(1);
}

run().catch((error) => {
  console.error(
    `EMITTER_SMOKE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
