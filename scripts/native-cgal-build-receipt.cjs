"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { hashFile, verifyNativeCgalSourceBundle } = require("./native-cgal-source-contract.cjs");

const root = path.resolve(__dirname, "..");
const receiptName = "NATIVE_BUILD_RECEIPT-windows.json";
const recipeCommit = "52fd90f2b7798d9fe6fef18fc1787db44574d704";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const git = (cwd, ...args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
};

/** Exact owner refs used both by packaging preparation and the release SBOM. */
function nativeCgalSbomOwners(manifest) {
  const build = manifest.windowsReferenceBuild;
  return {
    "math3d-cgal-worker.exe": "application:math3d-native-cgal-worker",
    "gmp-10.dll": `native:gmp:${build.gmp}`,
    "mpfr-6.dll": `native:mpfr:${build.mpfr}`,
  };
}

function currentNativeCgalBuild({ repository = root, sourceManifestPath,
  releaseDir = path.join(repository, "build/native/cgal-worker/Release") }) {
  if (!sourceManifestPath || path.basename(sourceManifestPath) !== "SOURCE_MANIFEST-windows.json")
    throw new Error("Native CGAL build requires the Windows corresponding-source receipt.");
  const sourcePath = path.resolve(sourceManifestPath);
  const sourceRaw = fs.readFileSync(sourcePath);
  const dependencyRaw = fs.readFileSync(path.join(repository, "native/cgal-worker/dependency-manifest.json"));
  const manifest = JSON.parse(dependencyRaw);
  const inventory = JSON.parse(fs.readFileSync(path.join(repository, "compliance/public-source-manifest.json")));
  const commit = git(repository, "rev-parse", "HEAD");
  if (git(repository, "status", "--porcelain", "--", "native/cgal-worker"))
    throw new Error("Native CGAL build sources differ from the recorded commit.");
  verifyNativeCgalSourceBundle(path.dirname(sourcePath), JSON.parse(sourceRaw), inventory, dependencyRaw, commit);
  const vcpkgRoot = path.join(repository, ".deps/vcpkg");
  if (git(vcpkgRoot, "rev-parse", "HEAD") !== recipeCommit)
    throw new Error("Native CGAL build uses an unpinned vcpkg recipe revision.");
  const triplet = manifest.windowsReferenceBuild.triplet;
  if (triplet !== "x64-windows") throw new Error("Native CGAL reference triplet changed.");
  const status = fs.readFileSync(path.join(vcpkgRoot, "installed/vcpkg/status"), "utf8").replace(/\r/g, "");
  for (const name of ["cgal", "boost-core", "gmp", "mpfr"]) {
    const block = status.split(/\n\n/).find(entry =>
      new RegExp(`^Package: ${name}$`, "m").test(entry) && /^Architecture: x64-windows$/m.test(entry));
    const actual = block?.match(/^Version: (.+)$/m)?.[1];
    if (actual !== manifest.windowsReferenceBuild[name])
      throw new Error(`Native CGAL ${name} version mismatch: ${actual ?? "missing"}.`);
  }
  const licenseHeader = path.join(vcpkgRoot, `installed/${triplet}/include/CGAL/Polygon_mesh_processing/corefinement.h`);
  if (!fs.readFileSync(licenseHeader, "utf8").includes("SPDX-License-Identifier: GPL-3.0-or-later OR LicenseRef-Commercial"))
    throw new Error("Installed CGAL corefinement license evidence is missing.");
  const copyrightSha256 = Object.fromEntries(["cgal", "boost-core", "gmp", "mpfr"].map(name => {
    const file = path.join(vcpkgRoot, `installed/${triplet}/share/${name}/copyright`);
    if (!fs.statSync(file).isFile() || !fs.readFileSync(file, "utf8").trim())
      throw new Error(`Installed native ${name} license evidence is missing.`);
    return [name, hashFile(file)];
  }));
  const vcpkgSbomSha256 = Object.fromEntries(["cgal", "boost-core", "gmp", "mpfr"].map(name => {
    const file = path.join(vcpkgRoot, `installed/${triplet}/share/${name}/vcpkg.spdx.json`);
    const spdx = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!/^SPDX-2\./.test(spdx.spdxVersion ?? ""))
      throw new Error(`Installed native ${name} source provenance is missing.`);
    return [name, hashFile(file)];
  }));
  const owners = nativeCgalSbomOwners(manifest);
  const names = ["math3d-cgal-worker.exe", ...manifest.windowsReferenceBuild.runtimeDlls];
  if (names.length !== Object.keys(owners).length || names.some(name => !owners[name]))
    throw new Error("Native CGAL SBOM ownership is incomplete.");
  const binaries = Object.fromEntries(names.map(name => [name, hashFile(path.join(releaseDir, name))]));
  return {
    schema: "math3d.native-cgal-build/v1", target: "windows", sourceCommit: commit,
    nativeTree: git(repository, "rev-parse", "HEAD:native/cgal-worker"),
    sourceManifestSha256: sha256(sourceRaw), dependencyManifestSha256: sha256(dependencyRaw),
    vcpkgRecipeCommit: recipeCommit, triplet, versions: Object.fromEntries(
      ["cgal", "boost-core", "gmp", "mpfr"].map(name => [name, manifest.windowsReferenceBuild[name]])),
    licenseEvidence: { cgalCorefinementHeaderSha256: hashFile(licenseHeader), copyrightSha256,
      cgalExpression: "GPL-3.0-or-later OR LicenseRef-Commercial" },
    vcpkgSbomSha256, binaries, sbomOwners: owners,
  };
}

function verifyNativeCgalBuildReceipt(receiptPath, options) {
  if (!receiptPath || path.basename(receiptPath) !== receiptName)
    throw new Error("Native CGAL build receipt is missing.");
  const recorded = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const current = currentNativeCgalBuild(options);
  assertNativeCgalReceiptMatches(recorded, current);
  return current;
}

function assertNativeCgalReceiptMatches(recorded, current) {
  assert.deepEqual(recorded, current, "Native CGAL source, binary, license or SBOM ownership differs from its build receipt.");
}

module.exports = { receiptName, currentNativeCgalBuild, verifyNativeCgalBuildReceipt,
  nativeCgalSbomOwners, assertNativeCgalReceiptMatches };
