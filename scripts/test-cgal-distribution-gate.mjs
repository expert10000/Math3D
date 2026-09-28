import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { assertNativeCgalPackagingPolicy, verifyLocalReferenceBuild } =
  require(path.join(root, "scripts/cgal-native-distribution-gate.cjs"));
const config = require(path.join(root, "electron-builder.config.cjs"));

assert.doesNotThrow(() => assertNativeCgalPackagingPolicy(config));
assert.throws(() => assertNativeCgalPackagingPolicy({
  ...config,
  extraResources: [...config.extraResources, { from: "build/native/cgal-worker/Release", to: "native-cgal" }],
}), /blocked/);
const previous = process.env.MATH3D_BUNDLE_NATIVE_CGAL;
try {
  process.env.MATH3D_BUNDLE_NATIVE_CGAL = "1";
  assert.throws(() => assertNativeCgalPackagingPolicy(config), /blocked/);
} finally {
  if (previous === undefined) delete process.env.MATH3D_BUNDLE_NATIVE_CGAL;
  else process.env.MATH3D_BUNDLE_NATIVE_CGAL = previous;
}
verifyLocalReferenceBuild();
console.log("Native CGAL distribution gate rejects bundle paths without public source assets and matches local dependency metadata.");
