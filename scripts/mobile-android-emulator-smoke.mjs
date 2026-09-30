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
  throw new Error(`APK and build-info.json do not match clean mobile source metadata: ${JSON.stringify(buildInfo.trackedSourceChanges)}`);
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
  writeFileSync(resolve(resultDir, "ui.xml"), xml);
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const value = (name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
    const bounds = value("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return { text: value("text"), description: value("content-desc"), resourceId: value("resource-id"), className: value("class"), bounds: bounds ? bounds.slice(1).map(Number) : null };
  });
};
const findText = (text) => nodes().find((node) => (node.text === text || node.description === text) && node.bounds);
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
const tapInScroll = (text) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = nodes();
    const scroll = snapshot.find(node => node.className === "android.widget.ScrollView" && node.bounds);
    if (!scroll) throw new Error(`Expected scrollable content before ${text}.`);
    const node = snapshot.find(item => (item.text === text || item.description === text) && item.bounds);
    const [left, top, right, bottom] = scroll.bounds;
    if (node && node.bounds[1] >= top + 8 && node.bounds[3] <= bottom - 8 && node.bounds[3] > node.bounds[1]) {
      adb("shell", "input", "tap", String(Math.round((node.bounds[0] + node.bounds[2]) / 2)),
        String(Math.round((node.bounds[1] + node.bounds[3]) / 2)));
      return;
    }
    const x = Math.round((left + right) / 2);
    adb("shell", "input", "swipe", String(x), String(bottom - 45), String(x), String(top + 80), "350");
  }
  throw new Error(`Expected visible scroll control: ${text}`);
};
const tapVisibleInspectorControl = (text, contentLabel = "Object", resourceId = "") => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = nodes();
    const node = snapshot.find(n => (resourceId ? n.resourceId === resourceId : n.text === text || n.description === text) && n.bounds);
    const nav = snapshot.filter(n => n.text === "Explore" && n.bounds).sort((a, b) => b.bounds[1] - a.bounds[1])[0];
    const anchor = snapshot.find(n => n.text === contentLabel && n.bounds);
    if (!nav || !anchor) throw new Error("Expected content controls and bottom navigation.");
    const navTop = nav.bounds[1] - 20;
    const contentTop = anchor.bounds[3] + 8;
    // Accessibility bounds may include the clipped portion of a scroll row.
    const visibleTop = node ? Math.max(node.bounds[1], contentTop) : 0;
    const visibleBottom = node ? Math.min(node.bounds[3], navTop - 8) : 0;
    if (node && visibleBottom - visibleTop >= 12) {
      adb("shell", "input", "tap", String(Math.round((node.bounds[0] + node.bounds[2]) / 2)),
        String(Math.round((visibleTop + visibleBottom) / 2)));
      return;
    }
    const scroll = snapshot.find(n => n.className === "android.widget.ScrollView" && n.bounds?.[1] >= anchor.bounds[3]);
    const x = Math.round(scroll ? (scroll.bounds[0] + scroll.bounds[2]) / 2 : (nav.bounds[0] + nav.bounds[2]) / 2);
    const fromY = scroll ? scroll.bounds[3] - 30 : nav.bounds[1] - 85;
    adb("shell", "input", "swipe", String(x), String(fromY), String(x), String(Math.max(contentTop + 12, fromY - 220)), "350");
  }
  throw new Error(`${text} inspector control could not be scrolled above bottom navigation.`);
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
    tap("Scene");
    const object = nodes().find((node) => /^Select .+/.test(node.description) && node.bounds);
    if (!object) throw new Error("Expected a selectable object in the Scene list.");
    tapVisibleInspectorControl(object.description);
    // Selecting a Scene row opens Object automatically, so its old row label is no longer mounted.
    expectText("Opacity");
    tapVisibleInspectorControl("50%");
    let opacityUpdated = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (nodes().filter((node) => node.text === "50%").length >= 2) {
        opacityUpdated = true;
        break;
      }
      pause(700);
    }
    if (!opacityUpdated) throw new Error("Object opacity did not update to 50%.");
    swipeHandle("Swipe down to close", 350);
    expectText("Swipe up for tools");
  });
  check("five destination navigation and Explore sections", () => {
    tap("Home"); expectText("Your Math3D workspace");
    tap("Explore"); expectText("Examples");
    tap("Learn"); expectText("Learn with examples");
    tap("Projects"); expectText("New Project");
    tap("Settings"); expectText("Worker base URL");
    tap("Workspace"); expectText("Catenoid");
  });
  check("Explore example survives process restart without saving to Projects", () => {
    tap("Explore");
    tap("Examples");
    tapInScroll("Search examples");
    adb("shell", "input", "text", "Helicoid");
    adb("shell", "input", "keyevent", "4");
    tapVisibleInspectorControl("Helicoid", "Examples", "mobile-example-helicoid");
    expectText("Helicoid");
    adb("shell", "am", "force-stop", packageName);
    adb("shell", "am", "start", "-n", `${packageName}/com.math3d.mobile.MainActivity`);
    expectText("Helicoid");
  });
  check("app remains alive with no fatal JS or Android errors", () => {
    const pid = adb("shell", "pidof", packageName);
    if (!/^\d+$/.test(pid)) throw new Error("Math3D process is not running.");
    const log = adb("logcat", `--pid=${pid}`, "-d", "-v", "brief", "AndroidRuntime:E", "ReactNativeJS:E", "*:S");
    writeFileSync(resolve(resultDir, "filtered-logcat.txt"), `${log}\n`);
    if (/FATAL EXCEPTION|E\/ReactNativeJS/.test(log)) throw new Error("Fatal error found in app logs.");
  });
  report.ok = true;
} catch (error) {
  report.error = String(error?.message || error);
  try { report.visibleText = nodes().map((node) => node.text).filter(Boolean); } catch { /* Preserve original error. */ }
  console.error(report.error);
  process.exitCode = 1;
} finally {
  const screenshot = spawnSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], { maxBuffer: 16 * 1024 * 1024 });
  if (screenshot.status === 0) writeFileSync(resolve(resultDir, "workspace.png"), screenshot.stdout);
  writeFileSync(resolve(resultDir, "smoke-result.json"), `${JSON.stringify(report, null, 2)}\n`);
}
