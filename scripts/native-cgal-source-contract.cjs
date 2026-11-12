"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const required = Object.freeze([
  ["CGAL", "6.2"], ["CGAL", "6.2.1"], ["Boost", "1.92.0"], ["GMP", "6.3.0"], ["MPFR", "4.2.2"],
]);
const hashFile = filename => {
  const hash = crypto.createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
};

/** Windows public source assets include the optional native reference build's complete upstream releases. */
function selectPublicSources(manifest, target) {
  if (!Array.isArray(manifest?.sources)) throw new TypeError("Public source inventory is invalid.");
  const selected = manifest.sources.filter(source => source.targets?.includes(target) ||
    target === "windows" && source.targets?.includes("native-cgal"));
  if (target === "windows" || target === "native-cgal") {
    for (const [name, version] of required) {
      const matches = selected.filter(source => source.name === name && source.version === version &&
        source.targets?.includes("native-cgal"));
      if (matches.length !== 1) throw new TypeError(`Native CGAL source requires exactly one ${name} ${version} archive.`);
    }
    const recipes = selected.filter(source => source.name === "vcpkg build recipes" &&
      source.version === "52fd90f2b7798d9fe6fef18fc1787db44574d704");
    if (recipes.length !== 1)
      throw new TypeError("Native CGAL source requires the pinned vcpkg build recipes.");
  }
  const filenames = new Set();
  for (const source of selected) {
    if (!/^[A-Za-z0-9._+-]+$/.test(source.filename) || !/^[a-f0-9]{64}$/.test(source.sha256) ||
        !source.url?.startsWith("https://") || !source.license || filenames.has(source.filename))
      throw new TypeError(`Invalid or duplicate public source asset: ${source.filename}`);
    filenames.add(source.filename);
  }
  return selected;
}

/** Fail closed on absent or changed public bytes before any native binary may enter packaging. */
function verifyNativeCgalSourceBundle(directory, materialized, inventory, dependencyManifestRaw, commit) {
  if (materialized?.schemaVersion !== 1 || materialized.target !== "windows" ||
      materialized.math3d?.commit !== commit || materialized.nativeCgal?.distributionStatus !== "source-bundle-integrated")
    throw new TypeError("Native CGAL source receipt does not match this Windows build and commit.");
  const selected = selectPublicSources(inventory, "windows");
  if (JSON.stringify(materialized.sources) !== JSON.stringify(selected))
    throw new TypeError("Native CGAL source receipt differs from the reviewed inventory.");
  if (crypto.createHash("sha256").update(dependencyManifestRaw).digest("hex") !==
      materialized.nativeCgal.dependencyManifestSha256)
    throw new TypeError("Native CGAL dependency-manifest bytes changed.");
  const dependencyManifest = JSON.parse(dependencyManifestRaw);
  if (dependencyManifest.windowsReferenceBuild?.triplet !== "x64-windows" ||
      dependencyManifest.windowsReferenceBuild?.cgal !== "6.2" ||
      dependencyManifest.windowsReferenceBuild?.["boost-core"] !== "1.92.0" ||
      dependencyManifest.windowsReferenceBuild?.gmp !== "6.3.0" ||
      dependencyManifest.windowsReferenceBuild?.mpfr !== "4.2.2" ||
      JSON.stringify(dependencyManifest.windowsReferenceBuild?.runtimeDlls) !==
        JSON.stringify(["gmp-10.dll", "mpfr-6.dll"]))
    throw new TypeError("Native CGAL source inventory differs from its reference build.");
  if (!/^Math3D-[A-Za-z0-9._+-]+-source\.zip$/.test(materialized.math3d.sourceArchive) ||
      !/^[a-f0-9]{64}$/.test(materialized.math3d.sourceArchiveSha256))
    throw new TypeError("Math3D source archive hash is missing.");
  const assets = [{ filename: materialized.math3d.sourceArchive,
    sha256: materialized.math3d.sourceArchiveSha256 }, ...selected];
  for (const asset of assets) {
    const filename = path.join(directory, asset.filename);
    if (!fs.existsSync(filename) || !fs.lstatSync(filename).isFile() || hashFile(filename) !== asset.sha256)
      throw new TypeError(`Required native CGAL corresponding source is missing or changed: ${asset.filename}`);
  }
  return { assetCount: assets.length, sourceArchive: materialized.math3d.sourceArchive };
}

module.exports = { required, hashFile, selectPublicSources, verifyNativeCgalSourceBundle };
