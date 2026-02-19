import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  commandExists,
  ensureFileExists,
  readConfig,
  runCapture,
  shQuote,
  sshArgs
} from "./_shared.mjs";

const argv = process.argv.slice(2);
const config = readConfig(argv);

const receiverEnvPath =
  readArgValue(argv, "--receiver-env-path") || "/home/bonk/backend/core-api-prod/shared/.env";
const emitterProdEnvPath =
  readArgValue(argv, "--emitter-prod-env-path") || "/home/bonk/balisnaptrip/.env";
const emitterStagingEnvPath =
  readArgValue(argv, "--emitter-staging-env-path") || "/home/bonk/stagging-bst/current/balisnap/.env";

const expectWebEmitDisabled = readBoolean(process.env.EXPECT_WEB_EMIT_DISABLED, true);
const expectIngestQueueEnabled = readBoolean(process.env.EXPECT_INGEST_QUEUE_ENABLED, true);
const expectIngestWebhookEnabled = readBoolean(process.env.EXPECT_INGEST_WEBHOOK_ENABLED, true);
const expectIngestReplayEnabled = readBoolean(process.env.EXPECT_INGEST_REPLAY_ENABLED, true);
const requireBackupEvidence = readBoolean(process.env.INGEST_ENV_REQUIRE_BACKUP_EVIDENCE, true);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportRootDir = path.resolve(__dirname, "../../reports/gates/ingest-env-baseline");

const receiverRequiredKeys = [
  "REDIS_URL",
  "INGEST_REDIS_URL",
  "CORE_API_ADMIN_TOKEN",
  "INGEST_SERVICE_TOKEN",
  "INGEST_SERVICE_SECRET"
];

const emitterRequiredKeys = [
  "INGEST_SERVICE_TOKEN",
  "INGEST_SERVICE_SECRET"
];

function readArgValue(args, key) {
  const index = args.findIndex((token) => token === key);
  if (index < 0) {
    return "";
  }
  return args[index + 1] || "";
}

