import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  parseVectorField3DDocument, reviseVectorField3DWorkspace, sampleVectorField3DSlice,
  serializeVectorField3DDocument, sha256Checksum, vectorField3DExpression,
  verifyGraph2DScientificVolume, type Graph2DScientificVolume,
  type VectorField3DSliceArtifact, type VectorField3DSource } from "@math3d/core";
import { sampleScalarSliceOverlay, sampleSliceOverlayArrows } from "./scientificSliceOverlay";

const scalarDirectory = resolve(import.meta.dirname, "../../../examples/scientific-scenes/quadratic-volume.sscene");
const scalarManifest = readFileSync(resolve(scalarDirectory, "manifest.json"), "utf8");
const scalarFingerprint = sha256Checksum(new TextEncoder().encode(scalarManifest)).slice(7);
const scalarReference = createGraph2DFieldReference(scalarManifest, scalarFingerprint,
  { kind: "preset", value: "quadraticVolume" }, "field", "scalar");
const scalarBytes = readFileSync(resolve(scalarDirectory, "scalar.f64"));
const scalarVolume: Graph2DScientificVolume = verifyGraph2DScientificVolume(scalarManifest,
  scalarFingerprint, { fingerprint: scalarFingerprint, datasetId: "field", component: "scalar",
    sourceShape: [17, 17, 17], sampleShape: [17, 17, 17],
    resourceSha256: scalarReference.resourceSha256,
    sampleSha256: sha256Checksum(scalarBytes).slice(7),
    values: Array.from({ length: 17 ** 3 }, (_, index) => scalarBytes.readDoubleLE(index * 8)) });

const axes = (["x", "y", "z"] as const).map(role => ({ role, label: role,
  unit: "m", min: -4, max: 4 })) as VectorField3DSource["axes"];
const analytic = createVectorField3DDocument({ axes, timeUnit: "s",
  field: { kind: "expressions", components: [
    vectorField3DExpression("-y", "m/s"), vectorField3DExpression("x", "m/s"),
    vectorField3DExpression("0", "m/s") ] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
    maxSteps: 1000, maxTime: 10 } }, { stableKey: "overlay-analytic" });

describe("SCI-02 verified scalar and vector slice overlay", () => {
  it("aligns the small scalar scene on XY, XZ and YZ with physical vector arrows", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const overlay = sampleScalarSliceOverlay(analytic, slice, scalarReference,
        scalarVolume, "Potential", "V", 0.85);
      expect(overlay.covered).toBe(slice.shape[0] * slice.shape[1]);
      expect(overlay.values[12 * slice.shape[1] + 12]).toBeCloseTo(0, 12);
      expect(overlay.values[15 * slice.shape[1] + 12]).toBeCloseTo(1, 12);
      expect(overlay.source).toBe("quadratic-volume / field");
      expect(overlay.sampleSha256).toBe(scalarVolume.sampleSha256);
      const arrows = sampleSliceOverlayArrows(analytic, slice);
      expect(arrows.length).toBeGreaterThan(20);
      expect(arrows.every(arrow => Number.isFinite(arrow.firstComponent) &&
        Number.isFinite(arrow.secondComponent))).toBe(true);
    }
  });

  it("keeps the overlay recipe across Project serialization without copying samples", () => {
    const withOverlay = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", scalarOverlay: { reference: scalarReference,
        title: "Potential", unit: "V", opacity: 0.7, visible: true } });
    expect(withOverlay.identity).toEqual(analytic.identity);
    const serialized = serializeVectorField3DDocument(withOverlay);
    expect(serialized).not.toContain("values");
    expect(parseVectorField3DDocument(serialized).workspace?.scalarOverlay)
      .toEqual(withOverlay.workspace?.scalarOverlay);
    const legacy = JSON.parse(serializeVectorField3DDocument(analytic));
    delete legacy.workspace.scalarOverlay;
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.scalarOverlay).toBeNull();
  });

  it("withholds coordinate-unit, axis-order and domain mismatches", () => {
    const slice = sampleVectorField3DSlice(analytic, 2, 0);
    expect(() => sampleScalarSliceOverlay(analytic, slice, { ...scalarReference,
      axes: scalarReference.axes.map((axis, index) => index === 0 ? { ...axis, unit: "mm" } : axis) },
    scalarVolume, "Potential", "V", 0.85)).toThrow(/units/);
    expect(() => sampleScalarSliceOverlay(analytic, slice, { ...scalarReference,
      axes: [scalarReference.axes[1]!, scalarReference.axes[0]!, scalarReference.axes[2]!] },
    scalarVolume, "Potential", "V", 0.85)).toThrow(/axes/);
    expect(() => sampleScalarSliceOverlay(analytic, slice, { ...scalarReference,
      axes: scalarReference.axes.map(axis => ({ ...axis, origin: 10 })) },
    scalarVolume, "Potential", "V", 0.85)).toThrow(/outside/);
  });

  it("places the 80³ vortex's bounded XY lattice on the same scalar physical axes", () => {
    const manifestJson = readFileSync(resolve(import.meta.dirname,
      "../../../output/scientific-vortex-80-overview.sscene/manifest.json"), "utf8");
    const manifest = JSON.parse(manifestJson), fingerprint = sha256Checksum(
      new TextEncoder().encode(manifestJson)).slice(7);
    const dataset = manifest.datasets[0], coordinate = manifest.coordinates[0];
    const refs = dataset.components.map((part: { name: string }) => createGraph2DFieldReference(
      manifestJson, fingerprint, { kind: "preset", value: "vortex80" }, dataset.id, part.name)) as
      [typeof scalarReference, typeof scalarReference, typeof scalarReference];
    const source: VectorField3DSource = { axes: coordinate.axes.map((axis: { name: string; unit: string },
      index: number) => ({ role: (["x", "y", "z"] as const)[index]!, label: axis.name,
      unit: axis.unit, min: coordinate.origin[index],
      max: coordinate.origin[index] + coordinate.spacing[index] * (dataset.shape[index] - 1) })) as
      VectorField3DSource["axes"], timeUnit: "s", field: { kind: "scientific-bundle",
      componentUnits: [dataset.quantity.unit, dataset.quantity.unit, dataset.quantity.unit],
      references: refs }, seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512,
        magnitudeScale: 1, colorBy: "speed" }, solver: { absoluteTolerance: 1e-6,
        relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 } };
    const vector = createVectorField3DDocument(source, { stableKey: "overlay-vortex80" });
    const indices = Array.from({ length: 32 }, (_, index) => Math.round(index * 79 / 31));
    const coordinates = indices.map(index => coordinate.origin[0] + coordinate.spacing[0] * index);
    const fixedCoordinate = coordinate.origin[2] + coordinate.spacing[2] * indices[16]!;
    const slice: VectorField3DSliceArtifact = { source: { documentId: vector.identity.id,
      revision: vector.identity.revision, structuralHash: vector.identity.structuralHash },
      normalAxis: 2, fixedCoordinate, fixedUnit: "m", planeAxes: [0, 1],
      coordinates: [coordinates, coordinates], shape: [32, 32],
      values: Array(32 ** 2).fill(0), channel: "magnitude", unit: "m/s",
      min: 0, max: 0, evaluated: 32 ** 2, rejected: 0 };
    const overlay = sampleScalarSliceOverlay(vector, slice, scalarReference,
      scalarVolume, "Potential", "V", 0.85);
    expect(overlay.covered).toBe(1024);
    expect(overlay.values[0]).toBeGreaterThan(32);
    expect(overlay.values.at(-1)).toBeCloseTo(overlay.values[0]!, 10);
  });
});
