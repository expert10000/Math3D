import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "output");
const outFile = path.join(outDir, "mesh-sequential-load-regression.json");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createIsolatedElectronProfile() {
  const profileRoot = mkdtempSync(path.join(os.tmpdir(), "math3d-mesh-sequential-"));
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
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk);
    process.stderr.write(text);
    logs.push({ stream: "stderr", at: Date.now(), text });
  });
  const exit = await Promise.race([
    new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal, timeout: false }))),
    wait(timeoutMs).then(() => ({ code: null, signal: null, timeout: true })),
  ]);
  if (exit.timeout && child.exitCode == null && !child.killed) child.kill();
  await wait(250);
  return exit;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = Date.now();
  const profile = createIsolatedElectronProfile();
  const logs = [];
  const env = {
    ...process.env,
    MATH3D_SKIP_AUTOSAVE_RECOVERY: "1",
    MATH3D_RENDERER_MEMORY_AUTO_RELOAD: "0",
    MATH3D_GPU_MODE: process.env.MATH3D_GPU_MODE ?? "swiftshader",
    MATH3D_E2E_USER_DATA_DIR: profile.userDataDir,
    MATH3D_MESH_TRACE_AUTORUN: "sequential",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const exit = await runElectronAutorun(env, logs);
  const finishPacket = parseTaggedJson(logs, "[mesh-trace-finished]");
  const artifact = {
    ok: finishPacket?.ok === true && exit.code === 0,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    profileRoot: profile.profileRoot,
    finishPacket,
    exit,
    meshDebugEvents: parseMeshDebugEvents(logs),
    electronLogs: logs,
  };
  writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  if (!artifact.ok) {
    console.error(`[mesh-sequential-load-regression] FAIL ${outFile}`);
    throw new Error(finishPacket?.error || `Electron autorun failed with code ${exit.code}`);
  }
  console.log(`[mesh-sequential-load-regression] PASS ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
