import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mobile = resolve(root, "apps/mobile");
const identity = JSON.parse(readFileSync(resolve(mobile, "version.json"), "utf8"));
const mode = process.argv[2] || "--check";

if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z]+)*$/.test(identity.version)) {
  throw new Error("apps/mobile/version.json must contain a valid version");
}
if (!Number.isSafeInteger(identity.build) || identity.build < 1 || identity.build > 2_100_000_000) {
  throw new Error("apps/mobile/version.json must contain a positive Android build number");
}
if (!/^([a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/.test(identity.applicationId)) {
  throw new Error("apps/mobile/version.json must contain a valid applicationId");
}

const files = [
  { path: resolve(mobile, "package.json"), apply: (data) => { data.version = identity.version; } },
  { path: resolve(mobile, "package-lock.json"), apply: (data) => {
    data.version = identity.version;
    data.packages[""].version = identity.version;
  } },
  { path: resolve(root, "package-lock.json"), apply: (data) => {
    data.packages["apps/mobile"].version = identity.version;
  } },
];

let stale = false;
for (const entry of files) {
  const before = readFileSync(entry.path, "utf8");
  const data = JSON.parse(before);
  const previous = JSON.stringify(data);
  entry.apply(data);
  const after = `${JSON.stringify(data, null, 2)}\n`;
  if (previous === JSON.stringify(data)) continue;
  if (mode === "--sync") writeFileSync(entry.path, after);
  else stale = true;
}

const gradlePath = resolve(mobile, "android/app/build.gradle");
const gradleBefore = readFileSync(gradlePath, "utf8");
const gradleAfter = gradleBefore.replace(
  /^([ \t]*namespace\s+)["'][^"']+["']/m,
  `$1'${identity.applicationId}'`
);
if (gradleBefore === gradleAfter && !gradleBefore.includes(`namespace '${identity.applicationId}'`)) {
  throw new Error("Android namespace declaration was not found");
}
if (gradleBefore !== gradleAfter) {
  if (mode === "--sync") writeFileSync(gradlePath, gradleAfter);
  else stale = true;
}

for (const name of ["MainActivity.kt", "MainApplication.kt"]) {
  const path = resolve(mobile, `android/app/src/main/java/${identity.applicationId.replaceAll(".", "/")}/${name}`);
  const before = readFileSync(path, "utf8");
  const after = before.replace(/^package\s+[\w.]+/m, `package ${identity.applicationId}`);
  if (before !== after) {
    if (mode === "--sync") writeFileSync(path, after);
    else stale = true;
  }
}

if (mode !== "--sync" && mode !== "--check") throw new Error("Usage: mobile-version.mjs --check|--sync");
if (stale) throw new Error("Mobile package metadata is stale; run npm run mobile:version:sync");
console.log(`Mobile identity ${identity.applicationId} ${identity.version} (${identity.build}) ${mode === "--sync" ? "synced" : "verified"}`);
