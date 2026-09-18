import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const identity = JSON.parse(readFileSync(resolve(repoRoot, "apps/mobile/version.json"), "utf8"));
const signing = JSON.parse(readFileSync(resolve(repoRoot, "docs/mobile-release-signing.json"), "utf8"));
const info = JSON.parse(readFileSync(resolve(repoRoot, "artifacts/mobile/build-info.json"), "utf8"));
const aab = resolve(repoRoot, "artifacts/mobile", `Math3D-mobile-${identity.version}-release.aab`);

if (!existsSync(aab)) throw new Error(`Release AAB missing: ${aab}`);
if (signing.applicationId !== identity.applicationId || signing.version !== identity.version || signing.build !== identity.build) {
  throw new Error("Release signing record differs from mobile identity.");
}
if (info.channel !== "release" || info.artifact !== `Math3D-mobile-${identity.version}-release.aab` ||
    info.applicationId !== identity.applicationId || info.version !== identity.version || info.build !== identity.build ||
    info.trackedSourceDirty !== false) {
  throw new Error("Release build metadata is missing, dirty, or differs from mobile identity.");
}

const sha256 = createHash("sha256").update(readFileSync(aab)).digest("hex");
if (sha256 !== info.sha256) throw new Error("Release AAB SHA-256 differs from build metadata.");

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
};

const signatureOutput = run("jarsigner", ["-verify", "-verbose", aab]);
if (!signatureOutput.includes("jar verified.")) throw new Error("jarsigner did not verify the release AAB.");

const certificateOutput = run("keytool", ["-J-Duser.language=en", "-printcert", "-jarfile", aab]);
const certificateMatch = certificateOutput.match(/SHA256:\s*([0-9A-Fa-f:]{95})/);
if (!certificateMatch) throw new Error("Could not read the AAB signing certificate SHA-256.");
const certificateSha256 = certificateMatch[1].replaceAll(":", "").toLowerCase();
if (certificateSha256 !== signing.certificateSha256) {
  throw new Error(`AAB signing certificate ${certificateSha256} differs from the release key record.`);
}

const verification = {
  ok: true,
  applicationId: identity.applicationId,
  version: identity.version,
  build: identity.build,
  sourceCommit: info.gitCommit,
  artifact: info.artifact,
  sha256,
  certificateSha256,
};
writeFileSync(resolve(repoRoot, "artifacts/mobile/release-verification.json"), `${JSON.stringify(verification, null, 2)}\n`);
console.log(`Verified ${info.artifact}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Signing certificate SHA-256: ${certificateSha256}`);
