import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateScientificScalarDerivative, createGraph2DFieldReference,
  createScientificFieldDocument, deriveVerifiedScientificScalarPlane,
  deriveVerifiedScientificScalarVolume, sha256Checksum,
  type Graph2DScientificPlane, type Graph2DScientificVolume } from "@math3d/core";

const fixture = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/sincos.sscene/", import.meta.url));
const manifestJson = readFileSync(`${fixture}manifest.json`, "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const reference = createGraph2DFieldReference(manifestJson, fingerprint,
  { kind: "preset", value: "sincos" }, "f", "scalar");
const bytes = readFileSync(`${fixture}values.f64`);
const plane: Graph2DScientificPlane = { fingerprint, datasetId: "f", component: "scalar",
  sourceShape: [17, 17], normalAxis: null, fixedIndex: null, planeAxes: [0, 1],
  shape: [17, 17], resourceSha256: reference.resourceSha256,
  planeSha256: sha256Checksum(bytes).slice(7),
  values: Array.from({ length: 17 * 17 }, (_, index) => bytes.readDoubleLE(index * 8)) };
const document = (operation: "gradient-x" | "gradient-y" | "gradient-magnitude" | "laplacian") =>
  createScientificFieldDocument({ reference, derivation: { operation },
    quantity: { name: "scalar value", unit: "1" },
    display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "data" } } },
  { stableKey: ["sincos-derived", operation] });

