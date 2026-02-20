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

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isRetryableStatus(status) {
  return status >= 500 || status === 429;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoDate(msOffset = 0) {
  return new Date(Date.now() + msOffset).toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sendSignedEvent(config, { idempotencyKey, payload }) {
  const body = JSON.stringify(payload);
  let lastStatus = null;
  let lastError = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = signRequest({
      method: "POST",
      path: config.ingestPath,
      timestamp,
      nonce,
      idempotencyKey,
      body,
      secret: config.secret
    });

    try {
      const response = await fetch(config.targetUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "x-signature": signature,
          "x-signature-algorithm": "HMAC-SHA256",
          "x-timestamp": timestamp,
          "x-nonce": nonce,
          "x-idempotency-key": idempotencyKey
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs)
      });

      const raw = await response.text();
      const json = parseJsonSafe(raw);
      lastStatus = response.status;

      if (response.ok) {
        return {
          ok: true,
          attempts: attempt,
          status: response.status,
          json
        };
      }

      lastError =
        json?.error?.message ||
        json?.message ||
        `HTTP_${response.status}`;
      if (!isRetryableStatus(response.status) || attempt === config.maxAttempts) {
        return {
          ok: false,
          attempts: attempt,
          status: response.status,
          json,
          error: lastError
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === config.maxAttempts) {
        return {
          ok: false,
          attempts: attempt,
          status: lastStatus,
          json: null,
          error: lastError
        };
      }
    }

    const delayMs =
      config.retryDelays[Math.min(attempt - 1, config.retryDelays.length - 1)] ||
      config.retryDelays[0];
    await sleep(delayMs);
  }

  return {
    ok: false,
    attempts: config.maxAttempts,
    status: lastStatus,
    json: null,
    error: lastError || "UNKNOWN_ERROR"
  };
}

async function fetchEventStatus(config, eventId) {
  const response = await fetch(`${config.baseUrl}${config.ingestPath}/${eventId}`, {
    method: "GET",
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  const raw = await response.text();
  const json = parseJsonSafe(raw);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: json?.error?.message || json?.message || `HTTP_${response.status}`
    };
  }

  return {
    ok: true,
    status: response.status,
    data: json?.data ?? null
  };
}

