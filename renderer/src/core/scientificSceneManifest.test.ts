import { describe, expect, it } from "vitest";
import { MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES, normalizeScientificSceneManifest,
  parseScientificSceneManifest, type ScientificSceneManifest } from "@math3d/core";

const hash = (digit: string) => digit.repeat(64);
const scalar = (): ScientificSceneManifest => ({
  schema: "scientific-scene/v1", sceneId: "sincos", title: "sin(x) cos(y)",
  source: { producer: "math3d-fixture", sourceId: "sincos-v1", sourceSchema: "scientific-fixture/v1", sha256: hash("a") },
  resources: [{ id: "values", path: "values.f64", format: "f64le", count: 12, bytes: 96, sha256: hash("b") }],
  coordinates: [{ id: "xy", kind: "cartesian", axes: [{ name: "x", unit: "1" }, { name: "y", unit: "1" }],
    origin: [-1, -1], spacing: [1, 1], periodic: [false, false] }],
  datasets: [{ id: "f", semanticType: "scalar-field", coordinateSystem: "xy", shape: [3, 4],
    order: "last-axis-fastest", quantity: { name: "scalar value", unit: "1", symbol: "f" }, real: "values" }],
  views: [{ id: "surface", label: "f(x,y)", dataset: "f", renderer: "height-surface", operation: "identity" }],
});

const complex = (): ScientificSceneManifest => ({
  ...scalar(), sceneId: "hydrogen-2p", title: "Hydrogenic 2p",
  source: { producer: "theory-lab", sourceId: "orbital-2p", sourceSchema: "quantum-scene/v1", sha256: hash("c") },
  resources: [
    { id: "psi-real", path: "psi-real.f64", format: "f64le", count: 27, bytes: 216, sha256: hash("d") },
    { id: "psi-imaginary", path: "psi-imaginary.f64", format: "f64le", count: 27, bytes: 216, sha256: hash("e") },
  ],
  coordinates: [{ id: "xyz", kind: "cartesian",
    axes: [{ name: "x", unit: "a0" }, { name: "y", unit: "a0" }, { name: "z", unit: "a0" }],
    origin: [-1, -1, -1], spacing: [1, 1, 1], periodic: [false, false, false] }],
  datasets: [{ id: "psi", semanticType: "complex-scalar-field", coordinateSystem: "xyz", shape: [3, 3, 3],
    order: "last-axis-fastest", quantity: { name: "wavefunction", unit: "a0^-3/2", symbol: "psi" },
    real: "psi-real", imaginary: "psi-imaginary" }],
  views: [{ id: "density-slice", label: "Density", dataset: "psi", renderer: "slice",
    operation: "complex-density/v1", axis: 2 }],
});

const edit = (value: ScientificSceneManifest, mutate: (copy: any) => void): unknown => {
  const copy = structuredClone(value);
  mutate(copy);
  return copy;
};

describe("small scientific-scene/v1 manifest", () => {
  it("accepts 2D scalar and 3D complex descriptors without embedding numerical arrays", () => {
    for (const manifest of [scalar(), complex()]) {
      const checked = normalizeScientificSceneManifest(manifest);
      expect(checked.ok).toBe(true);
      if (checked.ok) {
        expect(checked.value).toEqual(manifest);
        expect(checked.value).not.toBe(manifest);
        expect(JSON.stringify(checked.value)).not.toContain("Float64Array");
      }
      expect(parseScientificSceneManifest(JSON.stringify(manifest)).ok).toBe(true);
    }
  });

  it("fails closed on unknown versions, fields and executable view expressions", () => {
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.schema = "scientific-scene/v2"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.python = "print('run')"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.views[0].expression = "eval(x)"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.views[0].operation = "custom-js"; })).ok).toBe(false);
  });

  it("rejects traversal, URLs, forged hashes and resource byte mismatches", () => {
    for (const path of ["../values.f64", "nested/values.f64", "https://example.com/values.f64", "C:\\values.f64", "CON.f64"]) {
      expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.resources[0].path = path; })).ok).toBe(false);
    }
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.resources[0].sha256 = "not-a-hash"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.resources[0].bytes = 88; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.resources[0].count = 11; })).ok).toBe(false);
  });

  it("requires explicit compatible coordinates, shape, components and units", () => {
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.datasets[0].shape = [2, 4]; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.datasets[0].coordinateSystem = "missing"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.coordinates[0].axes[0].unit = ""; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.coordinates[0].spacing[1] = 0; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.coordinates[0].origin[1] = 1e20; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(complex(), copy => { delete copy.datasets[0].imaginary; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.datasets[0].imaginary = "values"; })).ok).toBe(false);
  });

  it("refuses duplicate identities, unreferenced resources and incompatible view operations", () => {
    expect(normalizeScientificSceneManifest(edit(complex(), copy => { copy.resources[1].id = "psi-real"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(complex(), copy => { copy.datasets[0].imaginary = "psi-real"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.views[0].operation = "complex-density/v1"; })).ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.views[0].renderer = "slice"; copy.views[0].axis = 2; })).ok).toBe(false);
  });

  it("caps metadata and rejects invalid JSON before admission", () => {
    expect(parseScientificSceneManifest("{".repeat(MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES + 1)).ok).toBe(false);
    expect(parseScientificSceneManifest("{not json}").ok).toBe(false);
    expect(normalizeScientificSceneManifest(edit(scalar(), copy => { copy.title = "x".repeat(200); })).ok).toBe(false);
  });
});
