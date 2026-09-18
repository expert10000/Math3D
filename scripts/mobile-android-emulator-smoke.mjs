import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactDir = resolve(root, "artifacts/mobile");
const resultDir = resolve(root, "output/mobile-android-smoke");
const identity = JSON.parse(readFileSync(resolve(root, "apps/mobile/version.json"), "utf8"));
const apk = resolve(artifactDir, `Math3D-mobile-${identity.version}-internal.apk`);
const buildInfo = JSON.parse(readFileSync(resolve(artifactDir, "build-info.json"), "utf8"));
const packageName = `${identity.applicationId}.internal`;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.platform === "win32" ? resolve(process.env.LOCALAPPDATA || homedir(), "Android/Sdk") : "");
const adbExecutable = process.platform === "win32" ? "adb.exe" : "adb";
const adbPath = sdk && existsSync(resolve(sdk, "platform-tools", adbExecutable))
  ? resolve(sdk, "platform-tools", adbExecutable)
  : adbExecutable;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const serial = process.env.ANDROID_SERIAL || run(adbPath, ["devices"])
  .split(/\r?\n/)
  .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
  .find(Boolean);
if (!serial?.startsWith("emulator-")) throw new Error("An Android emulator is required for this smoke test.");
const adb = (...args) => run(adbPath, ["-s", serial, ...args]);
if (adb("shell", "getprop", "ro.kernel.qemu") !== "1") {
  throw new Error(`${serial} is not an emulator; refusing to clear app data.`);
}

const sha256 = createHash("sha256").update(readFileSync(apk)).digest("hex");
if (buildInfo.sha256 !== sha256 || buildInfo.build !== identity.build ||
    buildInfo.applicationId !== packageName || buildInfo.trackedSourceDirty !== false) {
  throw new Error("APK and build-info.json do not match clean mobile source metadata.");
}

mkdirSync(resultDir, { recursive: true });
const checks = [];
const check = (name, action) => {
  action();
  checks.push(name);
  console.log(`PASS ${name}`);
};
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const nodes = () => {
  adb("shell", "uiautomator", "dump", "/sdcard/math3d-smoke.xml");
  const xml = adb("exec-out", "cat", "/sdcard/math3d-smoke.xml");
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const value = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
    const bounds = value("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return { text: value("text"), bounds: bounds ? bounds.slice(1).map(Number) : null };
  });
};
const findText = (text) => nodes().find((node) => node.text === text && node.bounds);
const expectText = (text) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const node = findText(text);
    if (node) return node;
    pause(700);
  }
  throw new Error(`Expected visible text: ${text}`);
};
const tap = (text) => {
  const node = expectText(text);
  const [x1, y1, x2, y2] = node.bounds;
  adb("shell", "input", "tap", String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
};
const swipeHandle = (text, deltaY) => {
  const node = expectText(text);
  const [x1, y1, x2, y2] = node.bounds;
  const x = Math.round((x1 + x2) / 2);
  const y = Math.round((y1 + y2) / 2);
  adb("shell", "input", "swipe", String(x), String(y), String(x), String(y + deltaY), "350");
};

const report = { ok: false, sourceCommit: buildInfo.gitCommit, build: identity.build, apkSha256: sha256, serial, checks };
try {
  check("clean install", () => {
    const uninstall = spawnSync(adbPath, ["-s", serial, "uninstall", packageName], { encoding: "utf8" });
    if (uninstall.error) throw uninstall.error;
    adb("install", apk);
  });
  check("Workspace opens with an offline Catenoid", () => {
    adb("shell", "am", "start", "-n", `${packageName}/com.math3d.mobile.MainActivity`);
    expectText("Catenoid");
    expectText("Swipe up for tools");
  });
  check("inspector swipe and opacity", () => {
    swipeHandle("Swipe up for tools", -350);
    expectText("Swipe down to close");
    tap("50%");
    const fiftyLabels = nodes().filter((node) => node.text === "50%");
    if (fiftyLabels.length < 2) throw new Error("Object opacity did not update to 50%.");
    swipeHandle("Swipe down to close", 350);
    expectText("Swipe up for tools");
  });
  check("five destination navigation and Explore sections", () => {
    tap("Home"); expectText("Your Math3D workspace");
    tap("Explore"); expectText("Gallery demos");
    tap("Functions"); expectText("Function library");
    tap("Learn"); expectText("Formula notes");
    tap("Files"); expectText("Saved scenes");
    tap("Settings"); expectText("Worker base URL");
    tap("Workspace"); expectText("Catenoid");
  });
  check("app remains alive with no fatal JS or Android errors", () => {
    const pid = adb("shell", "pidof", packageName);
    if (!/^\d+$/.test(pid)) throw new Error("Math3D process is not running.");
    const log = adb("logcat", `--pid=${pid}`, "-d", "-v", "brief", "AndroidRuntime:E", "ReactNativeJS:E", "*:S");
    writeFileSync(resolve(resultDir, "filtered-logcat.txt"), `${log}\n`);
    if (/FATAL EXCEPTION|E\/ReactNativeJS/.test(log)) throw new Error("Fatal error found in app logs.");
  });
  const screenshot = spawnSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 16 * 1024 * 1024 });
  if (screenshot.status === 0) writeFileSync(resolve(resultDir, "workspace.png"), screenshot.stdout);
  report.ok = true;
} catch (error) {
  report.error = String(error?.message || error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(resultDir, "smoke-result.json"), `${JSON.stringify(report, null, 2)}\n`);
}
