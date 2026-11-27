import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {importQuantumSceneBundle}=require("../dist/main/quantumScene/importer.js");
const {sceneFingerprint}=require("../dist/main/quantumScene/recent.js");
const {inspectVerifiedUte2LandauSample}=require("../dist/main/quantumScene/ute2LandauSample.js");
const fixture=resolve("tests/fixtures/quantum-ute2/ute2-landau-385f86e1c78131452a2ea145.qscene");
const root=await mkdtemp(join(tmpdir(),"m3d-ute2-gl-"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
try {
  const imported=await importQuantumSceneBundle(fixture);
  const fingerprint=sceneFingerprint(imported);
  assert.equal(imported.source.provenance.model,"two_order_landau");
  assert.deepEqual(imported.mappedObjectIds,["stationary","stable","global"]);
  const samples=Array.from({length:4},(_,sampleIndex)=>inspectVerifiedUte2LandauSample(imported,{fingerprint,sampleIndex}));
  assert.deepEqual(samples.map(item=>item.state),["normal","order-1","order-2","mixed"]);
  assert.equal(samples[3].globalMinimum,true);
  assert.equal(samples[3].locallyStable,true);
  assert.ok(samples[3].freeEnergy<samples[1].freeEnergy);
  assert.equal(samples[3].resultSha256,imported.source.provenance.resultSha256);
  assert.throws(()=>inspectVerifiedUte2LandauSample(imported,{fingerprint,sampleIndex:4}),/outside/);

  const changed=join(root,"changed.qscene");await cp(fixture,changed,{recursive:true});
  const positions=join(changed,"stationary-positions.f64");
  const altered=await readFile(positions);altered[0]^=1;await writeFile(positions,altered);
  await assert.rejects(importQuantumSceneBundle(changed),/integrity/);

  const forged=join(root,"forged.qscene");await cp(fixture,forged,{recursive:true});
  const scenePath=join(forged,"scene.json"),scene=JSON.parse(await readFile(scenePath,"utf8"));
  const globalPath=join(forged,"global-positions.f64"),normal=(await readFile(join(forged,"stationary-positions.f64"))).subarray(0,24);
  await writeFile(globalPath,normal);
  scene.datasets.find(item=>item.id==="global-positions").sha256=hash(normal);
  const sceneBytes=Buffer.from(JSON.stringify(scene,null,2)+"\n");await writeFile(scenePath,sceneBytes);
  await writeFile(join(forged,"bundle.json"),JSON.stringify({schema:"quantum-scene-bundle/v1",
    scene:{path:"scene.json",bytes:sceneBytes.length,sha256:hash(sceneBytes)}},null,2)+"\n");
  const forgedImport=await importQuantumSceneBundle(forged);
  assert.throws(()=>inspectVerifiedUte2LandauSample(forgedImport,
    {fingerprint:sceneFingerprint(forgedImport),sampleIndex:0}),/minimum role/);
  console.log("UTe2 Landau import, candidate roles, bundle tamper and forged-minimum refusal passed");
} finally {await rm(root,{recursive:true,force:true});}
