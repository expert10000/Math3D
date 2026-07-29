#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureElectronExecutablePath } from "./ensure-electron-install.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveTimeoutMs(envName, fallbackMs, minMs, maxMs) {
  const raw = Number(process.env[envName]);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.max(minMs, Math.min(maxMs, Math.floor(raw)));
}

const timeoutMs = resolveTimeoutMs("MATH3D_STARTUP_SMOKE_TIMEOUT_MS", 180000, 30000, 600000);
const workerStartupHealthTimeoutMs = resolveTimeoutMs(
  "MATH3D_WORKER_STARTUP_HEALTH_TIMEOUT_MS",
  120000,
  1000,
  600000
);
const workerHealthTimeoutMs = resolveTimeoutMs(
  "MATH3D_WORKER_HEALTH_TIMEOUT_MS",
  Math.max(15000, Math.floor(workerStartupHealthTimeoutMs / 2)),
  1000,
  600000
);

const requiredMarkers = [
  "[startup-smoke] APP_READY",
  "[startup-smoke] WINDOW_READY",
  "[startup-smoke] WORKER_HEALTH_OK",
  "[startup-smoke] EXIT_CLEAN",
];

function normalizeOutput(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function truthy(value) {
  return ["1", "true", "yes", "on", "y"].includes(String(value || "").toLowerCase());
}

function falsey(value) {
  return ["0", "false", "no", "off", "n"].includes(String(value || "").toLowerCase());
}

function getElectronArgs(profileRoot) {
  const sandboxOverride = process.env.MATH3D_ELECTRON_NO_SANDBOX;
  const disableSandbox = sandboxOverride == null || sandboxOverride === ""
    ? process.platform === "linux" && truthy(process.env.CI)
    : !falsey(sandboxOverride);
  const cacheDir = path.join(profileRoot, "cache");
  const args = [
    `--user-data-dir=${path.join(profileRoot, "user-data")}`,
    `--disk-cache-dir=${cacheDir}`,
    `--media-cache-dir=${path.join(cacheDir, "media")}`,
  ];
  if (disableSandbox) args.push("--no-sandbox");
  args.push(".");
  return args;
}

async function run() {
  const electronBinary = await ensureElectronExecutablePath();
  const profileRoot = mkdtempSync(path.join(os.tmpdir(), "math3d-startup-smoke-"));

  try {
    const childEnv = {
      ...process.env,
      MATH3D_STARTUP_SMOKE: "1",
      MATH3D_E2E_USER_DATA_DIR: path.join(profileRoot, "user-data"),
      MATH3D_WORKER_STARTUP_HEALTH_TIMEOUT_MS: String(workerStartupHealthTimeoutMs),
      MATH3D_WORKER_HEALTH_TIMEOUT_MS: String(workerHealthTimeoutMs),
      ELECTRON_ENABLE_LOGGING: "1",
    };
    delete childEnv.ELECTRON_RUN_AS_NODE;

    const child = spawn(electronBinary, getElectronArgs(profileRoot), {
      cwd: repoRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // no-op
        }
        const out = normalizeOutput(stdout);
        const err = normalizeOutput(stderr);
        reject(
          new Error(
            [
              `Startup smoke timed out after ${timeoutMs}ms.`,
              "[startup-smoke] stdout:",
              out.trim(),
              "[startup-smoke] stderr:",
              err.trim(),
            ].join("\n")
          )
        );
      }, timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    const out = normalizeOutput(stdout);
    const err = normalizeOutput(stderr);
    const merged = `${out}\n${err}`;

    const missing = requiredMarkers.filter((marker) => !merged.includes(marker));
    const exitCode = Number(result.code ?? 1);
    if (exitCode !== 0 || result.signal || missing.length) {
      const details = [
        `[startup-smoke] failed: exitCode=${exitCode} signal=${result.signal ?? "none"}`,
        missing.length ? `missing markers: ${missing.join(", ")}` : "",
        "[startup-smoke] stdout:",
        out.trim(),
        "[startup-smoke] stderr:",
        err.trim(),
      ].filter(Boolean).join("\n");
      throw new Error(details);
    }

    process.stdout.write("[startup-smoke] ok app_launch + window_open + worker_health + clean_exit\n");
  } finally {
    rmSync(profileRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exit(1);
});
