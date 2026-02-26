import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const reportRootDir = path.resolve(repoRoot, "reports/gates/ui-release-checklist");
const defaultBaselinePath = path.resolve(appRoot, "config/ui-release-checklist-baseline.json");

const CHECKLIST_SCOPE_FILES = [
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/bookings/page.tsx",
  "src/app/(dashboard)/bookings/[id]/page.tsx",
  "src/app/(dashboard)/email-inbox/page.tsx",
  "src/app/(dashboard)/finance/patterns/page.tsx",
  "src/app/(dashboard)/finance/settlements/page.tsx",
  "src/app/(dashboard)/finance/report/page.tsx",
  "src/app/(dashboard)/finance/validate/validate-client.tsx",
  "src/app/(dashboard)/finance/validate/components/BookingListPanel.tsx",
  "src/app/(dashboard)/finance/validate/components/CommissionSplitDialog.tsx",
  "src/app/(dashboard)/drivers/page.tsx",
  "src/app/(dashboard)/drivers/[id]/page.tsx",
  "src/components/ui/status-badge.tsx",
  "src/components/ui/source-badge.tsx",
  "src/components/ui/table.tsx",
  "src/components/ui/form-field.tsx",
  "src/components/ui/driver-status-badge.tsx",
  "src/lib/booking/source-label.ts",
  "src/lib/driver/status-label.ts"
];

