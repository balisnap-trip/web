#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const envFiles = ['.env', '.env.local'];
const shellEnvKeys = new Set(Object.keys(process.env));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");

    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    if (!shellEnvKeys.has(key)) {
      process.env[key] = value;
    }
  }
}

function sanitizeUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    if (url.username) {
      url.username = '***';
    }
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

function getConnectionFingerprint(connectionString) {
  const url = new URL(connectionString);
  const port = url.port || '5432';
  return `${url.protocol}//${url.username}@${url.hostname}:${port}${url.pathname}`;
}

function runOrThrow(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(`Command not found: ${command}. Install PostgreSQL client tools first.`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${command} ${args.join(' ')})`);
  }
}

function runAndCapture(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error(`Command not found: ${command}. Install PostgreSQL client tools first.`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `Command failed: ${command}`);
  }

  return result.stdout?.trim() || '';
}

function ensureUrlValue(name, value) {
  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${name} is not a valid connection URL.`);
  }
}

function parseMajorVersion(input, label) {
  const match = input.match(/(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse ${label} version from: ${input}`);
  }
  return Number.parseInt(match[1], 10);
}

function getWindowsToolCandidates(command) {
  if (process.platform !== 'win32') {
    return [];
  }

  const baseDir = 'C:\\Program Files\\PostgreSQL';
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const versionDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

  return versionDirs.map((version) => path.join(baseDir, version, 'bin', `${command}.exe`));
}

function getToolCandidates(command) {
  const candidates = [...getWindowsToolCandidates(command), command];
  return Array.from(new Set(candidates));
}

function probeTool(commandPath) {
  const result = spawnSync(commandPath, ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  try {
    const major = parseMajorVersion(result.stdout.trim(), commandPath);
    return { commandPath, major };
  } catch {
    return null;
  }
}

function resolveTool(command, minimumMajor = 0) {
  const probes = getToolCandidates(command)
    .map((candidate) => probeTool(candidate))
    .filter((item) => item !== null)
    .sort((a, b) => b.major - a.major);

  if (!probes.length) {
    throw new Error(`No usable ${command} command found. Install PostgreSQL client tools first.`);
  }

  const selected = probes.find((tool) => tool.major >= minimumMajor);
  if (!selected) {
    const highest = probes[0];
    throw new Error(
      `${command} major version ${highest.major} is older than required version ${minimumMajor}. ` +
      'Install a newer PostgreSQL client version.'
    );
  }

  return selected;
}

function getServerMajorVersion(connectionString, psqlCommandPath) {
  const output = runAndCapture(psqlCommandPath, [
    '-At',
    '--dbname',
    connectionString,
    '-c',
    'SHOW server_version_num;',
  ]);

  const serverVersionNum = Number.parseInt(output.trim(), 10);
  if (!Number.isFinite(serverVersionNum)) {
    throw new Error(`Unable to read server_version_num from ${sanitizeUrl(connectionString)}.`);
  }

  return Math.floor(serverVersionNum / 10000);
}

function verifyClientCompatibility(sourceDbUrl, targetDbUrl) {
  console.log('Checking PostgreSQL client compatibility...');

  const psqlTool = resolveTool('psql');
  const sourceMajor = getServerMajorVersion(sourceDbUrl, psqlTool.commandPath);
  const targetMajor = getServerMajorVersion(targetDbUrl, psqlTool.commandPath);

  const requiredDumpMajor = Math.max(sourceMajor, targetMajor);
  const pgDumpTool = resolveTool('pg_dump', requiredDumpMajor);
  const pgRestoreTool = resolveTool('pg_restore', targetMajor);

  console.log(
    `pg_dump=${pgDumpTool.major}, pg_restore=${pgRestoreTool.major}, source=${sourceMajor}, target=${targetMajor}`
  );
  console.log(`Using pg_dump: ${pgDumpTool.commandPath}`);
  console.log(`Using pg_restore: ${pgRestoreTool.commandPath}`);
  console.log('');

  return {
    psqlCommandPath: psqlTool.commandPath,
    pgDumpCommandPath: pgDumpTool.commandPath,
    pgRestoreCommandPath: pgRestoreTool.commandPath,
  };
}

function main() {
  for (const envFile of envFiles) {
    loadEnvFile(path.join(projectRoot, envFile));
  }

  const sourceDbUrl = process.env.SOURCE_DATABASE_URL;
  const targetDbUrl = process.env.DATABASE_URL;

  ensureUrlValue('SOURCE_DATABASE_URL', sourceDbUrl);
  ensureUrlValue('DATABASE_URL', targetDbUrl);

  if (getConnectionFingerprint(sourceDbUrl) === getConnectionFingerprint(targetDbUrl)) {
    throw new Error('SOURCE_DATABASE_URL and DATABASE_URL point to the same database. Aborting.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const syncDir = path.join(projectRoot, 'tmp', 'db-sync');
  const localBackupPath = path.join(syncDir, `local-backup-${timestamp}.dump`);
  const serverDumpPath = path.join(syncDir, `server-snapshot-${timestamp}.dump`);

  fs.mkdirSync(syncDir, { recursive: true });

  console.log('Starting database sync...');
  console.log(`Source (server): ${sanitizeUrl(sourceDbUrl)}`);
  console.log(`Target (local):  ${sanitizeUrl(targetDbUrl)}`);
  console.log('');

  const toolPaths = verifyClientCompatibility(sourceDbUrl, targetDbUrl);

  console.log('1/3 Backing up local database...');
  runOrThrow(toolPaths.pgDumpCommandPath, [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    localBackupPath,
    '--dbname',
    targetDbUrl,
  ]);

  console.log('2/3 Dumping server database...');
  runOrThrow(toolPaths.pgDumpCommandPath, [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    serverDumpPath,
    '--dbname',
    sourceDbUrl,
  ]);

  console.log('3/3 Restoring server dump into local database...');
  runOrThrow(toolPaths.pgRestoreCommandPath, [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    '--dbname',
    targetDbUrl,
    serverDumpPath,
  ]);

  console.log('');
  console.log('Database sync completed.');
  console.log(`Local backup file: ${localBackupPath}`);
  console.log(`Server dump file:  ${serverDumpPath}`);
}

try {
  main();
} catch (error) {
  console.error('');
  console.error('Database sync failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
