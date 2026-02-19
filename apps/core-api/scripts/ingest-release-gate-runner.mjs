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

  return {
    name,
    scriptFileName,
    startedAt,
    endedAt,
    exitCode: child.status ?? 1,
    passed,
    gateResult: parsed.gateResult,
    gateReportPath: parsed.gateReportPath,
    error: child.error ? child.error.message : null
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

  const reportPath = await writeReport(report);
  console.log(`RELEASE_GATE_RESULT=${report.result}`);
  console.log(`RELEASE_GATE_REPORT_JSON=${reportPath}`);

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
