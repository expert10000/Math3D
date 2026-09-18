import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const identity = JSON.parse(readFileSync(resolve(root, "apps/mobile/version.json"), "utf8"));
const signoff = JSON.parse(readFileSync(resolve(root, "docs/mobile-device-signoff.json"), "utf8"));
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};

const failures = [];
const requireValue = (condition, message) => { if (!condition) failures.push(message); };
const sourceCommit = signoff.sourceCommit;
requireValue(signoff.status === "approved", "Device signoff is not approved.");
requireValue(signoff.applicationId === `${identity.applicationId}.internal`, "Application ID differs from mobile identity.");
requireValue(signoff.version === identity.version && signoff.build === identity.build, "Version/build differs from mobile identity.");
requireValue(typeof sourceCommit === "string" && /^[0-9a-f]{40}$/.test(sourceCommit), "sourceCommit must be a full Git SHA.");
requireValue(typeof signoff.apkSha256 === "string" && /^[0-9a-f]{64}$/.test(signoff.apkSha256), "APK SHA-256 is missing or invalid.");
requireValue(typeof signoff.signingCertSha256 === "string" && /^[0-9a-f]{64}$/.test(signoff.signingCertSha256), "Signing certificate SHA-256 is missing or invalid.");
requireValue(typeof signoff.device?.model === "string" && signoff.device.model.trim(), "Device model is missing.");
requireValue(typeof signoff.device?.androidVersion === "string" && signoff.device.androidVersion.trim(), "Android version is missing.");
requireValue(typeof signoff.tester === "string" && signoff.tester.trim(), "Tester name is missing.");
requireValue(typeof signoff.testedAt === "string" && !Number.isNaN(Date.parse(signoff.testedAt)), "Test date is missing or invalid.");

const requiredChecks = [
  "installOrUpdate", "standaloneRelaunch", "workspaceViewport", "exploreNavigation",
  "inspectorControls", "filesPersistence", "crashLogReview",
];
for (const name of requiredChecks) requireValue(signoff.checks?.[name] === true, `${name} is not signed off.`);

if (typeof sourceCommit === "string" && /^[0-9a-f]{40}$/.test(sourceCommit)) {
  try {
    const fileContents = (ref) => git("ls-tree", "-r", ref, "--", "apps/mobile")
      .split("\n")
      .map((line) => line.replace(/^\d+ blob /, ""))
      .join("\n");
    requireValue(fileContents("HEAD") === fileContents(sourceCommit), "Mobile source contents changed after the signed-off build.");
    git("merge-base", "--is-ancestor", sourceCommit, "HEAD");
  } catch (error) {
    failures.push(`Cannot verify tested source commit: ${error.message}`);
  }
}

const report = {
  ok: failures.length === 0,
  signoffStatus: signoff.status,
  sourceCommit,
  apkSha256: signoff.apkSha256,
  signingCertSha256: signoff.signingCertSha256,
  failures,
};
const output = resolve(root, "output/mobile-device-signoff-gate.json");
mkdirSync(resolve(root, "output"), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`Mobile device signoff failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Mobile device signoff passed for ${sourceCommit} and ${signoff.apkSha256}`);
}
