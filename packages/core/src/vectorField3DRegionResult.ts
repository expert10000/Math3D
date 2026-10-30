import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation, type DocumentRelation } from "./documentRelations";
import { type Graph2DFieldReference } from "./graph2dFieldReference";
import { type VectorField3DDocument, type VectorField3DOverlayRegion } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_REGION_RESULT_TYPE = "vector3d.linked-region" as const;
export const VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE = "vector3d.linked-region-combined" as const;
export const VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE = "vector3d.derived-region" as const;
export const VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE =
  "vector3d.derived-subrectangle" as const;
export const VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE =
  "vector3d.combined-subrectangle" as const;
export type CombinedRegionStatistics = Readonly<{
  count: number; gaps: number; mean: number | null; min: number | null;
  max: number | null }>;
export type CombinedRegionSummary = Readonly<{
  sampleCount: 289;
  vector: CombinedRegionStatistics; scalar: CombinedRegionStatistics;
  complexMagnitude: CombinedRegionStatistics; complexPhase: CombinedRegionStatistics;
  vectorUnit: string; scalarUnit: string; complexUnit: string;
}>;
export type CombinedDerivedRegionSummary = CombinedRegionSummary & Readonly<{
  divergence: CombinedRegionStatistics; divergenceUnit: string;
}>;
export type CombinedCurlRegionSummary = CombinedDerivedRegionSummary & Readonly<{
  curlMagnitude: CombinedRegionStatistics; curlMagnitudeUnit: string;
}>;
export type VectorDerivedRegionSummary = Readonly<{
  sampleCount: 289; vector: CombinedRegionStatistics;
  divergence: CombinedRegionStatistics; curlMagnitude: CombinedRegionStatistics;
  vectorUnit: string; divergenceUnit: string; curlMagnitudeUnit: string;
}>;
export type VectorDerivedSubrectangleSummary = Readonly<{
  sampleCount: number; vector: CombinedRegionStatistics;
  divergence: CombinedRegionStatistics; curlMagnitude: CombinedRegionStatistics;
  vectorUnit: string; divergenceUnit: string; curlMagnitudeUnit: string;
}>;
export type VectorDerivedSubrectangleProfileHashes = Readonly<{
  columnPairId: string; rowPairId: string;
  columnRowsSha256: readonly [string, string, string];
  rowRowsSha256: readonly [string, string, string];
}>;
export type CombinedSubrectangleSummary = Readonly<{
  sampleCount: number; vector: CombinedRegionStatistics;
  scalar: CombinedRegionStatistics; complexMagnitude: CombinedRegionStatistics;
  complexPhase: CombinedRegionStatistics; divergence: CombinedRegionStatistics;
  curlMagnitude: CombinedRegionStatistics; vectorUnit: string;
  scalarUnit: string; complexUnit: string; divergenceUnit: string;
  curlMagnitudeUnit: string;
}>;
export type CombinedSubrectangleProfileHashes = Readonly<{
  columnPairId: string; rowPairId: string;
  columnRowsSha256: readonly [string, string, string, string, string, string];
  rowRowsSha256: readonly [string, string, string, string, string, string];
}>;
export type VectorField3DRegionStatistics = Readonly<{ mean: number; min: number; max: number }>;
export type VectorField3DRegionSummary = Readonly<{
  sampleCount: number; vectorCount: number; scalarCount: number; alignedCount: number;
  vector: VectorField3DRegionStatistics | null;
  scalar: VectorField3DRegionStatistics | null;
  scalarOutsideAreaPercent: number; vectorOutsideAreaPercent: number;
  vectorUnit: string; scalarUnit: string;
  scalarSampleSha256: string; vectorSourceHash: string;
}>;
export type VectorField3DRegionSampleDigest = Readonly<{ name: string; sampleSha256: string }>;
const validCombinedStatistics = (value: CombinedRegionStatistics) =>
  Number.isInteger(value.count) && value.count >= 0 && value.count <= 289 &&
  value.gaps === 289 - value.count &&
  (value.count === 0 ? value.mean === null && value.min === null && value.max === null :
    value.min !== null && value.max !== null && Number.isFinite(value.min) &&
    Number.isFinite(value.max) && (value.mean === null ||
      Number.isFinite(value.mean) && value.min <= value.mean && value.mean <= value.max));

