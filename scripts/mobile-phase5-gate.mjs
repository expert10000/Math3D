import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultReportPath = resolve(repoRoot, "output", "mobile-phase5-report.md");

const args = process.argv.slice(2);
const artifactPaths = [];
let reportPath = defaultReportPath;

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
  }
}

const checks = [];

const addCheck = (name, status, detail) => {
  checks.push({ name, status, detail });
};

const readJson = (absPath) => JSON.parse(readFileSync(absPath, "utf8"));

const isPinnedVersion = (version) => {
  if (typeof version !== "string") return false;
  if (version.startsWith("file:")) return true;
  return /^\d+\.\d+\.\d+([.-][A-Za-z0-9]+)?$/.test(version);
};

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

const mobilePackagePath = resolve(repoRoot, "apps", "mobile", "package.json");
const mobileLockPath = resolve(repoRoot, "apps", "mobile", "package-lock.json");
const mobileBackendPath = resolve(repoRoot, "apps", "mobile", "src", "services", "mobileMeshBackend.ts");
const phase5ChecklistPath = resolve(repoRoot, "docs", "mobile-phase5-stability-checklist.md");

try {
  const mobilePkg = readJson(mobilePackagePath);
  addCheck(
    "Mobile dev script exists",
    typeof mobilePkg.scripts?.dev === "string" ? "pass" : "fail",
    typeof mobilePkg.scripts?.dev === "string"
      ? `apps/mobile script: ${mobilePkg.scripts.dev}`
      : "apps/mobile/package.json is missing scripts.dev"
  );

  const depIssues = [];
  for (const [scope, entries] of [
    ["dependencies", mobilePkg.dependencies || {}],
    ["devDependencies", mobilePkg.devDependencies || {}],
  ]) {
    for (const [dep, version] of Object.entries(entries)) {
      if (!isPinnedVersion(version)) depIssues.push(`${scope}.${dep}=${String(version)}`);
    }
  }
  addCheck(
    "Mobile dependency versions are pinned",
    depIssues.length === 0 ? "pass" : "fail",
    depIssues.length === 0 ? "All dependency versions are exact." : `Unpinned versions: ${depIssues.join(", ")}`
  );
} catch (error) {
  addCheck("Read apps/mobile/package.json", "fail", String(error instanceof Error ? error.message : error));
}

addCheck(
  "apps/mobile lockfile exists",
  existsSync(mobileLockPath) ? "pass" : "fail",
  existsSync(mobileLockPath) ? relative(repoRoot, mobileLockPath) : "apps/mobile/package-lock.json is missing"
);

try {
  const backendSource = readFileSync(mobileBackendPath, "utf8");
  const usesSharedClient =
    backendSource.includes("createHttpMeshBackend") && backendSource.includes("@math3d/api-client");
  addCheck(
    "Mobile service layer uses shared packages/api-client backend",
    usesSharedClient ? "pass" : "fail",
    usesSharedClient ? "createHttpMeshBackend import and usage found." : "Shared API client usage not found."
  );
} catch (error) {
  addCheck("Inspect mobileMeshBackend.ts", "fail", String(error instanceof Error ? error.message : error));
}

addCheck(
  "Phase 5 checklist document exists",
  existsSync(phase5ChecklistPath) ? "pass" : "fail",
  existsSync(phase5ChecklistPath) ? relative(repoRoot, phase5ChecklistPath) : "docs/mobile-phase5-stability-checklist.md is missing"
);

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
    .toString("utf8")
    .trim();
  addCheck("Capture tested commit SHA", gitSha ? "pass" : "fail", gitSha || "Empty git SHA output.");
} catch (error) {
  addCheck("Capture tested commit SHA", "fail", String(error instanceof Error ? error.message : error));
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

const passCount = checks.filter((item) => item.status === "pass").length;
const failCount = checks.filter((item) => item.status === "fail").length;
const now = new Date().toISOString();

const lines = [
  "# Mobile Phase 5 Gate Report",
  "",
  `Generated: ${now}`,
  `Commit SHA: ${gitSha}`,
  "",
  "## Gate Checks",
  "",
  "| Check | Status | Detail |",
  "| --- | --- | --- |",
  ...checks.map((item) => `| ${item.name} | ${item.status.toUpperCase()} | ${item.detail.replace(/\|/g, "\\|")} |`),
  "",
  `Summary: ${passCount} passed, ${failCount} failed.`,
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

const summary = `mobile-phase5-gate: ${passCount} passed, ${failCount} failed (${relative(repoRoot, reportPath)})`;
console.log(summary);
if (failCount > 0) {
  process.exit(1);
}
