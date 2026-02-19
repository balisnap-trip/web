import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const windowMinutes = readNumberWithFallback(
  ["GATE_PROCESSING_WINDOW_MINUTES", "GATE_WINDOW_MINUTES"],
  60,
  1
);
const minSuccessRate = readNumberWithFallback(
  ["GATE_PROCESSING_MIN_SUCCESS_RATE", "GATE_MIN_SUCCESS_RATE"],
  0.995,
  0
);
const maxMedianMs = readNumberWithFallback(
  ["GATE_PROCESSING_MAX_MEDIAN_MS", "GATE_MAX_MEDIAN_MS"],
  3_000,
  1
);
const maxP95Ms = readNumberWithFallback(
  ["GATE_PROCESSING_MAX_P95_MS", "GATE_MAX_P95_MS"],
  15_000,
  1
);
const minReceived = readNumberWithFallback(
  ["GATE_PROCESSING_MIN_RECEIVED", "GATE_MIN_RECEIVED"],
  1,
  0
);
const minLatencySample = readNumberWithFallback(
  ["GATE_PROCESSING_MIN_LATENCY_SAMPLE", "GATE_MIN_LATENCY_SAMPLE"],
  1,
  0
);
const requestTimeoutMs = readNumberWithFallback(
  ["GATE_PROCESSING_REQUEST_TIMEOUT_MS", "GATE_REQUEST_TIMEOUT_MS"],
  10_000,
  1_000
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-processing");

function readNumberWithFallback(keys, fallback, minValue) {
  const selectedKey = keys.find((key) => {
    const raw = process.env[key];
    return raw !== undefined && raw !== "";
  });
  if (!selectedKey) {
    return fallback;
  }

  const raw = process.env[selectedKey];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minValue) {
    throw new Error(`${selectedKey} must be a number >= ${minValue}`);
  }
  return value;
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchMetrics() {
  const endpointPath = `/v1/ingest/metrics/processing?windowMinutes=${windowMinutes}`;
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: "GET",
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  const responseText = await response.text();

  let json;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = json?.data;
  if (!data || !data.totals || !data.latenciesMs) {
    throw new Error("INVALID_PROCESSING_METRICS_RESPONSE");
  }

  return {
    endpointPath,
    fetchLatencyMs: Date.now() - startedAt,
    windowMinutes: toNumber(data.windowMinutes),
    totals: {
      received: toNumber(data.totals.received),
      done: toNumber(data.totals.done),
      failed: toNumber(data.totals.failed),
      processing: toNumber(data.totals.processing),
      pending: toNumber(data.totals.pending),
      terminal: toNumber(data.totals.terminal)
    },
    successRate: Number(data.successRate ?? 0),
    failureRate: Number(data.failureRate ?? 0),
    latenciesMs: {
      sampleCount: toNumber(data.latenciesMs.sampleCount),
      median: toNumber(data.latenciesMs.median),
      p95: toNumber(data.latenciesMs.p95),
      max: toNumber(data.latenciesMs.max)
    }
  };
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const reportPath = path.join(reportRootDir, `${nowTimestampForFile()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function run() {
  const startedAt = new Date().toISOString();
  const metrics = await fetchMetrics();
  const failures = [];

  if (metrics.totals.received < minReceived) {
    failures.push(`received=${metrics.totals.received} below min=${minReceived}`);
  }
  if (metrics.successRate < minSuccessRate) {
    failures.push(
      `success_rate=${metrics.successRate.toFixed(6)} below min=${minSuccessRate.toFixed(6)}`
    );
  }
  if (metrics.latenciesMs.sampleCount < minLatencySample) {
    failures.push(
      `latency_sample=${metrics.latenciesMs.sampleCount} below min=${minLatencySample}`
    );
  }
  if (metrics.latenciesMs.sampleCount >= minLatencySample) {
    if (metrics.latenciesMs.median > maxMedianMs) {
      failures.push(`median_ms=${metrics.latenciesMs.median} exceeds max=${maxMedianMs}`);
    }
    if (metrics.latenciesMs.p95 > maxP95Ms) {
      failures.push(`p95_ms=${metrics.latenciesMs.p95} exceeds max=${maxP95Ms}`);
    }
  }

  const throughputPerSecond =
    metrics.windowMinutes > 0
      ? Number((metrics.totals.received / (metrics.windowMinutes * 60)).toFixed(4))
      : 0;

  const report = {
    gate: "F-01_F-02_INGEST_PROCESSING",
    startedAt,
    endedAt: new Date().toISOString(),
    baseUrl,
    endpointPath: metrics.endpointPath,
    config: {
      windowMinutes,
      minSuccessRate,
      maxMedianMs,
      maxP95Ms,
      minReceived,
      minLatencySample,
      requestTimeoutMs
    },
    summary: {
      fetchLatencyMs: metrics.fetchLatencyMs,
      received: metrics.totals.received,
      done: metrics.totals.done,
      failed: metrics.totals.failed,
      processing: metrics.totals.processing,
      pending: metrics.totals.pending,
      terminal: metrics.totals.terminal,
      successRate: metrics.successRate,
      failureRate: metrics.failureRate,
      throughputPerSecond,
      latencySampleCount: metrics.latenciesMs.sampleCount,
      latencyMedianMs: metrics.latenciesMs.median,
      latencyP95Ms: metrics.latenciesMs.p95,
      latencyMaxMs: metrics.latenciesMs.max
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };

  const reportPath = await writeReport(report);
  console.log(`GATE_RESULT=${report.result}`);
  console.log(`GATE_REPORT_JSON=${reportPath}`);
  console.log(`SUCCESS_RATE=${metrics.successRate.toFixed(6)}`);
  console.log(`LATENCY_MEDIAN_MS=${metrics.latenciesMs.median}`);
  console.log(`LATENCY_P95_MS=${metrics.latenciesMs.p95}`);

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
