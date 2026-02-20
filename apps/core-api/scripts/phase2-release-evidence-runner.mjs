import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const batchCode = process.env.PHASE2_BATCH_CODE || "phase2";
const runQualityCheck = readBoolean(process.env.RUN_EVIDENCE_QUALITY_CHECK, true);
const runIngestGates = readBoolean(process.env.RUN_EVIDENCE_INGEST_GATES, true);
const runIngestReplayDrill = readBoolean(process.env.RUN_EVIDENCE_INGEST_REPLAY_DRILL, false);
const runIngestDuplicateGate = readBoolean(process.env.RUN_EVIDENCE_INGEST_DUPLICATE_GATE, false);
const runIngestRetentionGate = readBoolean(process.env.RUN_EVIDENCE_INGEST_RETENTION_GATE, false);
const runCatalogGate = readBoolean(process.env.RUN_EVIDENCE_CATALOG_GATE, false);
const runBookingGate = readBoolean(process.env.RUN_EVIDENCE_BOOKING_GATE, false);
const runPaymentGate = readBoolean(process.env.RUN_EVIDENCE_PAYMENT_GATE, false);
const runCatalogPublishGate = readBoolean(process.env.RUN_EVIDENCE_CATALOG_PUBLISH_GATE, false);
const reportRootDir = path.resolve(__dirname, `../../../reports/release-evidence/${batchCode}`);

function readBoolean(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseOutput(text, key) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const line = lines.find((item) => item.startsWith(`${key}=`));
  return line ? line.replace(`${key}=`, "") : null;
}

function runScript(name, fileName, resultKey, reportKey, reportMdKey = null) {
  const scriptPath = path.join(__dirname, fileName);
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, [scriptPath], {
    env: process.env,
    encoding: "utf8",
    shell: false
  });
  const endedAt = new Date().toISOString();

  const stdout = child.stdout || "";
  const stderr = child.stderr || "";
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }

  const merged = `${stdout}\n${stderr}`;
  const result = parseOutput(merged, resultKey);
  const reportJson = parseOutput(merged, reportKey);
  const reportMd = reportMdKey ? parseOutput(merged, reportMdKey) : null;
  const passed = child.status === 0 && result === "PASS";

  return {
    name,
    fileName,
    startedAt,
    endedAt,
    exitCode: child.status ?? 1,
    result: result ?? "UNKNOWN",
    passed,
    reportJson,
    reportMd
  };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Phase-2 Release Evidence Report");
  lines.push("");
  lines.push(`- batch: ${report.batchCode}`);
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Executions");
  lines.push("");
  lines.push("| Stage | Result | Exit Code | JSON Report | MD Report |");
  lines.push("|---|---|---:|---|---|");
  for (const step of report.steps) {
    lines.push(
      `| ${step.name} | ${step.passed ? "PASS" : "FAIL"} | ${step.exitCode} | ${step.reportJson ?? "n/a"} | ${step.reportMd ?? "n/a"} |`
    );
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

  return {
    jsonPath,
    mdPath
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const steps = [];

  if (process.env.RUN_GATE_REPLAY_DRILL === undefined) {
    process.env.RUN_GATE_REPLAY_DRILL = runIngestReplayDrill ? "true" : "false";
  }
  if (process.env.RUN_GATE_DUPLICATE_DELIVERY === undefined) {
    process.env.RUN_GATE_DUPLICATE_DELIVERY = runIngestDuplicateGate ? "true" : "false";
  }
  if (process.env.RUN_GATE_RETENTION_POLICY === undefined) {
    process.env.RUN_GATE_RETENTION_POLICY = runIngestRetentionGate ? "true" : "false";
  }

  if (runQualityCheck) {
    steps.push(
      runScript(
        "PHASE2_QUALITY_CHECK",
        "phase2-quality-check.mjs",
        "QUALITY_CHECK_RESULT",
        "QUALITY_REPORT_JSON",
        "QUALITY_REPORT_MD"
      )
    );
  }

  if (runIngestGates) {
    steps.push(
      runScript(
        "INGEST_RELEASE_GATES",
        "ingest-release-gate-runner.mjs",
        "RELEASE_GATE_RESULT",
        "RELEASE_GATE_REPORT_JSON",
        "RELEASE_GATE_REPORT_MD"
      )
    );
  }

  if (runCatalogGate) {
    steps.push(
      runScript(
        "CATALOG_BRIDGE_GATE",
        "catalog-bridge-gate.mjs",
        "CATALOG_BRIDGE_GATE_RESULT",
        "CATALOG_BRIDGE_GATE_JSON",
        "CATALOG_BRIDGE_GATE_MD"
      )
    );
  }

  if (runBookingGate) {
    steps.push(
      runScript(
        "BOOKING_BRIDGE_GATE",
        "booking-bridge-gate.mjs",
        "BOOKING_BRIDGE_GATE_RESULT",
        "BOOKING_BRIDGE_GATE_JSON",
        "BOOKING_BRIDGE_GATE_MD"
      )
    );
  }

  if (runPaymentGate) {
    steps.push(
      runScript(
        "PAYMENT_FINANCE_BRIDGE_GATE",
        "payment-finance-bridge-gate.mjs",
        "PAYMENT_FINANCE_GATE_RESULT",
        "PAYMENT_FINANCE_GATE_JSON",
        "PAYMENT_FINANCE_GATE_MD"
      )
    );
  }

  if (runCatalogPublishGate) {
    steps.push(
      runScript(
        "CATALOG_PUBLISH_WORKFLOW_GATE",
        "catalog-publish-workflow-gate.mjs",
        "GATE_RESULT",
        "GATE_REPORT_JSON",
        "GATE_REPORT_MD"
      )
    );
  }

  if (steps.length === 0) {
    throw new Error(
      "No evidence stage selected. Enable RUN_EVIDENCE_QUALITY_CHECK and/or RUN_EVIDENCE_INGEST_GATES and/or RUN_EVIDENCE_CATALOG_GATE and/or RUN_EVIDENCE_BOOKING_GATE and/or RUN_EVIDENCE_PAYMENT_GATE and/or RUN_EVIDENCE_CATALOG_PUBLISH_GATE."
    );
  }

  const failedSteps = steps.filter((step) => !step.passed);
  const report = {
    batchCode,
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedSteps.length === 0 ? "PASS" : "FAIL",
    config: {
      runQualityCheck,
      runIngestGates,
      runIngestReplayDrill,
      runIngestDuplicateGate,
      runIngestRetentionGate,
      runCatalogGate,
      runBookingGate,
      runPaymentGate,
      runCatalogPublishGate
    },
    steps
  };

  const paths = await writeReport(report);
  console.log(`RELEASE_EVIDENCE_RESULT=${report.result}`);
  console.log(`RELEASE_EVIDENCE_REPORT_JSON=${paths.jsonPath}`);
  console.log(`RELEASE_EVIDENCE_REPORT_MD=${paths.mdPath}`);

  if (failedSteps.length > 0) {
    for (const failed of failedSteps) {
      console.error(`FAILED_STAGE=${failed.name} result=${failed.result} exit_code=${failed.exitCode}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`RELEASE_EVIDENCE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
