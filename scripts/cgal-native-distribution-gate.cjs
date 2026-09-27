"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = require("../native/cgal-worker/dependency-manifest.json");
const nativePattern = /(?:native-cgal|cgal-worker|build[\\/]native)/i;

function assertNativeCgalPackagingPolicy(config) {
  if (manifest.distributionStatus !== "blocked-pending-license-decision") {
    throw new Error("Native CGAL distribution policy changed without an approved release gate.");
  }
  if (process.env.MATH3D_BUNDLE_NATIVE_CGAL === "1") {
    throw new Error("Native CGAL installer bundling is blocked pending a documented license decision.");
  }
  const inclusions = [
    ...(config.files ?? []),
    ...(config.extraResources ?? []),
    ...(config.extraFiles ?? []),
  ];
  for (const entry of inclusions) {
    const from = typeof entry === "string" ? entry : String(entry?.from ?? "");
    const to = typeof entry === "string" ? "" : String(entry?.to ?? "");
    if (nativePattern.test(from) || nativePattern.test(to)) {
      throw new Error(`Native CGAL installer bundling is blocked: ${from} -> ${to}`);
    }
  }
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
  for (const dll of manifest.windowsReferenceBuild.runtimeDlls) {
    if (!fs.existsSync(path.join(build, dll))) throw new Error(`Native release dependency missing: ${dll}`);
  }
}

module.exports = { assertNativeCgalPackagingPolicy, verifyLocalReferenceBuild };

if (require.main === module) {
  const config = require("../electron-builder.config.cjs");
  assertNativeCgalPackagingPolicy(config);
  if (process.argv.includes("--local")) verifyLocalReferenceBuild();
  console.log("Native CGAL distribution remains blocked; installers retain the Python fallback.");
}
