import { mkdir, writeFile } from "fs/promises";
import { createHash, createHmac, randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const serviceToken = process.env.INGEST_SERVICE_TOKEN || "dev-service-token";
const serviceSecret = process.env.INGEST_SERVICE_SECRET || "dev-service-secret";
const totalRequests = readNumber("LOAD_TOTAL_REQUESTS", 500, 1);
const concurrency = Math.min(totalRequests, readNumber("LOAD_CONCURRENCY", 20, 1));
const maxFailureRate = readNumber("LOAD_MAX_FAILURE_RATE", 0.01, 0);
const maxP95Ms = readNumberOrNull("LOAD_MAX_P95_MS");
const requestTimeoutMs = readNumber("LOAD_REQUEST_TIMEOUT_MS", 15_000, 1_000);
const duplicateEvery = readNumber("LOAD_DUPLICATE_EVERY", 0, 0);
const source = (process.env.LOAD_SOURCE || "DIRECT").toUpperCase();
const eventType = (process.env.LOAD_EVENT_TYPE || "CREATED").toUpperCase();
const pathIngest = "/v1/ingest/bookings/events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/load/ingest");
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function readNumber(key, fallback, minValue) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue) {
    throw new Error(`${key} must be a number >= ${minValue}`);
  }
  return value;
}

function readNumberOrNull(key) {
  const raw = process.env[key];
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a number >= 0`);
  }
  return value;
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

function percentile(sortedNumbers, p) {
  if (sortedNumbers.length === 0) {
    return 0;
  }
  const position = Math.ceil((p / 100) * sortedNumbers.length) - 1;
  const index = Math.max(0, Math.min(position, sortedNumbers.length - 1));
  return sortedNumbers[index];
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createPlan(index, previousPlan) {
  const duplicate = duplicateEvery > 0 && previousPlan && index % duplicateEvery === 0;
  if (duplicate) {
    return {
      ...previousPlan,
      sequence: index,
      duplicate: true
    };
  }

  const payload = {
    payloadVersion: "v1",
    eventType,
    eventTime: new Date(Date.now() + index * 1_000).toISOString(),
    source,
    externalBookingRef: `LOAD-${runId}-${index}`,
    customer: {
      name: "Load Tester",
      email: `load+${index}@example.com`,
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
      note: `load test sequence ${index}`
    },
    raw: {
      providerPayload: {
        mode: "load",
        sequence: index
      }
    }
  };

  return {
    sequence: index,
    duplicate: false,
    idempotencyKey: randomUUID(),
    body: JSON.stringify(payload)
  };
}

async function requestIngest(plan) {
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const signature = signRequest({
    method: "POST",
    path: pathIngest,
    timestamp,
    nonce,
    idempotencyKey: plan.idempotencyKey,
    body: plan.body
  });

  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${pathIngest}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken}`,
        "x-signature-algorithm": "HMAC-SHA256",
        "x-signature": signature,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-idempotency-key": plan.idempotencyKey
      },
      body: plan.body,
      signal: AbortSignal.timeout(requestTimeoutMs)
    });

    const responseText = await response.text();
    let json = null;
    try {
      json = responseText ? JSON.parse(responseText) : null;
    } catch {
      json = null;
    }

    return {
      sequence: plan.sequence,
      duplicate: plan.duplicate,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      idempotentReplay: json?.data?.idempotentReplay === true,
      error: null
    };
  } catch (error) {
    return {
      sequence: plan.sequence,
      duplicate: plan.duplicate,
      status: 0,
      latencyMs: Date.now() - startedAt,
      idempotentReplay: false,
      error: error instanceof Error ? error.message : "REQUEST_FAILED"
    };
  }
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const filePath = path.join(reportRootDir, `${nowTimestampForFile()}.json`);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

async function run() {
  const plans = [];
  for (let index = 0; index < totalRequests; index += 1) {
    plans.push(createPlan(index, index > 0 ? plans[index - 1] : null));
  }

  const results = [];
  let nextIndex = 0;
  const startedAt = Date.now();

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= plans.length) {
        return;
      }

      const result = await requestIngest(plans[index]);
      results.push(result);

      if (results.length % 100 === 0 || results.length === plans.length) {
        console.log(`progress=${results.length}/${plans.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationMs = Date.now() - startedAt;

  const status202 = results.filter((item) => item.status === 202).length;
  const status4xx = results.filter((item) => item.status >= 400 && item.status < 500).length;
  const status5xx = results.filter((item) => item.status >= 500).length;
  const networkErrors = results.filter((item) => item.status === 0).length;
  const idempotentReplayCount = results.filter((item) => item.idempotentReplay).length;
  const duplicateRequests = results.filter((item) => item.duplicate).length;
  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const successRate = results.length === 0 ? 0 : status202 / results.length;
  const failureRate = 1 - successRate;
  const throughputRps = durationMs === 0 ? 0 : Number((results.length / (durationMs / 1000)).toFixed(2));

  const failures = [];
  if (failureRate > maxFailureRate) {
    failures.push(`failure_rate=${failureRate.toFixed(4)} exceeds max=${maxFailureRate}`);
  }
  if (maxP95Ms !== null && p95 > maxP95Ms) {
    failures.push(`p95=${p95}ms exceeds max=${maxP95Ms}ms`);
  }

  const report = {
    runId,
    baseUrl,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    config: {
      totalRequests,
      concurrency,
      duplicateEvery,
      maxFailureRate,
      maxP95Ms,
      requestTimeoutMs,
      source,
      eventType
    },
    summary: {
      success202: status202,
      status4xx,
      status5xx,
      networkErrors,
      duplicateRequests,
      idempotentReplayCount,
      successRate,
      failureRate,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      throughputRps
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    sampleErrors: results.filter((item) => item.error).slice(0, 10)
  };

  const reportPath = await writeReport(report);

  console.log(`LOAD_TEST_RESULT=${report.result}`);
  console.log(`TOTAL_REQUESTS=${results.length}`);
  console.log(`SUCCESS_202=${status202}`);
  console.log(`STATUS_4XX=${status4xx}`);
  console.log(`STATUS_5XX=${status5xx}`);
  console.log(`NETWORK_ERRORS=${networkErrors}`);
  console.log(`DUPLICATE_REQUESTS=${duplicateRequests}`);
  console.log(`IDEMPOTENT_REPLAY=${idempotentReplayCount}`);
  console.log(`LATENCY_P50_MS=${p50}`);
  console.log(`LATENCY_P95_MS=${p95}`);
  console.log(`THROUGHPUT_RPS=${throughputRps}`);
  console.log(`REPORT_JSON=${reportPath}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAILURE=${failure}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`LOAD_TEST_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
