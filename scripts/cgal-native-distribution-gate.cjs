"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { verifyNativeCgalSourceBundle } = require("./native-cgal-source-contract.cjs");

const root = path.resolve(__dirname, "..");
const manifest = require("../native/cgal-worker/dependency-manifest.json");
const nativePattern = /(?:native-cgal|cgal-worker|build[\\/]native)/i;

function assertNativeCgalPackagingPolicy(config) {
  if (manifest.distributionStatus !== "source-bundle-integrated-not-bundled") {
    throw new Error("Native CGAL distribution policy changed without an approved release gate.");
  }
  const requested = process.env.MATH3D_BUNDLE_NATIVE_CGAL === "1";
  const inclusions = [
    ...(config.files ?? []),
    ...(config.extraResources ?? []),
    ...(config.extraFiles ?? []),
  ];
  const native = [];
  for (const entry of inclusions) {
    const from = typeof entry === "string" ? entry : String(entry?.from ?? "");
    const to = typeof entry === "string" ? "" : String(entry?.to ?? "");
    if (nativePattern.test(from) || nativePattern.test(to)) {
      native.push({ from, to });
    }
  }
  if (!requested && native.length) throw new Error("Native CGAL bundling is blocked without an explicit source-qualified build.");
  if (!requested) return;
  if (native.length !== 1 || native[0].from !== "build/native/cgal-worker/Release" || native[0].to !== "native-cgal")
    throw new Error("Native CGAL bundling is blocked without the reviewed worker resource path.");
  const receiptPath = process.env.MATH3D_NATIVE_CGAL_SOURCE_MANIFEST;
  if (!receiptPath || path.basename(receiptPath) !== "SOURCE_MANIFEST-windows.json")
    throw new Error("Native CGAL bundling is blocked without a Windows corresponding-source receipt.");
  const directory = path.dirname(path.resolve(receiptPath));
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0) throw new Error("Native CGAL source commit could not be verified.");
  verifyNativeCgalSourceBundle(directory, JSON.parse(fs.readFileSync(receiptPath, "utf8")),
    JSON.parse(fs.readFileSync(path.join(root, "compliance/public-source-manifest.json"), "utf8")),
    fs.readFileSync(path.join(root, "native/cgal-worker/dependency-manifest.json")), commit.stdout.trim());
  verifyLocalReferenceBuild();
}

function installedVersion(status, name) {
  const block = status.split(/\r?\n\r?\n/).find((entry) =>
    new RegExp(`^Package: ${name}$`, "m").test(entry) && /^Architecture: x64-windows$/m.test(entry));
  return block?.match(/^Version: (.+)$/m)?.[1] ?? null;
}

function verifyLocalReferenceBuild() {
  const triplet = manifest.windowsReferenceBuild.triplet;
  const statusPath = path.join(root, ".deps/vcpkg/installed/vcpkg/status");
  if (!fs.existsSync(statusPath)) {
    throw new Error("Pinned vcpkg installation is missing; local native release validation cannot run.");
  }
  const status = fs.readFileSync(statusPath, "utf8").replace(/\r/g, "");
  for (const name of ["cgal", "gmp", "mpfr", "boost-core"]) {
    const actual = installedVersion(status, name);
    const expected = manifest.windowsReferenceBuild[name];
    if (actual !== expected) throw new Error(`${name} ${triplet}: expected ${expected}, found ${actual ?? "missing"}`);
  }
  const header = fs.readFileSync(path.join(root,
    `.deps/vcpkg/installed/${triplet}/include/CGAL/Polygon_mesh_processing/corefinement.h`), "utf8");
  if (!header.includes("SPDX-License-Identifier: GPL-3.0-or-later OR LicenseRef-Commercial")) {
    throw new Error("Installed CGAL corefinement license does not match reviewed package metadata.");
  }
  const build = path.join(root, "build/native/cgal-worker/Release");
  if (!fs.existsSync(path.join(build, "math3d-cgal-worker.exe"))) throw new Error("Native CGAL worker executable is missing.");
  for (const dll of manifest.windowsReferenceBuild.runtimeDlls) {
    if (!fs.existsSync(path.join(build, dll))) throw new Error(`Native release dependency missing: ${dll}`);
  }
}

module.exports = { assertNativeCgalPackagingPolicy, verifyLocalReferenceBuild };

if (require.main === module) {
  const config = require("../electron-builder.config.cjs");
  assertNativeCgalPackagingPolicy(config);
  if (process.argv.includes("--local")) verifyLocalReferenceBuild();
  console.log("Native CGAL distribution source gate passed; default installers retain the Python fallback.");
}
