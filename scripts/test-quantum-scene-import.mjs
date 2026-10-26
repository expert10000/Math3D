import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { writeLatticeFixture, writeOneDimensionalChainFixture } from "./quantum-lattice-fixtures.mjs";
import { writeReciprocalFixture } from "./quantum-reciprocal-fixtures.mjs";
import { writeLargeBandFixture } from "./quantum-band-fixtures.mjs";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { importQuantumFieldScientificManifest } = require("../dist/main/quantumScene/scientificManifest.js");
const { rememberQuantumScene, reopenRecentQuantumScene, reopenQuantumSceneReference, sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { quantumSceneLaunchDirectory } = require("../dist/main/ipc/quantumSceneIpc.js");
const { renderVerifiedFieldSlice, inspectVerifiedFieldSample } = require("../dist/main/quantumScene/fieldSlice.js");
const { deriveVerifiedFieldSurface } = require("../dist/main/quantumScene/fieldSurface.js");
const { deriveVerifiedFieldVolume } = require("../dist/main/quantumScene/fieldVolume.js");
const { inspectVerifiedBandSample } = require("../dist/main/quantumScene/bandSelection.js");
const { inspectVerifiedScalarSample } = require("../dist/main/quantumScene/scalarSelection.js");
const { BUNDLED_QUANTUM_SCENE_EXAMPLES, bundledQuantumSceneExample,
  bundledQuantumSceneDirectory, listBundledQuantumSceneExamples } = require("../dist/main/quantumScene/examples.js");
const { glyphSampleIndices, inspectVerifiedTopologySample, inspectVerifiedVectorSample } =
  require("../dist/main/quantumScene/topologyDisplay.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = await mkdtemp(join(tmpdir(), "m3d-q01-"));
try {
  const directory = join(root, "sample.qscene");
  const scientificDirectory = join(root, "sample.sscene");
  await mkdir(scientificDirectory);
  await writeFile(join(scientificDirectory, "bundle.json"), JSON.stringify({
    schema: "scientific-scene-bundle/v1", manifest: { path: "manifest.json", bytes: 1, sha256: "a".repeat(64) },
  }));
  await assert.rejects(importQuantumSceneBundle(scientificDirectory), /scientific \.sscene bundle.*Open external \.sscene folder/);
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
    [{x:1,y:0,z:0,id:"path:link:0:b",label:"Source path"},
      {x:1,y:1,z:0,id:"path:link:1:b",label:"Source path"}]);
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
  const workspaceReference = { directory, sceneFingerprint: sceneFingerprint(imported) };
  const workspaceReopened = await reopenQuantumSceneReference(workspaceReference);
  assert.deepEqual(workspaceReopened.imported.source, imported.source);
  await assert.rejects(reopenQuantumSceneReference({ ...workspaceReference, directory: "relative.qscene" }), /Invalid workspace/);

  const corrupted=Buffer.from(data); corrupted[0]=1;
  await writeFile(join(directory,"vertices.f64"),corrupted);
  await assert.rejects(importQuantumSceneBundle(directory),/integrity/);
  await assert.rejects(reopenRecentQuantumScene(userData),/integrity/);
  await assert.rejects(reopenQuantumSceneReference(workspaceReference),/integrity/);
  await writeFile(join(directory,"vertices.f64"),data);
  await writeScene({...scene,title:"Valid but different source"});
  await assert.rejects(reopenRecentQuantumScene(userData),/changed since it was opened/);
  await assert.rejects(reopenQuantumSceneReference(workspaceReference),/changed since it was saved/);
  await writeScene(scene);
  await writeFile(join(directory,"scene.json"),"{}\n");
  await assert.rejects(importQuantumSceneBundle(directory),/size|integrity/);
  await writeScene({...scene,schema:"quantum-scene/v3"});
  await assert.rejects(importQuantumSceneBundle(directory),/Unsupported quantum-scene version/);
  await writeScene(scene);
  await writeFile(join(directory,"unexpected.txt"),"not part of bundle");
  await assert.rejects(importQuantumSceneBundle(directory),/unexpected or linked/);
  await rm(join(directory,"unexpected.txt"));
  await writeScene({...scene,datasets:[{...scene.datasets[0],path:"../escape.f64"}]});
  await assert.rejects(importQuantumSceneBundle(directory),/Invalid quantum-scene\/v1/);
  console.log("M3D-Q01 synthetic bundle, mapping and tamper refusal passed");

  const siteDirectory = join(root, "sites-and-links.qscene");
  await mkdir(siteDirectory);
  const siteValues = [0,0,0, 2,0,0], linkValues = [0,0,0, 2,0,0];
  const f64 = values => {
    const bytes = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    return bytes;
  };
  const siteBytes = f64(siteValues), linkBytes = f64(linkValues);
  const siteScene = { ...scene, id: "verified-sites-links", title: "Supplied sites and links",
    coordinates: { ...scene.coordinates, units: ["a0", "a0", "a0"] },
    datasets: [["sites", siteBytes], ["links", linkBytes]].map(([id, bytes]) => ({
      id, path: `${id}.f64`, format: "f64le", count: 2, components: 3, unit: "a0",
      bytes: bytes.length, sha256: hash(bytes),
    })),
    objects: [
      { id: "supplied-sites", label: "Supplied sites", kind: "point-cloud", positions: "sites", visible: true,
        style: { color: "#22aaff", opacity: 1, size: 1 } },
      { id: "supplied-links", label: "Supplied links", kind: "segments", positions: "links", visible: true,
        style: { color: "#ff8800", opacity: 0.8, size: 1 } },
    ] };
  const writeSiteScene = async () => {
    const bytes = Buffer.from(JSON.stringify(siteScene, null, 2) + "\n");
    await writeFile(join(siteDirectory, "scene.json"), bytes);
    await writeFile(join(siteDirectory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
      scene: { path: "scene.json", bytes: bytes.length, sha256: hash(bytes) } }, null, 2) + "\n");
  };
  await writeFile(join(siteDirectory, "sites.f64"), siteBytes);
  await writeFile(join(siteDirectory, "links.f64"), linkBytes);
  await writeSiteScene();
  const sites = await importQuantumSceneBundle(siteDirectory);
  assert.deepEqual(sites.mappedObjectIds, ["supplied-sites", "supplied-links"]);
  assert.deepEqual(sites.document.geometry.points?.map(point => point.id),
    ["supplied-sites:site:0", "supplied-sites:site:1"]);
  assert.deepEqual(sites.document.geometry.segments?.map(segment => [segment.a.id, segment.b.id]),
    [["supplied-links:link:0:a", "supplied-links:link:0:b"]]);
  const sitesReference = { directory: siteDirectory, sceneFingerprint: sceneFingerprint(sites) };
  assert.deepEqual((await reopenQuantumSceneReference(sitesReference)).imported.document.geometry, sites.document.geometry);
  const alteredSites = Buffer.from(siteBytes); alteredSites[0] ^= 1;
  await writeFile(join(siteDirectory, "sites.f64"), alteredSites);
  await assert.rejects(reopenQuantumSceneReference(sitesReference), /integrity/);
  await writeFile(join(siteDirectory, "sites.f64"), siteBytes);

  const fieldDirectory = join(root, "orbital.qscene");
  await mkdir(fieldDirectory);
  const realValues = [], imaginaryValues = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    realValues.push(x); imaginaryValues.push(y);
  }
  const fieldBytes = values => {
    const bytes = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    return bytes;
  };
  const realBytes = fieldBytes(realValues), imaginaryBytes = fieldBytes(imaginaryValues);
  const fieldScene = {
    ...scene, id: "fixture-orbital", title: "Verified orbital field", objects: [],
    coordinates: { handedness: "right", axes: ["x", "y", "z"], units: ["a0", "a0", "a0"] },
    datasets: [["real", realBytes], ["imaginary", imaginaryBytes]].map(([id, bytes]) => ({
      id, path: `${id}.f64`, format: "f64le", count: 27, components: 1, unit: "a0^-3/2",
      bytes: bytes.length, sha256: hash(bytes),
    })),
    fields: [{ id: "wavefunction", label: "Synthetic complex field", kind: "complex-field", real: "real", imaginary: "imaginary",
      grid: { shape: [3, 3, 3], origin: [-1, -1, -1], spacing: [1, 1, 1], order: "xyz-z-fastest" } }],
  };
  const fieldSceneBytes = Buffer.from(JSON.stringify(fieldScene, null, 2) + "\n");
  await writeFile(join(fieldDirectory, "scene.json"), fieldSceneBytes);
  await writeFile(join(fieldDirectory, "real.f64"), realBytes);
  await writeFile(join(fieldDirectory, "imaginary.f64"), imaginaryBytes);
  await writeFile(join(fieldDirectory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: fieldSceneBytes.length, sha256: hash(fieldSceneBytes) } }, null, 2) + "\n");
  const orbital = await importQuantumSceneBundle(fieldDirectory);
  assert.deepEqual(orbital.deferredFieldIds, ["wavefunction"]);
  const request = { fingerprint: sceneFingerprint(orbital), fieldId: "wavefunction", axis: 2, index: 1, quantity: "density" };
  const density = renderVerifiedFieldSlice(orbital, request);
  assert.deepEqual([density.width, density.height, density.rgba.length, density.unit, density.range],
    [3, 3, 36, "a0^-3", [0, 2]]);
  assert.deepEqual(density.fitBounds, [0, 0, 3, 3], "small fields retain the complete source plane");
  const phase = renderVerifiedFieldSlice(orbital, { ...request, quantity: "phase" });
  assert.equal(phase.rgba[(1 * 3 + 1) * 4 + 3], 0, "phase at a zero-amplitude node is transparent");
  const sample = inspectVerifiedFieldSample(orbital, { ...request, u: 2, v: 1 });
  assert.deepEqual(sample, { grid: [2, 1, 1], position: [1, 0, 0], value: 1, unit: "a0^-3", undefinedNearNode: false });
  assert.equal(inspectVerifiedFieldSample(orbital, { ...request, quantity: "phase", u: 1, v: 1 }).value, null);
  assert.throws(() => renderVerifiedFieldSlice(orbital, { ...request, index: 3 }), /Invalid field slice index/);
  assert.throws(() => renderVerifiedFieldSlice(orbital, { ...request, fieldId: "missing" }), /Unknown verified scene field/);
  const mismatchedUnits = { ...orbital, source: { ...orbital.source, datasets: orbital.source.datasets.map(dataset =>
    dataset.id === "imaginary" ? { ...dataset, unit: "dimensionless" } : dataset) } };
  assert.throws(() => renderVerifiedFieldSlice(mismatchedUnits, request), /different units/);
  const scalar = { ...orbital, source: { ...orbital.source, fields: [{ ...orbital.source.fields[0], kind: "scalar-field", imaginary: undefined }] } };
  assert.equal(renderVerifiedFieldSlice(scalar, { ...request, quantity: "real" }).unit, "a0^-3/2");
  assert.throws(() => renderVerifiedFieldSlice(scalar, request), /Unsupported field quantity/);
  const volumeRequest = { fingerprint: sceneFingerprint(orbital), fieldId: "wavefunction", quantity: "real", requestId: "q03-test" };
  const realVolume = await deriveVerifiedFieldVolume(orbital, volumeRequest);
  assert.deepEqual([realVolume.encoding, realVolume.layout, realVolume.valueUnit, realVolume.values.length],
    ["f64le-planar-real-imaginary", "xyz-x-fastest", "a0^-3/2", 27]);
  assert.deepEqual(realVolume.coordinateUnits, ["a0", "a0", "a0"]);
  assert.deepEqual(realVolume.shape, [3, 3, 3]);
  assert.deepEqual(realVolume.origin, [-1, -1, -1]);
  assert.equal(realVolume.values[1], 0, "QVIS z-fastest to Volume x-fastest conversion was lost");
  assert.equal(realVolume.values[2], 1);
  assert.equal(realVolume.sourceHashes[0], hash(realBytes));
  const densityVolume = await deriveVerifiedFieldVolume(orbital, { ...volumeRequest, quantity: "density" });
  assert.equal(densityVolume.valueUnit, "a0^-3");
  assert.equal(densityVolume.values[13], 0);
  const phaseVolume = await deriveVerifiedFieldVolume(orbital, { ...volumeRequest, quantity: "phase" });
  assert.equal(phaseVolume.valueUnit, "rad");
  assert.equal(phaseVolume.phaseZeroPolicy, "zero-placeholder-masked");
  assert.equal(phaseVolume.undefinedMask[13], 1);
  assert.equal(phaseVolume.values[13], 0);
  assert.equal(phaseVolume.undefinedNodeCount, 3);
  assert.equal((await deriveVerifiedFieldVolume(scalar, volumeRequest)).kind, "scalar-field");
  await assert.rejects(deriveVerifiedFieldVolume(scalar, { ...volumeRequest, quantity: "density" }), /Unsupported field quantity/);
  await assert.rejects(deriveVerifiedFieldVolume(orbital, volumeRequest, () => true), /cancelled/);
  const brokenField = Buffer.from(realBytes); brokenField[0] ^= 1;
  await writeFile(join(fieldDirectory, "real.f64"), brokenField);
  await assert.rejects(importQuantumSceneBundle(fieldDirectory), /integrity/);
  console.log("M3D-Q02 bounded verified orbital slice and sample passed");

  const fixtureRoot = resolve("tests/fixtures/quantum-scene");
  assert.equal(listBundledQuantumSceneExamples().length, 28);
  assert.equal(new Set(BUNDLED_QUANTUM_SCENE_EXAMPLES.map(item => item.id)).size, 28);
  assert.throws(() => bundledQuantumSceneExample("../outside"), /Unknown bundled/);
  const weylFolder=join(fixtureRoot,bundledQuantumSceneExample("weyl-local").folder);
  const weyl=await importQuantumSceneBundle(weylFolder);
  const weylResultBytes=await readFile(join(fixtureRoot,"weyl-local-producer-result.json"));
  const weylResult=JSON.parse(weylResultBytes.toString("utf8"));
  assert.equal(weyl.source.provenance.model,"weyl_minimal");
  assert.equal(weyl.source.topology.invariants.find(item=>item.id==="local-chirality").value,1);
  assert.equal(weyl.source.topology.invariants.find(item=>item.id==="occupied-chern").value,-1);
  assert.equal(weyl.source.provenance.resultSha256,hash(weylResultBytes));
  assert.equal(weyl.document.geometry.triangles.length,320);
  assert.equal(weyl.document.geometry.points.length,163);
  const weylFirst=inspectVerifiedScalarSample(weyl,{fingerprint:sceneFingerprint(weyl),objectId:"weyl-samples",sampleIndex:0});
  assert.deepEqual(weylFirst.position,weylResult.analysis.positions[0]);
  assert.equal(weylFirst.value,-0.5);
  assert.equal(weylFirst.valueUnit,"inverse length squared");
  const changedWeyl=join(root,"weyl-changed.qscene");
  await cp(weylFolder,changedWeyl,{recursive:true});
  const weylBytes=await readFile(join(changedWeyl,"radial-berry.f64"));
  weylBytes[0]^=1;await writeFile(join(changedWeyl,"radial-berry.f64"),weylBytes);
  await assert.rejects(importQuantumSceneBundle(changedWeyl),/integrity|hash/i);
  const nodalFolder=join(fixtureRoot,bundledQuantumSceneExample("nodal-ring").folder);
  const nodal=await importQuantumSceneBundle(nodalFolder);
  const nodalResultBytes=await readFile(join(fixtureRoot,"nodal-ring-producer-result.json"));
  const nodalResult=JSON.parse(nodalResultBytes.toString("utf8"));
  assert.equal(nodal.source.provenance.model,"nodal_line_two_band");
  assert.equal(nodal.source.provenance.resultSha256,hash(nodalResultBytes));
  assert.equal(nodal.source.topology.invariants.find(item=>item.id==="linking-berry-phase").value,Math.PI);
  assert.equal(nodal.source.topology.invariants.find(item=>item.id==="linking-berry-phase").status,"verified");
  assert.deepEqual(Array.from(nodal.arrays.get("ring-samples")),nodalResult.analysis.ringPositions.flat());
  assert.deepEqual(Array.from(nodal.arrays.get("loop-samples")),nodalResult.analysis.loopPositions.flat());
  assert.deepEqual(Array.from(nodal.arrays.get("loop-lower-band")),nodalResult.analysis.lowerBand);
  assert.deepEqual(Array.from(nodal.arrays.get("loop-upper-band")),nodalResult.analysis.upperBand);
  const nodalFirst=inspectVerifiedScalarSample(nodal,{fingerprint:sceneFingerprint(nodal),objectId:"linking-loop-samples",sampleIndex:0});
  assert.deepEqual(nodalFirst.position,nodalResult.analysis.loopPositions[0]);
  assert.equal(nodalFirst.value,nodalResult.analysis.upperBand[0]);
  assert.equal(nodalFirst.valueUnit,"normalized energy");
  const changedNodal=join(root,"nodal-changed.qscene");
  await cp(nodalFolder,changedNodal,{recursive:true});
  const nodalBytes=await readFile(join(changedNodal,"loop-upper-band.f64"));
  nodalBytes[0]^=1;await writeFile(join(changedNodal,"loop-upper-band.f64"),nodalBytes);
  await assert.rejects(importQuantumSceneBundle(changedNodal),/integrity|hash/i);
  const changedRing=join(root,"nodal-ring-changed.qscene");
  await cp(nodalFolder,changedRing,{recursive:true});
  const ringBytes=await readFile(join(changedRing,"ring-samples.f64"));
  ringBytes[0]^=1;await writeFile(join(changedRing,"ring-samples.f64"),ringBytes);
  await assert.rejects(importQuantumSceneBundle(changedRing),/integrity|hash/i);
  const landauFolder=join(fixtureRoot,bundledQuantumSceneExample("landau-levels").folder);
  const landau=await importQuantumSceneBundle(landauFolder);
  const landauResultBytes=await readFile(join(fixtureRoot,"landau-producer-result.json"));
  const landauResult=JSON.parse(landauResultBytes.toString("utf8"));
  assert.equal(landau.source.provenance.model,"landau_continuum");
  assert.equal(landau.source.provenance.resultSha256,hash(landauResultBytes));
  assert.deepEqual(landau.source.coordinates.axes,["signed B","level index n","energy E_n"]);
  assert.equal(landau.source.coordinates.units[0],landauResult.analysis.units.field);
  assert.equal(landau.document.geometry.points.length,35);
  assert.deepEqual(Array.from(landau.arrays.get("level-3-positions")),landauResult.analysis.fieldValues.flatMap((field,i)=>[field,3,landauResult.analysis.energies[i][3]]));
  assert.deepEqual(Array.from(landau.arrays.get("level-3-energy")),landauResult.analysis.energies.map(row=>row[3]));
  const landauSample=inspectVerifiedScalarSample(landau,{fingerprint:sceneFingerprint(landau),objectId:"level-3-samples",sampleIndex:2});
  assert.deepEqual(landauSample.position,[landauResult.analysis.fieldValues[2],3,landauResult.analysis.energies[2][3]]);
  assert.equal(landauSample.value,landauResult.analysis.energies[2][3]);
  assert.equal(landauSample.valueUnit,landauResult.analysis.units.energy);
  const changedLandau=join(root,"landau-changed.qscene");
  await cp(landauFolder,changedLandau,{recursive:true});
  const landauBytes=await readFile(join(changedLandau,"level-3-energy.f64"));
  landauBytes[0]^=1;await writeFile(join(changedLandau,"level-3-energy.f64"),landauBytes);
  await assert.rejects(importQuantumSceneBundle(changedLandau),/integrity|hash/i);
  const harperFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-bands").folder);
  const harper=await importQuantumSceneBundle(harperFolder);
  const harperResultBytes=await readFile(join(fixtureRoot,"hofstadter-producer-result.json"));
  const harperResult=JSON.parse(harperResultBytes.toString("utf8"));
  assert.equal(harper.source.provenance.model,"hofstadter");
  assert.equal(harper.source.provenance.resultSha256,hash(harperResultBytes));
  assert.equal(harper.source.bands.energies.length,harperResult.model.parameters.q);
  assert.deepEqual(harper.source.coordinates.units,["rad / lattice constant","rad / lattice constant","hopping energy"]);
  assert.deepEqual(Array.from(harper.arrays.get("band-0-energy")),harperResult.analysis.bandEnergies[0]);
  const harperSample=inspectVerifiedBandSample(harper,{fingerprint:sceneFingerprint(harper),objectId:"band-0",sampleIndex:21});
  assert.deepEqual(harperSample.k.slice(0,2),[harperResult.analysis.kxValues[2],harperResult.analysis.kyValues[3]]);
  assert.equal(harperSample.energy,harperResult.analysis.bandEnergies[0][21]);
  assert.equal(harperSample.energyUnit,harperResult.analysis.units.energy);
  const changedHarper=join(root,"hofstadter-changed.qscene");
  await cp(harperFolder,changedHarper,{recursive:true});
  const harperBytes=await readFile(join(changedHarper,"band-0-energy.f64"));
  harperBytes[0]^=1;await writeFile(join(changedHarper,"band-0-energy.f64"),harperBytes);
  await assert.rejects(importQuantumSceneBundle(changedHarper),/integrity|hash/i);
  const chernFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-chern").folder);
  const chernScene=await importQuantumSceneBundle(chernFolder);
  const chernBytes=await readFile(join(fixtureRoot,"hofstadter-chern-producer-result.json"));
  const chernResult=JSON.parse(chernBytes.toString("utf8"));
  assert.equal(chernScene.source.provenance.resultSha256,hash(chernBytes));
  assert.deepEqual(chernScene.source.topology.invariants.map(item=>item.value),[-1,null,1]);
  assert.deepEqual(chernScene.source.topology.invariants.map(item=>item.status),["verified","undefined","verified"]);
  assert.equal(chernScene.source.topology.quantities.length,2);
  for(const occupied of [1,3]){
    const gap=chernResult.analysis.chernGaps[occupied-1];
    const dataset=`occupied-${occupied}-plaquette-flux`;
    assert.deepEqual(Array.from(chernScene.arrays.get(dataset)),gap.plaquetteFlux);
    const sample=inspectVerifiedTopologySample(chernScene,{fingerprint:sceneFingerprint(chernScene),
      quantityId:`occupied-${occupied}-berry-flux`,sampleIndex:21});
    assert.equal(sample.value,gap.plaquetteFlux[21]);
    assert.equal(sample.valueUnit,"rad per plaquette");
    assert.equal(sample.runId,chernResult.runId);
  }
  const changedCh = join(root,"hofstadter-chern-changed.qscene");
  await cp(chernFolder,changedCh,{recursive:true});
  const fluxBytes=await readFile(join(changedCh,"occupied-1-plaquette-flux.f64"));
  fluxBytes[0]^=1;await writeFile(join(changedCh,"occupied-1-plaquette-flux.f64"),fluxBytes);
  await assert.rejects(importQuantumSceneBundle(changedCh),/integrity|hash/i);
  const stripFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-strip").folder);
  const stripScene=await importQuantumSceneBundle(stripFolder);
  const stripBytes=await readFile(join(fixtureRoot,"hofstadter-strip-producer-result.json"));
  const stripResult=JSON.parse(stripBytes.toString("utf8"));
  assert.equal(stripScene.source.provenance.resultSha256,hash(stripBytes));
  assert.equal(stripScene.source.topology,undefined,"strip observation must not carry periodic Chern claims");
  assert.equal(stripScene.source.provenance.parameters.stripCells,stripResult.analysis.strip.cells);
  assert.deepEqual(Array.from(stripScene.arrays.get("strip-left-weight")),stripResult.analysis.strip.leftWeights.flat());
  assert.deepEqual(Array.from(stripScene.arrays.get("strip-right-weight")),stripResult.analysis.strip.rightWeights.flat());
  for(const side of ["left","right"]){
    const sample=inspectVerifiedScalarSample(stripScene,{fingerprint:sceneFingerprint(stripScene),objectId:`strip-${side}`,sampleIndex:3*17+5});
    assert.equal(sample.position[0],stripResult.analysis.strip.kyValues[5]);
    assert.equal(sample.position[2],stripResult.analysis.strip.energies[3][5]);
    assert.equal(sample.value,stripResult.analysis.strip[side==="left"?"leftWeights":"rightWeights"][3][5]);
    assert.equal(sample.valueUnit,"probability weight");
    assert.equal(sample.runId,stripResult.runId);
  }
  const changedStrip=join(root,"hofstadter-strip-changed.qscene");
  await cp(stripFolder,changedStrip,{recursive:true});
  const stripWeightBytes=await readFile(join(changedStrip,"strip-left-weight.f64"));
  stripWeightBytes[0]^=1;await writeFile(join(changedStrip,"strip-left-weight.f64"),stripWeightBytes);
  await assert.rejects(importQuantumSceneBundle(changedStrip),/integrity|hash/i);
  const hallFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-hall").folder);
  const hallScene=await importQuantumSceneBundle(hallFolder);
  const hallBytes=await readFile(join(fixtureRoot,"hofstadter-hall-producer-result.json"));
  const hallResult=JSON.parse(hallBytes.toString("utf8"));
  const hall=hallResult.analysis.filling;
  assert.equal(hallScene.source.provenance.resultSha256,hash(hallBytes));
  assert.equal(hallScene.source.provenance.parameters.occupiedBands,hall.occupiedBands);
  assert.equal(hallScene.source.topology.invariants.find(item=>item.id==="filled-global-gap").value,hall.fineGlobalGap);
  assert.equal(hallScene.source.topology.invariants.find(item=>item.id==="filled-hall-conductance").value,hall.conductance);
  assert.equal(hall.conductance,-1);
  assert.equal(hall.status,"defined");
  const hallSample=inspectVerifiedBandSample(hallScene,{fingerprint:sceneFingerprint(hallScene),objectId:"band-0",sampleIndex:21});
  assert.equal(hallSample.energy,hallResult.analysis.bandEnergies[0][21]);
  assert.equal(hallSample.runId,hallResult.runId);
  const changedHall=join(root,"hofstadter-hall-changed.qscene");
  await cp(hallFolder,changedHall,{recursive:true});
  const hallBand=await readFile(join(changedHall,"band-0-energy.f64"));
  hallBand[0]^=1;await writeFile(join(changedHall,"band-0-energy.f64"),hallBand);
  await assert.rejects(importQuantumSceneBundle(changedHall),/integrity|hash/i);
  const butterflyFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-butterfly").folder);
  const butterfly=await importQuantumSceneBundle(butterflyFolder);
  const butterflyBytes=await readFile(join(fixtureRoot,"hofstadter-flux-producer-result.json"));
  const butterflySource=JSON.parse(butterflyBytes.toString("utf8"));
  assert.equal(butterfly.source.provenance.resultSha256,hash(butterflyBytes));
  assert.equal(butterfly.source.provenance.model,"hofstadter_flux_sweep");
  assert.equal(butterfly.source.objects.length,butterflySource.points.length);
  for(const point of butterflySource.points){
    const selected=inspectVerifiedScalarSample(butterfly,{fingerprint:sceneFingerprint(butterfly),objectId:`flux-${point.index}`,sampleIndex:point.q===1?0:point.energies[0].length});
    assert.equal(selected.position[0],point.p/point.q);
    assert.equal(selected.value,point.q===1?point.energies[0][0]:point.energies[1][0]);
    assert.ok(butterfly.source.annotations[point.index].text.includes(point.resultSha256));
    assert.equal(point.filling?.status==="defined",point.filling?.conductance!==null&&point.filling?.conductance!==undefined);
  }
  const changedButterfly=join(root,"hofstadter-butterfly-changed.qscene");
  await cp(butterflyFolder,changedButterfly,{recursive:true});
  const butterflyBand=await readFile(join(changedButterfly,"flux-1-energy.f64"));
  butterflyBand[0]^=1;await writeFile(join(changedButterfly,"flux-1-energy.f64"),butterflyBand);
  await assert.rejects(importQuantumSceneBundle(changedButterfly),/integrity|hash/i);
  const edgeFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-bulk-edge").folder);
  const edgeScene=await importQuantumSceneBundle(edgeFolder);
  const edgeProducer=JSON.parse((await readFile(join(fixtureRoot,"hofstadter-edge-producer-results.json"))).toString("utf8"));
  assert.equal(edgeScene.source.provenance.model,"hofstadter_bulk_edge_study");
  assert.equal(edgeScene.source.provenance.resultSha256,hash(Buffer.from(JSON.stringify(edgeProducer.study))));
  assert.equal(edgeProducer.study.comparison.status,"consistent");
  assert.equal(edgeProducer.study.sources.length,3);
  const bulkEdge=inspectVerifiedScalarSample(edgeScene,{fingerprint:sceneFingerprint(edgeScene),objectId:"bulk-0",sampleIndex:12});
  assert.equal(bulkEdge.position[0],edgeProducer.results[0].analysis.kxValues[1]);
  assert.equal(bulkEdge.position[1],edgeProducer.results[0].analysis.kyValues[3]);
  assert.equal(bulkEdge.value,edgeProducer.results[0].analysis.bandEnergies[0][12]);
  for(const [width,sourceIndex] of [[18,1],[24,2]]){
    const strip=edgeProducer.results[sourceIndex].analysis.strip;
    for(const side of ["left","right"]){
      const sample=inspectVerifiedScalarSample(edgeScene,{fingerprint:sceneFingerprint(edgeScene),objectId:`strip-${width}-${side}`,sampleIndex:3*31+5});
      assert.equal(sample.position[0],strip.kyValues[5]);
      assert.equal(sample.position[2],strip.energies[3][5]);
      assert.equal(sample.value,strip[side==="left"?"leftWeights":"rightWeights"][3][5]);
      assert.ok(edgeScene.source.annotations[sourceIndex+1].text.includes(edgeProducer.study.sources[sourceIndex].resultSha256));
    }
  }
  const changedEdge=join(root,"hofstadter-edge-changed.qscene");
  await cp(edgeFolder,changedEdge,{recursive:true});
  const changedWeight=await readFile(join(changedEdge,"strip-18-left-weight.f64"));changedWeight[0]^=1;
  await writeFile(join(changedEdge,"strip-18-left-weight.f64"),changedWeight);
  await assert.rejects(importQuantumSceneBundle(changedEdge),/integrity|hash/i);
  const trackedFolder=join(fixtureRoot,bundledQuantumSceneExample("hofstadter-tracked-edge").folder);
  const trackedScene=await importQuantumSceneBundle(trackedFolder);
  const trackedProducer=JSON.parse((await readFile(join(fixtureRoot,"hofstadter-edge-tracked-producer-results.json"))).toString("utf8"));
  assert.equal(trackedProducer.study.tracking.status,"consistent");
  assert.equal(trackedScene.source.provenance.resultSha256,hash(Buffer.from(JSON.stringify(trackedProducer.study))));
  assert.ok(trackedScene.source.annotations.find(note=>note.id==="tracking")?.text.includes("overlap"));
  for(const [width,index] of [[18,1],[24,2]]){
    const crossing=trackedProducer.study.tracking.widths[index-1].crossings[0];
    const exact=inspectVerifiedScalarSample(trackedScene,{fingerprint:sceneFingerprint(trackedScene),
      objectId:`tracked-${width}`,sampleIndex:0});
    assert.equal(exact.position[0],crossing.ky);
    assert.equal(exact.value,crossing.overlap);
    assert.ok(trackedScene.source.annotations.find(note=>note.id===`track-${width}-0`)?.text.includes(
      trackedProducer.study.sources[index].resultSha256));
  }
  const changedTracked=join(root,"hofstadter-tracked-changed.qscene");
  await cp(trackedFolder,changedTracked,{recursive:true});
  const changedOverlap=await readFile(join(changedTracked,"tracked-18-overlap.f64"));changedOverlap[0]^=1;
  await writeFile(join(changedTracked,"tracked-18-overlap.f64"),changedOverlap);
  await assert.rejects(importQuantumSceneBundle(changedTracked),/integrity|hash/i);
  for (const example of BUNDLED_QUANTUM_SCENE_EXAMPLES) {
    const directory = bundledQuantumSceneDirectory(example, resolve(), "C:\\Math3D-resources", false);
    assert.equal(directory, resolve("tests", "fixtures", example.fixtureGroup, example.folder));
    assert.equal(bundledQuantumSceneDirectory(example, resolve(), "C:\\Math3D-resources", true),
      join("C:\\Math3D-resources", "quantum-scenes", example.fixtureGroup, example.folder));
    const pinned = await importQuantumSceneBundle(directory);
    assert.equal(sceneFingerprint(pinned), example.fingerprint, `Bundled ${example.id} no longer matches its pinned source`);
    if (example.id === "hydrogen-2p") {
      const compatible = await importQuantumFieldScientificManifest(directory);
      assert.equal(compatible.manifest.source.sha256, example.fingerprint);
      assert.equal(compatible.manifest.datasets[0].imaginary, "psi-imaginary");
      assert.deepEqual(compatible.manifest.resources.map(resource => resource.sha256),
        pinned.source.datasets.map(dataset => dataset.sha256));
    }
  }
  const allFixtureNames = (await readdir(fixtureRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.endsWith(".qscene"))
    .map(entry => entry.name).sort();
  assert.equal(allFixtureNames.length, 23, "Expected frozen SSH/QWZ plus bounded producer fixtures including tracked Hofstadter edges");
  const bhzFolders=new Set(["bhz-bands","bhz-general-continuum","bhz-general-lattice"].map(id=>bundledQuantumSceneExample(id).folder));
  const bbhFolders=new Set(["bbh-bands","bbh-finite","bbh-wilson"].map(id=>bundledQuantumSceneExample(id).folder));
  const kitaevFolders=new Set(["kitaev-bands","kitaev-finite","kitaev-invariant"].map(id=>bundledQuantumSceneExample(id).folder));
  const weylFolderName=bundledQuantumSceneExample("weyl-local").folder;
  const nodalFolderName=bundledQuantumSceneExample("nodal-ring").folder;
  const landauFolderName=bundledQuantumSceneExample("landau-levels").folder;
  const harperFolderName=bundledQuantumSceneExample("hofstadter-bands").folder;
  const chernFolderName=bundledQuantumSceneExample("hofstadter-chern").folder;
  const stripFolderName=bundledQuantumSceneExample("hofstadter-strip").folder;
  const hallFolderName=bundledQuantumSceneExample("hofstadter-hall").folder;
  const butterflyFolderName=bundledQuantumSceneExample("hofstadter-butterfly").folder;
  const edgeFolderName=bundledQuantumSceneExample("hofstadter-bulk-edge").folder;
  const trackedFolderName=bundledQuantumSceneExample("hofstadter-tracked-edge").folder;
  const fixtureNames=allFixtureNames.filter(name=>!bhzFolders.has(name)&&!bbhFolders.has(name)&&!kitaevFolders.has(name)&&name!==weylFolderName&&name!==nodalFolderName&&name!==landauFolderName&&name!==harperFolderName&&name!==chernFolderName&&name!==stripFolderName&&name!==hallFolderName&&name!==butterflyFolderName&&name!==edgeFolderName&&name!==trackedFolderName);
  assert.equal(fixtureNames.length, 4, "Expected real Theory Lab SSH/QWZ standard and band bundles");
  assert.deepEqual(new Set(BUNDLED_QUANTUM_SCENE_EXAMPLES.filter(example => example.fixtureGroup === "quantum-scene" && example.model!=="BHZ" && example.model!=="BBH" && example.model!=="Kitaev" && example.model!=="Weyl" && example.model!=="Nodal" && example.model!=="Landau" && example.model!=="Hofstadter")
    .map(example => example.model)), new Set(["QWZ", "SSH"]), "Q08 v0.1 has exactly two supported topological profiles");
  const expectedCoordinates = {
    "ssh/standard": { axes: ["site index", "display y", "display z"], units: ["site index", "dimensionless", "dimensionless"] },
    "ssh/bands": { axes: ["k", "energy", "display z"], units: ["rad / cell spacing", "normalized energy (hbar=1)", "dimensionless"] },
    "qwz/standard": { axes: ["kx", "ky", "Berry curvature"], units: ["rad / lattice constant", "rad / lattice constant", "dimensionless (a=1)"] },
    "qwz/bands": { axes: ["kx", "ky", "energy"], units: ["rad / lattice constant", "rad / lattice constant", "normalized energy (hbar=1)"] },
  };
  const acceptedViews = new Set();
  const pairedViews = new Map();
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
    const peers = pairedViews.get(source.provenance.model) ?? [];
    peers.push({ source, fingerprint: sceneFingerprint(real) });
    pairedViews.set(source.provenance.model, peers);
    if (source.provenance.model === "ssh") {
      assert.equal(source.lattice, undefined, "1D SSH is supplied Geometry, not a fictitious 2D/3D lattice");
      assert.ok(real.mappedObjectIds.length > 0);
    }
    if (source.provenance.model === "qwz") {
      assert.ok(source.reciprocal, "QWZ handoff includes supplied primitive-zone guides");
      assert.equal(source.reciprocal.pointObject, "symmetry-points");
      assert.equal(source.reciprocal.basis.length, 2);
      assert.equal(source.reciprocal.reciprocalUnit, "rad / lattice constant");
      assert.ok(real.mappedObjectIds.includes(source.reciprocal.pointObject));
    }
    if (source.bands) {
      for (const [bandIndex, objectId] of source.bands.objects.entries()) {
        for (const sampleIndex of [0, Math.floor(real.arrays.get(source.bands.coordinates).length / 6),
          real.arrays.get(source.bands.coordinates).length / 3 - 1]) {
          const sample = inspectVerifiedBandSample(real, { fingerprint: sceneFingerprint(real), objectId, sampleIndex });
          const k = real.arrays.get(source.bands.coordinates);
          assert.deepEqual(sample.k, Array.from(k.slice(sampleIndex * 3, sampleIndex * 3 + 3)));
          assert.equal(sample.energy, real.arrays.get(source.bands.energies[bandIndex])[sampleIndex]);
          assert.equal(sample.energyDatasetId, source.bands.energies[bandIndex]);
          assert.equal(sample.coordinateDatasetId, source.bands.coordinates);
          assert.equal(sample.sampleId, `${objectId}:sample:${sampleIndex}`);
          assert.equal(sample.runId, source.provenance.runId);
          assert.equal(sample.energyUnit, source.bands.energyUnit);
        }
      }
      assert.throws(() => inspectVerifiedBandSample(real, { fingerprint: sceneFingerprint(real), objectId: source.bands.objects[0], sampleIndex: 961 }), /outside/);
      assert.throws(() => inspectVerifiedBandSample(real, { fingerprint: sceneFingerprint(real), objectId: "unrelated", sampleIndex: 0 }), /not mapped/);
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
  for (const [model, peers] of pairedViews) {
    assert.equal(peers.length, 2, `${model} requires standard and bands from one saved result`);
    assert.equal(peers.filter(peer => !!peer.source.bands).length, 1);
    assert.equal(new Set(peers.map(peer => peer.source.provenance.runId)).size, 1);
    assert.equal(new Set(peers.map(peer => peer.source.provenance.resultSha256)).size, 1);
    assert.equal(new Set(peers.map(peer => peer.source.provenance.engine)).size, 1);
    assert.deepEqual(peers[0].source.provenance.parameters, peers[1].source.provenance.parameters);
    assert.equal(new Set(peers.map(peer => peer.fingerprint)).size, 2, "Each view retains its own source fingerprint");
    assert.deepEqual(peers.flatMap(peer => peer.source.topology?.invariants.map(invariant => invariant.id) ?? []),
      [model === "qwz" ? "chern" : "winding"]);
  }
  const bhzDirectory=join(fixtureRoot,bundledQuantumSceneExample("bhz-bands").folder);
  const bhz=await importQuantumSceneBundle(bhzDirectory);
  const bhzResultBytes=await readFile(join(fixtureRoot,"bhz-producer-result.json"));
  const bhzResult=JSON.parse(bhzResultBytes.toString("utf8"));
  assert.equal(bhz.source.provenance.model,"bhz");
  assert.equal(bhz.source.provenance.resultSha256,hash(bhzResultBytes));
  assert.equal(bhz.source.provenance.runId,bhzResult.runId);
  assert.equal(bhz.source.bands.objects.length,4);
  assert.deepEqual(bhz.source.bands.labels,["Block occupied","Partner occupied","Block empty","Partner empty"]);
  assert.deepEqual(bhz.source.topology.invariants.map(item=>[item.id,item.value,item.status]),
    [["spin-z2",1,"verified"],["block-chern",1,"supplied"]]);
  assert.deepEqual(bhz.source.bands.grid,[21,21]);
  const bhzSample=inspectVerifiedBandSample(bhz,{fingerprint:sceneFingerprint(bhz),objectId:"band-0",sampleIndex:220});
  assert.equal(bhzSample.energy,bhzResult.analysis.bandEnergies[0][220]);
  assert.equal(bhzSample.runId,bhzResult.runId);
  const bhzChanged=join(root,"bhz-changed.qscene");
  await cp(bhzDirectory,bhzChanged,{recursive:true});
  const bhzBandPath=join(bhzChanged,"band-energy-0.f64"),bhzBytes=await readFile(bhzBandPath);
  bhzBytes[0]^=1;await writeFile(bhzBandPath,bhzBytes);
  await assert.rejects(importQuantumSceneBundle(bhzChanged),/integrity|hash/i);
  const bbhBytes=await readFile(join(fixtureRoot,"bbh-producer-result.json"));
  const bbhResult=JSON.parse(bbhBytes.toString("utf8"));
  const bbhBands=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("bbh-bands").folder));
  const bbhFinite=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("bbh-finite").folder));
  for(const scene of [bbhBands,bbhFinite]){
    assert.equal(scene.source.provenance.model,"bbh");
    assert.equal(scene.source.provenance.runId,bbhResult.runId);
    assert.equal(scene.source.provenance.resultSha256,hash(bbhBytes));
    assert.equal(scene.source.topology,undefined,"Finite corner density is not a quadrupole invariant");
  }
  assert.equal(bbhBands.source.bands.objects.length,4);
  assert.equal(inspectVerifiedBandSample(bbhBands,{fingerprint:sceneFingerprint(bbhBands),objectId:"band-0",sampleIndex:60}).energy,
    bbhResult.analysis.bandEnergies[0][60]);
  const cell=inspectVerifiedScalarSample(bbhFinite,{fingerprint:sceneFingerprint(bbhFinite),objectId:"finite-midgap-cells",sampleIndex:5});
  assert.equal(cell.value,bbhResult.analysis.finite.midgapDensity[5]);
  assert.deepEqual(cell.position,[1,1,0]);
  assert.equal(cell.valueDatasetId,"midgap-density");
  assert.equal(cell.sampleId,"finite-midgap-cells:sample:5");
  const displayPoints=bbhFinite.document.geometry.points.filter(point=>point.id?.startsWith("finite-midgap-cells:site:"));
  assert.equal(displayPoints.length,16);
  assert.ok(displayPoints[0].size>displayPoints[5].size,"Corner concentration must be visible as display-only marker size");
  assert.throws(()=>inspectVerifiedScalarSample(bbhFinite,{fingerprint:sceneFingerprint(bbhFinite),objectId:"finite-midgap-cells",sampleIndex:16}),/outside/);
  const bbhChanged=join(root,"bbh-changed.qscene");
  await cp(join(fixtureRoot,bundledQuantumSceneExample("bbh-finite").folder),bbhChanged,{recursive:true});
  const densityPath=join(bbhChanged,"midgap-density.f64"),densityBytes=await readFile(densityPath);
  densityBytes[0]^=1;await writeFile(densityPath,densityBytes);
  await assert.rejects(importQuantumSceneBundle(bbhChanged),/integrity|hash/i);
  const wilsonBytes=await readFile(join(fixtureRoot,"bbh-wilson-producer-result.json"));
  const wilsonResult=JSON.parse(wilsonBytes.toString("utf8"));
  const bbhWilson=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("bbh-wilson").folder));
  assert.equal(bbhWilson.source.provenance.runId,wilsonResult.runId);
  assert.equal(bbhWilson.source.provenance.resultSha256,hash(wilsonBytes));
  assert.equal(bbhWilson.source.topology.invariants.find(item=>item.id==="bbh-quadrupole").value,.5);
  assert.equal(bbhWilson.source.topology.invariants.find(item=>item.id==="bbh-quadrupole").status,"verified");
  const center=inspectVerifiedScalarSample(bbhWilson,{fingerprint:sceneFingerprint(bbhWilson),objectId:"wilson-x-negative",sampleIndex:8});
  assert.equal(center.value,wilsonResult.analysis.wilson.wannierX[0][8]);
  assert.equal(center.position[0],wilsonResult.analysis.bandKValues[8]);
  assert.equal(center.valueUnit,"cycle");
  const alteredWilson=join(root,"bbh-wilson-changed.qscene");
  await cp(join(fixtureRoot,bundledQuantumSceneExample("bbh-wilson").folder),alteredWilson,{recursive:true});
  const alteredCenters=join(alteredWilson,"wilson-x-negative-centers.f64"),centerBytes=await readFile(alteredCenters);
  centerBytes[0]^=1;await writeFile(alteredCenters,centerBytes);
  await assert.rejects(importQuantumSceneBundle(alteredWilson),/integrity|hash/i);
  const kitaevBytes=await readFile(join(fixtureRoot,"kitaev-producer-result.json"));
  const kitaevResult=JSON.parse(kitaevBytes.toString("utf8"));
  const kitaevBands=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("kitaev-bands").folder));
  const kitaevFinite=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("kitaev-finite").folder));
  for(const imported of [kitaevBands,kitaevFinite]){
    assert.equal(imported.source.provenance.model,"kitaev_chain");
    assert.equal(imported.source.provenance.runId,kitaevResult.runId);
    assert.equal(imported.source.provenance.resultSha256,hash(kitaevBytes));
    assert.equal(imported.source.topology,undefined,"Finite end density is not a topological invariant");
  }
  assert.equal(kitaevBands.source.bands.kind,"path");
  assert.equal(kitaevBands.source.bands.objects.length,2);
  const kSample=inspectVerifiedBandSample(kitaevBands,{fingerprint:sceneFingerprint(kitaevBands),objectId:"band-0",sampleIndex:25});
  assert.equal(kSample.k[0],kitaevResult.analysis.kValues[25]);
  assert.equal(kSample.energy,kitaevResult.analysis.lowerBand[25]);
  assert.equal(kSample.sampleId,"band-0:sample:25");
  const site=inspectVerifiedScalarSample(kitaevFinite,{fingerprint:sceneFingerprint(kitaevFinite),objectId:"finite-end-sites",sampleIndex:0});
  assert.equal(site.value,kitaevResult.analysis.finite.siteDensity[0]);
  assert.deepEqual(site.position,[0,0,0]);
  assert.equal(site.valueDatasetId,"near-zero-density");
  assert.equal(site.sampleId,"finite-end-sites:sample:0");
  assert.equal(kitaevFinite.document.geometry.points.filter(point=>point.id?.startsWith("finite-end-sites:site:")).length,16);
  assert.throws(()=>inspectVerifiedScalarSample(kitaevFinite,{fingerprint:sceneFingerprint(kitaevFinite),objectId:"finite-end-sites",sampleIndex:16}),/outside/);
  const kitaevChanged=join(root,"kitaev-changed.qscene");
  await cp(join(fixtureRoot,bundledQuantumSceneExample("kitaev-finite").folder),kitaevChanged,{recursive:true});
  const kitaevDensityPath=join(kitaevChanged,"near-zero-density.f64"),kitaevDensityBytes=await readFile(kitaevDensityPath);
  kitaevDensityBytes[0]^=1;await writeFile(kitaevDensityPath,kitaevDensityBytes);
  await assert.rejects(importQuantumSceneBundle(kitaevChanged),/integrity|hash/i);
  const invariantBytes=await readFile(join(fixtureRoot,"kitaev-invariant-producer-result.json"));
  const invariantResult=JSON.parse(invariantBytes.toString("utf8"));
  const invariantScene=await importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample("kitaev-invariant").folder));
  assert.equal(invariantScene.source.provenance.model,"kitaev_chain");
  assert.equal(invariantScene.source.provenance.runId,invariantResult.runId);
  assert.equal(invariantScene.source.provenance.resultSha256,hash(invariantBytes));
  assert.equal(invariantScene.source.topology.invariants[0].value,invariantResult.analysis.invariant.parity);
  assert.equal(invariantScene.source.topology.invariants[1].value,invariantResult.analysis.invariant.winding);
  const curve=inspectVerifiedScalarSample(invariantScene,{fingerprint:sceneFingerprint(invariantScene),objectId:"kitaev-bdg-curve",sampleIndex:25});
  assert.deepEqual(curve.position,[invariantResult.analysis.invariant.curveX[25],invariantResult.analysis.invariant.curveY[25],0]);
  assert.equal(curve.value,invariantResult.analysis.kValues[25]);
  assert.equal(curve.valueDatasetId,"momentum-samples");
  const changedInvariant=join(root,"kitaev-invariant-changed.qscene");
  await cp(join(fixtureRoot,bundledQuantumSceneExample("kitaev-invariant").folder),changedInvariant,{recursive:true});
  const curvePath=join(changedInvariant,"bdg-chiral-curve.f64"),curveBytes=await readFile(curvePath);
  curveBytes[0]^=1;await writeFile(curvePath,curveBytes);
  await assert.rejects(importQuantumSceneBundle(changedInvariant),/integrity|hash/i);
  const generalBytes=await readFile(join(fixtureRoot,"bhz-general-producer-result.json"));
  const generalResult=JSON.parse(generalBytes.toString("utf8"));
  const generalScenes=await Promise.all(["bhz-general-continuum","bhz-general-lattice"].map(id=>
    importQuantumSceneBundle(join(fixtureRoot,bundledQuantumSceneExample(id).folder))));
  for(const source of generalScenes){
    assert.equal(source.source.provenance.model,"bhz_general");
    assert.equal(source.source.provenance.runId,generalResult.runId);
    assert.equal(source.source.provenance.resultSha256,hash(generalBytes));
    assert.equal(source.source.bands.objects.length,4);
    assert.deepEqual(source.source.topology.invariants.map(item=>[item.id,item.value,item.status]),[["z2",1,"verified"]]);
  }
  assert.equal(generalScenes[0].source.reciprocal,undefined);
  assert.ok(generalScenes[1].source.reciprocal);
  assert.ok(generalScenes[1].source.objects.some(object=>object.id==="ribbon-states"));
  assert.equal(inspectVerifiedBandSample(generalScenes[0],{fingerprint:sceneFingerprint(generalScenes[0]),objectId:"band-0",sampleIndex:220}).energy,
    generalResult.analysis.continuumBandEnergies[0][220]);
  assert.equal(inspectVerifiedBandSample(generalScenes[1],{fingerprint:sceneFingerprint(generalScenes[1]),objectId:"band-0",sampleIndex:220}).energy,
    generalResult.analysis.latticeBandEnergies[0][220]);
  const alteredGeneral=join(root,"altered-general.qscene");
  await cp(join(fixtureRoot,bundledQuantumSceneExample("bhz-general-lattice").folder),alteredGeneral,{recursive:true});
  const alteredBand=join(alteredGeneral,"band-energy-0.f64"),alteredBytes=await readFile(alteredBand);
  alteredBytes[0]^=1;await writeFile(alteredBand,alteredBytes);
  await assert.rejects(importQuantumSceneBundle(alteredGeneral),/integrity|hash/i);
  const qwzDirectory = join(fixtureRoot, "run-97a132d1d712414bb62bb8c9212f517e.qscene");
  const qwz = await importQuantumSceneBundle(qwzDirectory);
  const display = qwz.document.extensions[qwz.source.schema].topologyDisplay;
  assert.deepEqual(qwz.mappedObjectIds.filter(id => id.startsWith("reciprocal-b")), ["reciprocal-b1", "reciprocal-b2"]);
  assert.equal(display.scalars[0].quantityId, "lower-curvature");
  assert.equal(display.scalars[0].faceBins.length, 800);
  assert.ok(display.scalars[0].minimum < 0 && display.scalars[0].maximum > 0);
  assert.ok(display.scalars[0].faceBins.some(bin => bin < 3));
  assert.ok(display.scalars[0].faceBins.some(bin => bin > 3));
  assert.deepEqual(glyphSampleIndices(961), glyphSampleIndices(961));
  assert.deepEqual([glyphSampleIndices(961)[0], glyphSampleIndices(961).at(-1)], [0, 960]);
  assert.equal(new Set(glyphSampleIndices(961)).size, 128);
  for (const sampleIndex of [0, 220, 440]) {
    const sample = inspectVerifiedTopologySample(qwz, { fingerprint: sceneFingerprint(qwz),
      quantityId: "lower-curvature", sampleIndex });
    assert.equal(sample.value, qwz.arrays.get("curvature")[sampleIndex]);
    assert.deepEqual(sample.position, Array.from(qwz.arrays.get("curvature-grid").slice(3 * sampleIndex, 3 * sampleIndex + 3)));
    assert.equal(sample.valueUnit, "dimensionless (a=1)");
    assert.equal(sample.runId, qwz.source.provenance.runId);
  }
  for (const [objectId, expected] of [["reciprocal-b1", [2 * Math.PI, 0, 0]],
    ["reciprocal-b2", [0, 2 * Math.PI, 0]]]) {
    const sample = inspectVerifiedVectorSample(qwz, { fingerprint: sceneFingerprint(qwz), objectId, sampleIndex: 0 });
    assert.deepEqual(sample.value, expected);
    assert.equal(sample.valueUnit, "rad / lattice constant");
    assert.deepEqual(display.vectors.find(item => item.objectId === objectId).glyphs[0].direction,
      expected.map(value => value / (2 * Math.PI)));
  }
  assert.throws(() => inspectVerifiedTopologySample(qwz, { fingerprint: sceneFingerprint(qwz),
    quantityId: "lower-curvature", sampleIndex: 441 }), /outside/);
  assert.throws(() => inspectVerifiedVectorSample(qwz, { fingerprint: sceneFingerprint(qwz),
    objectId: "berry-curvature", sampleIndex: 0 }), /not mapped/);
  const qwzTamper = join(root, "qwz-topology-tamper.qscene");
  await cp(qwzDirectory, qwzTamper, { recursive: true });
  const damagedCurvature = Buffer.from(await readFile(join(qwzTamper, "curvature.f64")));
  damagedCurvature[0] ^= 1;
  await writeFile(join(qwzTamper, "curvature.f64"), damagedCurvature);
  await assert.rejects(importQuantumSceneBundle(qwzTamper), /integrity/);
  const syntheticVectors = join(root, "synthetic-pseudospin.qscene");
  await cp(qwzDirectory, syntheticVectors, { recursive: true });
  const syntheticScene = JSON.parse(await readFile(join(syntheticVectors, "scene.json"), "utf8"));
  const pseudospin = Buffer.alloc(441 * 3 * 8);
  for (let index = 0; index < 441; index++) {
    const vector = index === 0 ? [0, 0, 0] : index % 2 ? [0, 1, 0] : [1, 0, 0];
    vector.forEach((component, axis) => pseudospin.writeDoubleLE(component, 8 * (3 * index + axis)));
  }
  syntheticScene.datasets.push({ id: "synthetic-pseudospin-values", path: "synthetic-pseudospin.f64",
    format: "f64le", count: 441, components: 3, unit: "dimensionless", bytes: pseudospin.length,
    sha256: hash(pseudospin) });
  syntheticScene.objects.push({ id: "synthetic-pseudospin", label: "Synthetic pseudospin test field",
    kind: "vectors", positions: "curvature-grid", values: "synthetic-pseudospin-values", visible: true,
    style: { color: "#26a0ff", opacity: 1, size: 1 } });
  syntheticScene.topology.quantities.push({ id: "synthetic-pseudospin-quantity", label: "Synthetic pseudospin",
    kind: "pseudospin", object: "synthetic-pseudospin", dataset: "synthetic-pseudospin-values",
    convention: "Synthetic fixture in declared source axes; not a physical QWZ result" });
  const syntheticMetadata = Buffer.from(JSON.stringify(syntheticScene, null, 2) + "\n");
  await writeFile(join(syntheticVectors, "synthetic-pseudospin.f64"), pseudospin);
  await writeFile(join(syntheticVectors, "scene.json"), syntheticMetadata);
  await writeFile(join(syntheticVectors, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: syntheticMetadata.length, sha256: hash(syntheticMetadata) } }, null, 2) + "\n");
  const synthetic = await importQuantumSceneBundle(syntheticVectors);
  const syntheticDisplay = synthetic.document.extensions[synthetic.source.schema].topologyDisplay.vectors
    .find(item => item.objectId === "synthetic-pseudospin");
  assert.equal(syntheticDisplay.count, 441);
  assert.equal(syntheticDisplay.zeroCount, 1);
  assert.equal(syntheticDisplay.glyphs.length, 127);
  assert.equal(syntheticDisplay.glyphs.at(-1).sampleIndex, 440);
  assert.deepEqual(syntheticDisplay.glyphs.at(-1).direction, [1, 0, 0]);
  assert.deepEqual(inspectVerifiedVectorSample(synthetic, { fingerprint: sceneFingerprint(synthetic),
    objectId: "synthetic-pseudospin", sampleIndex: 1 }).value, [0, 1, 0]);
  const damagedPseudospin = Buffer.from(pseudospin);
  damagedPseudospin[8] ^= 1;
  await writeFile(join(syntheticVectors, "synthetic-pseudospin.f64"), damagedPseudospin);
  await assert.rejects(reopenQuantumSceneReference({ directory: syntheticVectors,
    sceneFingerprint: sceneFingerprint(synthetic) }), /integrity/);
  console.log("M3D-Q07 QWZ scalar sign, vector orientation, exact samples, density IDs and tamper refusal passed");
  const largeBands = await writeLargeBandFixture(
    join(fixtureRoot, "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene"),
    join(root, "large-bands.qscene"));
  const large = await importQuantumSceneBundle(largeBands);
  assert.deepEqual(large.source.bands.grid, [31, 31]);
  assert.equal(large.arrays.get(large.source.bands.coordinates).length / 3, 961);
  assert.equal(large.document.geometry.triangles.length, 900);
  assert.equal(large.document.extensions[large.source.schema].bandLodStride, 2);
  assert.deepEqual(large.document.extensions[large.source.schema].mappedTriangleCounts,
    { "band-0": 450, "band-1": 450 });
  assert.deepEqual(large.mappedObjectIds.filter(id => id.startsWith("band-")), ["band-0", "band-1"]);
  const last = inspectVerifiedBandSample(large, { fingerprint: sceneFingerprint(large), objectId: "band-1", sampleIndex: 960 });
  assert.equal(last.sampleId, "band-1:sample:960");
  assert.equal(last.energyDatasetId, "band-energy-1");
  assert.throws(() => inspectVerifiedBandSample(large, { fingerprint: sceneFingerprint(large), objectId: "band-1", sampleIndex: 961 }), /outside/);

  const orbitalRoot = resolve("tests/fixtures/quantum-scene-orbitals");
  const orbitals = [
    ["1s", 1, 0, 0, "complex", 8, 0.1],
    ["2s", 2, 0, 0, "complex", 12, 0.01],
    ["2p", 2, 1, 1, "complex", 16, 0.1],
    ["3p", 3, 1, 1, "real_cos", 24, 0.1],
    ["3d", 3, 2, 2, "complex", 18, 0.1],
  ];
  for (const [name, n, l, m, basis, radius, level] of orbitals) {
    const folder = `orbital-${name}.qscene`;
    const real = await importQuantumSceneBundle(join(orbitalRoot, folder));
    assert.equal(real.source.provenance.model, "hydrogenic");
    assert.deepEqual(real.source.coordinates.units, ["a0", "a0", "a0"]);
    assert.deepEqual(real.source.provenance.parameters, { n, l, m, basis, Z: 1, radius, grid: 21 });
    const camera = real.document.cameras[0];
    assert.deepEqual(camera.target, { x: 0, y: 0, z: 0 });
    const cameraDistance = Math.hypot(camera.position.x, camera.position.y, camera.position.z);
    assert.ok(Number.isFinite(cameraDistance) && cameraDistance > 0 && cameraDistance < radius * 10,
      `Hydrogenic ${name} source camera is outside the bounded field view`);
    assert.deepEqual(real.source.fields?.[0]?.grid.shape, [21, 21, 21]);
    assert.deepEqual(real.deferredFieldIds, ["wavefunction"]);
    const request = { fingerprint: sceneFingerprint(real), fieldId: "wavefunction", axis: 2, index: 10, quantity: "density" };
    const slice = renderVerifiedFieldSlice(real, request);
    assert.deepEqual([slice.width, slice.height, slice.unit, slice.rgba.length], [21, 21, "a0^-3", 21 * 21 * 4]);
    const center = inspectVerifiedFieldSample(real, { ...request, u: 10, v: 10 });
    assert.deepEqual(center.position, [0, 0, 0]);
    const surface = deriveVerifiedFieldSurface(real, { fingerprint: sceneFingerprint(real), fieldId: "wavefunction", level });
    const grid = await deriveVerifiedFieldVolume(real, { fingerprint: sceneFingerprint(real), fieldId: "wavefunction",
      quantity: "density", requestId: `orbital-${name}` });
    assert.deepEqual(grid.shape, [21, 21, 21]);
    assert.deepEqual(grid.coordinateUnits, ["a0", "a0", "a0"]);
    assert.equal(grid.valueUnit, "a0^-3");
    assert.equal(grid.sourceHashes.length, 2);
    assert.ok(grid.values.every(Number.isFinite));
    assert.ok(surface.triangleCount > 0 && surface.triangleCount <= 20_000);
    assert.equal(surface.indices.length, surface.triangleCount * 3);
    assert.equal(surface.positions.length, surface.normals.length);
    assert.deepEqual(surface.coordinateUnits, ["a0", "a0", "a0"]);
    assert.equal(surface.unit, "a0^-3");
    assert.ok(Math.abs(surface.threshold / surface.maximum - level) < 1e-14);
    assert.ok(surface.positions.every(value => Number.isFinite(value) && Math.abs(value) <= radius));
    assert.equal(surface.phaseBins.length, surface.triangleCount);
    assert.equal(surface.realSignBins.length, surface.triangleCount);
    assert.ok([...surface.phaseBins].every(bin => bin >= 0 && bin <= 8));
    assert.ok([...surface.realSignBins].every(bin => bin >= 0 && bin <= 2));
    assert.throws(() => deriveVerifiedFieldSurface(real, { fingerprint: sceneFingerprint(real), fieldId: "wavefunction", level: 0.0001 }), /threshold/);
    if (name === "1s") {
      assert.ok(Math.abs(center.value - 1 / Math.PI) < 1e-12, "Hydrogenic 1s center density disagrees with analytic value");
      assert.deepEqual([...new Set(surface.realSignBins)], [1]);
    } else if (name === "2s") {
      assert.ok(Math.abs(center.value - 1 / (8 * Math.PI)) < 1e-12, "Hydrogenic 2s center density disagrees with analytic value");
      assert.deepEqual(new Set(surface.realSignBins), new Set([0, 1]), "2s radial sign change was lost");
      assert.deepEqual(new Set(surface.phaseBins), new Set([0, 4]), "2s real phase jump was lost");
    } else {
      assert.equal(center.value, 0, `Hydrogenic ${name} has a central node`);
      assert.equal(inspectVerifiedFieldSample(real, { ...request, quantity: "phase", u: 10, v: 10 }).value, null);
      if (name === "2p") assert.ok(inspectVerifiedFieldSample(real, { ...request, u: 11, v: 10 }).value > 0);
      assert.deepEqual(new Set(surface.realSignBins), new Set([0, 1]));
      assert.deepEqual(new Set(surface.phaseBins), basis === "real_cos" ? new Set([0, 4]) : new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    }
  }
  console.log("M3D-Q02 real Theory Lab 1s/2s/2p/3p/3d fields, units, nodes and phase/sign surface bins passed");

  const orbitalTamper = join(root, "orbital-tamper.qscene");
  await cp(join(orbitalRoot, "orbital-3d.qscene"), orbitalTamper, { recursive: true });
  const damagedOrbital = Buffer.from(await readFile(join(orbitalTamper, "psi-real.f64")));
  damagedOrbital[0] ^= 1;
  await writeFile(join(orbitalTamper, "psi-real.f64"), damagedOrbital);
  await assert.rejects(importQuantumSceneBundle(orbitalTamper), /integrity/);
  await assert.rejects(reopenQuantumSceneReference({ directory: orbitalTamper,
    sceneFingerprint: sceneFingerprint(await importQuantumSceneBundle(join(orbitalRoot, "orbital-3d.qscene"))) }), /integrity/);
  console.log("M3D-Q03 scalar/complex Volume conversion, five orbitals, cancellation and tamper refusal passed");

  const oneDimensionalDirectory = join(root, "one-dimensional-chain.qscene");
  await writeOneDimensionalChainFixture(oneDimensionalDirectory);
  const oneDimensional = await importQuantumSceneBundle(oneDimensionalDirectory);
  assert.equal(oneDimensional.source.lattice, undefined);
  assert.deepEqual(oneDimensional.mappedObjectIds, ["chain-sites-object", "chain-links-object"]);
  assert.equal(oneDimensional.document.geometry.points.length, 4);
  assert.equal(oneDimensional.document.geometry.segments.length, 3);

  for (const family of ["square", "honeycomb", "simple_cubic"]) {
    const latticeDirectory = join(root, `lattice-${family}.qscene`);
    const fixture = await writeLatticeFixture(latticeDirectory, family);
    const verified = await importQuantumSceneBundle(latticeDirectory);
    const lattice = verified.source.lattice;
    assert.ok(lattice && lattice.boundary === "open");
    assert.equal(lattice.dimensions, family === "simple_cubic" ? 3 : 2);
    assert.deepEqual(lattice.repeats, fixture.scene.lattice.repeats);
    const samples = verified.document.extensions["quantum-scene/v1"].latticeSamples;
    assert.equal(samples.length, fixture.arrays.basisIndices.length);
    assert.deepEqual(samples[0], { sampleIndex: 0, cell: [0, 0, 0], basisIndex: 0 });
    assert.deepEqual(verified.document.geometry.points[0], {
      x: fixture.arrays.sites[0], y: fixture.arrays.sites[1], z: fixture.arrays.sites[2],
      id: "lattice-sites-object:site:0", label: "Supplied basis sites", color: 0x79d9c1, size: 0.15, opacity: 1,
    });
    assert.deepEqual(verified.source.coordinates.units, ["schematic spacing", "schematic spacing", "schematic spacing"]);
    assert.deepEqual((await reopenQuantumSceneReference({ directory: latticeDirectory,
      sceneFingerprint: sceneFingerprint(verified) })).imported.document.extensions["quantum-scene/v1"].latticeSamples, samples);
  }
  const latticeTamper = join(root, "lattice-tamper.qscene");
  await writeLatticeFixture(latticeTamper, "honeycomb");
  const alteredCell = Buffer.from(await readFile(join(latticeTamper, "site-cells.f64")));
  alteredCell[0] ^= 1;
  await writeFile(join(latticeTamper, "site-cells.f64"), alteredCell);
  await assert.rejects(importQuantumSceneBundle(latticeTamper), /integrity/);
  console.log("M3D-Q04 open square/honeycomb/cubic lattice identity, 1D chain/SSH Geometry and tamper refusal passed");

  for (const family of ["square", "honeycomb", "simple_cubic"]) {
    const reciprocalDirectory = join(root, `reciprocal-${family}.qscene`);
    const { scene: reciprocalFixture } = await writeReciprocalFixture(reciprocalDirectory, family);
    const verified = await importQuantumSceneBundle(reciprocalDirectory);
    assert.deepEqual(verified.source.reciprocal, reciprocalFixture.reciprocal);
    assert.equal(verified.source.reciprocal.directBasis.length, family === "simple_cubic" ? 3 : 2);
    assert.equal(verified.source.reciprocal.reciprocalUnit, "rad / schematic primitive spacing");
    assert.ok(verified.mappedObjectIds.includes("symmetry-points"));
    assert.ok(verified.mappedObjectIds.includes("primitive-bz"));
    assert.equal(verified.document.geometry.points.length, reciprocalFixture.reciprocal.points.length);
    assert.deepEqual((await reopenQuantumSceneReference({ directory: reciprocalDirectory,
      sceneFingerprint: sceneFingerprint(verified) })).imported.source.reciprocal, verified.source.reciprocal);
  }
  const reciprocalTamper = join(root, "reciprocal-tamper.qscene");
  await writeReciprocalFixture(reciprocalTamper, "honeycomb");
  const kBytes = Buffer.from(await readFile(join(reciprocalTamper, "symmetry-points.f64")));
  kBytes[0] ^= 1;
  await writeFile(join(reciprocalTamper, "symmetry-points.f64"), kBytes);
  await assert.rejects(importQuantumSceneBundle(reciprocalTamper), /integrity/);
  const sshDirectory=join(root,"reciprocal-ssh.qscene");
  const {scene:sshFixture}=await writeReciprocalFixture(sshDirectory,"ssh");
  const ssh=await importQuantumSceneBundle(sshDirectory);
  assert.equal(ssh.source.schema,"quantum-scene/v2");
  assert.deepEqual(ssh.source.reciprocal,sshFixture.reciprocal);
  assert.deepEqual(ssh.source.reciprocal.basis,[[2*Math.PI,0,0]]);
  assert.equal(ssh.document.metadata.sourceFormat,"quantum-scene/v2");
  assert.ok(ssh.document.extensions["quantum-scene/v2"]);
  assert.deepEqual((await reopenQuantumSceneReference({directory:sshDirectory,
    sceneFingerprint:sceneFingerprint(ssh)})).imported.source.reciprocal,ssh.source.reciprocal);
  const legacySsh=structuredClone(sshFixture);legacySsh.schema="quantum-scene/v1";
  const {assertScene}=require("../dist/main/quantumScene/index.js");
  assert.throws(()=>assertScene(legacySsh),/directBasis/);
  const offAxis=structuredClone(sshFixture);offAxis.reciprocal.points[0].position[1]=.1;
  assert.throws(()=>assertScene(offAxis),/declared k axis/);
  const sshTamper=join(root,"reciprocal-ssh-tamper.qscene");
  await cp(sshDirectory,sshTamper,{recursive:true});
  const sshBytes=Buffer.from(await readFile(join(sshTamper,"primitive-bz.f64")));sshBytes[0]^=1;
  await writeFile(join(sshTamper,"primitive-bz.f64"),sshBytes);
  await assert.rejects(importQuantumSceneBundle(sshTamper),/integrity/);
  console.log("M3D-Q05 supplied 1D SSH, square/honeycomb/cubic reciprocal guides, units, restart and tamper refusal passed");

  const copied = join(root, "real-lab-tamper.qscene");
  await cp(join(fixtureRoot, fixtureNames[0]), copied, { recursive: true });
  const copiedScene = JSON.parse(await readFile(join(copied, "scene.json"), "utf8"));
  const artifact = join(copied, copiedScene.datasets[0].path);
  const damaged = Buffer.from(await readFile(artifact));
  damaged[0] ^= 1;
  await writeFile(artifact, damaged);
  await assert.rejects(importQuantumSceneBundle(copied), /integrity/);
  console.log("M3D-Q01 four frozen QWZ/SSH bundles plus BHZ, BBH and Kitaev, units and tamper refusal passed");

  if (process.argv[2]) {
    const real = await importQuantumSceneBundle(process.argv[2]);
    assert.ok(["quantum-scene/v1","quantum-scene/v2"].includes(real.source.schema));
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