async function run() {
  const enabled = readBool(process.env.WEB_EMIT_BOOKING_EVENT_ENABLED, false);
  const forceSend = readBool(process.env.EMITTER_DRILL_FORCE_SEND, false);
  const expectSkip = readBool(process.env.EMITTER_DRILL_EXPECT_SKIP, false);

  if (expectSkip) {
    assert(!enabled && !forceSend, "EXPECT_SKIP requires WEB_EMIT_BOOKING_EVENT_ENABLED=false and no force");
    console.log("EMITTER_ORDERS_DRILL_RESULT=PASS");
    console.log("EMITTER_ORDERS_DRILL_MODE=SKIP_CHECK");
    return;
  }

  if (!enabled && !forceSend) {
    console.log("EMITTER_ORDERS_DRILL_RESULT=SKIPPED");
    console.log("EMITTER_ORDERS_DRILL_REASON=WEB_EMIT_BOOKING_EVENT_ENABLED=false");
    return;
  }

  const baseUrl = readText(process.env.CORE_API_BASE_URL);
  const ingestPath = readText(process.env.CORE_API_INGEST_PATH, DEFAULT_INGEST_PATH);
  const token = readText(process.env.INGEST_SERVICE_TOKEN);
  const secret = readText(process.env.INGEST_SERVICE_SECRET);
  const maxAttempts = readNumber(process.env.WEB_EMIT_BOOKING_EVENT_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1);
  const timeoutMs = readNumber(process.env.WEB_EMIT_BOOKING_EVENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000);
  const retryDelays = buildRetryDelays(process.env.WEB_EMIT_BOOKING_EVENT_RETRY_DELAYS_MS);
  const externalBookingRef = readText(
    process.env.EMITTER_DRILL_EXTERNAL_BOOKING_REF,
    `DRILL-${Date.now()}`
  );

  assert(Boolean(baseUrl), "Missing CORE_API_BASE_URL");
  assert(Boolean(token), "Missing INGEST_SERVICE_TOKEN");
  assert(Boolean(secret), "Missing INGEST_SERVICE_SECRET");

  const config = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ingestPath,
    targetUrl: `${baseUrl.replace(/\/+$/, "")}${ingestPath}`,
    token,
    secret,
    maxAttempts,
    timeoutMs,
    retryDelays
  };

  const createdKey = `orders-store-${externalBookingRef}`;
  const updatedKey = `orders-capture-${externalBookingRef}`;

  const createdPayload = {
    payloadVersion: "v1",
    eventType: "CREATED",
    eventTime: new Date().toISOString(),
    source: "DIRECT",
    externalBookingRef,
    customer: {
      name: "Canary Store",
      email: "canary-store@example.com",
      phone: "+628123456780"
    },
    booking: {
      tourDate: toIsoDate(24 * 60 * 60 * 1_000),
      tourTime: "09:00",
      adult: 2,
      child: 1,
      currency: "USD",
      totalPrice: 200.5,
      pickupLocation: "Kuta",
      meetingPoint: "Hotel Lobby",
      note: "orders/store drill"
    },
    raw: {
      providerPayload: {
        origin: "balisnap.orders.store",
        bookingRef: externalBookingRef
      }
    }
  };

  const updatedPayload = {
    payloadVersion: "v1",
    eventType: "UPDATED",
    eventTime: new Date().toISOString(),
    source: "DIRECT",
    externalBookingRef,
    customer: {
      name: "Canary Capture",
      email: "canary-capture@example.com",
      phone: "+628123456781"
    },
    booking: {
      tourDate: toIsoDate(24 * 60 * 60 * 1_000),
      tourTime: "09:00",
      adult: 2,
      child: 1,
      currency: "USD",
      totalPrice: 200.5,
      pickupLocation: "Kuta",
      meetingPoint: "Hotel Lobby",
      note: "orders/capture drill"
    },
    raw: {
      providerPayload: {
        origin: "balisnap.orders.capture",
        bookingRef: externalBookingRef,
        paymentStatus: "COMPLETED",
        paymentRef: `PAY-${Date.now()}`
      }
    }
  };

  const created = await sendSignedEvent(config, {
    idempotencyKey: createdKey,
    payload: createdPayload
  });
  assert(created.ok, `created event failed status=${created.status ?? "n/a"} error=${created.error || "unknown"}`);
  assert(created.json?.data?.idempotentReplay === false, "created first send should be idempotentReplay=false");
  assert(
    created.json?.data?.queued === true || created.json?.data?.processedInline === true,
    "created first send should be queued or processedInline"
  );

  const createdEventId = created.json?.data?.eventId;
  assert(Boolean(createdEventId), "created eventId missing");

  const createdReplay = await sendSignedEvent(config, {
    idempotencyKey: createdKey,
    payload: createdPayload
  });
  assert(
    createdReplay.ok,
    `created replay failed status=${createdReplay.status ?? "n/a"} error=${createdReplay.error || "unknown"}`
  );
  assert(createdReplay.json?.data?.idempotentReplay === true, "created replay should be idempotentReplay=true");
  assert(createdReplay.json?.data?.eventId === createdEventId, "created replay should return same eventId");

  const updated = await sendSignedEvent(config, {
    idempotencyKey: updatedKey,
    payload: updatedPayload
  });
  assert(updated.ok, `updated event failed status=${updated.status ?? "n/a"} error=${updated.error || "unknown"}`);
  assert(updated.json?.data?.idempotentReplay === false, "updated first send should be idempotentReplay=false");
  assert(
    updated.json?.data?.queued === true || updated.json?.data?.processedInline === true,
    "updated first send should be queued or processedInline"
  );
  const updatedEventId = updated.json?.data?.eventId;
  assert(Boolean(updatedEventId), "updated eventId missing");

  const createdStatusResult = await fetchEventStatus(config, createdEventId);
  const updatedStatusResult = await fetchEventStatus(config, updatedEventId);
  assert(createdStatusResult.ok, `created status fetch failed status=${createdStatusResult.status}`);
  assert(updatedStatusResult.ok, `updated status fetch failed status=${updatedStatusResult.status}`);
  const createdStatus = String(createdStatusResult.data?.processStatus || "UNKNOWN").toUpperCase();
  const updatedStatus = String(updatedStatusResult.data?.processStatus || "UNKNOWN").toUpperCase();
  assert(
    !["FAILED", "DEAD_LETTER"].includes(createdStatus),
    `created should not be failed status, got=${createdStatus}`
  );
  assert(
    !["FAILED", "DEAD_LETTER"].includes(updatedStatus),
    `updated should not be failed status, got=${updatedStatus}`
  );

  console.log("EMITTER_ORDERS_DRILL_RESULT=PASS");
  console.log("EMITTER_ORDERS_DRILL_MODE=SEND");
  console.log(`EMITTER_ORDERS_DRILL_EXTERNAL_REF=${externalBookingRef}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_EVENT_ID=${createdEventId}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_EVENT_ID=${updatedEventId}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_STATUS=${createdStatus}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_STATUS=${updatedStatus}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_ATTEMPTS=${created.attempts}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_ATTEMPTS=${updated.attempts}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_QUEUED=${created.json?.data?.queued}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_QUEUED=${updated.json?.data?.queued}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_PROCESSED_INLINE=${created.json?.data?.processedInline}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_PROCESSED_INLINE=${updated.json?.data?.processedInline}`);
  console.log(`EMITTER_ORDERS_DRILL_CREATED_IDEMPOTENT_REPLAY=${created.json?.data?.idempotentReplay}`);
  console.log(`EMITTER_ORDERS_DRILL_UPDATED_IDEMPOTENT_REPLAY=${updated.json?.data?.idempotentReplay}`);
  console.log("EMITTER_ORDERS_DRILL_IDEMPOTENT_REPLAY=true");
}

run().catch((error) => {
  console.error(
    `EMITTER_ORDERS_DRILL_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
