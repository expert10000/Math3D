import { describe, expect, it } from "vitest";
import { fitVisibleQuantumField } from "./quantumFieldFit";
import type { QuantumFieldVolume } from "./quantumFieldVolumeAdapter";

function field(quantity: QuantumFieldVolume["quantity"], sample: (x: number, y: number, z: number) => number): QuantumFieldVolume {
  const values = new Float32Array(11 ** 3);
  for (let z = 0; z < 11; z++) for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++)
    values[(z * 11 + y) * 11 + x] = sample(x, y, z);
  return { fingerprint: "a".repeat(64), fieldId: "psi", label: "Orbital", kind: "complex-field", quantity,
    encoding: "f64le-planar-real-imaginary", sourceDatasets: ["real", "imaginary"],
    sourceHashes: ["b".repeat(64), "c".repeat(64)], shape: [11, 11, 11],
    origin: [-5, -5, -5], spacing: [1, 1, 1], axes: ["x", "y", "z"],
    coordinateUnits: ["a0", "a0", "a0"], valueUnit: "a0^-3", layout: "xyz-x-fastest",
    phaseZeroPolicy: "zero-placeholder-masked", undefinedNodeCount: 0,
    undefinedMask: new Uint8Array(values.length), values };
}

describe("verified quantum Volume camera framing", () => {
  it("fits a bounded density signal on the selected plane without changing samples or coordinates", () => {
    const source = field("density", (x, y, z) => z === 5 && x >= 4 && x <= 6 && y >= 4 && y <= 6 ? 1 : 0);
    const before = Float32Array.from(source.values);
    expect(fitVisibleQuantumField(source, 2, 5)).toEqual({ gridBounds: [3, 3, 8, 8],
      center: [0, 0, 0], extents: [2.5, 2.5, 0.5], threshold: 0.01 });
    expect(source.values).toEqual(before);
    expect(source.origin).toEqual([-5, -5, -5]);
    expect(source.coordinateUnits).toEqual(["a0", "a0", "a0"]);
    expect(fitVisibleQuantumField(source, 2, 4)).toBeNull();
  });

  it("maps non-z planes and signed components to the same source axes", () => {
    const source = field("real", (x, y, z) => x === 3 && y >= 2 && y <= 4 && z >= 6 && z <= 8 ? -2 : 0);
    expect(fitVisibleQuantumField(source, 0, 3)).toEqual({ gridBounds: [1, 5, 6, 10],
      center: [-2, -2, 2], extents: [0.5, 2.5, 2.5], threshold: 0.2 });
    expect(fitVisibleQuantumField(source, 0, 11)).toBeNull();
    expect(fitVisibleQuantumField({ ...source, quantity: "phase" }, 0, 3)).toBeNull();
  });
});
