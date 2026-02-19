import { commandExists, ensureFileExists, readConfig, run, shQuote, sshArgs } from "./_shared.mjs";

const argv = process.argv.slice(2);
const config = readConfig(argv);
const action = readAction(argv);

const containerName = readArgValue(argv, "--container-name") || "core-api-prod-redis";
const redisImage = readArgValue(argv, "--redis-image") || "redis:7-alpine";
const hostPort = readArgValue(argv, "--host-port") || "6379";
const dataDir = readArgValue(argv, "--data-dir") || `${config.remoteBase}/shared/redis-data`;

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
    "--container-name",
    "--redis-image",
    "--host-port",
    "--data-dir"
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
  const qContainerName = shQuote(containerName);
  runRemote(
    `set -eu
raw_status=$(docker ps -a --filter "name=^/${containerName}$" --format '{{.Status}}' | head -n 1 || true)
if [ -z "$raw_status" ]; then
  echo "CORE_API_REDIS_STATUS=NOT_FOUND"
  echo "CORE_API_REDIS_CONTAINER=${containerName}"
  exit 0
fi
status="stopped"
if echo "$raw_status" | grep -qi '^Up '; then
  status="running"
fi
echo "CORE_API_REDIS_STATUS=$status"
echo "CORE_API_REDIS_CONTAINER=${containerName}"
echo "CORE_API_REDIS_IMAGE=$(docker ps -a --filter "name=^/${containerName}$" --format '{{.Image}}' | head -n 1 || true)"
echo "CORE_API_REDIS_PORT_BIND=127.0.0.1:${hostPort}->6379"
echo "CORE_API_REDIS_DOCKER_STATUS=$raw_status"
docker ps --filter "name=^/${containerName}$" --format 'CORE_API_REDIS_RUNNING={{.Names}} {{.Status}} {{.Ports}}' || true`
  );
}

function runStart() {
  const qRedisImage = shQuote(redisImage);
  const qDataDir = shQuote(dataDir);
  runRemote(
    `set -eu
mkdir -p ${qDataDir}
container_exists=$(docker ps -a --filter "name=^/${containerName}$" --format '{{.ID}}' | head -n 1 || true)
container_running=$(docker ps --filter "name=^/${containerName}$" --format '{{.ID}}' | head -n 1 || true)
if [ -n "$container_running" ]; then
  echo "CORE_API_REDIS_STATUS=running"
  echo "CORE_API_REDIS_CONTAINER=${containerName}"
  exit 0
fi
if [ -n "$container_exists" ]; then
  docker start ${containerName} >/dev/null
else
  docker run -d \
    --name ${containerName} \
    --restart unless-stopped \
    -p 127.0.0.1:${hostPort}:6379 \
    -v ${qDataDir}:/data \
    ${qRedisImage} \
    redis-server --appendonly yes --save 60 1 >/dev/null
fi
echo "CORE_API_REDIS_STATUS=running"
echo "CORE_API_REDIS_CONTAINER=${containerName}"
echo "CORE_API_REDIS_PORT_BIND=127.0.0.1:${hostPort}->6379"`
  );
}

function runStop() {
  runRemote(
    `set -eu
container_exists=$(docker ps -a --filter "name=^/${containerName}$" --format '{{.ID}}' | head -n 1 || true)
container_running=$(docker ps --filter "name=^/${containerName}$" --format '{{.ID}}' | head -n 1 || true)
if [ -z "$container_exists" ]; then
  echo "CORE_API_REDIS_STATUS=NOT_FOUND"
  echo "CORE_API_REDIS_CONTAINER=${containerName}"
  exit 0
fi
if [ -n "$container_running" ]; then
  docker stop ${containerName} >/dev/null
fi
echo "CORE_API_REDIS_STATUS=stopped"
echo "CORE_API_REDIS_CONTAINER=${containerName}"`
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
