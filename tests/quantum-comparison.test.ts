import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareVerifiedQuantumScenes } from "../src/main/quantumScene/comparison";
import type { ImportedQuantumScene } from "../src/main/quantumScene/importer";

const imported = (values: number[], coordinates = [0, 0, 0, 1, 0, 0], unit = "eV") => ({
  source: { provenance: { model: "qwz", parameters: { mass: 1 } },
    coordinates: { handedness: "right", axes: ["kx", "ky", "E"], units: ["rad", "rad", unit] },
    bands: { kind: "path", coordinates: "k", energies: ["low", "high"], energyUnit: unit, bulkGap: 1 },
  }, arrays: new Map([["k", Float64Array.from(coordinates)], ["low", Float64Array.from(values.slice(0, 2))],
    ["high", Float64Array.from(values.slice(2))]]) }) as unknown as ImportedQuantumScene;

describe("verified quantum A/B comparison", () => {
  it("reports reproducible aligned energy residuals", () => {
    const result = compareVerifiedQuantumScenes(imported([0, 1, 2, 3]), imported([1, 2, 3, 4]));
    assert.equal(result.status, "compatible"); assert.equal(result.samples, 4);
    assert.equal(result.meanAbsolute, 1); assert.equal(result.rootMeanSquare, 1);
    assert.equal(result.maximumAbsolute, 1); assert.equal(result.bulkGapDelta, 0);
  });
  it("flags unit and coordinate incompatibility before subtraction", () => {
    const result = compareVerifiedQuantumScenes(imported([0, 1, 2, 3]), imported([0, 1, 2, 3], [0, 0, 0, 2, 0, 0], "meV"));
    assert.equal(result.status, "incompatible"); assert.equal(result.samples, 0);
  });
  it("compares density rather than gauge-dependent complex amplitudes", () => {
    const field = (real: number, imaginary: number) => ({ source: {
      provenance: { model: "hydrogenic" }, coordinates: { axes: ["x", "y", "z"], units: ["a0", "a0", "a0"] },
      fields: [{ kind: "complex-field", real: "real", imaginary: "imaginary", grid: { shape: [1, 1, 1], origin: [0, 0, 0], spacing: [1, 1, 1] } }],
      datasets: [{ id: "real", unit: "a0^-3/2" }, { id: "imaginary", unit: "a0^-3/2" }],
    }, arrays: new Map([["real", Float64Array.from([real])], ["imaginary", Float64Array.from([imaginary])]]) }) as unknown as ImportedQuantumScene;
    const result = compareVerifiedQuantumScenes(field(1, 0), field(0, 1));
    assert.equal(result.status, "compatible"); assert.equal(result.maximumAbsolute, 0);
  });
});
