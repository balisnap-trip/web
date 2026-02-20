import {
  commandExists,
  ensureFileExists,
  readConfig,
  run,
  shQuote,
  sshArgs
} from "./_shared.mjs";

const argv = process.argv.slice(2);
const config = readConfig(argv);

const runtimeName = readArgValue(argv, "--runtime-name") || "core-api";
const action = readAction(argv);

const sharedDir = `${config.remoteBase}/shared`;
const logsDir = `${config.remoteBase}/logs`;
const currentDir = `${config.remoteBase}/current`;
const appDir = `${currentDir}/apps/core-api`;
const envFile = `${sharedDir}/.env`;
const pidFile = `${sharedDir}/${runtimeName}.pid`;
const outLog = `${logsDir}/${runtimeName}.out.log`;
const errLog = `${logsDir}/${runtimeName}.err.log`;

function readArgValue(args, key) {
  const index = args.findIndex((token) => token === key);
  if (index < 0) {
    return "";
  }
  return args[index + 1] || "";
}

function readAction(args) {
  const optionWithValue = new Set([
    "--server-host",
    "--server-user",
    "--ssh-key",
    "--remote-base",
    "--runtime-name"
  ]);
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (optionWithValue.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      continue;
    }
    return token;
  }
  return "status";
}

function runRemote(remoteCommand) {
  run("ssh", sshArgs(config, remoteCommand));
}

function runStatus() {
  const qCurrentDir = shQuote(currentDir);
  const qPidFile = shQuote(pidFile);
  const qOutLog = shQuote(outLog);
  const qErrLog = shQuote(errLog);
  runRemote(
    `set -eu
pid=""
if [ -f ${qPidFile} ]; then
  pid=$(cat ${qPidFile} || true)
fi
status="STOPPED"
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  status="RUNNING"
fi
current_path=""
if [ -e ${qCurrentDir} ] || [ -L ${qCurrentDir} ]; then
  current_path=$(readlink -f ${qCurrentDir})
fi
echo "CORE_API_RUNTIME_STATUS=$status"
echo "CORE_API_RUNTIME_PID=$pid"
echo "CORE_API_RUNTIME_PID_FILE=${pidFile}"
echo "CORE_API_RUNTIME_CURRENT=$current_path"
echo "CORE_API_RUNTIME_OUT_LOG=${outLog}"
echo "CORE_API_RUNTIME_ERR_LOG=${errLog}"
if [ "$status" = "RUNNING" ]; then
  if [ -f ${qOutLog} ]; then
    tail -n 5 ${qOutLog} || true
  fi
  if [ -f ${qErrLog} ]; then
    tail -n 5 ${qErrLog} || true
  fi
fi`
  );
}

function runStart() {
  const qSharedDir = shQuote(sharedDir);
  const qLogsDir = shQuote(logsDir);
  const qCurrentDir = shQuote(currentDir);
  const qAppDir = shQuote(appDir);
  const qEnvFile = shQuote(envFile);
  const qPidFile = shQuote(pidFile);
  const qOutLog = shQuote(outLog);
  const qErrLog = shQuote(errLog);
  runRemote(
    `set -eu
mkdir -p ${qSharedDir} ${qLogsDir}
if [ ! -e ${qCurrentDir} ] && [ ! -L ${qCurrentDir} ]; then
  echo "current release belum tersedia di ${currentDir}" >&2
  exit 1
fi
if [ ! -f ${qAppDir}/dist/main.js ]; then
  echo "dist/main.js tidak ditemukan di ${appDir}. Jalankan deploy build terlebih dahulu." >&2
  exit 1
fi
existing_pid=""
if [ -f ${qPidFile} ]; then
  existing_pid=$(cat ${qPidFile} || true)
fi
if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
  echo "CORE_API_RUNTIME_STATUS=RUNNING"
  echo "CORE_API_RUNTIME_PID=$existing_pid"
  exit 0
fi
(
  cd ${qAppDir}
  if [ -f ${qEnvFile} ]; then
    set -a
    . ${qEnvFile}
    set +a
  fi
  nohup node dist/main.js >> ${qOutLog} 2>> ${qErrLog} &
  echo $! > ${qPidFile}
)
new_pid=$(cat ${qPidFile} || true)
if [ -z "$new_pid" ] || ! kill -0 "$new_pid" 2>/dev/null; then
  echo "gagal start runtime core-api" >&2
  exit 1
fi
echo "CORE_API_RUNTIME_STATUS=RUNNING"
echo "CORE_API_RUNTIME_PID=$new_pid"
echo "CORE_API_RUNTIME_PID_FILE=${pidFile}"
echo "CORE_API_RUNTIME_CURRENT=$(readlink -f ${qCurrentDir})"`
  );
}

function runStop() {
  const qPidFile = shQuote(pidFile);
  runRemote(
    `set -eu
if [ ! -f ${qPidFile} ]; then
  echo "CORE_API_RUNTIME_STATUS=STOPPED"
  echo "CORE_API_RUNTIME_PID="
  exit 0
fi
pid=$(cat ${qPidFile} || true)
if [ -z "$pid" ]; then
  rm -f ${qPidFile}
  echo "CORE_API_RUNTIME_STATUS=STOPPED"
  echo "CORE_API_RUNTIME_PID="
  exit 0
fi
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" || true
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if kill -0 "$pid" 2>/dev/null; then
      sleep 1
    else
      break
    fi
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" || true
  fi
fi
rm -f ${qPidFile}
echo "CORE_API_RUNTIME_STATUS=STOPPED"
echo "CORE_API_RUNTIME_PID=$pid"`
  );
}

function runRestart() {
  runStop();
  runStart();
}

for (const cmd of ["ssh"]) {
  if (!commandExists(cmd)) {
    throw new Error(`Perintah tidak ditemukan: ${cmd}`);
  }
}
ensureFileExists(config.sshKeyPath, "SSH key");

if (action === "status") {
  runStatus();
} else if (action === "start") {
  runStart();
} else if (action === "stop") {
  runStop();
} else if (action === "restart") {
  runRestart();
} else {
  throw new Error("Aksi tidak valid. Gunakan: status | start | stop | restart.");
}
