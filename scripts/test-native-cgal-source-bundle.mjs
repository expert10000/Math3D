import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { selectPublicSources, verifyNativeCgalSourceBundle } = require("./native-cgal-source-contract.cjs");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "compliance/public-source-manifest.json"), "utf8"));
const selected = selectPublicSources(inventory, "windows");
for (const name of ["CGAL", "Boost", "GMP", "MPFR", "vcpkg build recipes"])
  assert(selected.some(item => item.name === name));
assert.throws(() => selectPublicSources({ sources: inventory.sources.filter(item => item.name !== "Boost") },
  "windows"), /Boost 1\.92\.0/);

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "m3d-native-source-test-"));
try {
  const source = selected.map(item => ({ ...item, sha256: hash(`source:${item.filename}`) }));
  const synthetic = { sources: source };
  for (const item of source) fs.writeFileSync(path.join(directory, item.filename), `source:${item.filename}`);
  const archive = "Math3D-test-source.zip", archiveBytes = "source archive";
  fs.writeFileSync(path.join(directory, archive), archiveBytes);
  const dependency = fs.readFileSync(path.join(root, "native/cgal-worker/dependency-manifest.json"));
  const receipt = { schemaVersion: 1, target: "windows", math3d: {
    commit: "a".repeat(40), sourceArchive: archive, sourceArchiveSha256: hash(archiveBytes) },
    nativeCgal: { distributionStatus: "source-bundle-integrated", dependencyManifestSha256: hash(dependency) },
    sources: source };
  assert.equal(verifyNativeCgalSourceBundle(directory, receipt, synthetic, dependency,
    "a".repeat(40)).assetCount, source.length + 1);
  assert.throws(() => verifyNativeCgalSourceBundle(directory, receipt, synthetic, dependency,
    "b".repeat(40)), /commit/);
  assert.throws(() => verifyNativeCgalSourceBundle(directory, receipt, synthetic,
    Buffer.from("{}"), "a".repeat(40)), /manifest bytes/);
  const boost = source.find(item => item.name === "Boost");
  fs.writeFileSync(path.join(directory, boost.filename), "changed");
  assert.throws(() => verifyNativeCgalSourceBundle(directory, receipt, synthetic, dependency,
    "a".repeat(40)), /missing or changed/);
  fs.unlinkSync(path.join(directory, boost.filename));
  assert.throws(() => verifyNativeCgalSourceBundle(directory, receipt, synthetic, dependency,
    "a".repeat(40)), /missing or changed/);
} finally {
  const safeRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!directory.startsWith(safeRoot) || !path.basename(directory).startsWith("m3d-native-source-test-"))
    throw new Error("Unsafe native source test cleanup path.");
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log("Native CGAL source inventory and exact-byte bundle refusal passed.");
