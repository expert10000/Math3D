import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const identity = JSON.parse(readFileSync(resolve(root, "apps/mobile/version.json"), "utf8"));
const signing = JSON.parse(readFileSync(resolve(root, "docs/mobile-release-signing.json"), "utf8"));

if (signing.applicationId !== identity.applicationId ||
    signing.version !== identity.version || signing.build !== identity.build) {
  throw new Error("Release signing record differs from the mobile application identity.");
}
if (signing.ownerBackupVerified !== true ||
    !/^[0-9a-f]{64}$/.test(signing.ownerBackupArchiveSha256 || "") ||
    Number.isNaN(Date.parse(signing.ownerBackupVerifiedAt || ""))) {
  throw new Error("Owner-controlled signing-key backup is not verified for this mobile release.");
}
console.log(`Owner-controlled signing backup recorded for ${identity.version} (${identity.build}).`);
