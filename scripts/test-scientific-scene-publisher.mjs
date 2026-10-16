import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const { readScientificSceneBundle } = await import("../dist/main/scientificScene/bundle.js");
const { inspectScientificHeightSample } = await import("../dist/main/scientificScene/heightSurface.js");
const { openScientificGraphDatasets } = await import("../dist/main/scientificScene/graphDataset.js");
const { normalizeScientificSceneManifest } = await import("../dist/shared/scientificSceneManifest.js");
const root = resolve(".");
const publisher = join(root, "integrations", "python", "scientific_scene_publisher.py");
const python = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runPublisher = (specPath, outputPath) =>
  JSON.parse(execFileSync(python, [publisher, "--spec", specPath, "--output", outputPath], { encoding: "utf8" }));
const base = {
  sceneId: "python-scalar", title: "Python supplied field", producer: "python",
  sourceId: "cross-language-test", sourceSchema: "python-data/v1", coordinateKind: "cartesian",
  axes: [{ name: "x", unit: "m" }, { name: "y", unit: "m" }],
  origin: [-1, 2], spacing: [0.5, 0.25], periodic: [false, false], shape: [3, 4],
  datasetId: "temperature", quantity: { name: "temperature", unit: "K", symbol: "T" },
  real: Array.from({ length: 12 }, (_, index) => index + 0.25),
};
const rootTemp = await mkdtemp(join(tmpdir(), "math3d-ssr05-"));
try {
  const scalarSpec = join(rootTemp, "scalar.json");
  const scalarPath = join(rootTemp, "python-scalar.sscene");
  await writeFile(scalarSpec, JSON.stringify(base));
  const scalarPublished = runPublisher(scalarSpec, scalarPath);
  const scalar = await readScientificSceneBundle(scalarPath);
  assert.equal(normalizeScientificSceneManifest(scalar.manifest).ok, true);
  assert.equal(scalar.fingerprint, scalarPublished.manifestSha256);
  assert.equal(scalarPublished.resourceBytes, 12 * 8);
  assert.equal(scalar.manifest.source.sha256, sha(scalar.resources.get("real")));
  assert.equal(scalar.resources.get("real").readDoubleLE(11 * 8), 11.25);
  const picked = await inspectScientificHeightSample(scalarPath, scalar.fingerprint, "temperature", 6);
  assert.deepEqual(picked.grid, [1, 2]);
  assert.deepEqual(picked.coordinates, [-0.5, 2.5]);
  assert.deepEqual(picked.coordinateUnits, ["m", "m"]);
  assert.equal(picked.value, 6.25);
  assert.equal(picked.sampleId, "python-scalar:temperature:6");

  const refusedExisting = spawnSync(python, [publisher, "--spec", scalarSpec, "--output", scalarPath], { encoding: "utf8" });
  assert.notEqual(refusedExisting.status, 0);
  assert.match(refusedExisting.stderr, /Output already exists/);
  assert.equal((await readScientificSceneBundle(scalarPath)).fingerprint, scalar.fingerprint);

  const scalar3dSpec = join(rootTemp, "scalar3d.json");
  const scalar3dPath = join(rootTemp, "python-scalar3d.sscene");
  await writeFile(scalar3dSpec, JSON.stringify({ ...base, sceneId: "python-scalar3d", shape: [2, 2, 2],
    axes: [...base.axes, { name: "z", unit: "m" }], origin: [-1, 2, 0], spacing: [0.5, 0.25, 1],
    periodic: [false, false, false], real: Array.from({ length: 8 }, (_, index) => index) }));
  runPublisher(scalar3dSpec, scalar3dPath);
  const scalar3d = await readScientificSceneBundle(scalar3dPath);
  assert.equal(normalizeScientificSceneManifest(scalar3d.manifest).ok, true);
  assert.deepEqual(scalar3d.manifest.views[0], { id: "default", label: "Scalar slice",
    dataset: "temperature", renderer: "slice", operation: "identity", axis: 2 });

  const complexSpec = join(rootTemp, "complex.json");
  const complexPath = join(rootTemp, "python-complex.sscene");
  const complex = { ...base, sceneId: "python-complex", shape: [3, 3, 3],
    axes: [...base.axes, { name: "z", unit: "m" }], origin: [-1, 2, 0], spacing: [0.5, 0.25, 1],
    periodic: [false, false, false], quantity: { name: "wave amplitude", unit: "1" },
    datasetId: "psi", real: Array.from({ length: 27 }, (_, index) => index / 10),
    imaginary: Array.from({ length: 27 }, (_, index) => -index / 20) };
  await writeFile(complexSpec, JSON.stringify(complex));
  runPublisher(complexSpec, complexPath);
  const verifiedComplex = await readScientificSceneBundle(complexPath);
  assert.equal(normalizeScientificSceneManifest(verifiedComplex.manifest).ok, true);
  assert.equal(verifiedComplex.manifest.datasets[0].semanticType, "complex-scalar-field");
  assert.equal(verifiedComplex.manifest.views[0].operation, "complex-density/v1");
  assert.equal(verifiedComplex.resources.get("imaginary").readDoubleLE(26 * 8), -1.3);
  assert.equal(verifiedComplex.manifest.source.sha256,
    sha(Buffer.concat([verifiedComplex.resources.get("real"), verifiedComplex.resources.get("imaginary")])));

  const graphBase = { ...base, sceneId: "python-graph", axes: [{ name: "time", unit: "s" }],
    origin: [2], spacing: [0.25], periodic: [false], shape: [4],
    quantity: { name: "amplitude", unit: "V" }, real: [0, 1, 0, -1] };
  const graphScalarSpec = join(rootTemp, "graph-scalar.json");
  const graphScalarPath = join(rootTemp, "python-graph-scalar.sscene");
  await writeFile(graphScalarSpec, JSON.stringify(graphBase));
  runPublisher(graphScalarSpec, graphScalarPath);
  const graphScalar = await openScientificGraphDatasets(graphScalarPath);
  assert.deepEqual(graphScalar.datasets, [{ datasetId: "temperature", component: "scalar", values: [0, 1, 0, -1] }]);

  const graphComplexSpec = join(rootTemp, "graph-complex.json");
  const graphComplexPath = join(rootTemp, "python-graph-complex.sscene");
  await writeFile(graphComplexSpec, JSON.stringify({ ...graphBase, sceneId: "python-graph-complex",
    imaginary: [1, 0, -1, 0] }));
  runPublisher(graphComplexSpec, graphComplexPath);
  const graphComplex = await openScientificGraphDatasets(graphComplexPath);
  const complexBundle = await readScientificSceneBundle(graphComplexPath);
  assert.equal(normalizeScientificSceneManifest(complexBundle.manifest).ok, true);
  assert.deepEqual(complexBundle.manifest.views, []);
  assert.deepEqual(graphComplex.datasets, [
    { datasetId: "temperature", component: "real", values: [0, 1, 0, -1] },
    { datasetId: "temperature", component: "imaginary", values: [1, 0, -1, 0] },
  ]);
  assert.equal(complexBundle.manifest.source.sha256,
    sha(Buffer.concat([complexBundle.resources.get("real"), complexBundle.resources.get("imaginary")])));

  const graphVectorSpec = join(rootTemp, "graph-vector.json");
  const graphVectorPath = join(rootTemp, "python-graph-vector.sscene");
  const vectorBase = { ...graphBase, sceneId: "python-graph-vector", datasetId: "velocity",
    quantity: { name: "velocity", unit: "m/s" } };
  delete vectorBase.real;
  const vectorSpec = { ...vectorBase, components: [
    { name: "east", values: [2, 3, 4, 5] }, { name: "north", values: [5, 4, 3, 2] },
  ] };
  await writeFile(graphVectorSpec, JSON.stringify(vectorSpec));
  runPublisher(graphVectorSpec, graphVectorPath);
  const graphVector = await openScientificGraphDatasets(graphVectorPath);
  const vectorBundle = await readScientificSceneBundle(graphVectorPath);
  assert.equal(normalizeScientificSceneManifest(vectorBundle.manifest).ok, true);
  assert.deepEqual(vectorBundle.manifest.datasets[0].components, [
    { name: "east", resource: "east" }, { name: "north", resource: "north" },
  ]);
  assert.deepEqual(graphVector.datasets, [
    { datasetId: "velocity", component: "east", values: [2, 3, 4, 5] },
    { datasetId: "velocity", component: "north", values: [5, 4, 3, 2] },
  ]);
  assert.equal(vectorBundle.manifest.source.sha256,
    sha(Buffer.concat([vectorBundle.resources.get("east"), vectorBundle.resources.get("north")])));

  const invalidVectorSpec = join(rootTemp, "invalid-vector.json");
  const invalidVectorPath = join(rootTemp, "invalid-vector.sscene");
  await writeFile(invalidVectorSpec, JSON.stringify({ ...vectorSpec, components: [
    { name: "east", values: [2, 3, 4, 5] }, { name: "East", values: [5, 4, 3, 2] },
  ] }));
  const duplicate = spawnSync(python, [publisher, "--spec", invalidVectorSpec, "--output", invalidVectorPath], { encoding: "utf8" });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /Duplicate vector component/);
  await writeFile(invalidVectorSpec, JSON.stringify({ ...vectorSpec, components: [
    { name: "east", values: [2, 3, 4, 5] }, { name: "north", values: [5, 4, null, 2] },
  ] }));
  const badValue = spawnSync(python, [publisher, "--spec", invalidVectorSpec, "--output", invalidVectorPath], { encoding: "utf8" });
  assert.notEqual(badValue.status, 0);
  assert.match(badValue.stderr, /Invalid north\[2\]/);
  await assert.rejects(readScientificSceneBundle(invalidVectorPath));

  const malformedSpec = join(rootTemp, "malformed.json");
  const malformedOutput = join(rootTemp, "malformed.sscene");
  await writeFile(malformedSpec, JSON.stringify({ ...base, shape: [256, 256, 16] }));
  const oversized = spawnSync(python, [publisher, "--spec", malformedSpec, "--output", malformedOutput], { encoding: "utf8" });
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /Field sample limit exceeded/);
  await assert.rejects(readScientificSceneBundle(malformedOutput));
  await writeFile(malformedSpec, JSON.stringify({ ...base, real: [...base.real.slice(0, -1), null] }));
  const nonfinite = spawnSync(python, [publisher, "--spec", malformedSpec, "--output", malformedOutput], { encoding: "utf8" });
  assert.notEqual(nonfinite.status, 0);
  assert.match(nonfinite.stderr, /Invalid real\[11\]/);
  await writeFile(malformedSpec, JSON.stringify({ ...base, view: { id: "bad", label: "bad", renderer: "height-surface", operation: "formula" } }));
  const unregistered = spawnSync(python, [publisher, "--spec", malformedSpec, "--output", malformedOutput], { encoding: "utf8" });
  assert.notEqual(unregistered.status, 0);
  assert.match(unregistered.stderr, /Unsupported two-dimensional view/);
  await writeFile(malformedSpec, JSON.stringify({ ...base, title: "😀".repeat(100) }));
  const overlongUtf16 = spawnSync(python, [publisher, "--spec", malformedSpec, "--output", malformedOutput], { encoding: "utf8" });
  assert.notEqual(overlongUtf16.status, 0);
  assert.match(overlongUtf16.stderr, /Invalid title/);

  const resource = join(scalarPath, "real.f64");
  const original = await readFile(resource);
  const damaged = Buffer.from(original); damaged[0] ^= 1;
  await writeFile(resource, damaged);
  await assert.rejects(readScientificSceneBundle(scalarPath), /resource integrity/);
  await writeFile(resource, original);
  const manifest = join(scalarPath, "manifest.json");
  const originalManifest = await readFile(manifest);
  const damagedManifest = Buffer.from(originalManifest); damagedManifest[0] ^= 1;
  await writeFile(manifest, damagedManifest);
  await assert.rejects(readScientificSceneBundle(scalarPath), /manifest integrity/);
  console.log("SSR-05 Python publisher 1D Graph scalar/complex/vector and 2D/3D field compatibility, bounds, non-overwrite and tamper tests passed");
} finally {
  if (!rootTemp.startsWith(resolve(tmpdir()) + sep) || !rootTemp.includes("math3d-ssr05-"))
    throw new Error("Unsafe scientific publisher test cleanup path");
  await rm(rootTemp, { recursive: true, force: true });
}
