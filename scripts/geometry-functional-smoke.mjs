#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timeoutMs = Number(process.env.MATH3D_GEOMETRY_SMOKE_TIMEOUT_MS || 150000);

const requiredMarkers = [
  "[geometry-smoke] VIEWER_OPEN",
  "[geometry-smoke] ENTER_SURFACE",
  "[geometry-smoke] CLICK_GENERATE",
  "[geometry-smoke] MESH_APPEARED",
  "[geometry-smoke] NO_CRASH_BANNER",
  "[geometry-smoke] FAIL_INVALID_EXPRESSION_OK",
  "[geometry-smoke] FAIL_WORKER_UNAVAILABLE_OK",
  "[geometry-smoke] FAIL_TIMEOUT_BAD_RESPONSE_OK",
  "[geometry-smoke] DONE",
];

const normalize = (text) => String(text || "").replace(/\r\n/g, "\n");

async function run() {
  const childEnv = {
    ...process.env,
    MATH3D_GEOMETRY_SMOKE: "1",
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
      reject(new Error(`Geometry smoke timed out after ${timeoutMs}ms.`));
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

  const out = normalize(stdout);
  const err = normalize(stderr);
  const all = `${out}\n${err}`;
  const missing = requiredMarkers.filter((marker) => !all.includes(marker));
  const hasFailMarker = all.includes("[geometry-smoke] FAIL:");
  const exitCode = Number(result.code ?? 1);
  if (exitCode !== 0 || result.signal || hasFailMarker || missing.length) {
    const details = [
      `[geometry-smoke] failed: exitCode=${exitCode} signal=${result.signal ?? "none"}`,
      hasFailMarker ? "detected FAIL marker" : "",
      missing.length ? `missing markers: ${missing.join(", ")}` : "",
      "[geometry-smoke] stdout:",
      out.trim(),
      "[geometry-smoke] stderr:",
      err.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(details);
  }

  process.stdout.write("[geometry-smoke] ok happy-path + failure-path scenarios\n");
}

run().catch((error) => {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exit(1);
});