/** Save a compact, source-linked 17×17 region calculation; no field lattice enters the Project. */
export function createVectorField3DRegionResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, summary: VectorField3DRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  overlaySamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  const workspace = document.workspace;
  const scalar = workspace?.scalarOverlay?.visible ? workspace.scalarOverlay : null;
  const complex = !scalar && workspace?.complexOverlay?.visible ?
    { ...workspace.complexOverlay,
      mode: workspace.complexOverlay.mode === "phase-contours" ?
        "phase" as const : workspace.complexOverlay.mode } : null;
  if (!workspace || !region.visible ||
      canonicalJsonStringify(workspace.overlayRegion) !== canonicalJsonStringify(region) ||
      Number(!!scalar) + Number(!!complex) !== 1 || summary.alignedCount < 1 ||
      !summary.vector || !summary.scalar || summary.sampleCount !== 289 ||
      overlaySamples.length !== (complex ? 2 : 1) ||
      vectorSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0))
    throw new TypeError("Only a freshly verified aligned region can be published.");
  const refs: readonly Graph2DFieldReference[] = complex ? [complex.real, complex.imaginary] :
    [scalar!.reference];
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    overlayKind: complex ? "complex" : "scalar",
    overlayMode: complex?.mode ?? "scalar",
    overlayReferences: refs as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    overlaySamples: overlaySamples as unknown as CanonicalJsonValue,
  };
  const compactSummary: Record<string, CanonicalJsonValue> = {
    sampleCount: summary.sampleCount, vectorCount: summary.vectorCount,
    scalarCount: summary.scalarCount, alignedCount: summary.alignedCount,
    vector: summary.vector, scalar: summary.scalar,
    scalarOutsideAreaPercent: summary.scalarOutsideAreaPercent,
    vectorOutsideAreaPercent: summary.vectorOutsideAreaPercent,
    vectorUnit: summary.vectorUnit, scalarUnit: summary.scalarUnit,
    scalarSampleSha256: summary.scalarSampleSha256,
    vectorSourceHash: summary.vectorSourceHash,
  };
  const source = viewerSourceFromDocument(document);
  const resultId = `vector3d-region:${structuralHash({ source, parameters, compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_REGION_RESULT_TYPE,
      algorithm: "aligned-physical-region", algorithmVersion: "17x17-v1", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

export function vectorField3DRegionResultRelation(result: AnalysisResultEnvelope): DocumentRelation {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_REGION_RESULT_TYPE &&
      result.provenance.operation.type !== VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE &&
      result.provenance.operation.type !== VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE &&
      result.provenance.operation.type !== VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE &&
      result.provenance.operation.type !== VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE)
    throw new TypeError("Expected a linked region result.");
  return createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: result.provenance.operation.type },
    operation: result.provenance.operation.type,
    parameters: result.provenance.operation.parameters });
}

/** A vector-only region keeps three compact statistics and two verified transfers. */
export function createVectorDerivedRegionResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, summary: VectorDerivedRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  derivedSamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  if (!region.visible || region.vectorChannel !== "speed" ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !== canonicalJsonStringify(region) ||
      summary.sampleCount !== 289 ||
      ![summary.vector, summary.divergence, summary.curlMagnitude].every(validCombinedStatistics) ||
      summary.vector.count === 0 ||
      summary.vectorUnit !== (document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits[0] : document.source.field.components[0].unit) ||
      summary.divergenceUnit !== `1/${document.source.timeUnit}` ||
      summary.curlMagnitudeUnit !== `1/${document.source.timeUnit}` ||
      new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      new Set(document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits :
        document.source.field.components.map(component => component.unit)).size !== 1 ||
      [vectorSamples, derivedSamples].some(samples => samples.length !==
        (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
        samples.some(item => !item.name || !/^[a-f0-9]{64}$/.test(item.sampleSha256))))
    throw new TypeError("Vector-only region requires verified speed, divergence and curl statistics.");
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    derivedSamples: derivedSamples as unknown as CanonicalJsonValue,
    method: "bounded-finite-difference",
  };
  const source = viewerSourceFromDocument(document);
  const compactSummary = summary as unknown as Record<string, CanonicalJsonValue>;
  const resultId = `vector3d-derived-region:${structuralHash({ source, parameters,
    compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE,
      algorithm: "vector-derived-physical-region", algorithmVersion: "17x17-v1",
      parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

/** Recover the selected 17×17 cells from the two snapped physical intervals. */
export function vectorDerivedSubrectangleSelection(region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]]) {
  const selected = ([0, 1] as const).map(axis => {
    const [min, max] = region.bounds[axis], [low, high] = bounds[axis];
    const tolerance = Math.max(1, Math.abs(max - min)) * 1e-9;
    if (![min, max, low, high].every(Number.isFinite) || max <= min ||
        low < min - tolerance || high > max + tolerance || high < low)
      throw new RangeError("Subrectangle intervals must lie inside the physical rectangle.");
    const positions = Array.from({ length: 17 }, (_, index) =>
      min + (max - min) * index / 16);
    const first = positions.findIndex(value => value >= low - tolerance);
    const last = positions.reduce((found, value, index) =>
      value <= high + tolerance ? index : found, -1);
    if (first < 0 || last < first ||
        Math.abs(low - (first === 0 ? min :
          (positions[first - 1]! + positions[first]!) / 2)) > tolerance ||
        Math.abs(high - (last === 16 ? max :
          (positions[last]! + positions[last + 1]!) / 2)) > tolerance)
      throw new RangeError("Subrectangle intervals must match saved profile cells.");
    return [first, last] as const;
  });
  return { columns: selected[0]!, rows: selected[1]!,
    sampleCount: (selected[0]![1] - selected[0]![0] + 1) *
      (selected[1]![1] - selected[1]![0] + 1) };
}

/** Publish compact selected-cell statistics; source arrays remain external. */
export function createVectorDerivedSubrectangleResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  summary: VectorDerivedSubrectangleSummary,
  profiles: VectorDerivedSubrectangleProfileHashes,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  derivedSamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  const selection = vectorDerivedSubrectangleSelection(region, bounds);
  const validStatistic = (value: CombinedRegionStatistics) =>
    Number.isInteger(value.count) && value.count >= 0 &&
    value.count <= selection.sampleCount &&
    value.gaps === selection.sampleCount - value.count &&
    (value.count === 0 ? value.mean === null && value.min === null &&
      value.max === null : value.mean !== null && value.min !== null &&
      value.max !== null && [value.mean, value.min, value.max].every(Number.isFinite) &&
      value.min <= value.mean && value.mean <= value.max);
  const hash = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value);
  if (!region.visible || region.vectorChannel !== "speed" ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !== canonicalJsonStringify(region) ||
      document.workspace?.scalarOverlay?.visible || document.workspace?.complexOverlay?.visible ||
      summary.sampleCount !== selection.sampleCount ||
      ![summary.vector, summary.divergence, summary.curlMagnitude].every(validStatistic) ||
      summary.vectorUnit !== (document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits[0] : document.source.field.components[0].unit) ||
      summary.divergenceUnit !== `1/${document.source.timeUnit}` ||
      summary.curlMagnitudeUnit !== `1/${document.source.timeUnit}` ||
      new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      new Set(document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits :
        document.source.field.components.map(component => component.unit)).size !== 1 ||
      !hash(profiles.columnPairId) || !hash(profiles.rowPairId) ||
      profiles.columnPairId === profiles.rowPairId ||
      profiles.columnRowsSha256.length !== 3 || profiles.rowRowsSha256.length !== 3 ||
      [...profiles.columnRowsSha256, ...profiles.rowRowsSha256].some(value => !hash(value)) ||
      [vectorSamples, derivedSamples].some(samples => samples.length !==
        (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
        samples.some(item => !item.name || !/^[a-f0-9]{64}$/.test(item.sampleSha256))))
    throw new TypeError("A vector subrectangle needs verified statistics and six profile hashes.");
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    bounds: bounds as unknown as CanonicalJsonValue,
    profiles: profiles as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    derivedSamples: derivedSamples as unknown as CanonicalJsonValue,
    method: "bounded-finite-difference",
  };
  const source = viewerSourceFromDocument(document);
  const compactSummary = summary as unknown as Record<string, CanonicalJsonValue>;
  const resultId = `vector3d-derived-subrectangle:${structuralHash({ source,
    parameters, compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: {
      type: VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
      algorithm: "vector-derived-selected-cells", algorithmVersion: "17x17-v1",
      parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

/** Save six selected-cell statistics and twelve profile hashes without field arrays. */
export function createCombinedSubrectangleResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  summary: CombinedSubrectangleSummary,
  profiles: CombinedSubrectangleProfileHashes,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  derivedSamples: readonly VectorField3DRegionSampleDigest[],
  scalarSampleSha256: string, realSampleSha256: string,
  imaginarySampleSha256: string): AnalysisResultEnvelope {
  const selection = vectorDerivedSubrectangleSelection(region, bounds);
  const scalar = document.workspace?.scalarOverlay;
  const complex = document.workspace?.complexOverlay;
  const hash = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value);
  const digest = (value: string) => /^[a-f0-9]{64}$/.test(value);
  const valid = (value: CombinedRegionStatistics, phase = false) =>
    Number.isInteger(value.count) && value.count >= 0 &&
    value.count <= selection.sampleCount &&
    value.gaps === selection.sampleCount - value.count &&
    (value.count === 0 ? value.mean === null && value.min === null &&
      value.max === null : value.min !== null && value.max !== null &&
      Number.isFinite(value.min) && Number.isFinite(value.max) &&
      value.min <= value.max && (value.mean === null ? phase :
        Number.isFinite(value.mean) && (phase ||
          value.min <= value.mean && value.mean <= value.max)));
  const fieldStats = [summary.vector, summary.scalar, summary.complexMagnitude,
    summary.divergence, summary.curlMagnitude];
  if (!region.visible || region.vectorChannel !== "speed" ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !==
        canonicalJsonStringify(region) ||
      !scalar?.visible || !complex?.visible ||
      summary.sampleCount !== selection.sampleCount ||
      !fieldStats.every(stat => valid(stat)) ||
      !valid(summary.complexPhase, true) ||
      summary.vectorUnit !== (document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits[0] : document.source.field.components[0].unit) ||
      summary.scalarUnit !== scalar.unit || summary.complexUnit !== complex.unit ||
      summary.divergenceUnit !== `1/${document.source.timeUnit}` ||
      summary.curlMagnitudeUnit !== `1/${document.source.timeUnit}` ||
      new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      !hash(profiles.columnPairId) || !hash(profiles.rowPairId) ||
      profiles.columnPairId === profiles.rowPairId ||
      profiles.columnRowsSha256.length !== 6 || profiles.rowRowsSha256.length !== 6 ||
      [...profiles.columnRowsSha256, ...profiles.rowRowsSha256].some(value => !hash(value)) ||
      [scalarSampleSha256, realSampleSha256, imaginarySampleSha256].some(value =>
        !digest(value)) ||
      [vectorSamples, derivedSamples].some(samples => samples.length !==
        (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
        samples.some(item => !item.name || !digest(item.sampleSha256))))
    throw new TypeError("A combined subrectangle needs six verified statistics and twelve profile hashes.");
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    bounds: bounds as unknown as CanonicalJsonValue,
    profiles: profiles as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    scalarReference: scalar.reference as unknown as CanonicalJsonValue,
    realReference: complex.real as unknown as CanonicalJsonValue,
    imaginaryReference: complex.imaginary as unknown as CanonicalJsonValue,
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    derivedSamples: derivedSamples as unknown as CanonicalJsonValue,
    scalarSampleSha256, realSampleSha256, imaginarySampleSha256,
    method: "bounded-finite-difference",
  };
  const source = viewerSourceFromDocument(document);
  const compactSummary = summary as unknown as Record<string, CanonicalJsonValue>;
  const resultId = `vector3d-combined-subrectangle:${structuralHash({ source,
    parameters, compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: {
      type: VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
      algorithm: "combined-selected-cells", algorithmVersion: "17x17-v1",
      parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

/** The combined result stores compact statistics and pinned references, never sample arrays. */
export function createCombinedVectorField3DRegionResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, summary: CombinedRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  scalarSampleSha256: string, realSampleSha256: string,
  imaginarySampleSha256: string): AnalysisResultEnvelope {
  const workspace = document.workspace;
  const scalar = workspace?.scalarOverlay, complex = workspace?.complexOverlay;
  if (!workspace || !scalar?.visible || !complex?.visible || !region.visible ||
      canonicalJsonStringify(workspace.overlayRegion) !== canonicalJsonStringify(region) ||
      summary.sampleCount !== 289 ||
      ![summary.vector, summary.scalar, summary.complexMagnitude,
        summary.complexPhase].every(validCombinedStatistics) ||
      summary.vector.count === 0 || summary.scalar.count === 0 ||
      summary.complexMagnitude.count === 0 ||
      !summary.vectorUnit || !summary.scalarUnit || !summary.complexUnit ||
      summary.scalarUnit !== scalar.unit || summary.complexUnit !== complex.unit ||
      vectorSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
      [...vectorSamples.map(sample => sample.sampleSha256), scalarSampleSha256,
        realSampleSha256, imaginarySampleSha256].some(hash => !/^[a-f0-9]{64}$/.test(hash)))
    throw new TypeError("A combined region needs three freshly verified fields and valid statistics.");
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    scalarReference: scalar.reference as unknown as CanonicalJsonValue,
    realReference: complex.real as unknown as CanonicalJsonValue,
    imaginaryReference: complex.imaginary as unknown as CanonicalJsonValue,
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    scalarSampleSha256, realSampleSha256, imaginarySampleSha256,
  };
  const source = viewerSourceFromDocument(document);
  const compactSummary = summary as unknown as Record<string, CanonicalJsonValue>;
  const resultId = `vector3d-combined-region:${structuralHash({ source, parameters,
    compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
      algorithm: "independent-physical-region", algorithmVersion: "17x17-v2", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

/** V3 adds derived divergence statistics while v2 saved results remain readable. */
export function createCombinedVectorField3DRegionResultWithDivergence(
  document: VectorField3DDocument, region: VectorField3DOverlayRegion,
  summary: CombinedDerivedRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  scalarSampleSha256: string, realSampleSha256: string,
  imaginarySampleSha256: string,
  divergenceSamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  const { divergence, divergenceUnit, ...baseSummary } = summary;
  const base = createCombinedVectorField3DRegionResult(document, region, baseSummary,
    vectorSamples, scalarSampleSha256, realSampleSha256, imaginarySampleSha256);
  if (!validCombinedStatistics(divergence) ||
      divergenceUnit !== `1/${document.source.timeUnit}` ||
      divergenceSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
      divergenceSamples.some(item => !item.name || !/^[a-f0-9]{64}$/.test(item.sampleSha256)))
    throw new TypeError("Divergence requires valid statistics, units and verified vector samples.");
  const parameters: Record<string, CanonicalJsonValue> = {
    ...base.provenance.operation.parameters,
    divergenceMethod: "bounded-finite-difference",
    divergenceSamples: divergenceSamples as unknown as CanonicalJsonValue,
  };
  const compactSummary: Record<string, CanonicalJsonValue> = {
    ...base.summary, divergence, divergenceUnit };
  const source = viewerSourceFromDocument(document);
  const resultId = `vector3d-combined-region:${structuralHash({ source, parameters,
    compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
      algorithm: "independent-physical-region", algorithmVersion: "17x17-v3",
      parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

/** V4 adds curl magnitude using the same verified vector stencil as divergence. */
export function createCombinedVectorField3DRegionResultWithCurl(
  document: VectorField3DDocument, region: VectorField3DOverlayRegion,
  summary: CombinedCurlRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  scalarSampleSha256: string, realSampleSha256: string,
  imaginarySampleSha256: string,
  derivedSamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  const { curlMagnitude, curlMagnitudeUnit, ...divergenceSummary } = summary;
  const base = createCombinedVectorField3DRegionResultWithDivergence(document, region,
    divergenceSummary, vectorSamples, scalarSampleSha256, realSampleSha256,
    imaginarySampleSha256, derivedSamples);
  if (!validCombinedStatistics(curlMagnitude) ||
      curlMagnitudeUnit !== `1/${document.source.timeUnit}` ||
      new Set(document.source.axes.map(axis => axis.unit)).size !== 1)
    throw new TypeError("Curl magnitude requires matching coordinate units and valid statistics.");
  const parameters: Record<string, CanonicalJsonValue> = {
    ...base.provenance.operation.parameters,
    curlMagnitudeMethod: "bounded-finite-difference",
  };
  const compactSummary: Record<string, CanonicalJsonValue> = {
    ...base.summary, curlMagnitude, curlMagnitudeUnit };
  const source = viewerSourceFromDocument(document);
  const resultId = `vector3d-combined-region:${structuralHash({ source, parameters,
    compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
      algorithm: "independent-physical-region", algorithmVersion: "17x17-v4", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

export function reverifyVectorField3DRegionResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument, region: VectorField3DOverlayRegion,
  summary: VectorField3DRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  overlaySamples: readonly VectorField3DRegionSampleDigest[]): void {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_REGION_RESULT_TYPE)
    throw new TypeError("This is not a saved linked region result.");
  const fresh = createVectorField3DRegionResult(document, region, summary,
    vectorSamples, overlaySamples);
  if (saved.resultId !== fresh.resultId ||
      canonicalJsonStringify(saved.provenance.source) !== canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !== canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved region result differs from the verified sources or physical bounds.");
}