const COMPONENT_ADOPTION_CONTRACTS = [
  {
    name: "bookings_list_uses_status_source_table_shell",
    file: "src/app/(dashboard)/bookings/page.tsx",
    required: [
      { label: "StatusBadge", regex: /\bStatusBadge\b/ },
      { label: "SourceBadge", regex: /\bSourceBadge\b/ },
      { label: "DataTableShell", regex: /\bDataTableShell\b/ }
    ]
  },
  {
    name: "booking_detail_uses_status_source_badge",
    file: "src/app/(dashboard)/bookings/[id]/page.tsx",
    required: [
      { label: "StatusBadge", regex: /\bStatusBadge\b/ },
      { label: "SourceBadge", regex: /\bSourceBadge\b/ }
    ]
  },
  {
    name: "dashboard_uses_status_source_badge",
    file: "src/app/(dashboard)/dashboard/page.tsx",
    required: [
      { label: "StatusBadge", regex: /\bStatusBadge\b/ },
      { label: "SourceBadge", regex: /\bSourceBadge\b/ }
    ]
  },
  {
    name: "email_inbox_uses_source_badge_table_shell",
    file: "src/app/(dashboard)/email-inbox/page.tsx",
    required: [
      { label: "SourceBadge", regex: /\bSourceBadge\b/ },
      { label: "DataTableShell", regex: /\bDataTableShell\b/ }
    ]
  },
  {
    name: "finance_patterns_uses_table_shell",
    file: "src/app/(dashboard)/finance/patterns/page.tsx",
    required: [{ label: "table import", regex: /from ['"]@\/components\/ui\/table['"]/ }]
  },
  {
    name: "finance_settlements_uses_table_shell",
    file: "src/app/(dashboard)/finance/settlements/page.tsx",
    required: [{ label: "table import", regex: /from ['"]@\/components\/ui\/table['"]/ }]
  },
  {
    name: "finance_report_uses_table_shell",
    file: "src/app/(dashboard)/finance/report/page.tsx",
    required: [{ label: "table import", regex: /from ['"]@\/components\/ui\/table['"]/ }]
  },
  {
    name: "finance_commission_split_uses_table_shell",
    file: "src/app/(dashboard)/finance/validate/components/CommissionSplitDialog.tsx",
    required: [{ label: "table import", regex: /from ['"]@\/components\/ui\/table['"]/ }]
  },
  {
    name: "drivers_list_uses_driver_status_badge",
    file: "src/app/(dashboard)/drivers/page.tsx",
    required: [{ label: "DriverStatusBadge", regex: /\bDriverStatusBadge\b/ }]
  },
  {
    name: "driver_detail_uses_driver_status_badge",
    file: "src/app/(dashboard)/drivers/[id]/page.tsx",
    required: [{ label: "DriverStatusBadge", regex: /\bDriverStatusBadge\b/ }]
  }
];

const LEGACY_PATTERN_RULES = [
  {
    name: "STATUS_COLORS",
    regex: /\bSTATUS_COLORS\b/g
  },
  {
    name: "SOURCE_COLORS",
    regex: /\bSOURCE_COLORS\b/g
  }
];

const RAW_TABLE_PATTERN = {
  name: "raw_table_w_full",
  regex: /<table\s+className\s*=\s*["'`][^"'`]*\bw-full\b/gi
};

function readText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized || fallback;
}

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createCheck(name, passed, detail) {
  return { name, passed, detail };
}

function toWorkspaceRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function toAppRelativePath(absolutePath) {
  return path.relative(appRoot, absolutePath).split(path.sep).join("/");
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

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function computeScopeHashes(scopeFiles) {
  const results = [];
  for (const relativePath of scopeFiles) {
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

async function evaluateComponentContracts(contracts) {
  const results = [];
  for (const contract of contracts) {
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

async function collectPatternMatches(scopeDir, patternRule) {
  const files = await listFilesRecursive(scopeDir);
  const matches = [];

  for (const filePath of files) {
    if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
      continue;
    }
    const content = await readFile(filePath, "utf8");
    const ruleRegex = new RegExp(patternRule.regex.source, patternRule.regex.flags);
    const found = content.match(ruleRegex);
    if (!found || found.length === 0) {
      continue;
    }
    matches.push({
      file: toAppRelativePath(filePath),
      count: found.length,
      pattern: patternRule.name
    });
  }

  return matches;
}

async function readBaseline(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeBaselineEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      path: readText(item?.path),
      sha256: readText(item?.sha256)
    }))
    .filter((item) => item.path && item.sha256);
}

async function writeBaseline(filePath, entries) {
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "EP-013 UI release checklist freeze baseline",
    criticalFiles: entries
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildBaselineDiff(currentHashes, baselineEntries) {
  const baselineMap = new Map(baselineEntries.map((item) => [item.path, item.sha256]));
  const currentMap = new Map(
    currentHashes
      .filter((item) => item.exists && item.sha256)
      .map((item) => [item.path, item.sha256])
  );

  const missingInBaseline = [];
  const missingInCurrent = [];
  const changed = [];

  for (const currentItem of currentHashes) {
    if (!currentItem.exists || !currentItem.sha256) {
      missingInCurrent.push(currentItem.path);
      continue;
    }
    if (!baselineMap.has(currentItem.path)) {
      missingInBaseline.push(currentItem.path);
      continue;
    }
    const expectedHash = baselineMap.get(currentItem.path);
    if (expectedHash !== currentItem.sha256) {
      changed.push({
        path: currentItem.path,
        expectedSha256: expectedHash,
        actualSha256: currentItem.sha256
      });
    }
  }

  for (const baselineItem of baselineEntries) {
    if (!currentMap.has(baselineItem.path)) {
      if (!missingInCurrent.includes(baselineItem.path)) {
        missingInCurrent.push(baselineItem.path);
      }
    }
  }

  return {
    missingInBaseline,
    missingInCurrent,
    changed
  };
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# UI Release Checklist Gate Report (T-013-06)");
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
  lines.push("## Checks");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const item of report.checks) {
    lines.push(`| ${item.name} | ${item.passed ? "PASS" : "FAIL"} | ${item.detail} |`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.summary, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Details");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.details, null, 2));
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
  const allowBaselineDrift = readBoolean(process.env.UI_RELEASE_CHECKLIST_ALLOW_BASELINE_DRIFT, false);
  const updateBaseline = readBoolean(process.env.UI_RELEASE_CHECKLIST_UPDATE_BASELINE, false);
  const baselinePath = path.resolve(
    appRoot,
    readText(process.env.UI_RELEASE_CHECKLIST_BASELINE_FILE, path.relative(appRoot, defaultBaselinePath))
  );
  const dashboardScopeDir = path.resolve(appRoot, "src/app/(dashboard)");

  const checks = [];
  const details = {
    requiredFiles: null,
    componentContracts: null,
    legacyPatternMatches: null,
    rawTableMatches: null,
    baseline: null,
    scopeHashes: null
  };

  const requiredFilesMissing = CHECKLIST_SCOPE_FILES.filter(
    (relativePath) => !existsSync(path.resolve(appRoot, relativePath))
  );
  details.requiredFiles = {
    total: CHECKLIST_SCOPE_FILES.length,
    missing: requiredFilesMissing
  };
  checks.push(
    createCheck(
      "T-013-06_required_files_present",
      requiredFilesMissing.length === 0,
      `missing=${requiredFilesMissing.length}`
    )
  );

  const contractResults = await evaluateComponentContracts(COMPONENT_ADOPTION_CONTRACTS);
  const failedContracts = contractResults.filter((item) => !item.passed);
  details.componentContracts = {
    total: contractResults.length,
    failed: failedContracts
  };
  checks.push(
    createCheck(
      "T-013-06_component_adoption_contracts",
      failedContracts.length === 0,
      `failed=${failedContracts.length}/${contractResults.length}`
    )
  );

  const legacyPatternMatches = [];
  for (const rule of LEGACY_PATTERN_RULES) {
    const ruleMatches = await collectPatternMatches(dashboardScopeDir, rule);
    legacyPatternMatches.push(...ruleMatches);
  }
  details.legacyPatternMatches = legacyPatternMatches;
  checks.push(
    createCheck(
      "T-013-06_legacy_status_source_patterns_removed",
      legacyPatternMatches.length === 0,
      `matches=${legacyPatternMatches.length}`
    )
  );

  const rawTableMatches = await collectPatternMatches(dashboardScopeDir, RAW_TABLE_PATTERN);
  details.rawTableMatches = rawTableMatches;
  checks.push(
    createCheck(
      "T-013-06_raw_table_w_full_removed",
      rawTableMatches.length === 0,
      `matches=${rawTableMatches.length}`
    )
  );

  const scopeHashes = await computeScopeHashes(CHECKLIST_SCOPE_FILES);
  details.scopeHashes = scopeHashes;
  const baselineEntriesCurrent = scopeHashes
    .filter((item) => item.exists && item.sha256)
    .map((item) => ({ path: item.path, sha256: item.sha256 }));

  if (updateBaseline) {
    await writeBaseline(baselinePath, baselineEntriesCurrent);
  }

  const baselineData = await readBaseline(baselinePath);
  const baselineEntries = normalizeBaselineEntries(baselineData?.criticalFiles);
  const baselineDiff = buildBaselineDiff(scopeHashes, baselineEntries);

  const baselineExists = Boolean(baselineData);
  const baselineDriftCount =
    baselineDiff.changed.length +
    baselineDiff.missingInBaseline.length +
    baselineDiff.missingInCurrent.length;
  const baselineStrictPass = baselineExists && baselineDriftCount === 0;
  const baselineCheckPass = baselineStrictPass || (allowBaselineDrift && baselineExists);

  details.baseline = {
    baselinePath: toWorkspaceRelativePath(baselinePath),
    baselineExists,
    baselineUpdated: updateBaseline,
    allowBaselineDrift,
    entryCount: baselineEntries.length,
    drift: baselineDiff
  };

  checks.push(
    createCheck(
      "T-013-06_freeze_baseline_stable",
      baselineCheckPass,
      `baselineExists=${baselineExists} driftCount=${baselineDriftCount} allowDrift=${allowBaselineDrift}`
    )
  );

  const failedChecks = checks.filter((item) => !item.passed);
  const report = {
    gate: "T-013-06_UI_RELEASE_CHECKLIST",
    startedAt,
    endedAt: new Date().toISOString(),
    result: failedChecks.length === 0 ? "PASS" : "FAIL",
    config: {
      appRoot: toWorkspaceRelativePath(appRoot),
      dashboardScopeDir: toWorkspaceRelativePath(dashboardScopeDir),
      baselinePath: toWorkspaceRelativePath(baselinePath),
      updateBaseline,
      allowBaselineDrift,
      scopeFileCount: CHECKLIST_SCOPE_FILES.length,
      componentContractCount: COMPONENT_ADOPTION_CONTRACTS.length
    },
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      baselineDriftCount
    },
    checks,
    details
  };

  const reportPaths = await writeReport(report);
  console.log(`UI_RELEASE_CHECKLIST_RESULT=${report.result}`);
  console.log(`UI_RELEASE_CHECKLIST_REPORT_JSON=${reportPaths.jsonPath}`);
  console.log(`UI_RELEASE_CHECKLIST_REPORT_MD=${reportPaths.mdPath}`);

  if (failedChecks.length > 0) {
    for (const failedCheck of failedChecks) {
      console.error(`FAILED_CHECK=${failedCheck.name} detail=${failedCheck.detail}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(
    `UI_RELEASE_CHECKLIST_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
