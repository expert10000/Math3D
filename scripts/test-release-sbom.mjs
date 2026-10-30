#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "math3d-release-sbom-"));
const app = path.join(scratch, "app");
const out = path.join(scratch, "out");
const python = path.join(scratch, "python.json");
const write = (name, body) => {
  const filename = path.join(app, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, body);
};
const run = () => spawnSync(process.execPath, [
  path.join(root, "scripts/generate-release-sbom.mjs"),
  "--target", "windows", "--app-dir", app, "--out", out,
  "--python-inventory", python,
], { cwd: root, encoding: "utf8" });

try {
  write("resources/app.asar", "Math3D fixture");
  write("resources/python-worker/worker.exe", "worker fixture");
  write("resources/python-worker/_internal/CGAL/gmp.dll", "GMP fixture");
  write("resources/web-app/index.html", "web fixture");
  write("resources/scientific-publisher/scientific_scene_publisher.py", "publisher fixture");
  write("resources/scientific-publisher/examples/sincos-grid.json", "{}\n");
  write("resources/LICENSE", "license fixture");
  write("resources/THIRD_PARTY_NOTICES.md", "notice fixture");
  for (const name of ["dxcompiler.dll", "dxil.dll", "resources.pak", "resources/elevate.exe"]) {
    write(name, `${name} fixture`);
  }
  fs.writeFileSync(python, JSON.stringify({ pythonVersion: "3.11.0", packages: [{
    name: "fixture-lib", version: "1.0.0", licenseExpression: "MIT", dependencies: [],
  }] }));
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const bom = JSON.parse(fs.readFileSync(path.join(out, `Math3D-${version}-windows.cdx.json`)));
  assert.equal(bom.bomFormat, "CycloneDX");
  assert.equal(bom.specVersion, "1.6");
  const refs = new Set(bom.components.map((item) => item["bom-ref"]));
  for (const item of bom.dependencies) {
    assert(refs.has(item.ref));
    for (const dependency of item.dependsOn) assert(refs.has(dependency));
  }
  const worker = bom.components.find((item) => item["bom-ref"] === "file:resources/python-worker/worker.exe");
  assert.equal(worker.properties.find((item) => item.name === "math3d:owner").value, "application:math3d-python-worker");
  assert.equal(worker.hashes[0].content, crypto.createHash("sha256").update("worker fixture").digest("hex"));
  const gmp = bom.components.find((item) => item["bom-ref"] === "file:resources/python-worker/_internal/CGAL/gmp.dll");
  assert.match(gmp.properties.find((item) => item.name === "math3d:owner").value, /^native:gmp:/);
  assert(bom.components.some((item) => item.purl === "pkg:pypi/fixture-lib@1.0.0"));
  for (const name of ["scientific_scene_publisher.py", "examples/sincos-grid.json"]) {
    const item = bom.components.find(component => component["bom-ref"] ===
      `file:resources/scientific-publisher/${name}`);
    assert.equal(item.properties.find(property => property.name === "math3d:owner").value, "application:math3d");
  }
  for (const name of ["dxcompiler.dll", "dxil.dll", "resources.pak", "resources/elevate.exe"]) {
    const item = bom.components.find(component => component["bom-ref"] === `file:${name}`);
    assert(item, `${name} is present in the SBOM`);
    assert.equal(item.properties.find(property => property.name === "math3d:owner").value,
      name === "resources/elevate.exe" ? "application:math3d" : `runtime:electron:${JSON.parse(fs.readFileSync(path.join(root, "node_modules/electron/package.json"))).version}`);
  }

  write("resources/unknown.exe", "unexpected binary");
  const unknown = run();
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unowned packaged file: resources\/unknown.exe/);
  fs.rmSync(path.join(app, "resources/unknown.exe"));
  write("unreviewed.exe", "unexpected root binary");
  const unknownRoot = run();
  assert.notEqual(unknownRoot.status, 0);
  assert.match(unknownRoot.stderr, /Unowned packaged file: unreviewed.exe/);
  fs.rmSync(path.join(app, "unreviewed.exe"));

  fs.writeFileSync(python, JSON.stringify({ pythonVersion: "3.11.0", packages: [{
    name: "mystery", version: "1.0.0", dependencies: [],
  }] }));
  const noLicense = run();
  assert.notEqual(noLicense.status, 0);
  assert.match(noLicense.stderr, /Unknown Python license: mystery@1.0.0/);

  const aab = path.join(scratch, "Math3D-mobile-fixture-release.aab");
  const info = path.join(scratch, "build-info.json");
  const identity = path.join(scratch, "version.json");
  const gradle = path.join(scratch, "gradle.json");
  const mobileLock = path.join(scratch, "mobile-lock.json");
  const androidOut = path.join(out, "Math3D-mobile-fixture-release.cdx.json");
  fs.writeFileSync(aab, "signed AAB fixture");
  const aabHash = crypto.createHash("sha256").update(fs.readFileSync(aab)).digest("hex");
  fs.writeFileSync(info, JSON.stringify({ channel: "release", version: "fixture", build: 1,
    sha256: aabHash, gitCommit: "fixture", applicationId: "com.math3d.fixture" }));
  fs.writeFileSync(identity, JSON.stringify({ version: "fixture", build: 1 }));
  fs.writeFileSync(mobileLock, JSON.stringify({ packages: {} }));
  const gradleBom = { bomFormat: "CycloneDX", specVersion: "1.6",
    components: [{ "bom-ref": "native:fixture", type: "library", name: "native-fixture", version: "1.0",
      licenses: [{ expression: "MIT" }] }],
    dependencies: [{ ref: "native:fixture", dependsOn: [] }] };
  fs.writeFileSync(gradle, JSON.stringify(gradleBom));
  const androidRun = () => spawnSync(process.execPath, [
    path.join(root, "scripts/generate-android-release-sbom.mjs"),
    "--identity", identity, "--info", info, "--aab", aab,
    "--gradle", gradle, "--lock", mobileLock, "--out", androidOut,
  ], { cwd: root, encoding: "utf8" });
  const android = androidRun();
  assert.equal(android.status, 0, android.stderr);
  const mobileBom = JSON.parse(fs.readFileSync(androidOut));
  const mobileRefs = new Set(mobileBom.components.map((item) => item["bom-ref"]));
  for (const item of mobileBom.dependencies) {
    assert(mobileRefs.has(item.ref));
    for (const dependency of item.dependsOn) assert(mobileRefs.has(dependency));
  }
  assert.equal(mobileBom.components.find((item) => item["bom-ref"] === "application:math3d-mobile").hashes[0].content, aabHash);
  gradleBom.components[0].licenses = [];
  fs.writeFileSync(gradle, JSON.stringify(gradleBom));
  const unknownNative = androidRun();
  assert.notEqual(unknownNative.status, 0);
  assert.match(unknownNative.stderr, /Unknown Gradle license: native-fixture@1.0/);
  gradleBom.components[0].licenses = [{ expression: "MIT" }];
  fs.writeFileSync(gradle, JSON.stringify(gradleBom));
  fs.writeFileSync(aab, "tampered AAB fixture");
  const tampered = androidRun();
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /AAB changed after verification/);
  console.log("Desktop and Android SBOM fixtures, hashes, references and fail-closed checks passed.");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
