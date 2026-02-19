import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const baseUrl = process.env.CORE_API_BASE_URL || "http://localhost:4000";
const adminToken = process.env.CORE_API_ADMIN_TOKEN || "dev-admin-token";
const adminRole = (process.env.CORE_API_ADMIN_ROLE || "ADMIN").toUpperCase();
const failOnChecks = readBoolean(process.env.RECON_REPORT_FAIL_ON_CHECKS, true);
const requestTimeoutMs = readNumber("RECON_REPORT_REQUEST_TIMEOUT_MS", 10000, 1000);
const endpointPath = "/v1/metrics/reconciliation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/recon/daily");

function readBoolean(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

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

function toPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function domainRows(snapshot) {
  const domains = snapshot?.domains || {};
  return [
    ["booking", domains.booking],
    ["payment", domains.payment],
    ["ingest", domains.ingest],
    ["catalog", domains.catalog]
  ];
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Reconciliation Daily Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- failOnChecks: ${report.config.failOnChecks}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Thresholds");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.snapshot.thresholds, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Domain Summary");
  lines.push("");
  lines.push("| Domain | Result | Mismatch Rows | Denominator | Ratio | Threshold |");
  lines.push("|---|---|---|---|---|---|");
  for (const [domainName, domain] of domainRows(report.snapshot)) {
    if (!domain) {
      lines.push(`| ${domainName} | FAIL | n/a | n/a | n/a | n/a |`);
      continue;
    }

    const ratio = domain.ratio === null ? "n/a" : toPercent(domain.ratio);
    const threshold = domain.thresholdRatio === null ? "n/a" : toPercent(domain.thresholdRatio);
    lines.push(
      `| ${domainName} | ${domain.passed ? "PASS" : "FAIL"} | ${domain.mismatchRows} | ${domain.denominator} | ${ratio} | ${threshold} |`
    );
  }
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const check of report.snapshot.checks || []) {
    lines.push(`| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${check.detail} |`);
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.snapshot.metrics, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function fetchSnapshot() {
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

  const snapshot = json?.data;
  if (!snapshot || !snapshot.metrics || !Array.isArray(snapshot.checks)) {
    throw new Error("INVALID_RECONCILIATION_RESPONSE");
  }
  return snapshot;
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
  const snapshot = await fetchSnapshot();
  const failedChecks = (snapshot.checks || []).filter((check) => !check.passed);

  const report = {
    startedAt,
    endedAt: new Date().toISOString(),
    result: snapshot.result || (failedChecks.length === 0 ? "PASS" : "FAIL"),
    baseUrl,
    endpointPath,
    config: {
      failOnChecks,
      requestTimeoutMs
    },
    failedChecks: failedChecks.map((check) => ({
      name: check.name,
      detail: check.detail
    })),
    snapshot
  };

  const paths = await writeReport(report);
  console.log(`RECON_REPORT_RESULT=${report.result}`);
  console.log(`RECON_REPORT_JSON=${paths.jsonPath}`);
  console.log(`RECON_REPORT_MD=${paths.mdPath}`);
  console.log(`RECON_FAILED_CHECKS=${failedChecks.length}`);

  if (failOnChecks && report.result !== "PASS") {
    for (const check of failedChecks) {
      console.error(`FAILED_CHECK=${check.name} ${check.detail}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(
    `RECON_REPORT_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
