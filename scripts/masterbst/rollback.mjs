import { commandExists, ensureFileExists, readConfig, run, shQuote, sshArgs } from "./_shared.mjs";

const argv = process.argv.slice(2);
const config = readConfig(argv);

const releaseArgIndex = argv.findIndex((token) => token === "--release-id");
const releaseId = releaseArgIndex >= 0 ? argv[releaseArgIndex + 1] : "";

if (!releaseId) {
  throw new Error("Gunakan --release-id <RELEASE_ID> untuk rollback.");
}

for (const cmd of ["ssh"]) {
  if (!commandExists(cmd)) {
    throw new Error(`Perintah tidak ditemukan: ${cmd}`);
  }
}

ensureFileExists(config.sshKeyPath, "SSH key");

const targetReleaseDir = `${config.remoteBase}/releases/${releaseId}`;
const qTargetReleaseDir = shQuote(targetReleaseDir);
const qRemoteBase = shQuote(config.remoteBase);

run(
  "ssh",
  sshArgs(
    config,
    `set -eu
if [ ! -d ${qTargetReleaseDir} ]; then
  echo "Release tidak ditemukan: ${targetReleaseDir}" >&2
  exit 1
fi
ln -sfn ${qTargetReleaseDir} ${qRemoteBase}/current
readlink -f ${qRemoteBase}/current`
  )
);
