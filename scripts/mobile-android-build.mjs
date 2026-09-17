import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mobileRoot = resolve(repoRoot, "apps/mobile");
const androidRoot = resolve(mobileRoot, "android");
const identity = JSON.parse(readFileSync(resolve(mobileRoot, "version.json"), "utf8"));
const channel = process.argv[2];
const variants = {
  debug: { task: ":app:assembleDebug", source: "app/build/outputs/apk/debug/app-debug.apk", extension: "apk" },
  internal: { task: ":app:assembleInternal", source: "app/build/outputs/apk/internal/app-internal.apk", extension: "apk" },
  release: { task: ":app:bundleRelease", source: "app/build/outputs/bundle/release/app-release.aab", extension: "aab" },
};
const variant = variants[channel];
if (!variant) throw new Error("Usage: mobile-android-build.mjs debug|internal|release");

if (!process.env.ANDROID_HOME && process.platform === "win32" && process.env.LOCALAPPDATA) {
  const sdk = resolve(process.env.LOCALAPPDATA, "Android/Sdk");
  if (existsSync(sdk)) process.env.ANDROID_HOME = sdk;
}
process.env.NODE_ENV = channel === "debug" ? "development" : "production";

const run = (command, args, cwd) => {
  const invocation = process.platform === "win32" && command.endsWith(".bat")
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${command} ${args.join(" ")}`] }
    : { command, args };
  const result = spawnSync(invocation.command, invocation.args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

run(process.execPath, [resolve(repoRoot, "scripts/mobile-version.mjs"), "--check"], repoRoot);

if (channel !== "debug") {
  const prefix = `MATH3D_ANDROID_${channel.toUpperCase()}_`;
  const fields = ["KEYSTORE_PATH", "STORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"];
  const missing = fields.filter((field) => !process.env[`${prefix}${field}`]);
  if (missing.length) throw new Error(`${channel} signing requires ${missing.map((field) => prefix + field).join(", ")}`);
  const keystore = resolve(process.env[`${prefix}KEYSTORE_PATH`]);
  if (!existsSync(keystore)) throw new Error(`${channel} keystore file does not exist`);
  if (keystore.toLowerCase() === resolve(androidRoot, "app/debug.keystore").toLowerCase()) {
    throw new Error(`${channel} must not use the debug keystore`);
  }
}

run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", [variant.task, "--no-daemon"], androidRoot);

const source = resolve(androidRoot, variant.source);
if (!existsSync(source)) throw new Error(`Gradle did not produce ${source}`);
const artifactDir = resolve(repoRoot, "artifacts/mobile");
mkdirSync(artifactDir, { recursive: true });
const name = `Math3D-mobile-${identity.version}-${channel}.${variant.extension}`;
const destination = resolve(artifactDir, name);
copyFileSync(source, destination);
const sha256 = createHash("sha256").update(readFileSync(destination)).digest("hex");

const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
const gitStatus = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" });
const info = {
  applicationId: identity.applicationId + (channel === "internal" ? ".internal" : ""),
  version: identity.version,
  build: identity.build,
  channel,
  gitCommit: git.status === 0 ? git.stdout.trim() : null,
  trackedSourceDirty: gitStatus.status === 0 ? gitStatus.stdout.trim().length > 0 : null,
  artifact: name,
  sha256,
};
writeFileSync(resolve(artifactDir, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
const checksums = ["debug", "internal", "release"]
  .map((key) => {
    const file = `Math3D-mobile-${identity.version}-${key}.${variants[key].extension}`;
    const path = resolve(artifactDir, file);
    return existsSync(path) ? `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${file}` : null;
  })
  .filter(Boolean);
writeFileSync(resolve(artifactDir, "SHA256SUMS"), `${checksums.join("\n")}\n`);
console.log(`Created ${destination}`);
