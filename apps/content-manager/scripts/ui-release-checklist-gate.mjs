import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const reportRootDir = path.resolve(repoRoot, "reports/gates/cm-ui-release-checklist");
const baselinePath = path.resolve(appRoot, "config/ui-release-checklist-baseline.json");

const TRACKED_FILES = [
  "src/app/(panel)/dashboard/page.tsx",
  "src/app/(panel)/catalog/page.tsx",
  "src/app/(panel)/publish/page.tsx",
  "src/components/layout/cm-header.tsx",
  "src/components/layout/cm-shell.tsx",
  "src/components/catalog/catalog-item-delete-modal.tsx",
  "src/components/catalog/image-preview-modal.tsx",
  "src/components/ui/form-field.tsx",
  "src/components/ui/table.tsx",
  "src/components/ui/status-badge.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/ui/sheet.tsx",
  "src/components/ui/popover.tsx"
];

const COMPONENT_CONTRACTS = [
  {
    name: "cm_header_uses_popover",
    file: "src/components/layout/cm-header.tsx",
    required: [
      { label: "popover import", regex: /from ["']@\/components\/ui\/popover["']/ },
      { label: "Popover usage", regex: /<Popover\b/ },
      { label: "PopoverTrigger usage", regex: /<PopoverTrigger\b/ },
      { label: "PopoverContent usage", regex: /<PopoverContent\b/ }
    ]
  },
  {
    name: "cm_shell_uses_sheet",
    file: "src/components/layout/cm-shell.tsx",
    required: [
      { label: "sheet import", regex: /from ["']@\/components\/ui\/sheet["']/ },
      { label: "Sheet usage", regex: /<Sheet\b/ },
      { label: "SheetContent usage", regex: /<SheetContent\b/ }
    ]
  },
  {
    name: "catalog_delete_modal_uses_dialog",
    file: "src/components/catalog/catalog-item-delete-modal.tsx",
    required: [
      { label: "dialog import", regex: /from ["']@\/components\/ui\/dialog["']/ },
      { label: "Dialog usage", regex: /<Dialog\b/ }
    ]
  },
  {
    name: "image_preview_modal_uses_dialog",
    file: "src/components/catalog/image-preview-modal.tsx",
    required: [
      { label: "dialog import", regex: /from ["']@\/components\/ui\/dialog["']/ },
      { label: "Dialog usage", regex: /<Dialog\b/ }
    ]
  }
];

const LEGACY_SCAN_DIRS = [
  "src/app/(panel)",
  "src/components/catalog",
  "src/components/layout"
];

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function createCheck(name, passed, detail) {
  return { name, passed, detail };
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFilesRecursive(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

async function computeTrackedFileHashes() {
  const results = [];
  for (const relativePath of TRACKED_FILES) {
    const absolutePath = path.resolve(appRoot, relativePath);
    if (!existsSync(absolutePath)) {
      results.push({
        path: relativePath,
        exists: false,
        sha256: null
      });
      continue;
    }
    const content = await readFile(absolutePath, "utf8");
    results.push({
      path: relativePath,
      exists: true,
      sha256: sha256Text(content)
    });
  }
  return results;
}

async function evaluateComponentContracts() {
  const results = [];
  for (const contract of COMPONENT_CONTRACTS) {
    const absolutePath = path.resolve(appRoot, contract.file);
    if (!existsSync(absolutePath)) {
      results.push({
        name: contract.name,
        file: contract.file,
        passed: false,
        missing: ["FILE_NOT_FOUND"]
      });
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    const missing = contract.required
      .filter((rule) => !rule.regex.test(content))
      .map((rule) => rule.label);
    results.push({
      name: contract.name,
      file: contract.file,
      passed: missing.length === 0,
      missing
    });
  }
  return results;
}

async function collectRegexMatches(regex, directories) {
  const matches = [];
  for (const dirRelative of directories) {
    const absDir = path.resolve(appRoot, dirRelative);
    if (!existsSync(absDir)) {
      continue;
    }
    const files = await listFilesRecursive(absDir);
    for (const filePath of files) {
      const text = await readFile(filePath, "utf8");
      const pattern = new RegExp(regex.source, regex.flags);
      const localMatches = text.match(pattern);
      if (!localMatches || localMatches.length === 0) {
        continue;
      }
      matches.push({
        file: path.relative(appRoot, filePath).split(path.sep).join("/"),
        count: localMatches.length
      });
    }
  }
  return matches;
}

async function loadBaseline() {
  if (!existsSync(baselinePath)) {
    return null;
  }
  try {
    const raw = await readFile(baselinePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trackedFiles)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeBaseline(trackedFiles) {
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "CM UI release checklist baseline",
    trackedFiles
  };
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, JSON.stringify(payload, null, 2));
}

function compareBaselineHashes(baseline, current) {
  const baselineMap = new Map(baseline.trackedFiles.map((item) => [item.path, item]));
  const drift = [];
  for (const item of current) {
    const prev = baselineMap.get(item.path);
    if (!prev) {
      drift.push({ path: item.path, reason: "NEW_TRACKED_FILE" });
      continue;
    }
    if (prev.exists !== item.exists || prev.sha256 !== item.sha256) {
      drift.push({
        path: item.path,
        reason: "HASH_CHANGED",
        previous: prev.sha256,
        current: item.sha256
      });
    }
  }
  return drift;
}

async function main() {
  const writeBaselineMode = readBoolean(process.env.CM_UI_WRITE_BASELINE, false);
  const strictBaselineMode = readBoolean(process.env.CM_UI_STRICT_BASELINE, false);

  const trackedFiles = await computeTrackedFileHashes();
  if (writeBaselineMode) {
    await writeBaseline(trackedFiles);
  }

  const baseline = await loadBaseline();
  const baselineDrift = baseline ? compareBaselineHashes(baseline, trackedFiles) : [];
  const contractResults = await evaluateComponentContracts();
  const confirmMatches = await collectRegexMatches(/\bconfirm\(/g, LEGACY_SCAN_DIRS);
  const manualDialogMatches = await collectRegexMatches(/role=["']dialog["']|aria-modal=["']true["']/g, LEGACY_SCAN_DIRS);

  const checks = [];
  checks.push(
    createCheck(
      "baseline_file_exists",
      Boolean(baseline) || writeBaselineMode,
      baseline ? "OK" : "BASELINE_NOT_FOUND"
    )
  );
  checks.push(
    createCheck(
      "strict_baseline_hash_match",
      !strictBaselineMode || baselineDrift.length === 0,
      strictBaselineMode
        ? baselineDrift.length === 0
          ? "OK"
          : `DRIFT:${baselineDrift.length}`
        : "SKIPPED_STRICT_MODE_DISABLED"
    )
  );
  checks.push(
    createCheck(
      "no_native_confirm_calls",
      confirmMatches.length === 0,
      confirmMatches.length === 0 ? "OK" : confirmMatches
    )
  );
  checks.push(
    createCheck(
      "no_manual_dialog_markup",
      manualDialogMatches.length === 0,
      manualDialogMatches.length === 0 ? "OK" : manualDialogMatches
    )
  );
  for (const contract of contractResults) {
    checks.push(
      createCheck(
        `contract:${contract.name}`,
        contract.passed,
        contract.passed ? "OK" : contract.missing
      )
    );
  }

  const failedChecks = checks.filter((check) => !check.passed);
  const passed = failedChecks.length === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    app: "content-manager",
    writeBaselineMode,
    strictBaselineMode,
    passed,
    checks,
    baselineDrift,
    trackedFiles
  };

  await mkdir(reportRootDir, { recursive: true });
  const reportFilename = `cm-ui-release-checklist-${nowStamp()}.json`;
  const reportPath = path.resolve(reportRootDir, reportFilename);
  const latestPath = path.resolve(reportRootDir, "latest.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(latestPath, JSON.stringify(report, null, 2));

  if (!passed) {
    // eslint-disable-next-line no-console
    console.error("CM UI release checklist gate failed.", {
      reportPath: path.relative(repoRoot, reportPath).split(path.sep).join("/"),
      failedChecks: failedChecks.map((item) => item.name)
    });
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("CM UI release checklist gate passed.", {
    reportPath: path.relative(repoRoot, reportPath).split(path.sep).join("/")
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("CM UI release checklist gate crashed.", error);
  process.exit(1);
});
