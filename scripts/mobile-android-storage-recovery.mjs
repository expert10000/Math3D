import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Unlike emulator smoke, this runner never installs, uninstalls or clears app data.
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactDir = resolve(process.env.MATH3D_MOBILE_ARTIFACT_DIR || resolve(root, "artifacts/mobile"));
const build = JSON.parse(readFileSync(resolve(artifactDir, "build-info.json"), "utf8"));
if (!build.projectRecoveryChecks || build.trackedSourceDirty !== false || build.channel !== "internal") {
  throw new Error("A clean internal APK built with MATH3D_PROJECT_RECOVERY_CHECKS=1 is required.");
}
const serial = process.env.ANDROID_SERIAL;
if (!serial) throw new Error("Set ANDROID_SERIAL explicitly; no device is selected automatically.");
const output = resolve(process.env.MATH3D_RECOVERY_OUTPUT || resolve(root, "output/mobile-storage-recovery"));
mkdirSync(output, { recursive: true });
const run = (...args) => {
  const result = spawnSync("adb", ["-s", serial, ...args], { encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
};
const installedPath = run("shell", "pm", "path", build.applicationId).split(/\r?\n/).find(line => line.endsWith("/base.apk"))?.slice(8);
if (!installedPath) throw new Error("The internal app is not installed.");
const installed = spawnSync("adb", ["-s", serial, "exec-out", "cat", installedPath], { maxBuffer: 128 * 1024 * 1024 });
if (installed.status !== 0 || createHash("sha256").update(installed.stdout).digest("hex") !== build.sha256) {
  throw new Error("Installed APK does not match the supplied build metadata.");
}
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const snapshot = () => {
  run("shell", "uiautomator", "dump", "/sdcard/math3d-recovery-ui.xml");
  const xml = run("exec-out", "cat", "/sdcard/math3d-recovery-ui.xml");
  writeFileSync(resolve(output, "ui.xml"), xml);
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const attr = name => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
    const bounds = attr("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)?.slice(1).map(Number);
    return { text: attr("text"), id: attr("resource-id"), description: attr("content-desc"), bounds };
  });
};
const tap = (id) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const nodes = snapshot();
    const node = nodes.filter(node => (node.id === id || node.text === id || node.description === id) && node.bounds && node.bounds[3] > node.bounds[1])
      .sort((a, b) => b.bounds[1] - a.bounds[1])[0];
    if (node) {
      const [left, top, right, bottom] = node.bounds;
      run("shell", "input", "tap", String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2))); return;
    }
    pause(500);
  }
  throw new Error(`Missing recovery control: ${id}`);
};
const expect = text => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const found = snapshot().find(node => node.text.startsWith(text));
    if (found) return found.text;
    pause(500);
  }
  throw new Error(`Missing recovery result: ${text}`);
};
const launchSettings = () => {
  run("shell", "am", "start", "-n", `${build.applicationId}/com.math3d.mobile.MainActivity`); tap("Settings");
};
const report = { ok: false, serial, model: run("shell", "getprop", "ro.product.model"), androidApi: run("shell", "getprop", "ro.build.version.sdk"),
  sourceCommit: build.gitCommit, apkSha256: build.sha256, checks: [], startedAt: new Date().toISOString() };
try {
  launchSettings(); tap("mobile-storage-recovery-prepare");
  report.checks.push(expect("PASS: 10/10 recovery checks; library unchanged."));
  run("shell", "am", "force-stop", build.applicationId);
  const stopped = spawnSync("adb", ["-s", serial, "shell", "pidof", build.applicationId], { encoding: "utf8", timeout: 30000 });
  if (stopped.error || stopped.status !== 1 || stopped.stdout.trim()) throw new Error("App process did not confirm force-stop.");
  launchSettings(); tap("mobile-storage-recovery-finish");
  report.checks.push(expect("PASS: 11/11 recovery checks; library unchanged."));
  run("shell", "screencap", "-p", "/sdcard/math3d-recovery-screen.png");
  run("pull", "/sdcard/math3d-recovery-screen.png", resolve(output, "recovery.png"));
  report.ok = true;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(output, "native-result.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
