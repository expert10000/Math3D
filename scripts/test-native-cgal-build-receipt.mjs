import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { receiptName, nativeCgalSbomOwners, assertNativeCgalReceiptMatches,
  verifyNativeCgalBuildReceipt } = require("./native-cgal-build-receipt.cjs");
const manifest = require("../native/cgal-worker/dependency-manifest.json");
const owners = nativeCgalSbomOwners(manifest);
assert.deepEqual(owners, {
  "math3d-cgal-worker.exe": "application:math3d-native-cgal-worker",
  "gmp-10.dll": "native:gmp:6.3.0",
  "mpfr-6.dll": "native:mpfr:4.2.2",
});
assert.equal(receiptName, "NATIVE_BUILD_RECEIPT-windows.json");
assert.throws(() => verifyNativeCgalBuildReceipt("missing.json", {}), /receipt is missing/);

const expected = {
  schema: "math3d.native-cgal-build/v1", sourceCommit: "a".repeat(40),
  sourceManifestSha256: "b".repeat(64), dependencyManifestSha256: "c".repeat(64),
  nativeTree: "d".repeat(40), vcpkgRecipeCommit: "e".repeat(40),
  licenseEvidence: { cgalCorefinementHeaderSha256: "f".repeat(64),
    copyrightSha256: Object.fromEntries(["cgal", "boost-core", "gmp", "mpfr"].map(name => [name, "2".repeat(64)])),
    cgalExpression: "GPL-3.0-or-later OR LicenseRef-Commercial" },
  vcpkgSbomSha256: Object.fromEntries(["cgal", "boost-core", "gmp", "mpfr"].map(name => [name, "3".repeat(64)])),
  binaries: Object.fromEntries(Object.keys(owners).map(name => [name, "1".repeat(64)])),
  sbomOwners: owners,
};
assert.doesNotThrow(() => assertNativeCgalReceiptMatches(structuredClone(expected), expected));
for (const changed of [
  { ...expected, sourceManifestSha256: "0".repeat(64) },
  { ...expected, vcpkgRecipeCommit: "0".repeat(40) },
  { ...expected, binaries: { ...expected.binaries, "gmp-10.dll": "0".repeat(64) } },
  { ...expected, licenseEvidence: { ...expected.licenseEvidence, cgalExpression: "unknown" } },
  { ...expected, licenseEvidence: { ...expected.licenseEvidence,
    copyrightSha256: { ...expected.licenseEvidence.copyrightSha256, gmp: "0".repeat(64) } } },
  { ...expected, vcpkgSbomSha256: { ...expected.vcpkgSbomSha256, cgal: "0".repeat(64) } },
  { ...expected, sbomOwners: { ...owners, "mpfr-6.dll": "application:math3d" } },
]) assert.throws(() => assertNativeCgalReceiptMatches(changed, expected), /differs from its build receipt/);
console.log("Native CGAL receipt rejects changed sources, recipes, binaries, licenses and owners.");
