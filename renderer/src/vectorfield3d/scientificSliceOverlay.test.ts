import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  parseVectorField3DDocument, reviseVectorField3DWorkspace, sampleVectorField3DSlice,
  serializeVectorField3DDocument, sha256Checksum, vectorField3DExpression,
  verifyGraph2DScientificVolume, type Graph2DScientificVolume,
  type VectorField3DSliceArtifact, type VectorField3DSource } from "@math3d/core";
import { sampleLinkedOverlayLineProfile, sampleScalarSliceOverlay,
  sampleSliceOverlayArrows, sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";

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
        title: "Potential", unit: "V", opacity: 0.7, visible: true },
      linkedLineProfile: { normalAxis: 2, varyingAxis: 0, point: [0, 0.5, 0],
        vectorChannel: "speed", visible: true } });
    expect(withOverlay.identity).toEqual(analytic.identity);
    const serialized = serializeVectorField3DDocument(withOverlay);
    expect(serialized).not.toContain("values");
    expect(parseVectorField3DDocument(serialized).workspace?.scalarOverlay)
      .toEqual(withOverlay.workspace?.scalarOverlay);
    expect(parseVectorField3DDocument(serialized).workspace?.linkedLineProfile)
      .toEqual(withOverlay.workspace?.linkedLineProfile);
    const invalid = JSON.parse(serialized);
    invalid.workspace.linkedLineProfile.varyingAxis = 2;
    expect(() => parseVectorField3DDocument(JSON.stringify(invalid))).toThrow();
    const legacy = JSON.parse(serializeVectorField3DDocument(analytic));
    delete legacy.workspace.scalarOverlay;
    delete legacy.workspace.linkedLineProfile;
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.scalarOverlay).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.linkedLineProfile).toBeNull();
  });

  it("aligns vector speed and scalar potential along one off-lattice physical line", () => {
    const slice = sampleVectorField3DSlice(analytic, 2, 0);
    const plane = sampleSliceOverlayVectorPlane(analytic, slice);
    const line = sampleLinkedOverlayLineProfile(analytic, slice,
      { normalAxis: 2, varyingAxis: 0, point: [0, 0.5, 0],
        vectorChannel: "speed", visible: true }, plane,
      scalarReference, scalarVolume, "V");
    expect(line.rows).toHaveLength(slice.shape[0]);
    const xOne = line.rows.find(row => Math.abs(row.coordinate - 1) < 1e-9)!;
    expect(xOne.vector).toBeCloseTo(Math.hypot(0.5, 1), 10);
    expect(xOne.scalar).toBeCloseTo(1.25, 10);
    expect(line.coordinateUnit).toBe("m");
    expect(line.vectorUnit).toBe("m/s");
    expect(line.scalarUnit).toBe("V");
    expect(line.scalarSampleSha256).toBe(scalarVolume.sampleSha256);
  });

  it("uses the same physical line positions on XY, XZ and YZ", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const fixedAxis = slice.planeAxes[1];
      const point = [0, 0, 0] as [number, number, number];
      point[fixedAxis] = 0.5;
      const line = sampleLinkedOverlayLineProfile(analytic, slice,
        { normalAxis, varyingAxis: slice.planeAxes[0] as 0 | 1 | 2,
          point, vectorChannel: "speed", visible: true },
        sampleSliceOverlayVectorPlane(analytic, slice), scalarReference, scalarVolume, "V");
      const atOne = line.rows.find(row => Math.abs(row.coordinate - 1) < 1e-9)!;
      expect(atOne.scalar).toBeCloseTo(1.25, 10);
      expect(atOne.vector).toBeCloseTo(normalAxis === 2 ? Math.sqrt(1.25) : 1, 10);
    }
  });

  it("leaves explicit gaps where the scalar domain ends before the vector line", () => {
    const wide = createVectorField3DDocument({ ...analytic.source,
      axes: axes.map(axis => ({ ...axis, min: -6, max: 6 })) as VectorField3DSource["axes"] },
    { stableKey: "overlay-wide" });
    const slice = sampleVectorField3DSlice(wide, 2, 0);
    const line = sampleLinkedOverlayLineProfile(wide, slice,
      { normalAxis: 2, varyingAxis: 0, point: [0, 0, 0],
        vectorChannel: "p", visible: true },
      sampleSliceOverlayVectorPlane(wide, slice), scalarReference, scalarVolume, "V");
    expect(line.rows[0]?.vector).toBe(0);
    expect(line.rows[0]?.scalar).toBeNull();
    expect(line.rows.find(row => Math.abs(row.coordinate) < 1e-9)?.scalar).toBe(0);
    expect(line.rows.at(-1)?.scalar).toBeNull();
  });

  it("withholds coordinate-unit, axis-order and domain mismatches", () => {
    const slice = sampleVectorField3DSlice(analytic, 2, 0);
    const plane = sampleSliceOverlayVectorPlane(analytic, slice);
    const recipe = { normalAxis: 2, varyingAxis: 0, point: [0, 0, 0],
      vectorChannel: "speed", visible: true } as const;
    expect(() => sampleScalarSliceOverlay(analytic, slice, { ...scalarReference,
      axes: scalarReference.axes.map((axis, index) => index === 0 ? { ...axis, unit: "mm" } : axis) },
    scalarVolume, "Potential", "V", 0.85)).toThrow(/units/);
    expect(() => sampleLinkedOverlayLineProfile(analytic, slice, recipe, plane,
      { ...scalarReference, axes: scalarReference.axes.map((axis, index) => index === 0 ?
        { ...axis, unit: "mm" } : axis) }, scalarVolume, "V")).toThrow(/units/);
    expect(() => sampleLinkedOverlayLineProfile(analytic, slice, recipe,
      { ...plane, units: ["m/s", "mm/s", "m/s"] }, scalarReference,
      scalarVolume, "V")).toThrow(/component units differ/);
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
