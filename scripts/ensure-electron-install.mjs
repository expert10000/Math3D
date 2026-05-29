#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const DIAG_TAIL_LINES = 80;
const DIAG_TAIL_CHARS = 20_000;

function readBoundedIntegerEnv(name, { min, max, defaultValue }) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function resolveElectronBinary() {
  return require("electron");
}

function getPlatformPath() {
  const platform = process.env.npm_config_platform || os.platform();
  switch (platform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function getTargetPlatform() {
  return process.env.npm_config_platform || os.platform();
}

function getTargetArch() {
  return process.env.npm_config_arch || process.arch;
}

function getElectronPaths() {
  const packageJsonPath = require.resolve("electron/package.json");
  const electronDir = path.dirname(packageJsonPath);
  const platformPath = getPlatformPath();
  return {
    electronDir,
    platformPath,
    pathFile: path.join(electronDir, "path.txt"),
    executablePath: path.join(electronDir, "dist", platformPath),
  };
}

function unsetEnvKeyCaseInsensitive(target, key) {
  const needle = key.toLowerCase();
  const removed = [];
  for (const name of Object.keys(target)) {
    if (name.toLowerCase() === needle) {
      removed.push(`${name}=${target[name]}`);
      delete target[name];
    }
  }
  return removed;
}

function writeMarkerIfExecutableExists(paths) {
  if (!fs.existsSync(paths.executablePath)) return false;
  fs.writeFileSync(paths.pathFile, paths.platformPath);
  return true;
}

function markerMatches(paths) {
  if (!fs.existsSync(paths.pathFile)) return false;
  const marker = fs.readFileSync(paths.pathFile, "utf8").trim();
  return marker === paths.platformPath && fs.existsSync(paths.executablePath);
}

function describeElectronState(paths) {
  const pathFileExists = fs.existsSync(paths.pathFile);
  const pathFileValue = pathFileExists ? fs.readFileSync(paths.pathFile, "utf8") : "(missing)";
  const executableExists = fs.existsSync(paths.executablePath);
  return [
    `path.txt exists: ${pathFileExists}`,
    `path.txt value: ${JSON.stringify(pathFileValue)}`,
    `executable exists: ${executableExists}`,
    `expected executable: ${paths.executablePath}`,
  ].join("; ");
}

function formatDurationMs(startMs) {
  return `${Date.now() - startMs}ms`;
}

function tailText(input, maxLines = DIAG_TAIL_LINES, maxChars = DIAG_TAIL_CHARS) {
  const text = String(input ?? "").replace(/\r\n/g, "\n");
  if (!text) return "(empty)";
  const lines = text.split("\n");
  const tailLines = lines.slice(-maxLines).join("\n");
  return tailLines.length > maxChars ? tailLines.slice(-maxChars) : tailLines;
}

function listDistEntries(paths) {
  const distPath = path.join(paths.electronDir, "dist");
  try {
    const all = fs.readdirSync(distPath);
    const head = all.slice(0, 50).join(", ");
    return `${all.length} entries${head ? `: ${head}` : ""}`;
  } catch {
    return "(dist folder missing)";
  }
}

function logState(paths, label) {
  process.stderr.write(`[ensure-electron] ${label} state: ${describeElectronState(paths)}\n`);
  process.stderr.write(`[ensure-electron] ${label} dist: ${listDistEntries(paths)}\n`);
}

async function withHardTimeout(label, timeoutMs, operation) {
  let timeoutHandle;
  const startedAt = Date.now();
  const heartbeatHandle = setInterval(() => {
    process.stderr.write(`[ensure-electron] ${label} in progress... elapsed=${formatDurationMs(startedAt)}\n`);
  }, 15_000);

  try {
    await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearInterval(heartbeatHandle);
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function runElectronInstall(timeoutMs) {
  const paths = getElectronPaths();
  const { electronDir } = paths;
  const installScript = path.join(electronDir, "install.js");
  const childEnv = { ...process.env };
  const startedAt = Date.now();
  const removedSkipFlags = unsetEnvKeyCaseInsensitive(childEnv, "ELECTRON_SKIP_BINARY_DOWNLOAD");
  if (removedSkipFlags.length > 0) {
    // The ensure script is an explicit repair path; always allow binary download here.
    process.stderr.write(`[ensure-electron] Ignoring ${removedSkipFlags.join(", ")} during repair\n`);
  }
  const removedOverrideFlags = unsetEnvKeyCaseInsensitive(childEnv, "ELECTRON_OVERRIDE_DIST_PATH");
  if (removedOverrideFlags.length > 0) {
    // Always repair into node_modules/electron/dist + path.txt so later scripts behave consistently.
    process.stderr.write(`[ensure-electron] Ignoring ${removedOverrideFlags.join(", ")} during repair\n`);
  }
  childEnv.DEBUG = childEnv.DEBUG ? `${childEnv.DEBUG},@electron/get*` : "@electron/get*";
  process.stderr.write(
    `[ensure-electron] install.js diagnostics: cwd=${electronDir} platform=${getTargetPlatform()} arch=${getTargetArch()} cache=${childEnv.electron_config_cache ?? "(default)"}\n`
  );

  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    env: childEnv,
    stdio: "pipe",
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stderr.write(`[ensure-electron] install.js finished in ${formatDurationMs(startedAt)}\n`);
  const stdoutTail = tailText(result.stdout);
  const stderrTail = tailText(result.stderr);
  process.stderr.write(`[ensure-electron] install.js exit status=${result.status} signal=${result.signal ?? "none"}\n`);
  process.stderr.write(`[ensure-electron] install.js stdout (tail):\n${stdoutTail}\n`);
  process.stderr.write(`[ensure-electron] install.js stderr (tail):\n${stderrTail}\n`);
  logState(paths, "post-install.js");

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`Electron install repair timed out after ${timeoutMs}ms.\ninstall.js stderr tail:\n${stderrTail}`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Electron install repair failed with exit code ${result.status ?? "unknown"}.\ninstall.js stderr tail:\n${stderrTail}`
    );
  }
}

async function downloadElectronArtifactDirect(paths, timeoutMs, forceFreshDownload) {
  const { downloadArtifact } = require("@electron/get");
  const extract = require("extract-zip");
  const { version } = require("electron/package.json");
  const distPath = path.join(paths.electronDir, "dist");
  const startedAt = Date.now();
  fs.rmSync(distPath, { recursive: true, force: true });
  fs.mkdirSync(distPath, { recursive: true });
  logState(paths, "pre-direct-download");

  process.stderr.write(
    `[ensure-electron] Direct artifact download start version=${version} platform=${getTargetPlatform()} arch=${getTargetArch()} force=${forceFreshDownload}\n`
  );
  const downloadStartedAt = Date.now();
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    force: forceFreshDownload,
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require("electron/checksums.json"),
    platform: getTargetPlatform(),
    arch: getTargetArch(),
    downloadOptions: {
      timeout: {
        request: timeoutMs,
      },
    },
  });
  process.stderr.write(`[ensure-electron] Direct download completed in ${formatDurationMs(downloadStartedAt)}\n`);
  const zipBytes = fs.statSync(zipPath).size;
  process.stderr.write(`[ensure-electron] Downloaded Electron artifact: ${zipPath} (${zipBytes} bytes)\n`);

  const extractStartedAt = Date.now();
  await extract(zipPath, { dir: distPath });
  process.stderr.write(`[ensure-electron] Extract completed in ${formatDurationMs(extractStartedAt)}\n`);
  const srcTypeDefPath = path.join(distPath, "electron.d.ts");
  const targetTypeDefPath = path.join(paths.electronDir, "electron.d.ts");
  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  }
  process.stderr.write(`[ensure-electron] Direct artifact phase completed in ${formatDurationMs(startedAt)}\n`);
  logState(paths, "post-direct-download");
}

function canRepair(message) {
  return (
    message.includes("Electron failed to install correctly") ||
    message.includes("Cannot find module") ||
    message.includes("Cannot find package 'electron'")
  );
}

export async function ensureElectronInstalled() {
  const paths = getElectronPaths();
  logState(paths, "initial");

  if (markerMatches(paths)) {
    process.stderr.write("[ensure-electron] Marker + executable already valid, skipping repair\n");
    return;
  }

  try {
    resolveElectronBinary();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!canRepair(message)) throw error;
  }

  if (writeMarkerIfExecutableExists(paths)) {
    process.stderr.write("[ensure-electron] Restored electron/path.txt from existing binary\n");
    logState(paths, "marker-restored");
    return;
  }

  const timeoutMs = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_TIMEOUT_MS", {
    min: 30_000,
    max: 60 * 60_000,
    defaultValue: 10 * 60_000,
  });
  const retries = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_RETRIES", {
    min: 0,
    max: 5,
    defaultValue: 1,
  });
  const totalAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    logState(paths, `attempt-${attempt}-start`);
    process.stderr.write(
      `[ensure-electron] Running electron/install.js; timeout=${timeoutMs}ms; attempt=${attempt}/${totalAttempts}\n`
    );
    try {
      runElectronInstall(timeoutMs);
      if (!fs.existsSync(paths.executablePath)) {
        process.stderr.write(
          "[ensure-electron] electron/install.js finished without binary; trying direct artifact download\n"
        );
        await withHardTimeout("direct artifact download", timeoutMs, async () => {
          const forceFreshDownload = process.env.force_no_cache === "true" || attempt > 1;
          await downloadElectronArtifactDirect(paths, timeoutMs, forceFreshDownload);
        });
      }
      if (writeMarkerIfExecutableExists(paths) && markerMatches(paths)) {
        process.stderr.write("[ensure-electron] Restored electron/path.txt after repair\n");
        process.stderr.write("[ensure-electron] Electron install repair succeeded\n");
        return;
      }
      throw new Error(
        `Repair completed but marker/binary validation still failed. Dist entries: ${listDistEntries(paths)}`
      );
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `[ensure-electron] Electron repair attempt ${attempt}/${totalAttempts} failed: ${String(error?.stack ?? error?.message ?? error)}\n`
      );
      if (attempt < totalAttempts) {
        const backoffMs = Math.min(60_000, attempt * 15_000);
        process.stderr.write(`[ensure-electron] Retrying after ${backoffMs}ms...\n`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  const stateDetails = describeElectronState(paths);
  if (lastError) {
    throw new Error(`${String(lastError?.message ?? lastError)}\n[ensure-electron] ${stateDetails}`);
  }
  throw new Error(`Electron install repair failed.\n[ensure-electron] ${stateDetails}`);
}

export function getElectronExecutablePath() {
  return getElectronPaths().executablePath;
}

export async function ensureElectronExecutablePath() {
  await ensureElectronInstalled();
  const executablePath = getElectronExecutablePath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `[ensure-electron] executable missing after ensure: ${executablePath}`
    );
  }
  return executablePath;
}

async function main() {
  await ensureElectronInstalled();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack ?? error?.message ?? error)}\n`);
    process.exit(1);
  });
}