function readBoolean(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nowTimestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseEnv(content) {
  const parsed = {};
  const lines = String(content || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function maskValue(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function checkNonEmptyKeys(name, envMap, keys, failures, details) {
  for (const key of keys) {
    const rawValue = envMap[key];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) {
      failures.push(`${name}:${key} is empty`);
      continue;
    }
    details[`${name}.${key}`] = maskValue(value);
  }
}

function createMarkdownReport(report, jsonPath) {
  const lines = [];
  lines.push("# Ingest Env Baseline Gate Report (F-00)");
  lines.push("");
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- endedAt: ${report.endedAt}`);
  lines.push(`- result: ${report.result}`);
  lines.push(`- json report: ${jsonPath}`);
  lines.push("");
  lines.push("## Paths");
  lines.push("");
  lines.push(`- receiver: \`${report.paths.receiver}\``);
  lines.push(`- emitter prod: \`${report.paths.emitterProd}\``);
  lines.push(`- emitter staging: \`${report.paths.emitterStaging}\``);
  lines.push("");
  lines.push("## Backup Evidence");
  lines.push("");
  lines.push(`- receiver latest backup: ${report.backups.receiver.latest || "(not found)"}`);
  lines.push(`- emitter prod latest backup: ${report.backups.emitterProd.latest || "(not found)"}`);
  lines.push(
    `- emitter staging latest backup: ${report.backups.emitterStaging.latest || "(not found)"}`
  );
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|---|---|");
  for (const check of report.checks) {
    lines.push(`| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${check.detail} |`);
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

function readRemoteFile(configInput, remotePath) {
  const qPath = shQuote(remotePath);
  return runCapture(
    "ssh",
    sshArgs(
      configInput,
      `set -eu
if [ -f ${qPath} ]; then
  cat ${qPath}
else
  echo "__FILE_NOT_FOUND__"
fi`
    )
  );
}

function readLatestBackup(configInput, remotePath) {
  const remoteDir = path.posix.dirname(remotePath);
  const baseName = path.posix.basename(remotePath);
  const qRemoteDir = shQuote(remoteDir);
  const qBaseName = shQuote(baseName);
  const output = runCapture(
    "ssh",
    sshArgs(
      configInput,
      `set -eu
latest=$(cd ${qRemoteDir} && ls -1t ${qBaseName}.bak.* 2>/dev/null | head -n 1 || true)
printf "%s" "$latest"`
    )
  );
  if (!output.trim()) {
    return "";
  }
  return path.posix.join(remoteDir, output.trim());
}

function buildChecks(failures, context) {
  return [
    {
      name: "receiver_required_keys_non_empty",
      passed: !failures.some((item) => item.startsWith("receiver:")),
      detail: `keys=${receiverRequiredKeys.join(",")}`
    },
    {
      name: "emitter_prod_required_keys_non_empty",
      passed: !failures.some((item) => item.startsWith("emitterProd:")),
      detail: `keys=${emitterRequiredKeys.join(",")}`
    },
    {
      name: "emitter_staging_required_keys_non_empty",
      passed: !failures.some((item) => item.startsWith("emitterStaging:")),
      detail: `keys=${emitterRequiredKeys.join(",")}`
    },
    {
      name: "token_secret_parity_receiver_vs_emitters",
      passed:
        context.tokenParity.receiverVsProd &&
        context.tokenParity.receiverVsStaging &&
        context.secretParity.receiverVsProd &&
        context.secretParity.receiverVsStaging,
      detail: `token(prod=${context.tokenParity.receiverVsProd}, staging=${context.tokenParity.receiverVsStaging}), secret(prod=${context.secretParity.receiverVsProd}, staging=${context.secretParity.receiverVsStaging})`
    },
    {
      name: "web_emit_booking_event_disabled",
      passed: expectWebEmitDisabled ? context.webEmitDisabled : true,
      detail: expectWebEmitDisabled
        ? "expected false on emitter env"
        : "check skipped (EXPECT_WEB_EMIT_DISABLED=false)"
    },
    {
      name: "ingest_queue_enabled_receiver",
      passed: expectIngestQueueEnabled ? context.ingestQueueEnabled : true,
      detail: expectIngestQueueEnabled
        ? "expected true on receiver env"
        : "check skipped (EXPECT_INGEST_QUEUE_ENABLED=false)"
    },
    {
      name: "ingest_webhook_enabled_receiver",
      passed: expectIngestWebhookEnabled ? context.ingestWebhookEnabled : true,
      detail: expectIngestWebhookEnabled
        ? "expected true on receiver env"
        : "check skipped (EXPECT_INGEST_WEBHOOK_ENABLED=false)"
    },
    {
      name: "ingest_replay_enabled_receiver",
      passed: expectIngestReplayEnabled ? context.ingestReplayEnabled : true,
      detail: expectIngestReplayEnabled
        ? "expected true on receiver env"
        : "check skipped (EXPECT_INGEST_REPLAY_ENABLED=false)"
    },
    {
      name: "backup_evidence_available",
      passed: requireBackupEvidence ? context.backupEvidencePresent : true,
      detail: requireBackupEvidence
        ? "latest .env.bak.* must exist for receiver+emitters"
        : "check skipped (INGEST_ENV_REQUIRE_BACKUP_EVIDENCE=false)"
    }
  ];
}

async function runGate() {
  for (const cmd of ["ssh"]) {
    if (!commandExists(cmd)) {
      throw new Error(`Perintah tidak ditemukan: ${cmd}`);
    }
  }

  ensureFileExists(config.sshKeyPath, "SSH key");
  const startedAt = new Date().toISOString();

  const receiverRaw = readRemoteFile(config, receiverEnvPath);
  const emitterProdRaw = readRemoteFile(config, emitterProdEnvPath);
  const emitterStagingRaw = readRemoteFile(config, emitterStagingEnvPath);

  const failures = [];
  if (receiverRaw.trim() === "__FILE_NOT_FOUND__") {
    failures.push(`receiver env file not found: ${receiverEnvPath}`);
  }
  if (emitterProdRaw.trim() === "__FILE_NOT_FOUND__") {
    failures.push(`emitter prod env file not found: ${emitterProdEnvPath}`);
  }
  if (emitterStagingRaw.trim() === "__FILE_NOT_FOUND__") {
    failures.push(`emitter staging env file not found: ${emitterStagingEnvPath}`);
  }

  const receiverEnv = parseEnv(receiverRaw);
  const emitterProdEnv = parseEnv(emitterProdRaw);
  const emitterStagingEnv = parseEnv(emitterStagingRaw);
  const maskedDetails = {};

  checkNonEmptyKeys("receiver", receiverEnv, receiverRequiredKeys, failures, maskedDetails);
  checkNonEmptyKeys("emitterProd", emitterProdEnv, emitterRequiredKeys, failures, maskedDetails);
  checkNonEmptyKeys(
    "emitterStaging",
    emitterStagingEnv,
    emitterRequiredKeys,
    failures,
    maskedDetails
  );

  const receiverToken = (receiverEnv.INGEST_SERVICE_TOKEN || "").trim();
  const receiverSecret = (receiverEnv.INGEST_SERVICE_SECRET || "").trim();
  const emitterProdToken = (emitterProdEnv.INGEST_SERVICE_TOKEN || "").trim();
  const emitterProdSecret = (emitterProdEnv.INGEST_SERVICE_SECRET || "").trim();
  const emitterStagingToken = (emitterStagingEnv.INGEST_SERVICE_TOKEN || "").trim();
  const emitterStagingSecret = (emitterStagingEnv.INGEST_SERVICE_SECRET || "").trim();

  const tokenParity = {
    receiverVsProd: Boolean(receiverToken && emitterProdToken && receiverToken === emitterProdToken),
    receiverVsStaging: Boolean(
      receiverToken && emitterStagingToken && receiverToken === emitterStagingToken
    )
  };
  const secretParity = {
    receiverVsProd: Boolean(receiverSecret && emitterProdSecret && receiverSecret === emitterProdSecret),
    receiverVsStaging: Boolean(
      receiverSecret && emitterStagingSecret && receiverSecret === emitterStagingSecret
    )
  };

  if (!tokenParity.receiverVsProd) {
    failures.push("INGEST_SERVICE_TOKEN mismatch: receiver vs emitterProd");
  }
  if (!tokenParity.receiverVsStaging) {
    failures.push("INGEST_SERVICE_TOKEN mismatch: receiver vs emitterStaging");
  }
  if (!secretParity.receiverVsProd) {
    failures.push("INGEST_SERVICE_SECRET mismatch: receiver vs emitterProd");
  }
  if (!secretParity.receiverVsStaging) {
    failures.push("INGEST_SERVICE_SECRET mismatch: receiver vs emitterStaging");
  }

  const prodWebEmitRaw = (emitterProdEnv.WEB_EMIT_BOOKING_EVENT_ENABLED || "").trim().toLowerCase();
  const stagingWebEmitRaw = (emitterStagingEnv.WEB_EMIT_BOOKING_EVENT_ENABLED || "")
    .trim()
    .toLowerCase();
  const webEmitDisabled =
    (!prodWebEmitRaw || prodWebEmitRaw === "false" || prodWebEmitRaw === "0" || prodWebEmitRaw === "off") &&
    (!stagingWebEmitRaw ||
      stagingWebEmitRaw === "false" ||
      stagingWebEmitRaw === "0" ||
      stagingWebEmitRaw === "off");
  if (expectWebEmitDisabled && !webEmitDisabled) {
    failures.push("WEB_EMIT_BOOKING_EVENT_ENABLED expected false on emitter env files");
  }

  const receiverIngestQueueRaw = (receiverEnv.INGEST_QUEUE_ENABLED || "").trim().toLowerCase();
  const ingestQueueEnabled =
    receiverIngestQueueRaw === "true" ||
    receiverIngestQueueRaw === "1" ||
    receiverIngestQueueRaw === "yes" ||
    receiverIngestQueueRaw === "on";
  if (expectIngestQueueEnabled && !ingestQueueEnabled) {
    failures.push("INGEST_QUEUE_ENABLED expected true on receiver env file");
  }

  const receiverIngestWebhookRaw = (receiverEnv.INGEST_WEBHOOK_ENABLED || "").trim().toLowerCase();
  const ingestWebhookEnabled =
    receiverIngestWebhookRaw === "true" ||
    receiverIngestWebhookRaw === "1" ||
    receiverIngestWebhookRaw === "yes" ||
    receiverIngestWebhookRaw === "on";
  if (expectIngestWebhookEnabled && !ingestWebhookEnabled) {
    failures.push("INGEST_WEBHOOK_ENABLED expected true on receiver env file");
  }

  const receiverIngestReplayRaw = (receiverEnv.INGEST_REPLAY_ENABLED || "").trim().toLowerCase();
  const ingestReplayEnabled =
    receiverIngestReplayRaw === "true" ||
    receiverIngestReplayRaw === "1" ||
    receiverIngestReplayRaw === "yes" ||
    receiverIngestReplayRaw === "on";
  if (expectIngestReplayEnabled && !ingestReplayEnabled) {
    failures.push("INGEST_REPLAY_ENABLED expected true on receiver env file");
  }

  const backups = {
    receiver: {
      latest: readLatestBackup(config, receiverEnvPath)
    },
    emitterProd: {
      latest: readLatestBackup(config, emitterProdEnvPath)
    },
    emitterStaging: {
      latest: readLatestBackup(config, emitterStagingEnvPath)
    }
  };
  const backupEvidencePresent = Boolean(
    backups.receiver.latest && backups.emitterProd.latest && backups.emitterStaging.latest
  );
  if (requireBackupEvidence && !backupEvidencePresent) {
    failures.push("backup evidence missing (.env.bak.*) for one or more env files");
  }

  const checks = buildChecks(failures, {
    tokenParity,
    secretParity,
    webEmitDisabled,
    ingestQueueEnabled,
    ingestWebhookEnabled,
    ingestReplayEnabled,
    backupEvidencePresent
  });

  const report = {
    gate: "F-00_RUNTIME_ENV_BASELINE_INGESTION",
    startedAt,
    endedAt: new Date().toISOString(),
    target: {
      host: config.serverHost,
      user: config.serverUser
    },
    paths: {
      receiver: receiverEnvPath,
      emitterProd: emitterProdEnvPath,
      emitterStaging: emitterStagingEnvPath
    },
    config: {
      expectWebEmitDisabled,
      expectIngestQueueEnabled,
      expectIngestWebhookEnabled,
      expectIngestReplayEnabled,
      requireBackupEvidence
    },
    parity: {
      tokenParity,
      secretParity
    },
    backups,
    maskedDetails,
    checks,
    failures,
    result: failures.length === 0 ? "PASS" : "FAIL"
  };

  const output = await writeReport(report);
  console.log(`INGEST_ENV_BASELINE_RESULT=${report.result}`);
  console.log(`INGEST_ENV_BASELINE_JSON=${output.jsonPath}`);
  console.log(`INGEST_ENV_BASELINE_MD=${output.mdPath}`);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAILED_CHECK=${failure}`);
    }
    process.exit(1);
  }
}

runGate().catch((error) => {
  console.error(
    `INGEST_ENV_BASELINE_RESULT=FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
