import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const endpointPath = "/v1/ingest/metrics/queue";
const windowMinutes = readNumber("GATE_WINDOW_MINUTES", 120, 1);
const sampleIntervalSeconds = readNumber("GATE_SAMPLE_INTERVAL_SECONDS", 60, 5);
const maxDlqGrowthPerHour = readNumber("GATE_DLQ_MAX_GROWTH_PER_HOUR", 20, 0);
const requestTimeoutMs = readNumber("GATE_REQUEST_TIMEOUT_MS", 10_000, 1_000);
const maxFetchErrors = readNumber("GATE_MAX_FETCH_ERRORS", 0, 0);
const maxQueueWaiting = readNumberOrNull("GATE_MAX_QUEUE_WAITING");
const maxQueueFailed = readNumberOrNull("GATE_MAX_QUEUE_FAILED");
const includedStatuses = readStatuses(
  process.env.GATE_DLQ_INCLUDE_STATUSES || "OPEN,READY,REPLAYING,FAILED"
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-dlq-growth");

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

function readStatuses(input) {
  const statuses = input
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (statuses.length === 0) {
    throw new Error("GATE_DLQ_INCLUDE_STATUSES must include at least one status");
  }
  return Array.from(new Set(statuses));
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumStatuses(byStatus, statuses) {
  return statuses.reduce((acc, status) => acc + toNumber(byStatus?.[status]), 0);
}

async function fetchMetrics() {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: "GET",
    signal: AbortSignal.timeout(requestTimeoutMs)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const queue = json?.data?.queue;
  const deadLetter = json?.data?.deadLetter;

  if (!queue || !deadLetter || !deadLetter.byStatus) {
    throw new Error("INVALID_METRICS_RESPONSE");
  }

  return {
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    queue: {
      queueName: String(queue.queueName ?? ""),
      enabled: queue.enabled === true,
      connected: queue.connected === true,
      waiting: toNumber(queue.waiting),
      active: toNumber(queue.active),
      delayed: toNumber(queue.delayed),
      completed: toNumber(queue.completed),
      failed: toNumber(queue.failed),
      paused: toNumber(queue.paused),
      lastError: queue.lastError ? String(queue.lastError) : null
    },
    deadLetter: {
      total: toNumber(deadLetter.total),
      byStatus: deadLetter.byStatus
    }
  };
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const filePath = path.join(reportRootDir, `${nowTimestampForFile()}.json`);
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}

async function run() {
  const windowMs = windowMinutes * 60 * 1_000;
  const intervalMs = sampleIntervalSeconds * 1_000;
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + windowMs;
  const samples = [];

  while (true) {
    const sampleTs = Date.now();
    try {
      const metrics = await fetchMetrics();
      const includedTotal = sumStatuses(metrics.deadLetter.byStatus, includedStatuses);
      samples.push({
        timestamp: metrics.fetchedAt,
        latencyMs: metrics.latencyMs,
        error: null,
        queue: metrics.queue,
        deadLetter: {
          total: metrics.deadLetter.total,
          includedTotal,
          byStatus: metrics.deadLetter.byStatus
        }
      });

      console.log(
        `sample_ok ts=${metrics.fetchedAt} queue_waiting=${metrics.queue.waiting} dlq_included=${includedTotal}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_FETCH_ERROR";
      samples.push({
        timestamp: new Date(sampleTs).toISOString(),
        latencyMs: null,
        error: message,
        queue: null,
        deadLetter: null
      });
      console.log(`sample_err ts=${new Date(sampleTs).toISOString()} error=${message}`);
    }

    if (Date.now() >= deadlineMs) {
      break;
    }

    const remainingMs = Math.max(deadlineMs - Date.now(), 0);
    await sleep(Math.min(intervalMs, remainingMs));
  }

  const validSamples = samples.filter((sample) => !sample.error);
  const fetchErrors = samples.length - validSamples.length;
  const failures = [];

  if (fetchErrors > maxFetchErrors) {
    failures.push(`fetch_errors=${fetchErrors} exceeds max=${maxFetchErrors}`);
  }
  if (validSamples.length < 2) {
    failures.push("insufficient_valid_samples");
  }

  let growthPerHour = null;
  let growth = null;
  let elapsedHours = null;
  let maxObservedQueueWaiting = null;
  let maxObservedQueueFailed = null;

  if (validSamples.length >= 2) {
    const first = validSamples[0];
    const last = validSamples[validSamples.length - 1];
    const firstTs = new Date(first.timestamp).getTime();
    const lastTs = new Date(last.timestamp).getTime();
    elapsedHours = (lastTs - firstTs) / (60 * 60 * 1_000);
    growth = last.deadLetter.includedTotal - first.deadLetter.includedTotal;
    growthPerHour = elapsedHours > 0 ? growth / elapsedHours : 0;

    if (growthPerHour > maxDlqGrowthPerHour) {
      failures.push(
        `dlq_growth_per_hour=${growthPerHour.toFixed(2)} exceeds max=${maxDlqGrowthPerHour.toFixed(2)}`
      );
    }

    maxObservedQueueWaiting = validSamples.reduce(
      (acc, sample) => Math.max(acc, sample.queue.waiting),
      0
    );
    maxObservedQueueFailed = validSamples.reduce(
      (acc, sample) => Math.max(acc, sample.queue.failed),
      0
    );

    if (maxQueueWaiting !== null && maxObservedQueueWaiting > maxQueueWaiting) {
      failures.push(`queue_waiting_max=${maxObservedQueueWaiting} exceeds max=${maxQueueWaiting}`);
    }
    if (maxQueueFailed !== null && maxObservedQueueFailed > maxQueueFailed) {
      failures.push(`queue_failed_max=${maxObservedQueueFailed} exceeds max=${maxQueueFailed}`);
    }
  }

  const report = {
    gate: "F-03_DLQ_GROWTH_AFTER_PEAK",
    baseUrl,
    endpointPath,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date().toISOString(),
    config: {
      windowMinutes,
      sampleIntervalSeconds,
      maxDlqGrowthPerHour,
      maxFetchErrors,
      requestTimeoutMs,
      maxQueueWaiting,
      maxQueueFailed,
      includedStatuses
    },
    summary: {
      sampleCount: samples.length,
      validSampleCount: validSamples.length,
      fetchErrors,
      elapsedHours,
      dlqGrowth: growth,
      dlqGrowthPerHour: growthPerHour,
      maxObservedQueueWaiting,
      maxObservedQueueFailed
    },
    result: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    samples
  };

  const reportPath = await writeReport(report);
  console.log(`GATE_RESULT=${report.result}`);
  console.log(`GATE_REPORT_JSON=${reportPath}`);

  if (report.summary.dlqGrowthPerHour !== null) {
    console.log(`DLQ_GROWTH_PER_HOUR=${report.summary.dlqGrowthPerHour.toFixed(2)}`);
  }
  if (report.summary.maxObservedQueueWaiting !== null) {
    console.log(`QUEUE_WAITING_MAX=${report.summary.maxObservedQueueWaiting}`);
  }

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
