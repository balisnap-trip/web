import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  commandExists,
  ensureFileExists,
  readConfig,
  run,
  runCapture,
  shQuote,
  sshArgs,
  utcReleaseId,
  utcTimestamp,
  workspaceRoot
} from "./_shared.mjs";

const args = process.argv.slice(2);
const config = readConfig(args);
const runInstall = args.includes("--run-install");
const runBuild = args.includes("--run-build");
const buildCoreApiOnly = args.includes("--build-core-api-only");

let keepReleases = 5;
const keepIndex = args.findIndex((token) => token === "--keep-releases");
if (keepIndex >= 0 && args[keepIndex + 1]) {
  keepReleases = Number(args[keepIndex + 1]);
  if (!Number.isInteger(keepReleases) || keepReleases < 1) {
    throw new Error("--keep-releases harus integer >= 1.");
  }
}

for (const cmd of ["ssh", "scp", "tar", "git"]) {
  if (!commandExists(cmd)) {
    throw new Error(`Perintah tidak ditemukan: ${cmd}`);
  }
}

ensureFileExists(config.sshKeyPath, "SSH key");

const root = workspaceRoot();
const releaseId = utcReleaseId();
const releaseDir = `${config.remoteBase}/releases/${releaseId}`;
const tmpArchive = path.join(os.tmpdir(), `masterbst-${releaseId}.tar`);
const remoteArchive = `/tmp/masterbst-${releaseId}.tar`;

let commit = "unknown";
try {
  commit = runCapture("git", ["-C", root, "rev-parse", "--short", "HEAD"]);
} catch {
  commit = "unknown";
}

const deployedAtUtc = utcTimestamp();
const deployedFrom = os.hostname();

const qRemoteBase = shQuote(config.remoteBase);
const qReleaseDir = shQuote(releaseDir);
const qRemoteArchive = shQuote(remoteArchive);

console.log(`==> Preparing remote release directory: ${releaseDir}`);
run("ssh", sshArgs(config, `set -eu
mkdir -p ${qRemoteBase}/releases ${qRemoteBase}/shared ${qRemoteBase}/logs
mkdir -p ${qReleaseDir}`));

try {
  console.log("==> Creating local deploy archive");
  run("tar", [
    "-cf",
    tmpArchive,
    "--exclude",
    ".git",
    "--exclude",
    "node_modules",
    "--exclude",
    ".pnpm-store",
    "--exclude",
    ".turbo",
    "--exclude",
    ".next",
    "--exclude",
    "dist",
    "--exclude",
    "coverage",
    "--exclude",
    "reports",
    "-C",
    root,
    "."
  ]);

  console.log("==> Uploading archive to server");
  run("scp", [
    "-i",
    config.sshKeyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    tmpArchive,
    `${config.serverUser}@${config.serverHost}:${remoteArchive}`
  ]);

  console.log("==> Extracting archive on server");
  run(
    "ssh",
    sshArgs(config, `set -eu
tar -xf ${qRemoteArchive} -C ${qReleaseDir}
rm -f ${qRemoteArchive}`)
  );
} finally {
  if (fs.existsSync(tmpArchive)) {
    fs.rmSync(tmpArchive, { force: true });
  }
}

console.log("==> Writing release metadata");
run(
  "ssh",
  sshArgs(
    config,
    `set -eu
cat > ${qReleaseDir}/.release-meta <<'EOF'
release_id=${releaseId}
deployed_at_utc=${deployedAtUtc}
git_commit=${commit}
deployed_from=${deployedFrom}
EOF`
  )
);

if (runInstall) {
  console.log("==> Running pnpm install on remote release");
  run("ssh", sshArgs(config, `set -eu; cd ${qReleaseDir}; pnpm install --frozen-lockfile`));
}

if (runBuild) {
  if (buildCoreApiOnly) {
    console.log("==> Running core-api build on remote release");
    run("ssh", sshArgs(config, `set -eu; cd ${qReleaseDir}; pnpm --filter @bst/core-api build`));
  } else {
    console.log("==> Running workspace build on remote release");
    run("ssh", sshArgs(config, `set -eu; cd ${qReleaseDir}; pnpm build`));
  }
}

console.log("==> Activating release");
run("ssh", sshArgs(config, `set -eu; ln -sfn ${qReleaseDir} ${qRemoteBase}/current`));

console.log(`==> Pruning old releases (keep ${keepReleases})`);
run(
  "ssh",
  sshArgs(
    config,
    `set -eu
cd ${qRemoteBase}/releases
count=$(ls -1 | wc -l)
if [ "$count" -gt "${keepReleases}" ]; then
  remove_count=$((count - ${keepReleases}))
  ls -1 | sort | head -n "$remove_count" | xargs -r -I{} rm -rf "{}"
fi`
  )
);

const activePath = runCapture("ssh", sshArgs(config, `readlink -f ${qRemoteBase}/current`));

console.log("");
console.log("Deploy staging selesai.");
console.log(`Release ID : ${releaseId}`);
console.log(`Current    : ${activePath}`);
