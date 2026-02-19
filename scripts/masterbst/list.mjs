import { commandExists, ensureFileExists, readConfig, run, shQuote, sshArgs } from "./_shared.mjs";

const config = readConfig(process.argv.slice(2));

for (const cmd of ["ssh"]) {
  if (!commandExists(cmd)) {
    throw new Error(`Perintah tidak ditemukan: ${cmd}`);
  }
}

ensureFileExists(config.sshKeyPath, "SSH key");

const qRemoteBase = shQuote(config.remoteBase);

run(
  "ssh",
  sshArgs(
    config,
    `set -eu
echo "CURRENT:"
if [ -e ${qRemoteBase}/current ] || [ -L ${qRemoteBase}/current ]; then
  readlink -f ${qRemoteBase}/current
else
  echo "(current belum diset)"
fi
echo
echo "RELEASES:"
if [ -d ${qRemoteBase}/releases ]; then
  ls -1 ${qRemoteBase}/releases | sort -r
else
  echo "(belum ada releases)"
fi`
  )
);
