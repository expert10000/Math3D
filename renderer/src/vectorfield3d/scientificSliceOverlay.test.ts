import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createVectorField3DDocument,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  Graph2DPointTableStore, parseGraph2DDocument, serializeGraph2DDocument,
  parseVectorField3DDocument, reviseVectorField3DWorkspace, sampleVectorField3DSlice,
  sampleVectorField3DDerivedSlice,
  serializeVectorField3DDocument, sha256Checksum, vectorField3DExpression,
  verifyGraph2DScientificVolume, type Graph2DScientificVolume,
  createVectorField3DRegionResult, reverifyVectorField3DRegionResult,
  createCombinedVectorField3DRegionResult,
  createCombinedVectorField3DRegionResultWithDivergence,
  createCombinedVectorField3DRegionResultWithCurl,
  createVectorDerivedRegionResult,
  validGraph2DLinkedOverlayOrigin,
  vectorField3DRegionResultRelation, createMixedWorkspaceDocument,
  createMath3DProject, parseMath3DProject, serializeMath3DProject,
  type VectorField3DSliceArtifact, type VectorField3DSource } from "@math3d/core";
import { phaseContourSegments, sampleComplexSliceOverlay, sampleLinkedOverlayLineProfile,
  sampleOverlayRegion, sampleScalarSliceOverlay,
  sampleSliceOverlayArrows, sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";
import { linkedOverlayGraphPair } from "./linkedOverlayGraphPair";
import { reverifyLinkedOverlayGraphPair } from "./reverifyLinkedOverlayGraphPair";
import { linkedOverlayRegionGraphPair } from "./linkedOverlayRegionGraphPair";
import { reverifyLinkedOverlayRegionGraphPair } from "./reverifyLinkedOverlayRegionGraphPair";
import { linkedCombinedRegionGraphFocus, linkedRegionGraphFocus,
  linkedVectorDerivedRegionGraphFocus } from
  "./linkedRegionGraphFocus";
import { checkSavedRegionResultSources } from "./checkSavedRegionResultSources";
import { sampleVerifiedComplexPoint, sampleVerifiedComplexRegion,
  sampleVerifiedScalarPoint, sampleVerifiedScalarRegion,
  sampleVerifiedVectorRegion } from "./combinedFieldInspection";
import { sampleCombinedRegion } from "./combinedFieldInspection";
import { checkCombinedRegionGraphSeries, linkedCombinedRegionGraphs,
  linkedCombinedRegionGraphsWithDivergence,
  linkedCombinedRegionGraphsWithCurl,
  createCombinedRegionVerificationSession,
  validateCombinedRegionGraphGroup } from "./linkedCombinedRegionGraphs";
import { curlMagnitudeRegionProfile, divergenceRegionProfile,
  verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";
import { linkedVectorDerivedRegionGraphs, checkVectorDerivedRegionGraphSeries,
  validateVectorDerivedRegionGraphGroup } from "./linkedVectorDerivedRegionGraphs";
import { CombinedOverlayRegionReadout } from "./CombinedOverlayRegionReadout";

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

  it("saves two references, aligns phase contours, and leaves gaps at missing or wrapped cells", () => {
    const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", scalarOverlay: { reference: scalarReference,
        title: "Potential", unit: "V", opacity: 0.7, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours", opacity: 0.9 },
      overlayRegion: { normalAxis: 2, fixedCoordinate: 0,
        bounds: [[-1, 1], [-1, 1]], vectorChannel: "speed", visible: true } });
    const serialized = serializeVectorField3DDocument(saved);
    expect(serialized).not.toContain('"values"');
    const reopened = parseVectorField3DDocument(serialized);
    expect(reopened.workspace?.scalarOverlay?.reference).toEqual(scalarReference);
    expect(reopened.workspace?.complexOverlay?.imaginary).toEqual(complexImaginary.reference);
    const slice = sampleVectorField3DSlice(reopened, 2, 0);
    const heatmap = sampleScalarSliceOverlay(reopened, slice, scalarReference,
      scalarVolume, "Potential", "V", 0.7);
    const phase = sampleComplexSliceOverlay(reopened, slice,
      reopened.workspace!.complexOverlay!, complexReal.volume, complexImaginary.volume);
    expect(heatmap.unit).toBe("V");
    expect(phase.unit).toBe("rad");
    expect(phaseContourSegments(phase.values, slice.shape).length).toBeGreaterThan(0);
    expect(() => sampleComplexSliceOverlay(reopened, slice,
      reopened.workspace!.complexOverlay!, complexReal.volume,
      { ...complexImaginary.volume, resourceSha256: "changed" })).toThrow(/changed/);
    expect(sampleScalarSliceOverlay(reopened, slice, scalarReference,
      scalarVolume, "Potential", "V", 0.7).covered).toBe(heatmap.covered);
    expect(() => sampleScalarSliceOverlay(reopened, slice, scalarReference,
      { ...scalarVolume, resourceSha256: "changed" }, "Potential", "V", 0.7))
      .toThrow(/changed/);
    expect(sampleComplexSliceOverlay(reopened, slice,
      reopened.workspace!.complexOverlay!, complexReal.volume,
      complexImaginary.volume).covered).toBe(phase.covered);
    const summary = sampleOverlayRegion(reopened, slice, reopened.workspace!.overlayRegion!,
      sampleSliceOverlayVectorPlane(reopened, slice), scalarReference, scalarVolume, "V");
    const result = createVectorField3DRegionResult(reopened, reopened.workspace!.overlayRegion!,
      summary, [], [{ name: "scalar", sampleSha256: scalarVolume.sampleSha256 }]);
    expect(result.provenance.operation.parameters.overlayKind).toBe("scalar");
    expect(result.provenance.operation.parameters.overlayReferences).toEqual([scalarReference]);
    expect(phaseContourSegments([-1, 1, null, 1], [2, 2])).toHaveLength(0);
    expect(phaseContourSegments([-3, 3, -3, 3], [2, 2])).toHaveLength(0);
    const invalid = JSON.parse(serialized);
    invalid.workspace.complexOverlay.mode = "phase";
    expect(() => parseVectorField3DDocument(JSON.stringify(invalid))).toThrow();
  });

  it("reads all three verified fields at one saved physical point independently", () => {
    const point = [1, 0, 0] as const, units = ["m", "m", "m"] as const;
    const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      scalarOverlay: { reference: scalarReference, title: "Potential",
        unit: "V", opacity: 0.7, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours" },
      linkedProbe: { point, units } });
    const reopened = parseVectorField3DDocument(serializeVectorField3DDocument(saved));
    expect(reopened.workspace?.linkedProbe?.point).toEqual(point);
    const scalar = sampleVerifiedScalarPoint(scalarReference, scalarVolume,
      reopened.source.axes, point, units);
    const complex = sampleVerifiedComplexPoint(complexReal.reference,
      complexImaginary.reference, [complexReal.volume, complexImaginary.volume],
      reopened.source.axes, point, units);
    expect(scalar.value).toBeCloseTo(1, 10);
    expect(complex.magnitude).toBeCloseTo(Math.exp(-1 / 18), 1);
    expect(complex.phase).toBeCloseTo(1.3, 1);
    expect(sampleVerifiedScalarPoint(scalarReference, scalarVolume, reopened.source.axes,
      [9, 0, 0], units)).toEqual({ status: "outside", value: null });
    expect(sampleVerifiedScalarPoint(scalarReference, scalarVolume, reopened.source.axes,
      point, ["mm", "m", "m"]).status).toBe("incompatible-units");
    expect(() => sampleVerifiedComplexPoint(complexReal.reference,
      complexImaginary.reference, [complexReal.volume,
        { ...complexImaginary.volume, resourceSha256: "changed" }],
      reopened.source.axes, point, units)).toThrow(/changed/);
    expect(sampleVerifiedScalarPoint(scalarReference, scalarVolume,
      reopened.source.axes, point, units).value).toBe(1);
  });

  it("reports independent vector, scalar, complex magnitude and phase rectangle gaps", () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const slice = sampleVectorField3DSlice(analytic, 2, 0);
    const plane = sampleSliceOverlayVectorPlane(analytic, slice);
    const vector = sampleVerifiedVectorRegion(analytic, slice, region, plane);
    const scalar = sampleVerifiedScalarRegion(region, scalarReference, scalarVolume,
      analytic.source.axes);
    const complex = sampleVerifiedComplexRegion(region, complexReal.reference,
      complexImaginary.reference, [complexReal.volume, complexImaginary.volume],
      analytic.source.axes);
    expect(vector.statistics.count).toBe(289);
    expect(vector.unit).toBe("m/s");
    const expectedSpeedMean = Array.from({ length: 17 }, (_, i) => -1 + i / 8)
      .flatMap(x => Array.from({ length: 17 }, (_, j) => Math.hypot(x, -1 + j / 8)))
      .reduce((sum, value) => sum + value, 0) / 289;
    expect(vector.statistics.mean).toBeCloseTo(expectedSpeedMean, 10);
    expect(scalar.count).toBe(289);
    expect(scalar.mean).toBeGreaterThan(0);
    expect(complex.magnitude.count).toBe(289);
    expect(complex.phase.count).toBe(289);
    const partial = { ...region, bounds: [[3, 5], [-1, 1]] as const };
    expect(sampleVerifiedScalarRegion(partial, scalarReference, scalarVolume,
      analytic.source.axes).gaps).toBeGreaterThan(0);
    expect(sampleVerifiedComplexRegion(partial, complexReal.reference,
      complexImaginary.reference, [complexReal.volume, complexImaginary.volume],
      analytic.source.axes).magnitude.gaps).toBeGreaterThan(0);
    expect(sampleVerifiedVectorRegion(analytic, slice, partial, plane).statistics.gaps)
      .toBeGreaterThan(0);
    expect(() => sampleVerifiedScalarRegion(region, scalarReference,
      { ...scalarVolume, resourceSha256: "changed" }, analytic.source.axes)).toThrow(/changed/);
    expect(sampleVerifiedComplexRegion(region, complexReal.reference,
      complexImaginary.reference, [complexReal.volume, complexImaginary.volume],
      analytic.source.axes).magnitude.count).toBe(289);
  });

  it("keeps verified scalar and complex rectangle values when the vector plane is withheld", () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      scalarOverlay: { reference: scalarReference, title: "Potential",
        unit: "V", opacity: 0.7, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours" },
      overlayRegion: region });
    const document = parseVectorField3DDocument(serializeVectorField3DDocument(saved));
    const html = renderToStaticMarkup(createElement(CombinedOverlayRegionReadout, {
      document, region, scalarVolume, complexVolumes: [complexReal.volume,
        complexImaginary.volume], vectorStatus: "Vector source withheld: changed" }));
    expect(html).toContain("Vector source withheld: changed");
    expect(html).toContain("Potential");
    expect(html).toContain("289/289 samples");
    expect(html).toContain("phase");
    const changed = renderToStaticMarkup(createElement(CombinedOverlayRegionReadout, {
      document, region, scalarVolume, complexVolumes: null,
      vectorStatus: "Vector source withheld: changed",
      complexStatus: "Complex overlay withheld: resource changed" }));
    expect(changed).toContain("Potential");
    expect(changed).toContain("Complex overlay withheld: resource changed");
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

  it("publishes a compact linked region that survives Project reopen and rejects changed values", async () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const,
      vectorChannel: "speed" as const, visible: true };
    const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", overlayRegion: region,
      scalarOverlay: { reference: scalarReference, title: "Potential", unit: "V",
        opacity: 0.8, visible: true } });
    const slice = sampleVectorField3DSlice(document, 2, 0);
    const summary = sampleOverlayRegion(document, slice, region,
      sampleSliceOverlayVectorPlane(document, slice), scalarReference, scalarVolume, "V");
    const overlaySamples = [{ name: "scalar", sampleSha256: scalarVolume.sampleSha256 }];
    const result = createVectorField3DRegionResult(document, region, summary, [], overlaySamples);
    const relation = vectorField3DRegionResultRelation(result);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], constructions: [],
      results: [result], relations: [relation], artifacts: [], committedSelection: null });
    const saved = serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "linked-region" }));
    expect(saved).not.toContain('"values"');
    const reopened = parseMath3DProject(saved);
    expect(reopened.workspace.results).toEqual([result]);
    expect(reopened.workspace.relations).toEqual([relation]);
    expect(result.provenance.operation.parameters.region).toEqual(region);
    expect(result.provenance.operation.parameters.overlayReferences).toEqual([scalarReference]);
    expect(result.provenance.operation.parameters.overlaySamples).toEqual(overlaySamples);
    expect(() => reverifyVectorField3DRegionResult(result, document, region,
      summary, [], overlaySamples)).not.toThrow();
    expect(() => reverifyVectorField3DRegionResult(result, document, region,
      { ...summary, scalar: { ...summary.scalar!, mean: summary.scalar!.mean + 1 } },
      [], overlaySamples)).toThrow(/differs/);
    expect(() => reverifyVectorField3DRegionResult(result, document, region,
      summary, [], [{ ...overlaySamples[0]!, sampleSha256: "changed" }]))
      .toThrow(/differs/);
    const missing = { checkGraphDatasetReference: async () =>
      ({ ok: false as const, status: "missing" as const, error: "Source missing" }) };
    const changed = { checkGraphDatasetReference: async () =>
      ({ ok: false as const, status: "changed" as const, error: "Source changed" }) };
    expect(await checkSavedRegionResultSources(result, document, missing)).toBe("missing");
    expect(await checkSavedRegionResultSources(result, document, changed)).toBe("changed");
  });

  it("publishes and plots four independently verified combined region fields", async () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", overlayRegion: region,
      scalarOverlay: { reference: scalarReference, title: "Quadratic potential",
        unit: "V", opacity: 0.8, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours" } });
    const slice = sampleVectorField3DSlice(document, 2, 0);
    const inspection = sampleCombinedRegion(document, slice, region,
      sampleSliceOverlayVectorPlane(document, slice), scalarReference, scalarVolume,
      complexReal.reference, complexImaginary.reference,
      [complexReal.volume, complexImaginary.volume]);
    expect(inspection.summary.vector.count).toBe(289);
    expect(inspection.summary.scalar.count).toBe(289);
    expect(inspection.summary.complexMagnitude.count).toBe(289);
    expect(inspection.summary.complexPhase.count).toBe(289);
    expect(inspection.profiles.vector[8]!.y).toBeCloseTo(9 / 17, 8);
    // Linear interpolation of the 17-point source grid lifts the quadratic mean.
    expect(inspection.profiles.scalar[8]!.y).toBeCloseTo(7 / 17, 8);
    expect(inspection.profiles["complex-phase"][8]!.y).toBeCloseTo(0, 3);
    expect(inspection.rowProfiles.vector).toHaveLength(17);
    expect(inspection.rowProfiles.scalar[8]!.y).toBeCloseTo(7 / 17, 8);
    expect(inspection.rowProfiles["complex-phase"][8]!.y).toBeCloseTo(0, 3);
    const result = createCombinedVectorField3DRegionResult(document, region,
      inspection.summary, [], scalarVolume.sampleSha256,
      complexReal.volume.sampleSha256, complexImaginary.volume.sampleSha256);
    const relation = vectorField3DRegionResultRelation(result);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], constructions: [],
      results: [result], relations: [relation], artifacts: [], committedSelection: null });
    const saved = serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "combined-region" }));
    expect(saved).not.toContain('"values"');
    expect(parseMath3DProject(saved).workspace.results).toEqual([result]);
    expect(result.provenance.operation.parameters.region).toEqual(region);
    const group = linkedCombinedRegionGraphs(document, region, inspection, [],
      scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256);
    expect(group.map(item => item.origin.series)).toEqual([
      "vector", "scalar", "complex-magnitude", "complex-phase"]);
    expect(group.map(item => item.origin.yUnit)).toEqual(["m/s", "V", "1", "rad"]);
    validateCombinedRegionGraphGroup(group.map(item => item.origin),
      group.map(item => item.rows));
    const rowGroup = linkedCombinedRegionGraphs(document, region, inspection, [],
      scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, 1);
    expect(rowGroup[0].origin.profileAxis).toBe(1);
    expect(group[0].origin.profileAxis).toBeUndefined();
    expect(rowGroup[0].origin.pairId).not.toBe(group[0].origin.pairId);
    expect(rowGroup.map(item => item.origin.xName)).toEqual(["y", "y", "y", "y"]);
    expect(rowGroup.map(item => item.origin.xUnit)).toEqual(["m", "m", "m", "m"]);
    expect(rowGroup.map(item => item.origin.yUnit)).toEqual(["m/s", "V", "1", "rad"]);
    expect(rowGroup.map(item => item.rows)).toEqual([
      inspection.rowProfiles.vector, inspection.rowProfiles.scalar,
      inspection.rowProfiles["complex-magnitude"], inspection.rowProfiles["complex-phase"]]);
    validateCombinedRegionGraphGroup(rowGroup.map(item => item.origin),
      rowGroup.map(item => item.rows));
    const rowFocus = linkedCombinedRegionGraphFocus(rowGroup.map(item => item.origin),
      rowGroup.map(item => item.rows), { kind: "interval", min: -0.5, max: 0.5 });
    expect(rowFocus.profileAxis).toBe(1);
    expect(rowFocus.columns).toEqual([4, 12]);
    expect(rowFocus.combined?.map(item => item.gaps)).toEqual([0, 0, 0, 0]);
    const sharedPoint = linkedCombinedRegionGraphFocus(group.map(item => item.origin),
      group.map(item => item.rows), { kind: "point", x: 0 });
    expect(sharedPoint.columns).toEqual([8, 8]);
    expect(sharedPoint.combined?.map(item => item.unit)).toEqual(["m/s", "V", "1", "rad"]);
    expect(sharedPoint.combined?.map(item => item.gaps)).toEqual([0, 0, 0, 0]);
    const sharedInterval = linkedCombinedRegionGraphFocus(group.map(item => item.origin),
      group.map(item => item.rows), { kind: "interval", min: -0.5, max: 0.5 });
    expect(sharedInterval.columns).toEqual([4, 12]);
    const store = new Graph2DPointTableStore();
    const drafts = group.map((item, index) => ({ label: item.label,
      table: store.publish(item.rows), mode: "line" as const, domain: item.domain,
      linkedOrigin: item.origin, style: { color: ["#ff0000", "#0000ff", "#00ff00", "#800080"][index]!,
        lineWidth: 2, lineStyle: "solid" as const, visible: true } }));
    const graph = applyGraph2DAuthoring(createEmptyGraph2DDocument("combined-graph"),
      { type: "create-point-series-group", drafts });
    const reopened = parseGraph2DDocument(serializeGraph2DDocument(
      createGraph2DDocument({ ...graph, stableKey: "combined-graph",
        selection: { objectId: graph.source.objects[0]!.id, probe: null,
          linkedRegion: { pairId: group[0].origin.pairId,
            physical: { kind: "interval", min: -0.5, max: 0.5 } } } })));
    expect(reopened.source.objects).toHaveLength(4);
    expect(reopened.selection.linkedRegion?.physical).toEqual({
      kind: "interval", min: -0.5, max: 0.5 });
    const rowDrafts = rowGroup.map((item, index) => ({ ...drafts[index]!,
      label: item.label, table: store.publish(item.rows), domain: item.domain,
      linkedOrigin: item.origin }));
    const rowGraph = applyGraph2DAuthoring(createEmptyGraph2DDocument("combined-row-graph"),
      { type: "create-point-series-group", drafts: rowDrafts });
    const reopenedRows = parseGraph2DDocument(serializeGraph2DDocument(
      createGraph2DDocument({ ...rowGraph, stableKey: "combined-row-graph",
        selection: { objectId: rowGraph.source.objects[0]!.id, probe: null,
          linkedRegion: { pairId: rowGroup[0].origin.pairId,
            physical: { kind: "interval", min: -0.5, max: 0.5 } } } })));
    expect(reopenedRows.source.objects).toHaveLength(4);
    expect(reopenedRows.selection.linkedRegion?.physical).toEqual({
      kind: "interval", min: -0.5, max: 0.5 });
    expect(() => parseGraph2DDocument(serializeGraph2DDocument({ ...reopened,
      selection: { ...reopened.selection, linkedRegion: {
        pairId: "sha256:" + "0".repeat(64),
        physical: { kind: "point", x: 0 } } } }))).toThrow();
    expect(() => parseGraph2DDocument(serializeGraph2DDocument({ ...reopened,
      selection: { ...reopened.selection, linkedRegion: {
        pairId: group[0].origin.pairId,
        physical: { kind: "interval", min: -999, max: 0 } } } }))).toThrow();
    const bridge = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => ({ ok: true as const,
      source: { manifestJson: locator.value === "quadraticVolume" ?
        scalarManifest : complexManifest } }) } as unknown as
      NonNullable<typeof window.scientificScenes>;
    expect(await checkSavedRegionResultSources(result, document, bridge)).toEqual({
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "source-current" });
    expect(await Promise.all(group.map(item =>
      checkCombinedRegionGraphSeries(item.origin, bridge)))).toEqual([
      "current", "current", "current", "current"]);
    expect(await Promise.all(rowGroup.map(item =>
      checkCombinedRegionGraphSeries(item.origin, bridge)))).toEqual([
      "current", "current", "current", "current"]);
    const changedScalar = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => locator.value === "quadraticVolume" ?
        { ok: false as const, status: "changed" as const,
          error: "scalar bytes changed" } :
        { ok: true as const, source: { manifestJson: complexManifest } } } as unknown as
      NonNullable<typeof window.scientificScenes>;
    expect(await checkSavedRegionResultSources(result, document, changedScalar)).toEqual({
      kind: "combined", vector: "source-current", scalar: "changed",
      complex: "source-current" });
    expect(await Promise.all(group.map(item =>
      checkCombinedRegionGraphSeries(item.origin, changedScalar)))).toEqual([
      "current", "changed", "current", "current"]);
    expect(await Promise.all(rowGroup.map(item =>
      checkCombinedRegionGraphSeries(item.origin, changedScalar)))).toEqual([
      "current", "changed", "current", "current"]);
    const changedWave = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => locator.value === "complexWaveVolume" ?
        { ok: false as const, status: "missing" as const,
          error: "complex bytes missing" } :
        { ok: true as const, source: { manifestJson: scalarManifest } } } as unknown as
      NonNullable<typeof window.scientificScenes>;
    expect(await checkSavedRegionResultSources(result, document, changedWave)).toEqual({
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "missing" });
    expect(await Promise.all(group.map(item =>
      checkCombinedRegionGraphSeries(item.origin, changedWave)))).toEqual([
      "current", "current", "missing", "missing"]);
    expect(() => validateCombinedRegionGraphGroup(group.map(item => item.origin),
      group.map((item, index) => index === 1 ?
        item.rows.map((row, rowIndex) => rowIndex === 8 ? { ...row, y: 999 } : row) :
        item.rows))).toThrow(/incomplete or misaligned/);
    expect(() => linkedCombinedRegionGraphFocus(group.map(item => item.origin),
      group.map((item, index) => index === 2 ?
        item.rows.map((row, rowIndex) => rowIndex === 8 ? { ...row, y: 999 } : row) :
        item.rows), { kind: "point", x: 0 })).toThrow(/incomplete or misaligned/);
    expect(() => linkedCombinedRegionGraphFocus(rowGroup.map(item => item.origin),
      rowGroup.map((item, index) => index === 2 ?
        item.rows.map((row, rowIndex) => rowIndex === 8 ? { ...row, y: 999 } : row) :
        item.rows), { kind: "point", x: 0 })).toThrow(/incomplete or misaligned/);
    const wider = { ...region, bounds: [[-6, 6], [-1, 1]] as const };
    const wideDocument = reviseVectorField3DWorkspace(document,
      { ...document.workspace!, overlayRegion: wider });
    const wideSlice = sampleVectorField3DSlice(wideDocument, 2, 0);
    const withGaps = sampleCombinedRegion(wideDocument, wideSlice, wider,
      sampleSliceOverlayVectorPlane(wideDocument, wideSlice),
      scalarReference, scalarVolume, complexReal.reference,
      complexImaginary.reference, [complexReal.volume, complexImaginary.volume]);
    expect(withGaps.summary.vector.gaps).toBeGreaterThan(0);
    expect(withGaps.summary.scalar.gaps).toBeGreaterThan(0);
    expect(withGaps.summary.complexMagnitude.gaps).toBeGreaterThan(0);
    expect(withGaps.profiles.vector[0]!.y).toBeNull();
    expect(withGaps.profiles.scalar[0]!.y).toBeNull();
    expect(withGaps.profiles["complex-magnitude"][0]!.y).toBeNull();
    expect(withGaps.profiles.vector[8]!.y).not.toBeNull();
    const asymmetric = { ...region, bounds: [[-1, 1], [-0.25, 0.75]] as const };
    const asymmetricDocument = reviseVectorField3DWorkspace(document,
      { ...document.workspace!, overlayRegion: asymmetric });
    const asymmetricSlice = sampleVectorField3DSlice(asymmetricDocument, 2, 0);
    const asymmetricInspection = sampleCombinedRegion(asymmetricDocument, asymmetricSlice,
      asymmetric, sampleSliceOverlayVectorPlane(asymmetricDocument, asymmetricSlice),
      scalarReference, scalarVolume, complexReal.reference, complexImaginary.reference,
      [complexReal.volume, complexImaginary.volume]);
    expect(asymmetricInspection.profiles.vector.map(row => row.x)[0]).toBe(-1);
    expect(asymmetricInspection.rowProfiles.vector.map(row => row.x)[0]).toBe(-0.25);
    expect(asymmetricInspection.rowProfiles.vector.map(row => row.x)[16]).toBe(0.75);
    const asymmetricRows = linkedCombinedRegionGraphs(asymmetricDocument, asymmetric,
      asymmetricInspection, [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, 1);
    expect(linkedCombinedRegionGraphFocus(asymmetricRows.map(item => item.origin),
      asymmetricRows.map(item => item.rows), { kind: "point", x: 0.5 }).profileAxis).toBe(1);
    expect(() => linkedCombinedRegionGraphFocus(asymmetricRows.map(item => item.origin),
      asymmetricRows.map(item => item.rows), { kind: "point", x: -0.5 })).toThrow();
    for (const normalAxis of [1, 0] as const) {
      const otherRegion = { ...region, normalAxis };
      const otherDocument = reviseVectorField3DWorkspace(document,
        { ...document.workspace!, selectedLayer: normalAxis === 1 ? "xz" : "yz",
          overlayRegion: otherRegion });
      const otherSlice = sampleVectorField3DSlice(otherDocument, normalAxis, 0);
      const otherInspection = sampleCombinedRegion(otherDocument, otherSlice, otherRegion,
        sampleSliceOverlayVectorPlane(otherDocument, otherSlice), scalarReference, scalarVolume,
        complexReal.reference, complexImaginary.reference,
        [complexReal.volume, complexImaginary.volume]);
      const otherRows = linkedCombinedRegionGraphs(otherDocument, otherRegion, otherInspection,
        [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
        complexImaginary.volume.sampleSha256, 1);
      expect(otherRows.map(item => item.origin.xName)).toEqual(["z", "z", "z", "z"]);
      expect(otherRows.map(item => item.rows.length)).toEqual([17, 17, 17, 17]);
      validateCombinedRegionGraphGroup(otherRows.map(item => item.origin),
        otherRows.map(item => item.rows));
    }
  });

  it("adds verified divergence as a fifth aligned and source-linked region profile", async () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", overlayRegion: region,
      scalarOverlay: { reference: scalarReference, title: "Quadratic potential",
        unit: "V", opacity: 0.8, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours" } });
    const slice = sampleVectorField3DSlice(document, 2, 0);
    const inspection = sampleCombinedRegion(document, slice, region,
      sampleSliceOverlayVectorPlane(document, slice), scalarReference, scalarVolume,
      complexReal.reference, complexImaginary.reference,
      [complexReal.volume, complexImaginary.volume]);
    const derived = divergenceRegionProfile(region,
      sampleVectorField3DDerivedSlice(document, 2, 0, "divergence"));
    expect(derived.unit).toBe("1/s");
    expect(derived.count).toBe(289);
    expect(derived.gaps).toBe(0);
    expect(derived.rows.every(row => row.y !== null && Math.abs(row.y) < 1e-10)).toBe(true);
    const result = createCombinedVectorField3DRegionResultWithDivergence(document,
      region, { ...inspection.summary,
        divergence: { count: derived.count, gaps: derived.gaps,
          mean: derived.mean, min: derived.min, max: derived.max },
        divergenceUnit: derived.unit }, [], scalarVolume.sampleSha256,
      complexReal.volume.sampleSha256, complexImaginary.volume.sampleSha256, []);
    expect(result.provenance.operation.algorithmVersion).toBe("17x17-v3");
    expect(result.summary.divergenceUnit).toBe("1/s");
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: document, expected: document.identity,
        replay: null }], activeDocumentIds: [document.identity.id],
      constructions: [], results: [result],
      relations: [vectorField3DRegionResultRelation(result)], artifacts: [],
      committedSelection: null }), { stableKey: "derived-region-result" });
    expect(parseMath3DProject(serializeMath3DProject(project)).workspace.results)
      .toEqual([result]);
    expect(serializeMath3DProject(project)).not.toContain('"values"');
    const group = linkedCombinedRegionGraphsWithDivergence(document, region, inspection,
      [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, { ...derived, samples: [] });
    expect(group.map(item => item.origin.series)).toEqual([
      "vector", "scalar", "complex-magnitude", "complex-phase", "divergence"]);
    expect(group[4]!.origin.yUnit).toBe("1/s");
    expect(group.map(item => validGraph2DLinkedOverlayOrigin(item.origin))).toEqual([
      true, true, true, true, true]);
    validateCombinedRegionGraphGroup(group.map(item => item.origin),
      group.map(item => item.rows));
    const focus = linkedCombinedRegionGraphFocus(group.map(item => item.origin),
      group.map(item => item.rows), { kind: "point", x: 0 });
    expect(focus.combined?.map(item => item.series)).toContain("divergence");
    const store = new Graph2DPointTableStore();
    const graph = applyGraph2DAuthoring(createEmptyGraph2DDocument("derived-region"),
      { type: "create-point-series-group", drafts: group.map((item, index) => ({
        label: item.label, table: store.publish(item.rows), mode: "line" as const,
        domain: item.domain, linkedOrigin: item.origin,
        style: { color: ["#fde047", "#38bdf8", "#fb7185", "#a78bfa", "#34d399"][index]!,
          lineWidth: 2, lineStyle: "solid" as const, visible: true } })) });
    const reopened = parseGraph2DDocument(serializeGraph2DDocument(
      createGraph2DDocument({ ...graph, stableKey: "derived-region" })));
    expect(reopened.source.objects).toHaveLength(5);
    const bridge = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => locator.value === "quadraticVolume" ?
      { ok: false as const, status: "changed" as const, error: "scalar changed" } :
      { ok: true as const, source: { manifestJson: complexManifest } } } as unknown as
        NonNullable<typeof window.scientificScenes>;
    expect(await Promise.all(group.map(item =>
      checkCombinedRegionGraphSeries(item.origin, bridge)))).toEqual([
      "current", "changed", "current", "current", "current"]);
    expect(await checkSavedRegionResultSources(result, document, bridge)).toEqual({
      kind: "combined", vector: "source-current", scalar: "changed",
      complex: "source-current", divergence: "source-current" });
    const checked = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => ({ ok: true as const,
      source: { manifestJson: locator.value === "quadraticVolume" ?
        scalarManifest : complexManifest } }) } as unknown as
        NonNullable<typeof window.scientificScenes>;
    expect(await checkSavedRegionResultSources(result, document, checked)).toEqual({
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "source-current", divergence: "source-current" });
    const wrongDivergence = createCombinedVectorField3DRegionResultWithDivergence(
      document, region, { ...inspection.summary,
        divergence: { count: 289, gaps: 0, mean: 1, min: 1, max: 1 },
        divergenceUnit: derived.unit }, [], scalarVolume.sampleSha256,
      complexReal.volume.sampleSha256, complexImaginary.volume.sampleSha256, []);
    expect(await checkSavedRegionResultSources(wrongDivergence, document, checked))
      .toEqual({ kind: "combined", vector: "source-current",
        scalar: "source-current", complex: "source-current", divergence: "changed" });
    const wrongRows = linkedCombinedRegionGraphsWithDivergence(document, region, inspection,
      [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, { ...derived,
        rows: derived.rows.map(row => ({ ...row, y: 1 })), samples: [] });
    validateCombinedRegionGraphGroup(wrongRows.map(item => item.origin),
      wrongRows.map(item => item.rows));
    expect(await Promise.all(wrongRows.map(item =>
      checkCombinedRegionGraphSeries(item.origin, checked)))).toEqual([
      "current", "current", "current", "current", "changed"]);
    expect(await checkSavedRegionResultSources({ ...result,
      summary: { ...result.summary, divergenceUnit: "m/s" } }, document, checked))
      .toEqual({ kind: "combined", vector: "changed", scalar: "changed",
        complex: "changed", divergence: "changed" });
    expect(() => validateCombinedRegionGraphGroup(group.map(item => item.origin),
      group.map((item, index) => index === 4 ? item.rows.map((row, column) =>
        column === 8 ? { ...row, y: 42 } : row) : item.rows))).toThrow();
    const wider = { ...region, bounds: [[-6, 6], [-1, 1]] as const };
    const gaps = divergenceRegionProfile(wider,
      sampleVectorField3DDerivedSlice(document, 2, 0, "divergence"));
    expect(gaps.gaps).toBeGreaterThan(0);
    expect(gaps.rows[0]!.y).toBeNull();
  });

  it("saves and reverifies curl magnitude independently in the six-field region", async () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
      visible: true };
    const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", overlayRegion: region,
      scalarOverlay: { reference: scalarReference, title: "Quadratic potential",
        unit: "V", opacity: 0.8, visible: true },
      complexOverlay: { ...complexRecipe, mode: "phase-contours" } });
    const slice = sampleVectorField3DSlice(document, 2, 0);
    const inspection = sampleCombinedRegion(document, slice, region,
      sampleSliceOverlayVectorPlane(document, slice), scalarReference, scalarVolume,
      complexReal.reference, complexImaginary.reference,
      [complexReal.volume, complexImaginary.volume]);
    const divergence = divergenceRegionProfile(region,
      sampleVectorField3DDerivedSlice(document, 2, 0, "divergence"));
    const curlMagnitude = curlMagnitudeRegionProfile(region,
      sampleVectorField3DDerivedSlice(document, 2, 0, "curl-magnitude"));
    expect(curlMagnitude.unit).toBe("1/s");
    expect(curlMagnitude.count).toBe(289);
    expect(curlMagnitude.gaps).toBe(0);
    expect(curlMagnitude.rows.every(row => row.y !== null &&
      Math.abs(row.y - 2) < 1e-10)).toBe(true);
    const outside = curlMagnitudeRegionProfile({ ...region,
      bounds: [[-6, 6], [-1, 1]] as const },
      sampleVectorField3DDerivedSlice(document, 2, 0, "curl-magnitude"));
    expect(outside.gaps).toBeGreaterThan(0);
    expect(outside.rows[0]!.y).toBeNull();
    const summary = { ...inspection.summary,
      divergence: { count: divergence.count, gaps: divergence.gaps,
        mean: divergence.mean, min: divergence.min, max: divergence.max },
      divergenceUnit: divergence.unit,
      curlMagnitude: { count: curlMagnitude.count, gaps: curlMagnitude.gaps,
        mean: curlMagnitude.mean, min: curlMagnitude.min, max: curlMagnitude.max },
      curlMagnitudeUnit: curlMagnitude.unit };
    const result = createCombinedVectorField3DRegionResultWithCurl(document, region,
      summary, [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, []);
    expect(result.provenance.operation.algorithmVersion).toBe("17x17-v4");
    const group = linkedCombinedRegionGraphsWithCurl(document, region, inspection,
      [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, { ...divergence, samples: [] }, curlMagnitude);
    expect(group.map(item => item.origin.series)).toEqual([
      "vector", "scalar", "complex-magnitude", "complex-phase", "divergence",
      "curl-magnitude"]);
    expect(group.map(item => validGraph2DLinkedOverlayOrigin(item.origin)))
      .toEqual([true, true, true, true, true, true]);
    validateCombinedRegionGraphGroup(group.map(item => item.origin),
      group.map(item => item.rows));
    const store = new Graph2DPointTableStore();
    const graph = applyGraph2DAuthoring(createEmptyGraph2DDocument("curl-region"),
      { type: "create-point-series-group", drafts: group.map((item, index) => ({
        label: item.label, table: store.publish(item.rows), mode: "line" as const,
        domain: item.domain, linkedOrigin: item.origin,
        style: { color: ["#fde047", "#38bdf8", "#fb7185", "#a78bfa",
          "#34d399", "#f97316"][index]!, lineWidth: 2,
          lineStyle: "solid" as const, visible: true } })) });
    expect(parseGraph2DDocument(serializeGraph2DDocument(
      createGraph2DDocument({ ...graph, stableKey: "curl-region" })))
      .source.objects).toHaveLength(6);
    expect(linkedCombinedRegionGraphFocus(group.map(item => item.origin),
      group.map(item => item.rows), { kind: "point", x: 0 }).combined
      ?.map(item => item.series)).toContain("curl-magnitude");
    let sourceChecks = 0;
    const checked = { checkGraphDatasetReference: async ({ locator }: {
      locator: { value: string } }) => {
      sourceChecks++;
      return { ok: true as const, source: { manifestJson: locator.value ===
        "quadraticVolume" ? scalarManifest : complexManifest } };
    } } as unknown as
        NonNullable<typeof window.scientificScenes>;
    expect(await checkSavedRegionResultSources(result, document, checked)).toEqual({
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "source-current", divergence: "source-current",
      curlMagnitude: "source-current" });
    sourceChecks = 0;
    const session = createCombinedRegionVerificationSession();
    expect(await Promise.all(group.map(item =>
      checkCombinedRegionGraphSeries(item.origin, checked, session)))).toEqual([
      "current", "current", "current", "current", "current", "current"]);
    expect(sourceChecks).toBe(2);
    const wrongCurl = createCombinedVectorField3DRegionResultWithCurl(document, region,
      { ...summary, curlMagnitude: { count: 289, gaps: 0,
        mean: 3, min: 3, max: 3 } }, [], scalarVolume.sampleSha256,
      complexReal.volume.sampleSha256, complexImaginary.volume.sampleSha256, []);
    expect(await checkSavedRegionResultSources(wrongCurl, document, checked)).toEqual({
      kind: "combined", vector: "source-current", scalar: "source-current",
      complex: "source-current", divergence: "source-current",
      curlMagnitude: "changed" });
    const wrongRows = linkedCombinedRegionGraphsWithCurl(document, region, inspection,
      [], scalarVolume.sampleSha256, complexReal.volume.sampleSha256,
      complexImaginary.volume.sampleSha256, { ...divergence, samples: [] },
      { ...curlMagnitude, rows: curlMagnitude.rows.map(row => ({ ...row, y: 3 })) });
    validateCombinedRegionGraphGroup(wrongRows.map(item => item.origin),
      wrongRows.map(item => item.rows));
    expect(await Promise.all(wrongRows.map(item =>
      checkCombinedRegionGraphSeries(item.origin, checked)))).toEqual([
      "current", "current", "current", "current", "current", "changed"]);
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: document, expected: document.identity,
        replay: null }], activeDocumentIds: [document.identity.id],
      constructions: [], results: [result], relations: [
        vectorField3DRegionResultRelation(result)], artifacts: [],
      committedSelection: null }), { stableKey: "curl-region-result" });
    expect(parseMath3DProject(serializeMath3DProject(project)).workspace.results)
      .toEqual([result]);
    expect(serializeMath3DProject(project)).not.toContain('"values"');
  }, 15_000);

  it("publishes and plots a vector-only physical rectangle on all three planes", async () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const region = { normalAxis, fixedCoordinate: 0,
        bounds: [[-1, 1], [-1, 1]] as const, vectorChannel: "speed" as const,
        visible: true };
      const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
        selectedLayer: ({ 2: "xy", 1: "xz", 0: "yz" } as const)[normalAxis],
        overlayRegion: region, scalarOverlay: null, complexOverlay: null });
      const speed = await verifiedVectorRegionProfile(document, region);
      const derived = await verifiedCombinedDerivedRegionProfiles(document, region);
      expect(speed.statistics.count).toBe(289);
      expect(speed.rows).toHaveLength(17);
      expect(derived.divergence.unit).toBe("1/s");
      expect(derived.curlMagnitude.unit).toBe("1/s");
      const compact = (profile: typeof derived.divergence) => ({
        count: profile.count, gaps: profile.gaps, mean: profile.mean,
        min: profile.min, max: profile.max });
      const summary = { sampleCount: 289 as const, vector: speed.statistics,
        divergence: compact(derived.divergence),
        curlMagnitude: compact(derived.curlMagnitude), vectorUnit: speed.unit,
        divergenceUnit: derived.divergence.unit,
        curlMagnitudeUnit: derived.curlMagnitude.unit };
      const result = createVectorDerivedRegionResult(document, region, summary,
        speed.samples, derived.samples);
      expect(result.summary).toEqual(summary);
      expect(await checkSavedRegionResultSources(result, document, undefined)).toEqual({
        kind: "vector-derived", vector: "source-current",
        divergence: "source-current", curlMagnitude: "source-current" });
      const group = linkedVectorDerivedRegionGraphs(document, region, speed, derived);
      expect(group.map(item => item.origin.series)).toEqual([
        "vector", "divergence", "curl-magnitude"]);
      validateVectorDerivedRegionGraphGroup(group.map(item => item.origin),
        group.map(item => item.rows));
      const columnFocus = linkedVectorDerivedRegionGraphFocus(
        group.map(item => item.origin), group.map(item => item.rows),
        { kind: "point", x: group[1].rows[8]!.x });
      expect(columnFocus.columns).toEqual([8, 8]);
      expect(columnFocus.combined?.map(item => item.unit)).toEqual([
        "m/s", "1/s", "1/s"]);
      const intervalFocus = linkedVectorDerivedRegionGraphFocus(
        group.map(item => item.origin), group.map(item => item.rows),
        { kind: "interval", min: group[2].rows[4]!.x,
          max: group[2].rows[7]!.x });
      expect(intervalFocus.columns).toEqual([4, 7]);
      expect(intervalFocus.xBounds[0]).toBeLessThan(group[0].rows[4]!.x);
      expect(() => linkedVectorDerivedRegionGraphFocus(
        group.map(item => item.origin), group.map(item => item.rows),
        { kind: "interval", min: 1, max: -1 })).toThrow();
      expect(await Promise.all(group.map(item =>
        checkVectorDerivedRegionGraphSeries(item.origin)))).toEqual([
        "current", "current", "current"]);
      const wrongCurl = createVectorDerivedRegionResult(document, region,
        { ...summary, curlMagnitude: { count: 289, gaps: 0,
          mean: 3, min: 3, max: 3 } }, speed.samples, derived.samples);
      expect(await checkSavedRegionResultSources(wrongCurl, document, undefined)).toEqual({
        kind: "vector-derived", vector: "source-current",
        divergence: "source-current", curlMagnitude: "changed" });
      expect(() => validateVectorDerivedRegionGraphGroup(group.map(item => item.origin),
        group.map((item, index) => index === 2 ? item.rows.map((row, column) =>
          column === 8 ? { ...row, y: 42 } : row) : item.rows))).toThrow();
      expect(() => linkedVectorDerivedRegionGraphFocus(group.map(item => item.origin),
        group.map((item, index) => index === 1 ? item.rows.map((row, column) =>
          column === 8 ? { ...row, y: 42 } : row) : item.rows),
        { kind: "point", x: group[0].rows[8]!.x })).toThrow();
      const store = new Graph2DPointTableStore();
      const graph = applyGraph2DAuthoring(createEmptyGraph2DDocument("vector-derived"),
        { type: "create-point-series-group", drafts: group.map((item, index) => ({
          label: item.label, table: store.publish(item.rows), mode: "line" as const,
          domain: item.domain, linkedOrigin: item.origin,
          style: { color: ["#fde047", "#38bdf8", "#fb7185"][index]!,
            lineWidth: 2, lineStyle: "solid" as const, visible: true } })) });
      expect(graph.source.objects).toHaveLength(3);
      const project = createMath3DProject(createMixedWorkspaceDocument({
        entries: [{ module: "vector3d", checkpoint: document, expected: document.identity,
          replay: null }], activeDocumentIds: [document.identity.id],
        constructions: [], results: [result],
        relations: [vectorField3DRegionResultRelation(result)], artifacts: [],
        committedSelection: null }), { stableKey: `vector-derived-${normalAxis}` });
      expect(parseMath3DProject(serializeMath3DProject(project)).workspace.results)
        .toEqual([result]);
      expect(serializeMath3DProject(project)).not.toContain('"values"');
      if (normalAxis === 2) {
        const wide = { ...region, bounds: [[-6, 6], [-1, 1]] as const };
        const wideDocument = reviseVectorField3DWorkspace(document,
          { ...document.workspace!, overlayRegion: wide });
        const wideSpeed = await verifiedVectorRegionProfile(wideDocument, wide);
        const wideDerived = await verifiedCombinedDerivedRegionProfiles(wideDocument, wide);
        expect(wideSpeed.statistics.gaps).toBeGreaterThan(0);
        expect(wideSpeed.rows[0]!.y).toBeNull();
        expect(wideDerived.divergence.gaps).toBeGreaterThan(0);
        expect(wideDerived.curlMagnitude.rows[0]!.y).toBeNull();
      }
    }
  }, 20_000);

  it("sends aligned region column means to Graphs and reverifies both saved series", async () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const region = { normalAxis, fixedCoordinate: 0,
        bounds: [[-1, 1], [-1, 1]] as const,
        vectorChannel: "speed" as const, visible: true };
      const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
        selectedLayer: ({ 0: "yz", 1: "xz", 2: "xy" } as const)[normalAxis],
        overlayRegion: region, scalarOverlay: { reference: scalarReference,
          title: "Potential", unit: "V", opacity: 0.8, visible: true } });
      const slice = sampleVectorField3DSlice(document, normalAxis, 0);
      const summary = sampleOverlayRegion(document, slice, region,
        sampleSliceOverlayVectorPlane(document, slice), scalarReference, scalarVolume, "V");
      const pair = linkedOverlayRegionGraphPair(document, region, summary, [],
        [{ name: "scalar", sampleSha256: scalarVolume.sampleSha256 }], "Potential");
      expect(pair[0].rows).toHaveLength(17);
      expect(pair[0].rows.map(row => row.x)).toEqual(pair[1].rows.map(row => row.x));
      expect(pair[0].origin.region).toEqual(region);
      expect(pair[0].origin.yUnit).toBe("m/s");
      expect(pair[1].origin.yUnit).toBe("V");
      expect(pair[0].rows.every(row => row.y !== null)).toBe(true);
      const pointFocus = linkedRegionGraphFocus(pair[0].origin, pair[1].origin,
        pair[0].rows, pair[1].rows, { kind: "point", x: pair[0].rows[8]!.x });
      expect(pointFocus.columns).toEqual([8, 8]);
      expect(pointFocus.xBounds[0]).toBeLessThan(pair[0].rows[8]!.x);
      expect(pointFocus.xBounds[1]).toBeGreaterThan(pair[0].rows[8]!.x);
      expect(pointFocus.xUnit).toBe("m");
      expect(pointFocus.vectorUnit).toBe("m/s");
      expect(pointFocus.overlayUnit).toBe("V");
      const intervalFocus = linkedRegionGraphFocus(pair[0].origin, pair[1].origin,
        pair[0].rows, pair[1].rows,
        { kind: "interval", min: pair[0].rows[4]!.x, max: pair[0].rows[7]!.x });
      expect(intervalFocus.columns).toEqual([4, 7]);
      expect(() => linkedRegionGraphFocus(pair[0].origin, pair[1].origin,
        pair[0].rows, pair[1].rows, { kind: "interval", min: 0.01, max: -0.01 }))
        .toThrow(/increasing interval/);
      expect(() => linkedRegionGraphFocus(pair[0].origin, pair[1].origin,
        pair[0].rows.map((row, index) => index === 8 ? { ...row, y: 999 } : row),
        pair[1].rows, { kind: "point", x: 0 })).toThrow(/point tables/);
      const atZero = pair[1].rows[8]!;
      expect(atZero.x).toBeCloseTo(0, 12);
      expect(atZero.y).toBeCloseTo(summary.profileRows[8]!.scalar!, 12);
      const store = new Graph2DPointTableStore();
      const drafts = pair.map((part, index) => ({ label: part.label,
        table: store.publish(part.rows), mode: "line" as const, domain: part.domain,
        linkedOrigin: part.origin, style: { color: index ? "#38bdf8" : "#fde047",
          lineWidth: 2, lineStyle: "solid" as const, visible: true } })) as
        [typeof pair[number] & { table: ReturnType<typeof store.publish> },
          typeof pair[number] & { table: ReturnType<typeof store.publish> }];
      const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(`region-${normalAxis}`),
        { type: "create-point-series-pair", drafts });
      const reopened = parseGraph2DDocument(serializeGraph2DDocument(
        createGraph2DDocument({ ...scene, stableKey: `region-${normalAxis}` })));
      expect(reopened.source.objects.map(object => object.kind === "point-series" ?
        object.linkedOrigin?.kind : null)).toEqual([
          "vector-scalar-linked-region/v1", "vector-scalar-linked-region/v1"]);
      const bridge = { checkGraphDatasetReference: async () => ({ ok: true as const,
        source: { manifestJson: scalarManifest, fingerprint: scalarFingerprint } }),
        openGraphDatasetReference: async () => ({ ok: true as const,
          source: { manifestJson: scalarManifest, fingerprint: scalarFingerprint } }),
        previewGraphVolume: async () => scalarVolume,
        closeGraphDataset: async () => true } as unknown as
          NonNullable<typeof window.scientificScenes>;
      await expect(reverifyLinkedOverlayRegionGraphPair(pair[0].origin,
        pair[1].origin, bridge)).resolves.toBeUndefined();
      const changed = { ...bridge, checkGraphDatasetReference: async () => ({
        ok: false as const, status: "changed" as const, error: "resource changed" }) } as
        unknown as NonNullable<typeof window.scientificScenes>;
      await expect(reverifyLinkedOverlayRegionGraphPair(pair[0].origin,
        pair[1].origin, changed)).rejects.toThrow(/changed/);
    }
  });

  it("keeps explicit region gaps and hashes both complex phase components", async () => {
    const region = { normalAxis: 2 as const, fixedCoordinate: 0,
      bounds: [[-6, 6], [-1, 1]] as const,
      vectorChannel: "speed" as const, visible: true };
    const document = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
      selectedLayer: "xy", overlayRegion: region,
      complexOverlay: { ...complexRecipe, mode: "phase" } });
    const slice = sampleVectorField3DSlice(document, 2, 0);
    const summary = sampleOverlayRegion(document, slice, region,
      sampleSliceOverlayVectorPlane(document, slice), complexReal.reference,
      complexReal.volume, "rad", { imaginaryReference: complexImaginary.reference,
        imaginaryVolume: complexImaginary.volume, mode: "phase" });
    const pair = linkedOverlayRegionGraphPair(document, region, summary, [], [
      { name: "real", sampleSha256: complexReal.volume.sampleSha256 },
      { name: "imaginary", sampleSha256: complexImaginary.volume.sampleSha256 }],
    "Wave amplitude phase");
    expect(pair.map(part => part.origin.series)).toEqual(["vector", "complex"]);
    expect(pair[0].origin.kind).toBe("vector-complex-linked-region/v1");
    expect(pair[0].rows.map(row => row.x)).toEqual(pair[1].rows.map(row => row.x));
    expect(pair[0].rows[0]!.y).toBeNull();
    expect(pair[1].rows[0]!.y).toBeNull();
    const gapFocus = linkedRegionGraphFocus(pair[0].origin, pair[1].origin,
      pair[0].rows, pair[1].rows, { kind: "point", x: pair[0].rows[0]!.x });
    expect(gapFocus.vectorGaps).toBe(1);
    expect(gapFocus.overlayGaps).toBe(1);
    expect(pair[1].origin.yUnit).toBe("rad");
    const bridge = { checkGraphDatasetReference: async () => ({ ok: true as const,
      source: { manifestJson: complexManifest, fingerprint: complexFingerprint } }),
      openGraphDatasetReference: async () => ({ ok: true as const,
        source: { manifestJson: complexManifest, fingerprint: complexFingerprint } }),
      previewGraphVolume: async ({ component }: { component: string }) =>
        component === "real" ? complexReal.volume : complexImaginary.volume,
      closeGraphDataset: async () => true } as unknown as
        NonNullable<typeof window.scientificScenes>;
    await expect(reverifyLinkedOverlayRegionGraphPair(pair[0].origin,
      pair[1].origin, bridge)).resolves.toBeUndefined();
    const missing = { ...bridge, checkGraphDatasetReference: async () => ({
      ok: false as const, status: "missing" as const, error: "resource missing" }) } as
      unknown as NonNullable<typeof window.scientificScenes>;
    await expect(reverifyLinkedOverlayRegionGraphPair(pair[0].origin,
      pair[1].origin, missing)).rejects.toThrow(/missing/);
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

  it("publishes aligned complex Graphs pairs with wrapped phase and both component hashes", async () => {
    for (const mode of ["magnitude", "phase"] as const) {
      for (const normalAxis of [2, 1, 0] as const) {
        const slice = sampleVectorField3DSlice(analytic, normalAxis, 0);
        const point = [0, 0, 0] as [number, number, number];
        point[slice.planeAxes[1]] = 0.5;
        const profile = { normalAxis, varyingAxis: slice.planeAxes[0] as 0 | 1 | 2,
          point, vectorChannel: "speed" as const, visible: true };
        const saved = reviseVectorField3DWorkspace(analytic, { ...analytic.workspace!,
          selectedLayer: ({ 0: "yz", 1: "xz", 2: "xy" } as const)[normalAxis],
          complexOverlay: { ...complexRecipe, mode }, linkedLineProfile: profile });
        const line = sampleLinkedOverlayLineProfile(saved, slice, profile,
          sampleSliceOverlayVectorPlane(saved, slice), complexReal.reference,
          complexReal.volume, mode === "phase" ? "rad" : "1",
          { imaginaryReference: complexImaginary.reference,
            imaginaryVolume: complexImaginary.volume, mode });
        const pair = linkedOverlayGraphPair(saved, profile, line, [],
          `Wave amplitude ${mode}`);
        expect(pair[0].origin.kind).toBe("vector-complex-linked-line/v1");
        expect(pair.map(part => part.origin.series)).toEqual(["vector", "complex"]);
        expect(pair[0].rows.map(row => row.x)).toEqual(pair[1].rows.map(row => row.x));
        for (const [index, row] of pair[1].rows.entries()) {
          if (row.y === line.rows[index]!.scalar) continue;
          expect(mode).toBe("phase");
          expect(row.y).toBeNull();
          expect(Math.abs(line.rows[index]!.scalar! - line.rows[index - 1]!.scalar!))
            .toBeGreaterThan(Math.PI);
        }
        expect(pair[1].origin.yUnit).toBe(mode === "phase" ? "rad" : "1");
        if (pair[0].origin.kind !== "vector-complex-linked-line/v1") throw new Error("Wrong origin");
        expect(pair[0].origin.realReference).toEqual(complexReal.reference);
        expect(pair[0].origin.imaginaryReference).toEqual(complexImaginary.reference);
        expect(pair[0].origin.realSampleSha256).toBe(complexReal.volume.sampleSha256);
        expect(pair[0].origin.imaginarySampleSha256).toBe(complexImaginary.volume.sampleSha256);
        if (mode === "phase" && normalAxis === 2) {
          expect(line.rows.some((row, index) => index > 0 && row.scalar !== null &&
            line.rows[index - 1]!.scalar !== null &&
            Math.abs(row.scalar - line.rows[index - 1]!.scalar!) > Math.PI)).toBe(true);
          expect(pair[1].rows.filter(row => row.y === null).length)
            .toBeGreaterThan(line.rows.filter(row => row.scalar === null).length);
        }
        const store = new Graph2DPointTableStore();
        const drafts = pair.map((part, index) => ({ label: part.label,
          table: store.publish(part.rows), mode: "line" as const, domain: part.domain,
          linkedOrigin: part.origin, style: { color: index ? "#38bdf8" : "#fde047",
            lineWidth: 2, lineStyle: "solid" as const, visible: true } })) as
          [typeof pair[number] & { table: ReturnType<typeof store.publish> },
            typeof pair[number] & { table: ReturnType<typeof store.publish> }];
        const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument(`complex-${mode}-${normalAxis}`),
          { type: "create-point-series-pair", drafts });
        const reopened = parseGraph2DDocument(serializeGraph2DDocument(
          createGraph2DDocument({ ...scene, stableKey: `complex-${mode}-${normalAxis}` })));
        expect(reopened.source.objects.map(object => object.kind === "point-series" ?
          object.linkedOrigin?.series : null)).toEqual(["vector", "complex"]);
        const bridge = { openGraphDatasetReference: async () => ({ ok: true as const,
          source: { manifestJson: complexManifest, fingerprint: complexFingerprint } }),
        previewGraphVolume: async ({ component }: { component: string }) =>
          component === "real" ? complexReal.volume : complexImaginary.volume,
        closeGraphDataset: async () => true } as unknown as
          NonNullable<typeof window.scientificScenes>;
        await expect(reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin, bridge))
          .resolves.toBeUndefined();
        const changed = { ...bridge, previewGraphVolume: async ({ component }: { component: string }) =>
          component === "real" ? complexReal.volume : { ...complexImaginary.volume,
            sampleSha256: "0".repeat(64) } } as unknown as NonNullable<typeof window.scientificScenes>;
        await expect(reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin, changed))
          .rejects.toThrow();
        const changedReal = { ...bridge, previewGraphVolume: async ({ component }: { component: string }) =>
          component === "real" ? { ...complexReal.volume, sampleSha256: "0".repeat(64) } :
            complexImaginary.volume } as unknown as NonNullable<typeof window.scientificScenes>;
        await expect(reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin, changedReal))
          .rejects.toThrow();
        await expect(reverifyLinkedOverlayGraphPair(pair[0].origin,
          { ...pair[1].origin, rowsSha256: `sha256:${"0".repeat(64)}` }, bridge))
          .rejects.toThrow(/rows differ/);
      }
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
