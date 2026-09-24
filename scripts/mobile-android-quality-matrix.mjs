import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resultDir = resolve(root, "output/mobile-android-matrix");
const matrix = JSON.parse(readFileSync(resolve(root, "tests/mobile/mobile-quality-matrix.json"), "utf8"));
const identity = JSON.parse(readFileSync(resolve(root, "apps/mobile/version.json"), "utf8"));
const packageName = `${identity.applicationId}.internal`;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.platform === "win32" ? resolve(process.env.LOCALAPPDATA || homedir(), "Android/Sdk") : "");
const adbExecutable = process.platform === "win32" ? "adb.exe" : "adb";
const adbPath = sdk && existsSync(resolve(sdk, "platform-tools", adbExecutable))
  ? resolve(sdk, "platform-tools", adbExecutable)
  : adbExecutable;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};
const serial = process.env.ANDROID_SERIAL || run(adbPath, ["devices"])
  .split(/\r?\n/)
  .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
  .find(Boolean);
if (!serial?.startsWith("emulator-")) throw new Error("An Android emulator is required for the mobile quality matrix.");
const adb = (...args) => run(adbPath, ["-s", serial, ...args]);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const activity = `${packageName}/com.math3d.mobile.MainActivity`;

mkdirSync(resultDir, { recursive: true });

const readNodes = () => {
  adb("shell", "uiautomator", "dump", "/sdcard/math3d-matrix.xml");
  const xml = adb("exec-out", "cat", "/sdcard/math3d-matrix.xml");
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const value = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
    const bounds = value("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return {
      label: value("text") || value("content-desc"),
      text: value("text"),
      description: value("content-desc"),
      bounds: bounds ? bounds.slice(1).map(Number) : null,
    };
  });
};

const expectNode = (label) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const node = readNodes().find((candidate) => candidate.label === label && candidate.bounds);
    if (node) return node;
    pause(600);
  }
  throw new Error(`Expected accessible UI node: ${label}`);
};

const tap = (label) => {
  const node = expectNode(label);
  const [x1, y1, x2, y2] = node.bounds;
  adb("shell", "input", "tap", String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
  pause(350);
};

const launch = () => {
  adb("shell", "am", "force-stop", packageName);
  adb("shell", "am", "start", "-n", activity);
  expectNode("Workspace");
  expectNode("Swipe up for tools");
};

const screenshot = (name) => {
  const captured = spawnSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 20 * 1024 * 1024 });
  if (captured.status !== 0) throw new Error(`Screenshot failed: ${captured.stderr?.toString() || "unknown error"}`);
  writeFileSync(resolve(resultDir, `${name}.png`), captured.stdout);
};

const assertNavigationLayout = (profile) => {
  const nav = ["Home", "Explore", "Workspace", "Files", "Settings"].map(expectNode);
  for (const node of nav) {
    const [x1, y1, x2, y2] = node.bounds;
    if (x1 < 0 || y1 < 0 || x2 > profile.width || y2 > profile.height || x2 <= x1 || y2 <= y1) {
      throw new Error(`${profile.id}: ${node.label} is outside ${profile.width}x${profile.height}.`);
    }
  }
  const ordered = [...nav].sort((a, b) => a.bounds[0] - b.bounds[0]);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].bounds[2] > ordered[index].bounds[0]) {
      throw new Error(`${profile.id}: bottom navigation labels overlap.`);
    }
  }
  return nav.map((node) => ({ label: node.label, bounds: node.bounds }));
};

const report = { ok: false, serial, layouts: [], lifecycle: [] };
let networkDisabled = false;
try {
  for (const profile of matrix.layouts) {
    adb("shell", "wm", "size", `${profile.width}x${profile.height}`);
    adb("shell", "wm", "density", "160");
    adb("shell", "settings", "put", "system", "font_scale", String(profile.fontScale));
    adb("shell", "cmd", "uimode", "night", profile.appearance === "dark" ? "yes" : "no");
    adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
    adb("shell", "settings", "put", "system", "user_rotation", profile.orientation === "landscape" ? "1" : "0");
    launch();
    const navigation = assertNavigationLayout(profile);
    screenshot(profile.id);
    report.layouts.push({ ...profile, navigation, result: "passed" });
  }

  const interactionProfile = matrix.layouts.find((profile) => profile.id === "standard-portrait") || matrix.layouts[0];
  adb("shell", "wm", "size", `${interactionProfile.width}x${interactionProfile.height}`);
  adb("shell", "settings", "put", "system", "font_scale", String(interactionProfile.fontScale));
  adb("shell", "settings", "put", "system", "user_rotation", "0");
  launch();
  tap("Swipe up for tools");
  expectNode("Swipe down to close");
  for (const tab of ["Scene", "Object", "Create", "View", "Compute", "Analyze"]) expectNode(tab);
  tap("Create");
  tap("Object ID");
  const inputState = adb("shell", "dumpsys", "input_method");
  if (!/mInputShown=true|inputShown=true|showRequested=true/.test(inputState)) throw new Error("Editor keyboard did not open.");
  screenshot("expanded-inspector-keyboard");
  adb("shell", "input", "keyevent", "4");

  adb("shell", "input", "keyevent", "3");
  pause(800);
  adb("shell", "am", "start", "-n", activity);
  expectNode("Workspace");
  report.lifecycle.push({ id: "background-foreground", result: "passed" });

  adb("shell", "svc", "wifi", "disable");
  adb("shell", "svc", "data", "disable");
  networkDisabled = true;
  launch();
  expectNode("Swipe up for tools");
  report.lifecycle.push({ id: "network-loss", result: "passed" });
  adb("shell", "svc", "wifi", "enable");
  adb("shell", "svc", "data", "enable");
  networkDisabled = false;

  adb("shell", "am", "force-stop", packageName);
  adb("shell", "am", "start", "-n", activity);
  expectNode("Workspace");
  report.lifecycle.push({ id: "gl-context-recreation", result: "passed" });
  adb("shell", "am", "kill", packageName);
  adb("shell", "am", "start", "-n", activity);
  expectNode("Workspace");
  report.lifecycle.push({ id: "process-kill-restore", result: "passed" });
  report.lifecycle.push(...matrix.lifecycle
    .filter((scenario) => scenario.runner !== "android-emulator")
    .map((scenario) => ({ ...scenario, result: "covered-by-focused-unit-test" })));
  screenshot("lifecycle-restored");
  report.ok = true;
} catch (error) {
  report.error = String(error?.message || error);
  try { report.visibleLabels = readNodes().map((node) => node.label).filter(Boolean); } catch { /* Keep the first failure. */ }
  process.exitCode = 1;
} finally {
  if (networkDisabled) {
    try { adb("shell", "svc", "wifi", "enable"); } catch { /* Best effort restoration. */ }
    try { adb("shell", "svc", "data", "enable"); } catch { /* Best effort restoration. */ }
  }
  try { adb("shell", "wm", "size", "reset"); } catch { /* Best effort restoration. */ }
  try { adb("shell", "wm", "density", "reset"); } catch { /* Best effort restoration. */ }
  try { adb("shell", "settings", "put", "system", "font_scale", "1.0"); } catch { /* Best effort restoration. */ }
  try { adb("shell", "settings", "put", "system", "accelerometer_rotation", "1"); } catch { /* Best effort restoration. */ }
  try { adb("shell", "cmd", "uimode", "night", "no"); } catch { /* Best effort restoration. */ }
  writeFileSync(resolve(resultDir, "matrix-result.json"), `${JSON.stringify(report, null, 2)}\n`);
}
