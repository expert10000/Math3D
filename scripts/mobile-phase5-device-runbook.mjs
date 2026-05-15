import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const args = process.argv.slice(2);
const artifactPaths = [];
let reportPath = resolve(repoRoot, "output", "mobile-phase5-device-runbook.md");
let tester = process.env.USERNAME || process.env.USER || "unassigned";

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--artifact") {
    const value = args[i + 1];
    if (value) {
      artifactPaths.push(resolve(repoRoot, value));
      i += 1;
    }
    continue;
  }
  if (arg === "--report") {
    const value = args[i + 1];
    if (value) {
      reportPath = resolve(repoRoot, value);
      i += 1;
    }
    continue;
  }
  if (arg === "--tester") {
    const value = args[i + 1];
    if (value) {
      tester = value;
      i += 1;
    }
  }
}

const collectFiles = (target, out) => {
  const stats = statSync(target);
  if (stats.isFile()) {
    out.push(target);
    return;
  }
  if (!stats.isDirectory()) return;
  for (const child of readdirSync(target)) {
    collectFiles(resolve(target, child), out);
  }
};

const hashFile = (absPath) => {
  const hash = createHash("sha256");
  hash.update(readFileSync(absPath));
  return hash.digest("hex");
};

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
    .toString("utf8")
    .trim();
} catch {
  // best effort
}

const artifactRows = [];
for (const artifactPath of artifactPaths) {
  if (!existsSync(artifactPath)) {
    artifactRows.push({
      path: relative(repoRoot, artifactPath),
      sha256: "missing",
      status: "missing",
    });
    continue;
  }
  const files = [];
  collectFiles(artifactPath, files);
  if (files.length === 0) {
    artifactRows.push({
      path: relative(repoRoot, artifactPath),
      sha256: "empty",
      status: "empty",
    });
    continue;
  }
  for (const filePath of files) {
    artifactRows.push({
      path: relative(repoRoot, filePath),
      sha256: hashFile(filePath),
      status: "ok",
    });
  }
}

const now = new Date().toISOString();
const lines = [
  "# Mobile Phase 5 Device Runbook",
  "",
  `Generated: ${now}`,
  `Tester: ${tester}`,
  `Commit SHA under test: ${gitSha}`,
  "",
  "## 1. Preflight",
  "",
  "- [ ] `npm run phase5:mobile:gate`",
  "- [ ] `npm run phase5:mobile:release-metadata`",
  "- [ ] `npm --prefix apps/mobile run dev` launches locally",
  "- [ ] Android release build command executed: `./gradlew :app:assembleRelease` (from `apps/mobile/android`)",
  "",
  "## 2. Device Matrix Results",
  "",
  "| Platform | Device Tier | OS | Build Type | Result | Notes |",
  "| --- | --- | --- | --- | --- | --- |",
  "| Android | Mid-range physical (primary) | Android 16 | Release APK | Pending |  |",
  "| Android | Emulator sanity | API 36 | Debug/Release | Pending |  |",
  "| iOS | Current iPhone physical | iOS latest supported by SDK 54 | Release | Pending |  |",
  "| iOS | Simulator sanity | iOS latest supported by SDK 54 | Debug/Release | Pending |  |",
  "",
  "## 3. Stability Smoke Runs",
  "",
  "Run each row 10 times unless stated otherwise.",
  "",
  "| Test Case | Android Result | iOS Result | Notes |",
  "| --- | --- | --- | --- |",
  "| Cold launch -> Home tab visible | Pending | Pending |  |",
  "| Open Gallery -> Catenoid -> Viewer | Pending | Pending |  |",
  "| Orbit/pan/zoom for 30 seconds | Pending | Pending |  |",
  "| Open implicit preset -> preview mesh generation | Pending | Pending |  |",
  "| Background app for 30 seconds -> resume | Pending | Pending |  |",
  "| Kill app -> relaunch -> reopen recent scene | Pending | Pending |  |",
  "| Toggle quality presets (`performance`, `balanced`, `sharp`) | Pending | Pending |  |",
  "| Backend URL health check with valid endpoint | Pending | Pending |  |",
  "| Backend URL health check with invalid endpoint | Pending | Pending |  |",
  "",
  "## 4. Performance Measurements",
  "",
  "| Metric | Target | Android Actual | iOS Actual |",
  "| --- | --- | --- | --- |",
  "| Cold start to first interactive screen | <= 3.0s | Pending | Pending |",
  "| Gallery -> viewer first render | <= 2.5s | Pending | Pending |",
  "| Implicit preview request roundtrip | <= 4.0s typical | Pending | Pending |",
  "| Peak memory during viewer interaction | No OOM/crash loop | Pending | Pending |",
  "",
  "## 5. Evidence Capture",
  "",
  "- [ ] Archive Android `logcat` output from full matrix run.",
  "- [ ] Archive iOS simulator/device crash logs from full matrix run.",
  "- [ ] Attach output paths and hashes below.",
  "",
  "Recommended capture commands:",
  "",
  "```powershell",
  "adb logcat -d > output/logs/mobile-android-logcat.txt",
  "```",
  "",
  "```bash",
  "xcrun simctl spawn booted log stream --style compact > output/logs/mobile-ios-sim.log",
  "```",
  "",
  "## 6. Signoff",
  "",
  "- [ ] Engineering signoff complete.",
  "- [ ] QA signoff complete.",
  "- [ ] `docs/mobile-phase5-stability-checklist.md` updated after this run.",
  "",
];

if (artifactRows.length > 0) {
  lines.push("## Artifact Hashes", "");
  lines.push("| Path | SHA256 | Status |", "| --- | --- | --- |");
  for (const row of artifactRows) {
    lines.push(`| ${row.path} | ${row.sha256} | ${row.status.toUpperCase()} |`);
  }
  lines.push("");
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

console.log(`mobile-phase5-device-runbook: generated ${relative(repoRoot, reportPath)}`);
