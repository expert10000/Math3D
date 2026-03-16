#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timeoutMs = Number(process.env.MATH3D_STARTUP_SMOKE_TIMEOUT_MS || 90000);

const requiredMarkers = [
  "[startup-smoke] APP_READY",
  "[startup-smoke] WINDOW_READY",
  "[startup-smoke] WORKER_HEALTH_OK",
  "[startup-smoke] EXIT_CLEAN",
];

function normalizeOutput(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

async function run() {
  const childEnv = {
    ...process.env,
    MATH3D_STARTUP_SMOKE: "1",
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBinary, ["."], {
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
}

run().catch((error) => {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exit(1);
});
