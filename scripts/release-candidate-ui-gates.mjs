import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const reportRootDir = path.resolve(repoRoot, "reports/gates/release-candidate-ui");

function readText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized || fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createStep(name, command, enabled) {
  return {
    name,
    command,
    enabled,
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    result: enabled ? "PENDING" : "SKIPPED",
    exitCode: null
  };
}

async function runCommand(command) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Release Candidate UI Gates Report");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Config");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.config, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Steps");
  lines.push("");
  lines.push("| Step | Enabled | Result | Exit Code | Duration (ms) | Command |");
  lines.push("|---|---|---|---:|---:|---|");
  for (const step of report.steps) {
    lines.push(
      `| ${step.name} | ${step.enabled ? "yes" : "no"} | ${step.result} | ${step.exitCode ?? "n/a"} | ${step.durationMs} | \`${step.command}\` |`
    );
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.summary, null, 2));
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

async function run() {
  const startedAt = new Date().toISOString();
  const runUiChecklist = readBoolean(process.env.RC_UI_GATES_RUN_UI_CHECKLIST, true);
  const runCatalogEditorSmoke = readBoolean(process.env.RC_UI_GATES_RUN_CATALOG_EDITOR_SMOKE, true);
  const runCatalogPublishGate = readBoolean(process.env.RC_UI_GATES_RUN_CATALOG_PUBLISH_GATE, true);
  const runPublicWebContinuity = readBoolean(process.env.RC_UI_GATES_RUN_PUBLIC_WEB_CONTINUITY, false);

  const steps = [
    createStep("ui_release_checklist", "pnpm --filter bst-admin gate:ui-release-checklist", runUiChecklist),
    createStep("catalog_editor_smoke", "pnpm --filter @bst/core-api smoke:catalog-editor", runCatalogEditorSmoke),
    createStep(
      "catalog_publish_workflow_gate",
      "pnpm --filter @bst/core-api gate:catalog-publish-workflow",
      runCatalogPublishGate
    ),
    createStep("public_web_continuity", "pnpm gate:public-web-continuity", runPublicWebContinuity)
  ];

  for (const step of steps) {
    if (!step.enabled) {
      continue;
    }
    step.startedAt = new Date().toISOString();
    const runResult = await runCommand(step.command);
    step.endedAt = new Date().toISOString();
    step.durationMs = runResult.durationMs;
    step.exitCode = runResult.code;
    step.result = runResult.code === 0 ? "PASS" : "FAIL";
    if (runResult.code !== 0) {
      break;
    }
  }

  const failedSteps = steps.filter((step) => step.result === "FAIL");
  const report = {
    gate: "RELEASE_CANDIDATE_UI_GATES",
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedSteps.length === 0 ? "PASS" : "FAIL",
    config: {
      coreApiBaseUrl: readText(process.env.CORE_API_BASE_URL, "not-set"),
      publicWebBaseUrl: readText(process.env.PUBLIC_WEB_BASE_URL, "not-set"),
      runUiChecklist,
      runCatalogEditorSmoke,
      runCatalogPublishGate,
      runPublicWebContinuity
    },
    summary: {
      totalSteps: steps.length,
      enabledSteps: steps.filter((step) => step.enabled).length,
      skippedSteps: steps.filter((step) => !step.enabled).length,
      passedSteps: steps.filter((step) => step.result === "PASS").length,
      failedSteps: failedSteps.length
    },
    steps
  };

  const reportPaths = await writeReport(report);
  console.log(`RELEASE_CANDIDATE_UI_GATES_RESULT=${report.result}`);
  console.log(`RELEASE_CANDIDATE_UI_GATES_REPORT_JSON=${reportPaths.jsonPath}`);
  console.log(`RELEASE_CANDIDATE_UI_GATES_REPORT_MD=${reportPaths.mdPath}`);

  if (failedSteps.length > 0) {
    for (const failedStep of failedSteps) {
      console.error(`FAILED_STEP=${failedStep.name} exitCode=${failedStep.exitCode}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(
    `RELEASE_CANDIDATE_UI_GATES_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
