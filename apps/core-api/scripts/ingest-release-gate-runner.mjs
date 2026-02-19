import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../../reports/gates/ingest-release");

const runProcessingGate = readBoolean(process.env.RUN_GATE_PROCESSING, true);
const runDlqGrowthGate = readBoolean(process.env.RUN_GATE_DLQ_GROWTH, true);

function readBoolean(raw, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatMetric(value) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(4);
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (value === null || value === undefined) {
    return "n/a";
  }
  return String(value);
}

function parseGateOutput(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const gateResultLine = lines.find((line) => line.startsWith("GATE_RESULT="));
  const gateReportLine = lines.find((line) => line.startsWith("GATE_REPORT_JSON="));
  const gateResult = gateResultLine ? gateResultLine.replace("GATE_RESULT=", "") : "UNKNOWN";
  const gateReportPath = gateReportLine ? gateReportLine.replace("GATE_REPORT_JSON=", "") : null;
  return {
    gateResult,
    gateReportPath
  };
}

function runGate(name, scriptFileName) {
  const scriptPath = path.join(__dirname, scriptFileName);
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

  const parsed = parseGateOutput(`${stdout}\n${stderr}`);
  const passed = child.status === 0 && parsed.gateResult === "PASS";
  const gateReportPreview = parsed.gateReportPath ? readGateReportPreview(parsed.gateReportPath) : null;

  return {
    name,
    scriptFileName,
    startedAt,
    endedAt,
    exitCode: child.status ?? 1,
    passed,
    gateResult: parsed.gateResult,
    gateReportPath: parsed.gateReportPath,
    gateReportPreview,
    error: child.error ? child.error.message : null
  };
}

function readGateReportPreview(reportPath) {
  try {
    const raw = readFileSync(reportPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      gate: parsed?.gate ?? null,
      result: parsed?.result ?? null,
      summary: parsed?.summary ?? null
    };
  } catch {
    return null;
  }
}

function summarizeGate(gate) {
  const summary = gate.gateReportPreview?.summary;
  if (!summary || typeof summary !== "object") {
    return "n/a";
  }

  if (gate.name === "F-01_F-02_INGEST_PROCESSING") {
    const successRate = formatMetric(summary.successRate);
    const p95 = formatMetric(summary.latencyP95Ms);
    const median = formatMetric(summary.latencyMedianMs);
    const received = formatMetric(summary.received);
    return `successRate=${successRate}, latencyMedianMs=${median}, latencyP95Ms=${p95}, received=${received}`;
  }

  if (gate.name === "F-03_DLQ_GROWTH_AFTER_PEAK") {
    const growthPerHour = formatMetric(summary.dlqGrowthPerHour);
    const queueWaitingMax = formatMetric(summary.maxObservedQueueWaiting);
    const fetchErrors = formatMetric(summary.fetchErrors);
    return `dlqGrowthPerHour=${growthPerHour}, queueWaitingMax=${queueWaitingMax}, fetchErrors=${fetchErrors}`;
  }

  const keys = Object.keys(summary).slice(0, 4);
  if (keys.length === 0) {
    return "n/a";
  }
  return keys.map((key) => `${key}=${formatMetric(summary[key])}`).join(", ");
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Ingest Release Gate Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Gate Results");
  lines.push("");
  lines.push("| Gate | Result | Exit Code | Summary | Report |");
  lines.push("|---|---|---:|---|---|");

  for (const gate of report.gates) {
    lines.push(
      `| ${gate.name} | ${gate.passed ? "PASS" : "FAIL"} | ${gate.exitCode} | ${summarizeGate(gate)} | ${gate.gateReportPath ?? "n/a"} |`
    );
  }

  lines.push("");
  if (report.result !== "PASS") {
    lines.push("## Failed Gates");
    lines.push("");
    for (const gate of report.gates.filter((item) => !item.passed)) {
      lines.push(`- ${gate.name}: gateResult=${gate.gateResult}, exitCode=${gate.exitCode}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writeReport(report) {
  await mkdir(reportRootDir, { recursive: true });
  const timestamp = nowTimestampForFile();
  const reportPath = path.join(reportRootDir, `${timestamp}.json`);
  const markdownPath = path.join(reportRootDir, `${timestamp}.md`);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, createMarkdownReport(report, reportPath), "utf8");

  return {
    reportPath,
    markdownPath
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const gates = [];

  if (runProcessingGate) {
    gates.push(runGate("F-01_F-02_INGEST_PROCESSING", "ingest-processing-gate.mjs"));
  }
  if (runDlqGrowthGate) {
    gates.push(runGate("F-03_DLQ_GROWTH_AFTER_PEAK", "ingest-dlq-growth-gate.mjs"));
  }

  if (gates.length === 0) {
    throw new Error("No gate selected. Enable RUN_GATE_PROCESSING and/or RUN_GATE_DLQ_GROWTH.");
  }

  const failedGates = gates.filter((gate) => !gate.passed);
  const report = {
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedGates.length === 0 ? "PASS" : "FAIL",
    config: {
      runProcessingGate,
      runDlqGrowthGate
    },
    gates
  };

  const paths = await writeReport(report);
  console.log(`RELEASE_GATE_RESULT=${report.result}`);
  console.log(`RELEASE_GATE_REPORT_JSON=${paths.reportPath}`);
  console.log(`RELEASE_GATE_REPORT_MD=${paths.markdownPath}`);

  if (failedGates.length > 0) {
    for (const failed of failedGates) {
      console.error(
        `FAILED_GATE=${failed.name} exit_code=${failed.exitCode} gate_result=${failed.gateResult}`
      );
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`RELEASE_GATE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
