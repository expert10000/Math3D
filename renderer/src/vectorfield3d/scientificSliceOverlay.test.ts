import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  Graph2DPointTableStore, parseGraph2DDocument, serializeGraph2DDocument,
  parseVectorField3DDocument, reviseVectorField3DWorkspace, sampleVectorField3DSlice,
  serializeVectorField3DDocument, sha256Checksum, vectorField3DExpression,
  verifyGraph2DScientificVolume, type Graph2DScientificVolume,
  type VectorField3DSliceArtifact, type VectorField3DSource } from "@math3d/core";
import { sampleComplexSliceOverlay, sampleLinkedOverlayLineProfile,
  sampleOverlayRegion, sampleScalarSliceOverlay,
  sampleSliceOverlayArrows, sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";
import { linkedOverlayGraphPair } from "./linkedOverlayGraphPair";
import { reverifyLinkedOverlayGraphPair } from "./reverifyLinkedOverlayGraphPair";

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
const complexDirectory = resolve(import.meta.dirname,
  "../../../examples/scientific-scenes/complex-wave-volume.sscene");
const complexManifest = readFileSync(resolve(complexDirectory, "manifest.json"), "utf8");
const complexFingerprint = sha256Checksum(new TextEncoder().encode(complexManifest)).slice(7);
const complexPart = (component: "real" | "imaginary") => {
  const reference = createGraph2DFieldReference(complexManifest, complexFingerprint,
    { kind: "preset", value: "complexWaveVolume" }, "field", component);
  const bytes = readFileSync(resolve(complexDirectory, `${component}.f64`));
  const sampleShape = reference.shape.map(count => Math.min(count, 32));
  const selected = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    Math.round(index * (reference.shape[axis]! - 1) / (count - 1))));
  const values = selected[0]!.flatMap(i => selected[1]!.flatMap(j => selected[2]!.map(k =>
    bytes.readDoubleLE(((i * reference.shape[1]! + j) * reference.shape[2]! + k) * 8))));
  const sampleBytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => sampleBytes.writeDoubleLE(value, index * 8));
  const volume = verifyGraph2DScientificVolume(complexManifest, complexFingerprint,
    { fingerprint: complexFingerprint, datasetId: "field", component,
      sourceShape: reference.shape, sampleShape,
      resourceSha256: reference.resourceSha256,
      sampleSha256: sha256Checksum(sampleBytes).slice(7), values });
  return { reference, volume };
};
const complexReal = complexPart("real"), complexImaginary = complexPart("imaginary");
const complexRecipe = { real: complexReal.reference, imaginary: complexImaginary.reference,
  title: "Wave amplitude", unit: "1", mode: "magnitude" as const,
  opacity: 0.85, visible: true };

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
        vectorChannel: "speed", visible: true },
      overlayRegion: { normalAxis: 2, fixedCoordinate: 0, bounds: [[-1, 1], [-1, 1]],
        vectorChannel: "speed", visible: true } });
    expect(withOverlay.identity).toEqual(analytic.identity);
    const serialized = serializeVectorField3DDocument(withOverlay);
    expect(serialized).not.toContain("values");
    expect(parseVectorField3DDocument(serialized).workspace?.scalarOverlay)
      .toEqual(withOverlay.workspace?.scalarOverlay);
    expect(parseVectorField3DDocument(serialized).workspace?.linkedLineProfile)
      .toEqual(withOverlay.workspace?.linkedLineProfile);
    expect(parseVectorField3DDocument(serialized).workspace?.overlayRegion)
      .toEqual(withOverlay.workspace?.overlayRegion);
    const invalid = JSON.parse(serialized);
    invalid.workspace.linkedLineProfile.varyingAxis = 2;
    expect(() => parseVectorField3DDocument(JSON.stringify(invalid))).toThrow();
    const legacy = JSON.parse(serializeVectorField3DDocument(analytic));
    delete legacy.workspace.scalarOverlay;
    delete legacy.workspace.complexOverlay;
    delete legacy.workspace.linkedLineProfile;
    delete legacy.workspace.overlayRegion;
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.scalarOverlay).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.linkedLineProfile).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.overlayRegion).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace?.complexOverlay).toBeNull();
    const invalidRegion = JSON.parse(serialized);
    invalidRegion.workspace.overlayRegion.bounds[0] = [2, -2];
    expect(() => parseVectorField3DDocument(JSON.stringify(invalidRegion))).toThrow();
  });

  it("keeps a complex overlay recipe without source samples and rejects a changed pair", () => {
    const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", scalarOverlay: null, complexOverlay: complexRecipe });
    const serialized = serializeVectorField3DDocument(saved);
    expect(serialized).not.toContain("values");
    expect(parseVectorField3DDocument(serialized).workspace?.complexOverlay).toEqual(complexRecipe);
    const invalid = JSON.parse(serialized);
    invalid.workspace.complexOverlay.imaginary.sceneFingerprint = "0".repeat(64);
    expect(() => parseVectorField3DDocument(JSON.stringify(invalid))).toThrow();
    invalid.workspace.complexOverlay.imaginary = invalid.workspace.complexOverlay.real;
    expect(() => parseVectorField3DDocument(JSON.stringify(invalid))).toThrow();
  });

  it("aligns complex magnitude and phase on XY, XZ and YZ physical slices", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const magnitude = sampleComplexSliceOverlay(analytic, slice, complexRecipe,
        complexReal.volume, complexImaginary.volume);
      const phase = sampleComplexSliceOverlay(analytic, slice,
        { ...complexRecipe, mode: "phase" }, complexReal.volume, complexImaginary.volume);
      expect(magnitude.covered).toBe(normalAxis === 2 ?
        slice.shape[0] * slice.shape[1] : 13 * slice.shape[0]);
      expect(phase.covered).toBe(magnitude.covered);
      expect(magnitude.unit).toBe("1");
      expect(phase.unit).toBe("rad");
      expect(phase.min).toBeCloseTo(-Math.PI, 12);
      expect(phase.max).toBeCloseTo(Math.PI, 12);
      expect(magnitude.verifiedComponents?.map(part => part.sampleSha256))
        .toEqual([complexReal.volume.sampleSha256, complexImaginary.volume.sampleSha256]);
      const center = 12 * slice.shape[1] + 12;
      // Interpolating real and imaginary on a bounded lattice attenuates the peak.
      expect(Math.abs(magnitude.values[center]! - 1)).toBeLessThan(0.08);
      expect(phase.values[center]).toBeCloseTo(0, 2);
    }
    const xy = sampleVectorField3DSlice(analytic, 2, 0);
    const phase = sampleComplexSliceOverlay(analytic, xy,
      { ...complexRecipe, mode: "phase" }, complexReal.volume, complexImaginary.volume);
    const atXOne = phase.values[15 * xy.shape[1] + 12];
    expect(atXOne).toBeCloseTo(1.3, 1);
    expect(() => sampleComplexSliceOverlay(analytic, xy, complexRecipe,
      complexReal.volume, { ...complexImaginary.volume, resourceSha256: "changed" }))
      .toThrow(/changed/);
    expect(() => sampleComplexSliceOverlay(analytic, xy,
      { ...complexRecipe, real: { ...complexReal.reference,
        axes: complexReal.reference.axes.map((axis, index) => index === 0 ?
          { ...axis, unit: "mm" } : axis) } },
      complexReal.volume, complexImaginary.volume)).toThrow(/units/);
  });

  it("links complex magnitude and phase to the vector line on every plane", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const point = [0, 0, 0] as [number, number, number];
      point[slice.planeAxes[1]] = 0.5;
      const recipe = { normalAxis, varyingAxis: slice.planeAxes[0] as 0 | 1 | 2,
        point, vectorChannel: "speed" as const, visible: true };
      const plane = sampleSliceOverlayVectorPlane(analytic, slice);
      const paired = (mode: "magnitude" | "phase") => sampleLinkedOverlayLineProfile(
        analytic, slice, recipe, plane, complexReal.reference, complexReal.volume,
        mode === "phase" ? "rad" : "1", { imaginaryReference: complexImaginary.reference,
          imaginaryVolume: complexImaginary.volume, mode });
      const magnitude = paired("magnitude"), phase = paired("phase");
      expect(magnitude.rows.map(row => row.coordinate))
        .toEqual(phase.rows.map(row => row.coordinate));
      expect(magnitude.rows.map(row => row.vector))
        .toEqual(phase.rows.map(row => row.vector));
      expect(magnitude.scalarUnit).toBe("1");
      expect(phase.scalarUnit).toBe("rad");
      expect(magnitude.vectorUnit).toBe("m/s");
      const atOne = magnitude.rows.findIndex(row => Math.abs(row.coordinate - 1) < 1e-9);
      expect(atOne).toBeGreaterThanOrEqual(0);
      const physical = [...point];
      physical[recipe.varyingAxis] = 1;
      const [x, y, z] = physical;
      const expectedMagnitude = Math.exp(-(x! ** 2 + y! ** 2) / 18 - z! ** 2 / 12);
      const expectedPhase = 1.3 * x! + 0.8 * y! + 0.65 * z! + 0.25 * Math.sin(y!);
      expect(Math.abs(magnitude.rows[atOne]!.scalar! - expectedMagnitude)).toBeLessThan(0.08);
      expect(Math.abs(phase.rows[atOne]!.scalar! - expectedPhase)).toBeLessThan(0.1);
      expect(magnitude.rows[atOne]!.vector).toBeCloseTo(Math.hypot(x!, y!), 10);
    }
  });

  it("keeps complex line gaps, source checks and its physical recipe after Project reopen", () => {
    const slice = sampleVectorField3DSlice(analytic, 1, 0);
    const recipe = { normalAxis: 1 as const, varyingAxis: 2 as const,
      point: [0, 0, 0] as [number, number, number],
      vectorChannel: "p" as const, visible: true };
    const plane = sampleSliceOverlayVectorPlane(analytic, slice);
    const imaginary = { imaginaryReference: complexImaginary.reference,
      imaginaryVolume: complexImaginary.volume, mode: "phase" as const };
    const line = sampleLinkedOverlayLineProfile(analytic, slice, recipe, plane,
      complexReal.reference, complexReal.volume, "rad", imaginary);
    expect(line.rows[0]!.vector).toBeCloseTo(0, 12);
    expect(line.rows[0]!.scalar).toBeNull();
    expect(line.rows.at(-1)!.scalar).toBeNull();
    expect(line.rows.find(row => Math.abs(row.coordinate) < 1e-9)?.scalar).toBeCloseTo(0, 2);
    expect(() => sampleLinkedOverlayLineProfile(analytic, slice, recipe, plane,
      complexReal.reference, complexReal.volume, "rad", { ...imaginary,
        imaginaryVolume: { ...complexImaginary.volume, resourceSha256: "changed" } }))
      .toThrow(/imaginary source changed/);
    const wrongAxes = complexReal.reference.axes.map((axis, index) =>
      index === 0 ? { ...axis, unit: "mm" } : axis);
    expect(() => sampleLinkedOverlayLineProfile(analytic, slice, recipe, plane,
      { ...complexReal.reference, axes: wrongAxes }, complexReal.volume, "rad",
      { ...imaginary, imaginaryReference: { ...complexImaginary.reference,
        axes: wrongAxes } })).toThrow(/coordinate axes or units/);
    const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xz", complexOverlay: { ...complexRecipe, mode: "phase" },
      linkedLineProfile: recipe });
    const serialized = serializeVectorField3DDocument(saved);
    expect(serialized).not.toContain("values");
    const reopened = parseVectorField3DDocument(serialized);
    expect(reopened.workspace?.linkedLineProfile).toEqual(recipe);
    expect(reopened.workspace?.complexOverlay?.mode).toBe("phase");
  });

  it("keeps the selected vector and complex rectangle aligned in both modes", () => {
    const slice = sampleVectorField3DSlice(analytic, 2, 0);
    const plane = sampleSliceOverlayVectorPlane(analytic, slice);
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const magnitude = sampleOverlayRegion(analytic, slice, region, plane,
      complexReal.reference, complexReal.volume, "1",
      { imaginaryReference: complexImaginary.reference,
        imaginaryVolume: complexImaginary.volume, mode: "magnitude" });
    const phase = sampleOverlayRegion(analytic, slice, region, plane,
      complexReal.reference, complexReal.volume, "rad",
      { imaginaryReference: complexImaginary.reference,
        imaginaryVolume: complexImaginary.volume, mode: "phase" });
    expect(magnitude.alignedCount).toBe(289);
    expect(phase.alignedCount).toBe(289);
    expect(magnitude.vector?.mean).toBeCloseTo(phase.vector!.mean, 12);
    expect(magnitude.scalarUnit).toBe("1");
    expect(phase.scalarUnit).toBe("rad");
    expect(magnitude.scalar!.mean).toBeGreaterThan(0.8);
    expect(Math.abs(phase.scalar!.mean)).toBeLessThan(0.1);
    expect(() => sampleOverlayRegion(analytic, slice, region, plane,
      complexReal.reference, complexReal.volume, "rad",
      { imaginaryReference: complexImaginary.reference,
        imaginaryVolume: { ...complexImaginary.volume, resourceSha256: "changed" },
        mode: "phase" })).toThrow(/imaginary source changed/);
  });

  it("summarizes aligned physical rectangles on all planes with separate units", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const region = { normalAxis, fixedCoordinate: 0, bounds: [[-1, 1], [-1, 1]],
        vectorChannel: "speed" as const, visible: true };
      const result = sampleOverlayRegion(analytic, slice, region,
        sampleSliceOverlayVectorPlane(analytic, slice), scalarReference, scalarVolume, "V");
      expect(result.alignedCount).toBe(289);
      expect(result.scalarOutsideAreaPercent).toBe(0);
      expect(result.scalar?.min).toBeCloseTo(0, 12);
      expect(result.scalar?.max).toBeCloseTo(2, 12);
      expect(result.vector?.max).toBeCloseTo(normalAxis === 2 ? Math.SQRT2 : 1, 10);
      expect(result.vectorUnit).toBe("m/s");
      expect(result.scalarUnit).toBe("V");
      expect(result.scalarSampleSha256).toBe(scalarVolume.sampleSha256);
    }
  });

  it("flags scalar area beyond its domain and rejects changed or incompatible sources", () => {
    const wide = createVectorField3DDocument({ ...analytic.source,
      axes: axes.map(axis => ({ ...axis, min: -6, max: 6 })) as VectorField3DSource["axes"] },
    { stableKey: "overlay-region-wide" });
    const slice = sampleVectorField3DSlice(wide, 2, 0);
    const plane = sampleSliceOverlayVectorPlane(wide, slice);
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-6, 6], [-6, 6]] as const,
      vectorChannel: "p" as const, visible: true };
    const result = sampleOverlayRegion(wide, slice, region, plane,
      scalarReference, scalarVolume, "V");
    expect(result.vectorCount).toBe(289);
    expect(result.scalarCount).toBeLessThan(289);
    expect(result.scalarOutsideAreaPercent).toBeCloseTo(100 * (1 - 16 / 36), 10);
    const beyondVector = sampleOverlayRegion(analytic,
      sampleVectorField3DSlice(analytic, 2, 0),
      { ...region, bounds: [[-6, 6], [-6, 6]] },
      sampleSliceOverlayVectorPlane(analytic, sampleVectorField3DSlice(analytic, 2, 0)),
      scalarReference, scalarVolume, "V");
    expect(beyondVector.vectorCount).toBeLessThan(289);
    expect(beyondVector.vectorOutsideAreaPercent).toBeCloseTo(100 * (1 - 16 / 36), 10);
    expect(() => sampleOverlayRegion(wide, slice, region, plane,
      scalarReference, { ...scalarVolume, sampleSha256: "sha256:changed",
        resourceSha256: "changed" }, "V")).toThrow(/changed/);
    expect(() => sampleOverlayRegion(wide, slice, region, plane,
      { ...scalarReference, axes: scalarReference.axes.map((axis, index) =>
        index === 0 ? { ...axis, unit: "mm" } : axis) }, scalarVolume, "V"))
      .toThrow(/coordinate units/);
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

  it("publishes two source-linked Graphs series with aligned physical positions and checked reopen", async () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
      const point = [0, 0, 0] as [number, number, number];
      point[slice.planeAxes[1]] = 0.5;
      const profile = { normalAxis, varyingAxis: slice.planeAxes[0] as 0 | 1 | 2,
        point, vectorChannel: "speed" as const, visible: true };
      const withOverlay = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
        scalarOverlay: { reference: scalarReference, title: "Potential",
          unit: "V", opacity: 0.7, visible: true }, linkedLineProfile: profile });
      const line = sampleLinkedOverlayLineProfile(withOverlay, slice, profile,
        sampleSliceOverlayVectorPlane(withOverlay, slice), scalarReference, scalarVolume, "V");
      const pair = linkedOverlayGraphPair(withOverlay, profile, line, [], "Potential");
      expect(pair[0].rows.map(row => row.x)).toEqual(pair[1].rows.map(row => row.x));
      expect(pair[0].origin.yUnit).toBe("m/s");
      expect(pair[1].origin.yUnit).toBe("V");
      expect(pair[0].origin.scalarReference).toEqual(scalarReference);
      const atOne = pair[0].rows.findIndex(row => Math.abs(row.x - 1) < 1e-9);
      expect(pair[0].rows[atOne]?.y).toBeCloseTo(normalAxis === 2 ? Math.sqrt(1.25) : 1, 10);
      expect(pair[1].rows[atOne]?.y).toBeCloseTo(1.25, 10);
      const store = new Graph2DPointTableStore();
      const drafts = pair.map((part, index) => ({ label: part.label,
        table: store.publish(part.rows), mode: "line" as const, domain: part.domain,
        linkedOrigin: part.origin, style: { color: index ? "#38bdf8" : "#fde047",
          lineWidth: 2, lineStyle: "solid" as const, visible: true } })) as
        [typeof pair[number] & { table: ReturnType<typeof store.publish> },
          typeof pair[number] & { table: ReturnType<typeof store.publish> }];
      const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(`overlay-${normalAxis}`),
        { type: "create-point-series-pair", drafts });
      const graph = createGraph2DDocument({ ...scene, stableKey: `overlay-${normalAxis}` });
      const reopened = parseGraph2DDocument(serializeGraph2DDocument(graph));
      expect(reopened.source.objects.map(object => object.kind === "point-series" ?
        object.linkedOrigin?.series : null)).toEqual(["vector", "scalar"]);
      const bridge = { openGraphDatasetReference: async () => ({ ok: true as const,
        source: { manifestJson: scalarManifest, fingerprint: scalarFingerprint } }),
        previewGraphVolume: async () => scalarVolume,
        closeGraphDataset: async () => true } as unknown as NonNullable<typeof window.scientificScenes>;
      await expect(reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin, bridge))
        .resolves.toBeUndefined();
      await expect(reverifyLinkedOverlayGraphPair(pair[0].origin,
        { ...pair[1].origin, rowsSha256: `sha256:${"0".repeat(64)}` }, bridge))
        .rejects.toThrow(/rows differ/);
      const changed = { ...bridge, previewGraphVolume: async () => ({ ...scalarVolume,
        values: [scalarVolume.values[0]! + 1, ...scalarVolume.values.slice(1)] }) } as
        unknown as NonNullable<typeof window.scientificScenes>;
      await expect(reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin, changed))
        .rejects.toThrow();
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
    const waveMagnitude = sampleComplexSliceOverlay(vector, slice, complexRecipe,
      complexReal.volume, complexImaginary.volume);
    const wavePhase = sampleComplexSliceOverlay(vector, slice,
      { ...complexRecipe, mode: "phase" }, complexReal.volume, complexImaginary.volume);
    expect(waveMagnitude.covered).toBe(1024);
    const centerX = coordinates[16]!, centerY = coordinates[16]!;
    const centerIndex = 16 * 32 + 16;
    const expectedWaveMagnitude = Math.exp(-(centerX ** 2 + centerY ** 2) / 18 -
      fixedCoordinate ** 2 / 12);
    const expectedWavePhase = 1.3 * centerX + 0.8 * centerY +
      0.65 * fixedCoordinate + 0.25 * Math.sin(centerY);
    expect(Math.abs(waveMagnitude.values[centerIndex]! - expectedWaveMagnitude)).toBeLessThan(0.03);
    expect(Math.abs(wavePhase.values[centerIndex]! - expectedWavePhase)).toBeLessThan(0.05);
    const components = [[], [], []] as [number[], number[], number[]];
    for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) {
      const x = coordinates[i]!, y = coordinates[j]!;
      const factor = 16 / (16 + x * x + y * y), offset = i * 32 + j;
      components[0][offset] = -y * factor;
      components[1][offset] = x * factor;
      components[2][offset] = Math.sin(fixedCoordinate) / 4;
    }
    const profile = { normalAxis: 2 as const, varyingAxis: 0 as const,
      point: [centerX, centerY, fixedCoordinate] as [number, number, number],
      vectorChannel: "speed" as const, visible: true };
    const line = sampleLinkedOverlayLineProfile(vector, slice, profile,
      { shape: [32, 32], sourceStructuralHash: vector.identity.structuralHash,
        components, units: ["m/s", "m/s", "m/s"] },
      complexReal.reference, complexReal.volume, "rad",
      { imaginaryReference: complexImaginary.reference,
        imaginaryVolume: complexImaginary.volume, mode: "phase" });
    expect(line.rows[16]!.coordinate).toBe(centerX);
    expect(Math.abs(line.rows[16]!.scalar! - expectedWavePhase)).toBeLessThan(0.05);
    expect(line.rows[16]!.vector).toBeCloseTo(Math.hypot(
      -centerY * 16 / (16 + centerX ** 2 + centerY ** 2),
      centerX * 16 / (16 + centerX ** 2 + centerY ** 2),
      Math.sin(fixedCoordinate) / 4), 10);
    const region = sampleOverlayRegion(vector, slice,
      { normalAxis: 2, fixedCoordinate, bounds: [[-1, 1], [-1, 1]],
        vectorChannel: "speed", visible: true },
      { shape: [32, 32], sourceStructuralHash: vector.identity.structuralHash,
        components, units: ["m/s", "m/s", "m/s"] },
      scalarReference, scalarVolume, "V");
    const expectedSpeed = Array.from({ length: 17 ** 2 }, (_, index) => {
      const x = -1 + Math.floor(index / 17) / 8, y = -1 + index % 17 / 8;
      const factor = 16 / (16 + x * x + y * y);
      return Math.hypot(x * factor, y * factor, Math.sin(fixedCoordinate) / 4);
    }).reduce((sum, value) => sum + value, 0) / 17 ** 2;
    expect(region.alignedCount).toBe(289);
    expect(region.vector?.mean).toBeCloseTo(expectedSpeed, 2);
    // The 17³ scalar source is trilinearly interpolated, so its quadratic
    // minimum can differ from the continuous formula between source nodes.
    expect(Math.abs(region.scalar!.min - fixedCoordinate ** 2)).toBeLessThan(0.08);
    expect(region.scalarOutsideAreaPercent).toBe(0);
  });
});
