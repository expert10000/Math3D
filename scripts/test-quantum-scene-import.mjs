import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { writeLatticeFixture, writeOneDimensionalChainFixture } from "./quantum-lattice-fixtures.mjs";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { rememberQuantumScene, reopenRecentQuantumScene, reopenQuantumSceneReference, sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { quantumSceneLaunchDirectory } = require("../dist/main/ipc/quantumSceneIpc.js");
const { renderVerifiedFieldSlice, inspectVerifiedFieldSample } = require("../dist/main/quantumScene/fieldSlice.js");
const { deriveVerifiedFieldSurface } = require("../dist/main/quantumScene/fieldSurface.js");
const { deriveVerifiedFieldVolume } = require("../dist/main/quantumScene/fieldVolume.js");
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
  await writeScene({...scene,schema:"quantum-scene/v2"});
  await assert.rejects(importQuantumSceneBundle(directory),/Invalid quantum-scene\/v1/);
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
    if (source.provenance.model === "ssh") {
      assert.equal(source.lattice, undefined, "1D SSH is supplied Geometry, not a fictitious 2D/3D lattice");
      assert.ok(real.mappedObjectIds.length > 0);
    }
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
