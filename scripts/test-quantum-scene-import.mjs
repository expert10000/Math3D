import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = await mkdtemp(join(tmpdir(), "m3d-q01-"));
try {
  const directory = join(root, "sample.qscene");
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

  const corrupted=Buffer.from(data); corrupted[0]=1;
  await writeFile(join(directory,"vertices.f64"),corrupted);
  await assert.rejects(importQuantumSceneBundle(directory),/integrity/);
  await writeFile(join(directory,"vertices.f64"),data);
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

  if (process.argv[2]) {
    const real = await importQuantumSceneBundle(process.argv[2]);
    assert.equal(real.source.schema,"quantum-scene/v1");
    assert.equal(real.document.metadata.sourceResultSha256,real.source.provenance.resultSha256);
    assert.ok(real.mappedObjectIds.length || real.deferredObjectIds.length || real.deferredFieldIds.length);
    console.log(`M3D-Q01 Theory Lab bundle passed: ${real.source.provenance.runId}`);
  }
} finally {
  await rm(root,{recursive:true,force:true});
}
