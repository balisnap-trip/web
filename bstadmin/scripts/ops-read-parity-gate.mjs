import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const reportRootDir = path.resolve(__dirname, "../../reports/gates/ops-read-parity");

const ENV_FILE_CANDIDATES = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.production"),
  path.join(repoRoot, "../apps/core-api/.env")
];

const DEFAULT_CORE_API_BASE_URL = "http://localhost:4000";
const DEFAULT_CORE_API_ADMIN_TOKEN = "dev-admin-token";
const DEFAULT_CORE_API_ADMIN_ROLE = "ADMIN";
const DEFAULT_CORE_API_TIMEOUT_MS = 8000;

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeBookingRef(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeOptionalDriverId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeComparableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function parseEnvText(raw) {
  const out = new Map();
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    if (value) {
      out.set(match[1], value);
    }
  }
  return out;
}

const envFileCache = new Map();
async function readEnvFile(filePath) {
  if (envFileCache.has(filePath)) {
    return envFileCache.get(filePath);
  }

  if (!existsSync(filePath)) {
    const empty = new Map();
    envFileCache.set(filePath, empty);
    return empty;
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = parseEnvText(raw);
  envFileCache.set(filePath, parsed);
  return parsed;
}

async function resolveValue(key, fallback = "") {
  const fromProcess = normalizeText(process.env[key]);
  if (fromProcess) {
    return fromProcess;
  }

  for (const filePath of ENV_FILE_CANDIDATES) {
    const parsed = await readEnvFile(filePath);
    const fromFile = normalizeText(parsed.get(key));
    if (fromFile) {
      return fromFile;
    }
  }

  return fallback;
}

function readNumber(raw, fallback, minValue) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    throw new Error(`Invalid numeric value '${raw}' (expected >= ${minValue})`);
  }
  return parsed;
}

function ratio(numerator, denominator) {
  if (denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(6));
}

