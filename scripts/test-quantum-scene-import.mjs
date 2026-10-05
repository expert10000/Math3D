import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { rememberQuantumScene, reopenRecentQuantumScene } = require("../dist/main/quantumScene/recent.js");
const { quantumSceneLaunchDirectory } = require("../dist/main/ipc/quantumSceneIpc.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = await mkdtemp(join(tmpdir(), "m3d-q01-"));
try {
  const directory = join(root, "sample.qscene");
  assert.equal(quantumSceneLaunchDirectory(["electron", ".", "--quantum-scene", directory]), directory);
  assert.equal(quantumSceneLaunchDirectory(["electron", "."]), null);
  assert.throws(() => quantumSceneLaunchDirectory(["electron", ".", "--quantum-scene", "relative.qscene"]), /Invalid quantum scene launch folder/);
  assert.throws(() => quantumSceneLaunchDirectory(["electron", ".", "--quantum-scene", directory, "--quantum-scene", directory]), /Only one quantum scene/);
  await mkdir(directory);
  const values = [0,0,0, 1,0,0, 1,1,0];
  const data = Buffer.alloc(values.length * 8);
  values.forEach((value,index) => data.writeDoubleLE(value,index * 8));
  const scene = {
    schema: "quantum-scene/v1", id: "fixture-path", title: "Verified path",
    provenance: { runId: "run-fixture", jobId: "job-fixture", model: "two_level", engine: "native",
      engineVersion: "1", computedAt: "2026-10-05T00:00:00Z", resultSha256: "a".repeat(64), adapter: "qvis/1" },
    coordinates: { handedness: "right", axes: ["x","y","z"], units: ["dimensionless","dimensionless","dimensionless"] },
    camera: { position: [3,2,2], target: [0,0,0], up: [0,0,1] },
    datasets: [{ id: "vertices", path: "vertices.f64", format: "f64le", count: 3, components: 3,
      unit: "dimensionless", bytes: data.length, sha256: hash(data) }],
    objects: [{ id: "path", label: "Source path", kind: "polyline", positions: "vertices", visible: true,
      style: { color: "#0088ff", opacity: 0.8, size: 1 } }],
    annotations: [],
  };
  const writeScene = async current => {
    const bytes = Buffer.from(JSON.stringify(current, null, 2) + "\n");
    await writeFile(join(directory,"scene.json"),bytes);
    await writeFile(join(directory,"bundle.json"),JSON.stringify({schema:"quantum-scene-bundle/v1",
      scene:{path:"scene.json",bytes:bytes.length,sha256:hash(bytes)}},null,2)+"\n");
  };
  await writeFile(join(directory,"vertices.f64"),data);
  await writeScene(scene);
  const imported = await importQuantumSceneBundle(directory);
  assert.equal(imported.document.metadata.sourceResultSha256,scene.provenance.resultSha256);
  assert.deepEqual(imported.document.geometry.segments?.map(segment=>segment.b),
    [{x:1,y:0,z:0},{x:1,y:1,z:0}]);
  assert.deepEqual(imported.document.cameras?.[0].position,{x:3,y:2,z:2});
  assert.deepEqual(imported.source.coordinates.units,scene.coordinates.units);
  assert.deepEqual(imported.mappedObjectIds,["path"]);
  assert.equal(imported.arrays.get("vertices")?.length,9);

  const userData = join(root, "user-data");
  await rememberQuantumScene(userData, directory, imported);
  const reopened = await reopenRecentQuantumScene(userData);
  assert.equal(reopened.directory, directory);
  assert.deepEqual(reopened.imported.source, imported.source);
  assert.deepEqual(reopened.imported.document.geometry, imported.document.geometry);
  assert.deepEqual(reopened.imported.document.metadata, imported.document.metadata);

  const corrupted=Buffer.from(data); corrupted[0]=1;
  await writeFile(join(directory,"vertices.f64"),corrupted);
  await assert.rejects(importQuantumSceneBundle(directory),/integrity/);
  await assert.rejects(reopenRecentQuantumScene(userData),/integrity/);
  await writeFile(join(directory,"vertices.f64"),data);
  await writeScene({...scene,title:"Valid but different source"});
  await assert.rejects(reopenRecentQuantumScene(userData),/changed since it was opened/);
  await writeScene(scene);
  await writeFile(join(directory,"scene.json"),"{}\n");
  await assert.rejects(importQuantumSceneBundle(directory),/size|integrity/);
  await writeScene({...scene,schema:"quantum-scene/v2"});
  await assert.rejects(importQuantumSceneBundle(directory),/Invalid quantum-scene\/v1/);
  await writeScene(scene);
  await writeFile(join(directory,"unexpected.txt"),"not part of bundle");
  await assert.rejects(importQuantumSceneBundle(directory),/unexpected or linked/);
  await rm(join(directory,"unexpected.txt"));
  await writeScene({...scene,datasets:[{...scene.datasets[0],path:"../escape.f64"}]});
  await assert.rejects(importQuantumSceneBundle(directory),/Invalid quantum-scene\/v1/);
  console.log("M3D-Q01 synthetic bundle, mapping and tamper refusal passed");

  const fixtureRoot = resolve("tests/fixtures/quantum-scene");
  const fixtureNames = (await readdir(fixtureRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.endsWith(".qscene"))
    .map(entry => entry.name).sort();
  assert.equal(fixtureNames.length, 4, "Expected real Theory Lab SSH/QWZ standard and band bundles");
  const expectedCoordinates = {
    "ssh/standard": { axes: ["site index", "display y", "display z"], units: ["site index", "dimensionless", "dimensionless"] },
    "ssh/bands": { axes: ["k", "energy", "display z"], units: ["rad / cell spacing", "normalized energy (hbar=1)", "dimensionless"] },
    "qwz/standard": { axes: ["kx", "ky", "Berry curvature"], units: ["rad / lattice constant", "rad / lattice constant", "dimensionless (a=1)"] },
    "qwz/bands": { axes: ["kx", "ky", "energy"], units: ["rad / lattice constant", "rad / lattice constant", "normalized energy (hbar=1)"] },
  };
  const acceptedViews = new Set();
  for (const name of fixtureNames) {
    const real = await importQuantumSceneBundle(join(fixtureRoot, name));
    const { source, document } = real;
    assert.equal(source.schema, "quantum-scene/v1");
    assert.equal(document.metadata.sourceResultSha256, source.provenance.resultSha256);
    assert.deepEqual((document.extensions["quantum-scene/v1"]).scene.coordinates, source.coordinates);
    assert.equal(source.provenance.adapter, "qvis/1");
    assert.ok(real.mappedObjectIds.length || real.deferredObjectIds.length || real.deferredFieldIds.length);
    const key = `${source.provenance.model}/${source.bands ? "bands" : "standard"}`;
    assert.deepEqual({ axes: source.coordinates.axes, units: source.coordinates.units }, expectedCoordinates[key]);
    if (source.bands) {
      assert.equal(source.bands.objects.length, 2);
      const meshColors = source.bands.objects.map(id => source.objects.find(object => object.id === id)?.style.color);
      assert.equal(new Set(meshColors).size, 2, "Band surfaces need distinct supplied colors");
      const triangleIds = document.geometry.triangles?.flatMap(triangle => [triangle.a.id, triangle.b.id, triangle.c.id]) ?? [];
      for (const objectId of source.bands.objects) {
        if (source.objects.find(object => object.id === objectId)?.kind === "mesh")
          assert.ok(triangleIds.some(id => id?.startsWith(`${objectId}:`)), `Missing sample IDs for ${objectId}`);
      }
    }
    acceptedViews.add(key);
  }
  assert.deepEqual(acceptedViews, new Set(["ssh/standard", "ssh/bands", "qwz/standard", "qwz/bands"]));

  const copied = join(root, "real-lab-tamper.qscene");
  await cp(join(fixtureRoot, fixtureNames[0]), copied, { recursive: true });
  const copiedScene = JSON.parse(await readFile(join(copied, "scene.json"), "utf8"));
  const artifact = join(copied, copiedScene.datasets[0].path);
  const damaged = Buffer.from(await readFile(artifact));
  damaged[0] ^= 1;
  await writeFile(artifact, damaged);
  await assert.rejects(importQuantumSceneBundle(copied), /integrity/);
  console.log("M3D-Q01 four real Theory Lab bundles, units and tamper refusal passed");

  if (process.argv[2]) {
    const real = await importQuantumSceneBundle(process.argv[2]);
    assert.equal(real.source.schema,"quantum-scene/v1");
    assert.equal(real.document.metadata.sourceResultSha256,real.source.provenance.resultSha256);
    assert.ok(real.mappedObjectIds.length || real.deferredObjectIds.length || real.deferredFieldIds.length);
    console.log(`M3D-Q01 Theory Lab bundle passed: ${real.source.provenance.runId}`);
  }
} finally {
  const safeRoot = resolve(root);
  if (!safeRoot.startsWith(resolve(tmpdir()) + sep) || !safeRoot.includes("m3d-q01-"))
    throw new Error("Unsafe quantum-scene test cleanup path");
  await rm(safeRoot,{recursive:true,force:true});
}
