import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${name}`);
  return resolve(process.argv[index + 1]);
};
const identity = JSON.parse(readFileSync(resolve(root, "apps/mobile/version.json"), "utf8"));
const apk = option("--apk", resolve(root, `artifacts/mobile/Math3D-mobile-${identity.version}-internal.apk`));
const metadata = option("--build-info", resolve(root, "artifacts/mobile/build-info.json"));
const output = option("--report", resolve(root, "output/mobile-project-notes-preflight.json"));
const fixture = resolve(root, "tests/fixtures/project-workbook-note-journey.json");
const blockers = [], devices = [];
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || `${command} failed`);
  return result.stdout.trim();
};
try {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, "Android/Sdk"));
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
  const adb = sdk && existsSync(resolve(sdk, "platform-tools", executable)) ? resolve(sdk, "platform-tools", executable) : executable;
  for (const line of run(adb, ["devices"]).split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+device$/);
    if (!match || match[1].startsWith("emulator-")) continue;
    const serial = match[1];
    if (run(adb, ["-s", serial, "shell", "getprop", "ro.kernel.qemu"]) === "1") continue;
    devices.push({ serial, model: run(adb, ["-s", serial, "shell", "getprop", "ro.product.model"]), androidVersion: run(adb, ["-s", serial, "shell", "getprop", "ro.build.version.release"]) });
  }
  if (!devices.length) blockers.push("No authorized physical Android device is connected through ADB.");
  else if (devices.length > 1 && !devices.some(device => device.serial === process.env.ANDROID_SERIAL)) blockers.push("Select the intended physical device with ANDROID_SERIAL.");
} catch (error) { blockers.push(`Device discovery failed: ${error.message}`); }

let apkSha256 = null, sourceCommit = null;
if (!existsSync(apk)) blockers.push(`Current internal APK is missing: ${apk}`);
else {
  apkSha256 = createHash("sha256").update(readFileSync(apk)).digest("hex");
  try {
    const info = JSON.parse(readFileSync(metadata, "utf8")); sourceCommit = info.gitCommit;
    if (info.sha256 !== apkSha256 || info.applicationId !== `${identity.applicationId}.internal` || info.version !== identity.version || info.build !== identity.build || info.channel !== "internal")
      blockers.push("APK and internal build metadata do not match the current mobile identity.");
    if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? "")) blockers.push("Build metadata has no valid source commit.");
    else {
      const paths = ["apps/mobile", "packages/core", "packages/kernel", "packages/workbook", "packages/api-client"];
      if (run("git", ["diff", "--name-only", sourceCommit, "--", ...paths])) blockers.push("Mobile application or shared package sources differ from the APK's recorded commit; rebuild before acceptance.");
      if (run("git", ["ls-files", "--others", "--exclude-standard", "--", ...paths])) blockers.push("Untracked mobile/shared sources need an explicit build source record before acceptance.");
    }
  } catch (error) { blockers.push(`Cannot verify APK build metadata: ${error.message}`); }
}
const report = { status: blockers.length ? "pending" : "ready-for-device-test", approved: false,
  applicationId: `${identity.applicationId}.internal`, version: identity.version, build: identity.build,
  apk, apkSha256, sourceCommit, devices, fixture,
  fixtureSha256: createHash("sha256").update(readFileSync(fixture)).digest("hex"), blockers,
  requiredEvidence: ["resource-package-import", "workbook-read", "existing-note-read", "new-global-note", "new-workbook-block-note", "note-edit", "cold-relaunch-text-and-anchor", "portrait-landscape-and-keyboard", "crash-log-review"] };
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (blockers.length) process.exitCode = 1;
