import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const meshId = process.argv[2] || process.env.MATH3D_MESH_TRACE_ID || "3dbenchy";
const safeMeshId = meshId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
const outDir = path.join(repoRoot, "output");
const outFile = path.join(outDir, `mesh-full-trace-${safeMeshId}.json`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function terminateProcessTree(child) {
  if (child.exitCode != null || child.killed) return Promise.resolve();
  if (process.platform !== "win32" || !child.pid) {
    child.kill();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("exit", () => resolve());
    killer.once("error", () => {
      child.kill();
      resolve();
    });
  });
}

function createIsolatedElectronProfile() {
  const profileRoot = mkdtempSync(path.join(os.tmpdir(), "math3d-mesh-full-trace-"));
  const userDataDir = path.join(profileRoot, "user-data");
  mkdirSync(userDataDir, { recursive: true });
  return { profileRoot, userDataDir };
}

function parseTaggedJson(logs, marker) {
  for (const entry of logs.slice().reverse()) {
    for (const line of entry.text.split(/\r?\n/).reverse()) {
      const index = line.indexOf(marker);
      if (index < 0) continue;
      try {
        return JSON.parse(line.slice(index + marker.length).trim());
      } catch {
        return { ok: false, error: `Could not parse ${marker}` };
      }
    }
  }
  return null;
}

function parseMeshDebugEvents(logs) {
  const events = [];
  for (const entry of logs) {
    for (const line of entry.text.split(/\r?\n/)) {
      const marker = "[mesh-debug-trace]";
      const index = line.indexOf(marker);
      if (index < 0) continue;
      try {
        events.push(JSON.parse(line.slice(index + marker.length).trim()));
      } catch {
        events.push({ parseError: true, raw: line.slice(index + marker.length).trim() });
      }
    }
  }
  return events;
}

async function runElectronAutorun(env, logs, timeoutMs = 120_000) {
  const electronExe = path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
  const electronDist = path.dirname(electronExe);
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  let finishedSignal = false;
  const child = spawn(electronExe, ["."], {
    cwd: repoRoot,
    env: {
      ...env,
      PATH: `${electronDist}${path.delimiter}${env.PATH ?? ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk);
    process.stdout.write(text);
    logs.push({ stream: "stdout", at: Date.now(), text });
    if (text.includes("[mesh-trace-finished]")) {
      finishedSignal = true;
      resolveFinished?.({ finished: true });
    }
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    process.stderr.write(text);
    logs.push({ stream: "stderr", at: Date.now(), text });
  });
  const exit = await Promise.race([
    new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal, timeout: false }))),
    finished,
    wait(timeoutMs).then(() => ({ code: null, signal: null, timeout: true })),
  ]);
  if ("finished" in exit && child.exitCode == null && !child.killed) await terminateProcessTree(child);
  if (exit.timeout && child.exitCode == null && !child.killed) await terminateProcessTree(child);
  await wait(250);
  if ("finished" in exit) return { code: child.exitCode, signal: child.signalCode, timeout: false, finishedSignal };
  return { ...exit, finishedSignal };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = Date.now();
  const profile = createIsolatedElectronProfile();
  const logs = [];
  const env = {
    ...process.env,
    MATH3D_E2E: "1",
    MATH3D_SKIP_AUTOSAVE_RECOVERY: "1",
    MATH3D_RENDERER_MEMORY_AUTO_RELOAD: process.env.MATH3D_RENDERER_MEMORY_AUTO_RELOAD ?? "0",
    MATH3D_GPU_MODE: process.env.MATH3D_GPU_MODE ?? "software",
    MATH3D_E2E_USER_DATA_DIR: profile.userDataDir,
    MATH3D_MESH_TRACE_AUTORUN: "full",
    MATH3D_MESH_TRACE_ID: meshId,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const exit = await runElectronAutorun(env, logs);
  const finishPacket = parseTaggedJson(logs, "[mesh-trace-finished]");
  const artifact = {
    ok: finishPacket?.ok === true && (exit.code === 0 || exit.finishedSignal === true),
    meshId,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    profileRoot: profile.profileRoot,
    outFile,
    finishPacket,
    exit,
    meshDebugEvents: parseMeshDebugEvents(logs),
    electronLogs: logs,
  };
  writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  if (!artifact.ok) {
    console.error(`[trace] failed ${outFile}`);
    throw new Error(finishPacket?.error || `Electron autorun failed with code ${exit.code}`);
  }
  console.log(`[trace] wrote ${outFile}`);
}

main().catch((error) => {
  console.error("[trace] failed", error);
  process.exitCode = 1;
});
