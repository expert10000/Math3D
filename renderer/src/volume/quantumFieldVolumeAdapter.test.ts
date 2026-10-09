import { describe, expect, it } from "vitest";
import { adaptQuantumFieldVolume, type QuantumFieldVolume } from "./quantumFieldVolumeAdapter";

const source: QuantumFieldVolume = {
  fingerprint: "a".repeat(64), fieldId: "psi", label: "Orbital", kind: "complex-field", quantity: "density",
  encoding: "f64le-planar-real-imaginary", sourceDatasets: ["psi-real", "psi-imaginary"],
  sourceHashes: ["b".repeat(64), "c".repeat(64)], shape: [2, 2, 2], origin: [-1, -2, -3], spacing: [1, 2, 3],
  axes: ["x", "y", "z"], coordinateUnits: ["a0", "a0", "a0"], valueUnit: "a0^-3",
  layout: "xyz-x-fastest", phaseZeroPolicy: "zero-placeholder-masked", undefinedNodeCount: 0,
  undefinedMask: new Uint8Array(8), values: Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
};

describe("verified quantum field Volume adapter", () => {
  it("retains units, source hashes and grid ordering without embedding samples in the command document", () => {
    const { document, dataset } = adaptQuantumFieldVolume(source);
    expect(document.source.representation).toBe("dense-scalar-grid");
    expect(document.source.spatial).toMatchObject({ dimensions: [2, 2, 2], origin: [-1, -2, -3],
      spacing: [1, 2, 3], positionUnits: "a0/a0/a0", valueUnits: "a0^-3", centering: "point" });
    expect(document.source.recipe).toMatchObject({ fingerprint: source.fingerprint,
      encoding: "f64le-planar-real-imaginary", layout: "xyz-x-fastest", sourceHashes: source.sourceHashes });
    expect(document.source.payload).toMatchObject({ byteLength: 32, scalarType: "float32", components: 1 });
    expect(dataset.grid).toMatchObject({ dims: [2, 2, 2], origin: [-1, -2, -3], spacing: [1, 2, 3] });
    expect(dataset.grid.scalars).toEqual(source.values);
    expect(JSON.stringify(document)).not.toContain("\"values\"");
    expect(JSON.stringify(document)).not.toContain("0,1,2,3,4,5,6,7");
  });

  it("refuses wrong layout, altered hashes and malformed derived arrays", () => {
    expect(() => adaptQuantumFieldVolume({ ...source, layout: "xyz-z-fastest" as QuantumFieldVolume["layout"] })).toThrow();
    expect(() => adaptQuantumFieldVolume({ ...source, sourceHashes: ["bad"] })).toThrow();
    expect(() => adaptQuantumFieldVolume({ ...source, values: new Float32Array(7) })).toThrow();
    expect(() => adaptQuantumFieldVolume({ ...source, undefinedNodeCount: 1 })).toThrow();
  });
});