describe("independent verified scalar calculus", () => {
  it("matches the bundled scalar preset oracles after checksum verification", () => {
    for (const [name, expected] of [["quadratic-potential", 4], ["saddle-potential", 0]] as const) {
      const folder = fileURLToPath(new URL(`../../../tests/fixtures/scientific-scene/${name}.sscene/`, import.meta.url));
      const manifest = readFileSync(`${folder}manifest.json`, "utf8");
      const hash = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
      const ref = createGraph2DFieldReference(manifest, hash, { kind: "preset", value: name }, "field", "scalar");
      const data = readFileSync(`${folder}scalar.f64`);
      const values = Array.from({ length: ref.shape[0] * ref.shape[1] }, (_, index) => data.readDoubleLE(index * 8));
      const source = createScientificFieldDocument({ reference: ref, derivation: { operation: "laplacian" },
        quantity: { name: "Potential", unit: "V" },
        display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "data" } } },
      { stableKey: name });
      const result = deriveVerifiedScientificScalarPlane(source, manifest, hash, {
        fingerprint: hash, datasetId: "field", component: "scalar", sourceShape: ref.shape,
        normalAxis: null, fixedIndex: null, planeAxes: [0, 1], shape: [ref.shape[0], ref.shape[1]],
        resourceSha256: ref.resourceSha256, planeSha256: sha256Checksum(data).slice(7), values });
      expect(result.plane.values.every(value => Math.abs(value - expected) < 1e-9)).toBe(true);
      expect(result.unit).toBe("(V)/m²");
    }
    const folder = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/gaussian-bump.sscene/", import.meta.url));
    const manifest = readFileSync(`${folder}manifest.json`, "utf8");
    const hash = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
    const ref = createGraph2DFieldReference(manifest, hash, { kind: "preset", value: "gaussianBump" },
      "field", "scalar");
    const data = readFileSync(`${folder}scalar.f64`);
    const values = Array.from({ length: 41 * 41 }, (_, index) => data.readDoubleLE(index * 8));
    const source = createScientificFieldDocument({ reference: ref, derivation: { operation: "laplacian" },
      quantity: { name: "Amplitude", unit: "1" },
      display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "data" } } },
    { stableKey: "gaussian-bump" });
    const result = deriveVerifiedScientificScalarPlane(source, manifest, hash, {
      fingerprint: hash, datasetId: "field", component: "scalar", sourceShape: ref.shape,
      normalAxis: null, fixedIndex: null, planeAxes: [0, 1], shape: [41, 41],
      resourceSha256: ref.resourceSha256, planeSha256: sha256Checksum(data).slice(7), values });
    expect(result.plane.values[20 * 41 + 20]).toBeLessThan(-1.9);
    expect(result.plane.values[20 * 41 + 20]).toBeGreaterThan(-2.1);
  });

  it("matches the bundled 3D quadratic Laplacian on its verified volume", () => {
    const folder = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/quadratic-volume.sscene/", import.meta.url));
    const manifest = readFileSync(`${folder}manifest.json`, "utf8");
    const hash = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
    const ref = createGraph2DFieldReference(manifest, hash, { kind: "preset", value: "quadraticVolume" },
      "field", "scalar");
    const data = readFileSync(`${folder}scalar.f64`);
    const values = Array.from({ length: 17 ** 3 }, (_, index) => data.readDoubleLE(index * 8));
    const source = createScientificFieldDocument({ reference: ref, derivation: { operation: "laplacian" },
      quantity: { name: "Potential", unit: "V" },
      display: { view: "volume", normalAxis: 2, fixedIndex: 8, transfer: { mode: "data" } } },
    { stableKey: "quadratic-volume" });
    const result = deriveVerifiedScientificScalarVolume(source, manifest, hash, {
      fingerprint: hash, datasetId: "field", component: "scalar", sourceShape: [17, 17, 17],
      sampleShape: [17, 17, 17], resourceSha256: ref.resourceSha256,
      sampleSha256: sha256Checksum(data).slice(7), values });
    expect(result.volume.values.every(value => Math.abs(value - 6) < 1e-9)).toBe(true);
    expect(result.unit).toBe("(V)/m²");
  });
  it("uses physical coordinates and quadratic boundary stencils on 2D and 3D fields", () => {
    const xy = [-2, -1, 0, 1, 2], values2d = xy.flatMap(x => xy.map(y => x * x + y * y));
    const gradient = calculateScientificScalarDerivative(values2d, [xy, xy], "gradient-x");
    const laplacian = calculateScientificScalarDerivative(values2d, [xy, xy], "laplacian");
    expect(gradient.values[3 * 5 + 2]).toBeCloseTo(2, 10);
    expect(gradient.values[0 * 5 + 2]).toBeCloseTo(-4, 10);
    expect(laplacian.values.every(value => Math.abs(value - 4) < 1e-10)).toBe(true);
    expect(laplacian.boundarySamples).toBe(16);
    const z = [-3, 0, 3], values3d = xy.flatMap(x => xy.flatMap(y => z.map(t => x*x + y*y + t*t)));
    const volume = calculateScientificScalarDerivative(values3d, [xy, xy, z], "laplacian");
    expect(volume.values.every(value => Math.abs(value - 6) < 1e-10)).toBe(true);
    expect(calculateScientificScalarDerivative(values3d, [xy, xy, z], "gradient-magnitude")
      .values[(3 * 5 + 2) * 3 + 1]).toBeCloseTo(2, 10);
    const sampledX = Array.from({ length: 32 }, (_, index) => Math.round(index * 33 / 31));
    const sampledValues = sampledX.flatMap(x => xy.flatMap(y => z.map(t => x*x + y*y + t*t)));
    expect(calculateScientificScalarDerivative(sampledValues, [sampledX, xy, z], "laplacian")
      .values.every(value => Math.abs(value - 6) < 1e-10)).toBe(true);
  });

  it("checks source bytes before a derived plane is exposed", () => {
    const result = deriveVerifiedScientificScalarPlane(document("laplacian"),
      manifestJson, fingerprint, plane);
    expect(result.plane.values).toHaveLength(289);
    expect(result.resultChecksum).not.toBe(result.sourceChecksum);
    expect(result.unit).toBe("1");
    expect(result.boundarySamples).toBeGreaterThan(0);
    expect(() => deriveVerifiedScientificScalarPlane(document("gradient-x"),
      manifestJson, fingerprint, { ...plane, values: plane.values.map((value, index) =>
        index === 0 ? value + 1 : value) })).toThrow(/checksum/);
    expect(() => deriveVerifiedScientificScalarPlane(document("laplacian"),
      manifestJson, "0".repeat(64), plane)).toThrow(/fingerprint/);
  });

  it("checks a bounded 3D transfer and keeps its source checksum separate", () => {
    const source = JSON.parse(manifestJson);
    source.sceneId = "quadratic-volume";
    source.coordinates[0].axes.push({ name: "z", unit: "1" });
    source.coordinates[0].origin = [-2, -2, -2];
    source.coordinates[0].spacing = [1, 1, 1];
    source.coordinates[0].periodic.push(false);
    source.datasets[0].shape = [5, 5, 5];
    source.views = [];
    const grid = [-2, -1, 0, 1, 2];
    const values = grid.flatMap(x => grid.flatMap(y => grid.map(z => x*x + y*y + z*z)));
    const data = new Uint8Array(values.length * 8), view = new DataView(data.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    const resourceHash = sha256Checksum(data).slice(7);
    source.resources[0].sha256 = resourceHash;
    source.resources[0].count = values.length;
    source.resources[0].bytes = data.length;
    const volumeManifest = JSON.stringify(source);
    const volumeFingerprint = sha256Checksum(new TextEncoder().encode(volumeManifest)).slice(7);
    const volumeReference = createGraph2DFieldReference(volumeManifest, volumeFingerprint,
      { kind: "preset", value: "quadratic-volume" }, "f", "scalar");
    const volumeDocument = createScientificFieldDocument({ reference: volumeReference,
      derivation: { operation: "laplacian" }, quantity: { name: "Potential", unit: "V" },
      display: { view: "volume", normalAxis: 2, fixedIndex: 2, transfer: { mode: "data" } } },
    { stableKey: "quadratic-volume" });
    const volume: Graph2DScientificVolume = { fingerprint: volumeFingerprint, datasetId: "f",
      component: "scalar", sourceShape: [5, 5, 5], sampleShape: [5, 5, 5],
      resourceSha256: resourceHash, sampleSha256: resourceHash, values };
    const result = deriveVerifiedScientificScalarVolume(volumeDocument, volumeManifest,
      volumeFingerprint, volume);
    expect(result.volume.values.every(value => Math.abs(value - 6) < 1e-10)).toBe(true);
    expect(result.unit).toBe("(V)/1²");
    expect(() => deriveVerifiedScientificScalarVolume(volumeDocument, volumeManifest,
      volumeFingerprint, { ...volume, sampleSha256: "0".repeat(64) })).toThrow(/checksum/);
  });
});
