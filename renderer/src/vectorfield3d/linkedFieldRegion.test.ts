import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createScientificFieldDocument, sha256Checksum,
  verifyGraph2DScientificVolume, type Graph2DScientificVolume,
  type VectorField3DAxis, type VectorField3DOverlayRegion } from "@math3d/core";
import { sampleLinkedFieldRegion } from "./linkedFieldRegion";

const axes = (["x", "y", "z"] as const).map(role => ({ role, label: role,
  unit: "m", min: -4, max: 4 })) as VectorField3DAxis[];
const region: VectorField3DOverlayRegion = { normalAxis: 2, fixedCoordinate: 0,
  bounds: [[-1, 1], [-1, 1]], vectorChannel: "speed", visible: true };
const scene = (folder: string, component: string) => {
  const directory = resolve(import.meta.dirname, `../../../examples/scientific-scenes/${folder}.sscene`);
  const manifest = readFileSync(resolve(directory, "manifest.json"), "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifest)).slice(7);
  const reference = createGraph2DFieldReference(manifest, fingerprint,
    { kind: "preset", value: folder === "quadratic-volume" ?
      "quadraticVolume" : "complexWaveVolume" }, "field", component);
  const bytes = readFileSync(resolve(directory, `${component}.f64`));
  const sampleShape = reference.shape.map(count => Math.min(count, 32));
  const selected = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    Math.round(index * (reference.shape[axis]! - 1) / (count - 1))));
  const values = selected[0]!.flatMap(i => selected[1]!.flatMap(j => selected[2]!.map(k =>
    bytes.readDoubleLE(((i * reference.shape[1]! + j) * reference.shape[2]! + k) * 8))));
  const sampleBytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => sampleBytes.writeDoubleLE(value, index * 8));
  const volume: Graph2DScientificVolume = verifyGraph2DScientificVolume(manifest, fingerprint,
    { fingerprint, datasetId: "field", component,
      sourceShape: reference.shape, sampleShape,
      resourceSha256: reference.resourceSha256,
      sampleSha256: sha256Checksum(sampleBytes).slice(7), values });
  return { reference, volume };
};

describe("SCI-02 saved region across verified field layers", () => {
  const scalar = scene("quadratic-volume", "scalar");
  const real = scene("complex-wave-volume", "real");
  const imaginary = scene("complex-wave-volume", "imaginary");
  const scalarDocument = createScientificFieldDocument({ reference: scalar.reference,
    quantity: { name: "Potential", unit: "V" },
    display: { view: "plane", normalAxis: 2, fixedIndex: 8,
      transfer: { mode: "data" } } }, { stableKey: "region-scalar" });
  const complexDocument = createScientificFieldDocument({ reference: real.reference,
    paired: { imaginary: imaginary.reference,
      line: { normalAxis: 2, planeFixedIndex: 8, varyingAxis: 0, fixedIndex: 20 } },
    quantity: { name: "Wave amplitude", unit: "1" },
    display: { view: "plane", normalAxis: 2, fixedIndex: 8,
      transfer: { mode: "data" } } }, { stableKey: "region-complex" });

  it("keeps physical positions, units and source hashes for scalar and complex layers", () => {
    const potential = sampleLinkedFieldRegion(region, axes, scalarDocument, [scalar.volume]);
    expect(potential.alignedCount).toBe(289);
    expect(potential.components[0]?.min).toBeCloseTo(0, 10);
    expect(potential.components[0]?.max).toBeCloseTo(2, 10);
    expect(potential.unit).toBe("V");
    expect(potential.components[0]?.sampleSha256).toBe(scalar.volume.sampleSha256);
    const wave = sampleLinkedFieldRegion(region, axes, complexDocument,
      [real.volume, imaginary.volume]);
    expect(wave.alignedCount).toBe(289);
    expect(wave.components.map(component => component.name)).toEqual(["real", "imaginary"]);
    expect(wave.unit).toBe("1");
    expect(wave.components[0]?.mean).toBeGreaterThan(0.5);
    expect(Math.abs(wave.components[1]!.mean)).toBeLessThan(0.1);
    expect(wave.components.map(component => component.sampleSha256))
      .toEqual([real.volume.sampleSha256, imaginary.volume.sampleSha256]);
  });

  it("flags partial or missing domains and refuses mismatched source metadata", () => {
    const wide = { ...region, bounds: [[-6, 6], [-6, 6]] } as VectorField3DOverlayRegion;
    const partial = sampleLinkedFieldRegion(wide, axes, scalarDocument, [scalar.volume]);
    expect(partial.alignedCount).toBeLessThan(289);
    expect(partial.outsideAreaPercent).toBeCloseTo(100 * (1 - 16 / 36), 10);
    const outside = sampleLinkedFieldRegion({ ...region, bounds: [[5, 6], [5, 6]] },
      axes, complexDocument, [real.volume, imaginary.volume]);
    expect(outside.alignedCount).toBe(0);
    expect(outside.outsideAreaPercent).toBe(100);
    expect(() => sampleLinkedFieldRegion(region,
      axes.map((axis, index) => index === 0 ? { ...axis, unit: "mm" } : axis),
      scalarDocument, [scalar.volume])).toThrow(/units/);
    expect(() => sampleLinkedFieldRegion(region, axes, complexDocument,
      [real.volume, { ...imaginary.volume, resourceSha256: "changed" }])).toThrow(/verified/);
  });
});
