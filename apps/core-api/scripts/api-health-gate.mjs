import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const adminToken = process.env.CORE_API_ADMIN_TOKEN || "dev-admin-token";
const adminRole = (process.env.CORE_API_ADMIN_ROLE || "ADMIN").toUpperCase();
const windowMinutes = readNumber("GATE_API_WINDOW_MINUTES", 15, 1);
const max5xxRate = readNumber("GATE_API_MAX_5XX_RATE", 0.015, 0);
const minRequests = readNumber("GATE_API_MIN_REQUESTS", 1, 0);
const requestTimeoutMs = readNumber("GATE_API_REQUEST_TIMEOUT_MS", 10_000, 1_000);
const endpointPath = `/v1/metrics/api?windowMinutes=${windowMinutes}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/api-health");

function readNumber(key, fallback, minValue) {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    throw new Error(`${key} must be a number >= ${minValue}`);
  }
  return parsed;
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fetchMetrics() {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "x-admin-role": adminRole
    },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  if (!json?.data?.totals || !json?.data?.rates || !json?.data?.latencyMs) {
    throw new Error("INVALID_API_METRICS_RESPONSE");
  }

  return {
    fetchLatencyMs: Date.now() - startedAt,
    metrics: json.data
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
  const { fetchLatencyMs, metrics } = await fetchMetrics();
  const failures = [];

  const requests = Number(metrics.totals.requests ?? 0);
  const status5xx = Number(metrics.totals.status5xx ?? 0);
  const error5xxRate = Number(metrics.rates.error5xxRate ?? 0);

  if (requests < minRequests) {
    failures.push(`requests=${requests} below min=${minRequests}`);
  }
  if (error5xxRate > max5xxRate) {
    failures.push(`error5xxRate=${error5xxRate.toFixed(6)} exceeds max=${max5xxRate.toFixed(6)}`);
  }

  const report = {
    gate: "G-03_API_5XX_CORE_PATH",
    startedAt,
    endedAt: new Date().toISOString(),
    baseUrl,
    endpointPath,
    config: {
      windowMinutes,
      max5xxRate,
      minRequests,
      requestTimeoutMs
    },
    summary: {
      fetchLatencyMs,
      requests,
      status5xx,
      error5xxRate,
      latencyP95Ms: Number(metrics.latencyMs.p95 ?? 0),
      latencyMedianMs: Number(metrics.latencyMs.median ?? 0),
      requestsPerSecond: Number(metrics.throughput?.requestsPerSecond ?? 0)
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    metrics
  };

  const reportPath = await writeReport(report);
  console.log(`GATE_RESULT=${report.result}`);
  console.log(`GATE_REPORT_JSON=${reportPath}`);
  console.log(`API_5XX_RATE=${error5xxRate.toFixed(6)}`);
  console.log(`API_REQUESTS=${requests}`);

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
