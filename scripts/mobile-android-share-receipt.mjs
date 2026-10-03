import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [expectedPath, outputPath, senderBuildPath, receiverBuildPath, sharedFileName] = process.argv.slice(2);
const serial = process.env.ANDROID_SERIAL;
if (!serial || !expectedPath || !outputPath || !senderBuildPath || !receiverBuildPath || !sharedFileName) {
  throw new Error("Set ANDROID_SERIAL and provide: expected-project output-directory sender-build-info receiver-build-info observed-share-filename");
}
const receiver = "com.math3d.acceptance.sharereceiver";
const sender = "com.math3d.mobile.internal";
const run = (...args) => {
  const result = spawnSync("adb", ["-s", serial, ...args], { timeout: 30000, maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr?.toString() || "ADB failed");
  return result.stdout;
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const expectedBytes = readFileSync(resolve(expectedPath));
const expected = JSON.parse(expectedBytes.toString("utf8"));
const senderBuild = JSON.parse(readFileSync(resolve(senderBuildPath), "utf8"));
const receiverBuild = JSON.parse(readFileSync(resolve(receiverBuildPath), "utf8"));
assert.equal(senderBuild.applicationId, sender);
assert.equal(senderBuild.trackedSourceDirty, false);
assert.equal(receiverBuild.applicationId, receiver);
assert.equal(receiverBuild.debugTestFixture, true);
const installedHash = packageName => {
  const path = run("shell", "pm", "path", packageName).toString().trim().split(/\r?\n/)
    .find(line => line.endsWith("/base.apk"))?.slice(8);
  assert.ok(path, `Missing installed APK: ${packageName}`);
  return sha(run("exec-out", "cat", path));
};
assert.equal(installedHash(sender), senderBuild.sha256);
assert.equal(installedHash(receiver), receiverBuild.apkSha256);
const packages = run("shell", "pm", "list", "packages", "-U", "com.math3d").toString();
const uid = packageName => {
  const line = packages.split(/\r?\n/).find(line => line.startsWith(`package:${packageName} uid:`));
  assert.ok(line, `Missing UID: ${packageName}`);
  return Number(line.split(" uid:")[1]);
};
assert.notEqual(uid(sender), uid(receiver), "Recipient must have separate Android storage and permissions.");
// run-as is confined to our debug recipient; no sender-private file is accessed.
const receiptBytes = run("exec-out", "run-as", receiver, "cat", "files/receipt.json");
const receivedBytes = run("exec-out", "run-as", receiver, "cat", "files/received-project.json");
const receipt = JSON.parse(receiptBytes.toString("utf8"));
assert.equal(receipt.ok, true);
assert.equal(receipt.action, "android.intent.action.SEND");
assert.equal(receipt.mimeType, "application/json");
assert.equal(receipt.receiverPackage, receiver);
assert.equal(receipt.receiverUid, uid(receiver));
assert.equal(receipt.contentResolverStreamRead, true);
assert.equal(receipt.readPermissionFlag, true);
assert.ok(receipt.contentUriAuthority.startsWith(`${sender}.`));
assert.equal(receipt.displayName, sharedFileName, "Reject an older receipt instead of attesting a fresh share.");
assert.equal(receipt.byteLength, receivedBytes.length);
assert.equal(receipt.sha256, sha(receivedBytes));
assert.deepEqual(receivedBytes, expectedBytes);
const received = JSON.parse(receivedBytes.toString("utf8"));
assert.deepEqual(received, expected);
assert.equal(receipt.projectId, expected.identity.id);
assert.equal(receipt.projectRevision, expected.identity.revision);
assert.equal(receipt.projectTitle, expected.metadata.title);
assert.equal(receipt.documentCount, expected.workspace.entries.length);
assert.equal(receipt.relationCount, expected.workspace.relations.length);
const output = resolve(outputPath);
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "receipt.json"), receiptBytes);
writeFileSync(resolve(output, "received.math3d.project.json"), receivedBytes);
const report = { format: "math3d.native-local-share-acceptance.v1", ok: true,
  scope: "Actual Android ACTION_SEND delivery to a separate local recipient app; no network transport",
  testedAtUtc: new Date().toISOString(), model: run("shell", "getprop", "ro.product.model").toString().trim(),
  androidApi: Number(run("shell", "getprop", "ro.build.version.sdk").toString().trim()),
  senderPackage: sender, senderUid: uid(sender), senderSourceCommit: senderBuild.gitCommit, senderApkSha256: senderBuild.sha256,
  receiverPackage: receiver, receiverUid: uid(receiver), receiverBuild,
  observedShareFileName: sharedFileName, payloadSha256: receipt.sha256, byteLength: receipt.byteLength,
  nativeReadGrantWorked: true, separateRecipientPrivateCopy: true, exactOriginalBytesRetained: true,
  projectIdentityMetadataGenerationsRelationsResultsRetained: true };
writeFileSync(resolve(output, "delivery-result.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
