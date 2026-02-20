import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const envFileCache = new Map();

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const out = String(value).trim();
  return out || null;
}

function stripQuotes(value) {
  const out = normalizeValue(value);
  if (!out) {
    return null;
  }
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    return out.slice(1, -1).trim() || null;
  }
  return out;
}

function parseEnvFile(filePath) {
  if (envFileCache.has(filePath)) {
    return envFileCache.get(filePath);
  }

  const out = new Map();
  if (!existsSync(filePath)) {
    envFileCache.set(filePath, out);
    return out;
  }

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = stripQuotes(match[2]);
    if (value) {
      out.set(key, value);
    }
  }

  envFileCache.set(filePath, out);
  return out;
}

function valueFromFiles(filePaths, key) {
  for (const filePath of filePaths) {
    const parsed = parseEnvFile(filePath);
    const value = normalizeValue(parsed.get(key));
    if (value) {
      return value;
    }
  }
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = normalizeValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

export function resolveOpsDbUrl(env = process.env) {
  const coreApiEnvFiles = [path.join(repoRoot, "apps/core-api/.env")];
  const balisnapEnvFiles = [path.join(repoRoot, "balisnap/.env")];
  const bstadminEnvFiles = [
    path.join(repoRoot, "bstadmin/.env"),
    path.join(repoRoot, "bstadmin/.env.production")
  ];
  return firstValue(
    env.OPS_DB_URL,
    env.DATABASE_URL,
    valueFromFiles(coreApiEnvFiles, "OPS_DB_URL"),
    valueFromFiles(coreApiEnvFiles, "DATABASE_URL"),
    valueFromFiles(balisnapEnvFiles, "OPS_DB_URL"),
    valueFromFiles(balisnapEnvFiles, "DATABASE_URL"),
    valueFromFiles(bstadminEnvFiles, "OPS_DB_URL"),
    valueFromFiles(bstadminEnvFiles, "SYNC_DATABASE_URL"),
    valueFromFiles(bstadminEnvFiles, "DATABASE_URL")
  );
}

export function resolveSourceDbUrls(env = process.env) {
  const opsDbUrl = resolveOpsDbUrl(env);

  const balisnapEnvFiles = [path.join(repoRoot, "balisnap/.env")];
  const bstadminEnvFiles = [
    path.join(repoRoot, "bstadmin/.env"),
    path.join(repoRoot, "bstadmin/.env.production")
  ];

  const balisnapDbUrl = firstValue(
    env.BALISNAP_DB_URL,
    env.BALISNAP_DATABASE_URL,
    valueFromFiles(balisnapEnvFiles, "BALISNAP_DB_URL"),
    valueFromFiles(balisnapEnvFiles, "BALISNAP_DATABASE_URL"),
    valueFromFiles(balisnapEnvFiles, "DATABASE_URL"),
    opsDbUrl
  );

  const bstadminDbUrl = firstValue(
    env.BSTADMIN_DB_URL,
    env.BSTADMIN_DATABASE_URL,
    env.SYNC_DATABASE_URL,
    valueFromFiles(bstadminEnvFiles, "BSTADMIN_DB_URL"),
    valueFromFiles(bstadminEnvFiles, "BSTADMIN_DATABASE_URL"),
    valueFromFiles(bstadminEnvFiles, "SYNC_DATABASE_URL"),
    valueFromFiles(bstadminEnvFiles, "DATABASE_URL"),
    opsDbUrl
  );

  return {
    opsDbUrl,
    balisnapDbUrl,
    bstadminDbUrl
  };
}
