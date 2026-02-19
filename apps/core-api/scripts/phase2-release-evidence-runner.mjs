import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const batchCode = process.env.PHASE2_BATCH_CODE || "phase2";
const runQualityCheck = readBoolean(process.env.RUN_EVIDENCE_QUALITY_CHECK, true);
const runIngestGates = readBoolean(process.env.RUN_EVIDENCE_INGEST_GATES, true);
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

  if (steps.length === 0) {
    throw new Error("No evidence stage selected. Enable RUN_EVIDENCE_QUALITY_CHECK and/or RUN_EVIDENCE_INGEST_GATES.");
  }

  const failedSteps = steps.filter((step) => !step.passed);
  const report = {
    batchCode,
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedSteps.length === 0 ? "PASS" : "FAIL",
    config: {
      runQualityCheck,
      runIngestGates
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
