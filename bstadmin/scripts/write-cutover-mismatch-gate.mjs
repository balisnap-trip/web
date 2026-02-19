import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const actionName = "OPS_WRITE_CUTOVER_EVENT";
const windowMinutes = readNumber("OPS_WRITE_GATE_WINDOW_MINUTES", 60, 1);
const maxMismatchRatio = readNumber("OPS_WRITE_MISMATCH_MAX_RATIO", 0.001, 0);
const minSamples = Math.floor(readNumber("OPS_WRITE_MISMATCH_MIN_SAMPLES", 1, 0));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../reports/gates/write-cutover");

function readNumber(key, fallback, minValue) {
  const rawValue = process.env[key];
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    throw new Error(`${key} must be a number >= ${minValue}`);
  }
  return parsed;
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ratioOrZero(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(6));
}

function toPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function parsePayload(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null;
  }
  const payload = rawValue;
  const operation =
    typeof payload.operation === "string" && payload.operation.trim()
      ? payload.operation.trim()
      : null;
  if (!operation || typeof payload.coreAttempted !== "boolean") {
    return null;
  }
  return {
    operation,
    bookingId:
      typeof payload.bookingId === "string" && payload.bookingId.trim()
        ? payload.bookingId.trim()
        : null,
    coreAttempted: payload.coreAttempted,
    coreSuccess: payload.coreSuccess === null ? null : Boolean(payload.coreSuccess),
    coreStatus:
      Number.isFinite(Number(payload.coreStatus)) ? Number(payload.coreStatus) : null,
    coreError:
      typeof payload.coreError === "string" && payload.coreError.trim()
        ? payload.coreError.trim()
        : null,
    strictMode: Boolean(payload.strictMode),
    fallbackUsed: Boolean(payload.fallbackUsed),
    legacyAttempted: Boolean(payload.legacyAttempted),
    legacySuccess:
      payload.legacySuccess === null ? null : Boolean(payload.legacySuccess),
    legacyError:
      typeof payload.legacyError === "string" && payload.legacyError.trim()
        ? payload.legacyError.trim()
        : null,
    mismatch: Boolean(payload.mismatch)
  };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Write Cutover Mismatch Gate Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| totalEvents | ${report.summary.totalEvents} |`);
  lines.push(`| coreAttempted | ${report.summary.coreAttempted} |`);
  lines.push(`| mismatch | ${report.summary.mismatch} |`);
  lines.push(`| mismatchRatio | ${toPercent(report.summary.mismatchRatio)} |`);
  lines.push(`| threshold | ${toPercent(report.thresholds.maxMismatchRatio)} |`);
  lines.push(`| minSamples | ${report.thresholds.minSamples} |`);
  lines.push("");
  lines.push("## By Operation");
  lines.push("");
  lines.push("| Operation | Core Attempted | Mismatch | Mismatch Ratio |");
  lines.push("|---|---|---|---|");
  for (const row of report.byOperation) {
    lines.push(
      `| ${row.operation} | ${row.coreAttempted} | ${row.mismatch} | ${toPercent(row.mismatchRatio)} |`
    );
  }
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
  const timestamp = nowTimestampForFile();
  const jsonPath = path.join(reportRootDir, `${timestamp}.json`);
  const mdPath = path.join(reportRootDir, `${timestamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, createMarkdownReport(report, jsonPath), "utf8");

  return { jsonPath, mdPath };
}

async function run() {
  const startedAt = new Date().toISOString();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const rows = await prisma.auditLog.findMany({
    where: {
      action: actionName,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      newValue: true
    }
  });

  const entries = rows
    .map((row) => {
      const payload = parsePayload(row.newValue);
      if (!payload) {
        return null;
      }
      return {
        createdAt: row.createdAt.toISOString(),
        payload
      };
    })
    .filter(Boolean);

  const summary = {
    totalEvents: entries.length,
    coreAttempted: entries.filter((item) => item.payload.coreAttempted).length,
    coreSuccess: entries.filter((item) => item.payload.coreAttempted && item.payload.coreSuccess === true).length,
    coreFailed: entries.filter((item) => item.payload.coreAttempted && item.payload.coreSuccess === false).length,
    mismatch: entries.filter((item) => item.payload.mismatch).length,
    fallbackUsed: entries.filter((item) => item.payload.fallbackUsed).length
  };
  summary.mismatchRatio = ratioOrZero(summary.mismatch, summary.coreAttempted);

  const byOperationMap = new Map();
  for (const item of entries) {
    const key = item.payload.operation;
    const bucket = byOperationMap.get(key) || {
      operation: key,
      coreAttempted: 0,
      mismatch: 0
    };
    if (item.payload.coreAttempted) {
      bucket.coreAttempted += 1;
    }
    if (item.payload.mismatch) {
      bucket.mismatch += 1;
    }
    byOperationMap.set(key, bucket);
  }

  const byOperation = Array.from(byOperationMap.values())
    .map((item) => ({
      ...item,
      mismatchRatio: ratioOrZero(item.mismatch, item.coreAttempted)
    }))
    .sort((a, b) => b.mismatchRatio - a.mismatchRatio || b.coreAttempted - a.coreAttempted);

  const failures = [];
  if (summary.coreAttempted < minSamples) {
    failures.push(`samples=${summary.coreAttempted} below min=${minSamples}`);
  }
  if (summary.mismatchRatio > maxMismatchRatio) {
    failures.push(
      `mismatchRatio=${summary.mismatchRatio.toFixed(6)} exceeds max=${maxMismatchRatio.toFixed(6)}`
    );
  }

  const report = {
    gate: "H-01_WRITE_CUTOVER_MISMATCH",
    startedAt,
    endedAt: new Date().toISOString(),
    thresholds: {
      windowMinutes,
      maxMismatchRatio,
      minSamples
    },
    summary,
    byOperation,
    failures,
    result: failures.length === 0 ? "PASS" : "FAIL"
  };

  const paths = await writeReport(report);
  console.log(`WRITE_CUTOVER_GATE_RESULT=${report.result}`);
  console.log(`WRITE_CUTOVER_GATE_JSON=${paths.jsonPath}`);
  console.log(`WRITE_CUTOVER_GATE_MD=${paths.mdPath}`);
  console.log(`WRITE_CUTOVER_MISMATCH_RATIO=${summary.mismatchRatio.toFixed(6)}`);
  console.log(`WRITE_CUTOVER_CORE_ATTEMPTED=${summary.coreAttempted}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAILED_CHECK=${failure}`);
    }
    process.exit(1);
  }
}

run()
  .catch((error) => {
    console.error(
      `WRITE_CUTOVER_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
