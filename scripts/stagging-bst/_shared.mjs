import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  serverHost: "192.168.0.60",
  serverUser: "bonk",
  sshKeyPath: path.join(os.homedir(), ".ssh", "bonk_codex_20260220012842_nopass"),
  remoteBase: "/home/bonk/stagging-bst"
};

function parseArgMap(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, true);
      continue;
    }
    map.set(key, next);
    i += 1;
  }
  return map;
}

export function readConfig(argv) {
  const args = parseArgMap(argv);
  return {
    serverHost: String(args.get("server-host") || DEFAULTS.serverHost),
    serverUser: String(args.get("server-user") || DEFAULTS.serverUser),
    sshKeyPath: String(args.get("ssh-key") || DEFAULTS.sshKeyPath),
    remoteBase: String(args.get("remote-base") || DEFAULTS.remoteBase)
  };
}

export function workspaceRoot() {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..");
}

export function commandExists(name) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [name], { stdio: "ignore" });
  return result.status === 0;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}), exit code ${result.status ?? "unknown"}`
    );
  }

  return result;
}

export function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const suffix = stderr ? `: ${stderr}` : "";
    throw new Error(`Command failed (${command} ${args.join(" ")}), exit code ${result.status ?? "unknown"}${suffix}`);
  }

  return (result.stdout || "").trim();
}

export function sshTarget(config) {
  return `${config.serverUser}@${config.serverHost}`;
}

export function sshArgs(config, remoteCommand) {
  return [
    "-i",
    config.sshKeyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    sshTarget(config),
    remoteCommand
  ];
}

export function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function utcReleaseId(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const sec = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}${sec}Z`;
}

export function utcTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} tidak ditemukan: ${filePath}`);
  }
}