function toPercent(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function check(name, passed, detail) {
  return { name, passed, detail };
}

function pushLimited(array, item, limit = 30) {
  if (array.length < limit) {
    array.push(item);
  }
}

function collectCriticalMissingFields(coreBooking) {
  const missing = [];
  const requiredFields = [
    "bookingKey",
    "channelCode",
    "externalBookingRef",
    "customerPaymentStatus",
    "opsFulfillmentStatus"
  ];
  for (const field of requiredFields) {
    if (!normalizeText(coreBooking?.[field])) {
      missing.push(field);
    }
  }
  return missing;
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Ops Read Parity Gate Report (Batch G)");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const item of report.checks) {
    lines.push(`| ${item.name} | ${item.passed ? "PASS" : "FAIL"} | ${item.detail} |`);
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.metrics, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Sample Mismatches");
  lines.push("");

  const listMismatchRows = report.samples?.listMismatchRows ?? [];
  const missingInCoreRows = report.samples?.missingInCoreRows ?? [];
  const detailMismatchRows = report.samples?.detailMismatchRows ?? [];

  lines.push(`- listMismatchRows sample: ${listMismatchRows.length}`);
  lines.push(`- missingInCoreRows sample: ${missingInCoreRows.length}`);
  lines.push(`- detailMismatchRows sample: ${detailMismatchRows.length}`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.samples, null, 2));
  lines.push("```");
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

function buildCoreApiUrl(baseUrl, apiPath) {
  return `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
}

async function requestCoreApi(config, apiPath) {
  const url = buildCoreApiUrl(config.coreApiBaseUrl, apiPath);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${config.coreApiAdminToken}`,
      "x-admin-role": config.coreApiAdminRole,
      "content-type": "application/json"
    },
    signal: AbortSignal.timeout(config.coreApiTimeoutMs)
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

function compareListFields(legacyRow, coreRow) {
  const mismatchedFields = [];

  const legacyStatus = normalizeText(legacyRow.status)?.toUpperCase() || null;
  const coreStatus = normalizeText(coreRow.opsFulfillmentStatus)?.toUpperCase() || null;
  if (legacyStatus !== coreStatus) {
    mismatchedFields.push("status");
  }

  const legacySource = normalizeText(legacyRow.source)?.toUpperCase() || null;
  const coreSource = normalizeText(coreRow.channelCode)?.toUpperCase() || null;
  if (legacySource !== coreSource) {
    mismatchedFields.push("source");
  }

  const legacyMeetingPoint = normalizeComparableText(legacyRow.meetingPoint);
  const coreMeetingPoint = normalizeComparableText(coreRow.meetingPoint);
  if (legacyMeetingPoint !== coreMeetingPoint) {
    mismatchedFields.push("meetingPoint");
  }

  const legacyDriverId = normalizeOptionalDriverId(legacyRow.assignedDriverId);
  const coreDriverId = normalizeOptionalDriverId(coreRow.assignedDriverId);
  if (legacyDriverId !== coreDriverId) {
    mismatchedFields.push("assignedDriverId");
  }

  return mismatchedFields;
}

async function readConfig() {
  const databaseUrl =
    (await resolveValue("OPS_READ_PARITY_DATABASE_URL")) ||
    (await resolveValue("SYNC_DATABASE_URL")) ||
    (await resolveValue("DATABASE_URL"));
  const coreApiBaseUrl = await resolveValue("CORE_API_BASE_URL", DEFAULT_CORE_API_BASE_URL);
  const coreApiAdminToken = await resolveValue("CORE_API_ADMIN_TOKEN", DEFAULT_CORE_API_ADMIN_TOKEN);
  const coreApiAdminRole = await resolveValue("CORE_API_ADMIN_ROLE", DEFAULT_CORE_API_ADMIN_ROLE);

  const sampleLimit = Math.floor(
    readNumber(await resolveValue("OPS_READ_PARITY_SAMPLE_LIMIT"), 200, 1)
  );
  const detailSampleSize = Math.floor(
    readNumber(await resolveValue("OPS_READ_DETAIL_SAMPLE_SIZE"), 50, 1)
  );
  const maxMismatchRatio = readNumber(
    await resolveValue("OPS_READ_PARITY_MAX_MISMATCH_RATIO"),
    0.01,
    0
  );
  const minMatchedRows = Math.floor(
    readNumber(await resolveValue("OPS_READ_PARITY_MIN_MATCHED_ROWS"), 50, 0)
  );
  const coreApiTimeoutMs = Math.floor(
    readNumber(await resolveValue("CORE_API_TIMEOUT_MS"), DEFAULT_CORE_API_TIMEOUT_MS, 1000)
  );

  return {
    databaseUrl,
    coreApiBaseUrl,
    coreApiAdminToken,
    coreApiAdminRole: coreApiAdminRole.toUpperCase(),
    coreApiTimeoutMs,
    sampleLimit,
    detailSampleSize,
    maxMismatchRatio,
    minMatchedRows
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const config = await readConfig();

  if (!config.databaseUrl) {
    throw new Error("Missing DATABASE_URL for legacy read model");
  }
  if (!config.coreApiBaseUrl) {
    throw new Error("Missing CORE_API_BASE_URL");
  }
  if (!config.coreApiAdminToken) {
    throw new Error("Missing CORE_API_ADMIN_TOKEN");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: config.databaseUrl
      }
    }
  });

  try {
    const legacyBookings = await prisma.booking.findMany({
      orderBy: [{ tourDate: "desc" }, { id: "desc" }],
      take: config.sampleLimit,
      select: {
        id: true,
        bookingRef: true,
        source: true,
        status: true,
        meetingPoint: true,
        assignedDriverId: true
      }
    });

    const coreListResult = await requestCoreApi(config, "/v1/ops/bookings");
    if (!coreListResult.ok || !Array.isArray(coreListResult.data)) {
      throw new Error(
        `CORE_LIST_FETCH_FAILED status=${coreListResult.status} error=${coreListResult.error || "unknown"}`
      );
    }

    const coreRows = coreListResult.data;
    const coreByExternalRef = new Map();
    for (const row of coreRows) {
      const ref = normalizeBookingRef(row?.externalBookingRef);
      if (ref) {
        coreByExternalRef.set(ref, row);
      }
    }

    const eligibleLegacyRows = [];
    let legacyRowsWithoutBookingRef = 0;
    for (const legacyRow of legacyBookings) {
      const normalizedRef = normalizeBookingRef(legacyRow.bookingRef);
      if (!normalizedRef) {
        legacyRowsWithoutBookingRef += 1;
        continue;
      }
      eligibleLegacyRows.push({
        ...legacyRow,
        normalizedRef
      });
    }

    let matchedRows = 0;
    let missingInCoreRows = 0;
    let listParityMismatchRows = 0;

    const listMismatchSamples = [];
    const missingInCoreSamples = [];
    const matchedForDetail = [];

    for (const legacyRow of eligibleLegacyRows) {
      const coreRow = coreByExternalRef.get(legacyRow.normalizedRef);
      if (!coreRow) {
        missingInCoreRows += 1;
        pushLimited(missingInCoreSamples, {
          bookingId: legacyRow.id,
          bookingRef: legacyRow.normalizedRef
        });
        continue;
      }

      matchedRows += 1;
      matchedForDetail.push({
        bookingId: legacyRow.id,
        bookingRef: legacyRow.normalizedRef,
        legacyRow,
        coreRow
      });

      const mismatchedFields = compareListFields(legacyRow, coreRow);
      if (mismatchedFields.length > 0) {
        listParityMismatchRows += 1;
        pushLimited(listMismatchSamples, {
          bookingId: legacyRow.id,
          bookingRef: legacyRow.normalizedRef,
          mismatchedFields,
          legacy: {
            source: legacyRow.source,
            status: legacyRow.status,
            meetingPoint: normalizeComparableText(legacyRow.meetingPoint),
            assignedDriverId: normalizeOptionalDriverId(legacyRow.assignedDriverId)
          },
          core: {
            source: coreRow.channelCode,
            status: coreRow.opsFulfillmentStatus,
            meetingPoint: normalizeComparableText(coreRow.meetingPoint),
            assignedDriverId: normalizeOptionalDriverId(coreRow.assignedDriverId)
          }
        });
      }
    }

    const detailCandidates = matchedForDetail.slice(0, config.detailSampleSize);
    let detailMismatchRows = 0;
    let detailFetchErrors = 0;
    let detailCriticalMissingFields = 0;
    const detailMismatchSamples = [];

    for (const candidate of detailCandidates) {
      const detailResult = await requestCoreApi(
        config,
        `/v1/ops/bookings/${encodeURIComponent(candidate.bookingRef)}`
      );

      if (!detailResult.ok || !detailResult.data) {
        detailMismatchRows += 1;
        detailFetchErrors += 1;
        pushLimited(detailMismatchSamples, {
          bookingId: candidate.bookingId,
          bookingRef: candidate.bookingRef,
          type: "FETCH_ERROR",
          status: detailResult.status,
          error: detailResult.error
        });
        continue;
      }

      const detailData = detailResult.data;
      const missingCriticalFields = collectCriticalMissingFields(detailData);
      detailCriticalMissingFields += missingCriticalFields.length;

      const mismatchedFields = compareListFields(candidate.legacyRow, detailData);
      const detailExternalRef = normalizeBookingRef(detailData.externalBookingRef);
      if (detailExternalRef !== candidate.bookingRef) {
        mismatchedFields.push("externalBookingRef");
      }

      if (missingCriticalFields.length > 0 || mismatchedFields.length > 0) {
        detailMismatchRows += 1;
        pushLimited(detailMismatchSamples, {
          bookingId: candidate.bookingId,
          bookingRef: candidate.bookingRef,
          type: "PARITY_OR_CRITICAL_MISMATCH",
          missingCriticalFields,
          mismatchedFields
        });
      }
    }

    const listMismatchRatio = ratio(listParityMismatchRows, matchedRows);
    const detailMismatchRatio = ratio(detailMismatchRows, detailCandidates.length);

    const listParityPassed =
      matchedRows === 0
        ? config.minMatchedRows === 0
        : listMismatchRatio !== null && listMismatchRatio <= config.maxMismatchRatio;
    const detailParityPassed =
      detailCandidates.length === 0
        ? config.minMatchedRows === 0
        : detailMismatchRatio !== null && detailMismatchRatio <= config.maxMismatchRatio;

    const checks = [
      check(
        "BG-01_list_parity_ratio",
        listParityPassed,
        `parityMismatchRows=${listParityMismatchRows}, matchedRows=${matchedRows}, ratio=${toPercent(listMismatchRatio)}, max=${toPercent(config.maxMismatchRatio)}`
      ),
      check(
        "BG-01_min_matched_rows",
        matchedRows >= config.minMatchedRows,
        `matchedRows=${matchedRows}, min=${config.minMatchedRows}`
      ),
      check(
        "BG-01_detail_parity_ratio",
        detailParityPassed,
        `mismatchRows=${detailMismatchRows}, sampledRows=${detailCandidates.length}, ratio=${toPercent(detailMismatchRatio)}, max=${toPercent(config.maxMismatchRatio)}`
      ),
      check(
        "BG-01_detail_critical_fields",
        detailCriticalMissingFields === 0,
        `missingCriticalFields=${detailCriticalMissingFields}`
      ),
      check(
        "BG-01_detail_fetch_errors",
        detailFetchErrors === 0,
        `detailFetchErrors=${detailFetchErrors}`
      )
    ];

    const report = {
      gate: "BG-01_OPS_READ_PARITY",
      startedAt,
      endedAt: new Date().toISOString(),
      thresholds: {
        sampleLimit: config.sampleLimit,
        detailSampleSize: config.detailSampleSize,
        maxMismatchRatio: config.maxMismatchRatio,
        minMatchedRows: config.minMatchedRows
      },
      metrics: {
        legacyRows: legacyBookings.length,
        legacyRowsWithoutBookingRef,
        eligibleLegacyRows: eligibleLegacyRows.length,
        coreRows: coreRows.length,
        matchedRows,
        missingInCoreRows,
        listParityMismatchRows,
        listMismatchRatio,
        detailSampledRows: detailCandidates.length,
        detailMismatchRows,
        detailMismatchRatio,
        detailCriticalMissingFields,
        detailFetchErrors
      },
      checks,
      samples: {
        listMismatchRows: listMismatchSamples,
        missingInCoreRows: missingInCoreSamples,
        detailMismatchRows: detailMismatchSamples
      },
      result: checks.every((item) => item.passed) ? "PASS" : "FAIL"
    };

    const output = await writeReport(report);
    console.log(`OPS_READ_PARITY_GATE_RESULT=${report.result}`);
    console.log(`OPS_READ_PARITY_GATE_JSON=${output.jsonPath}`);
    console.log(`OPS_READ_PARITY_GATE_MD=${output.mdPath}`);
    console.log(
      `OPS_READ_PARITY_LIST_MISMATCH_RATIO=${
        report.metrics.listMismatchRatio === null
          ? "n/a"
          : report.metrics.listMismatchRatio.toFixed(6)
      }`
    );
    console.log(
      `OPS_READ_PARITY_DETAIL_MISMATCH_RATIO=${
        report.metrics.detailMismatchRatio === null
          ? "n/a"
          : report.metrics.detailMismatchRatio.toFixed(6)
      }`
    );
    console.log(`OPS_READ_PARITY_MATCHED_ROWS=${report.metrics.matchedRows}`);

    if (report.result !== "PASS") {
      for (const failedCheck of checks.filter((item) => !item.passed)) {
        console.error(`FAILED_CHECK=${failedCheck.name} ${failedCheck.detail}`);
      }
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(
    `OPS_READ_PARITY_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
