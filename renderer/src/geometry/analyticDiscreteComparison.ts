import { analyzeExactSurface, type ExactSurfaceSample, type ExactSurfaceVec3, type GeometryAnalyticSurfaceDefinition } from "./exactSurfaceAnalysis";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type GeometryDiscreteTargetKind = "display-tessellation" | "derived-analysis-mesh" | "saved-mesh-result";
export type GeometryMappingConfidence = "exact" | "heuristic" | "partial" | "unavailable";
export type GeometryComparisonQuantity = "position" | "normal" | "curvature" | "area" | "volume" | "boundary" | "geodesic" | "feature";
export type GeometryComparisonStatistics = { signedMean: number; absoluteMean: number; relativeMean: number | null; rms: number; p50: number; p95: number; maximum: number; worstSampleIndices: number[] };
export type GeometrySavedMeshFields = { gaussianCurvature?: readonly number[]; geodesicLength?: number; featureCount?: number; boundaryCount?: number; area?: number; volume?: number };
export type GeometryDiscreteComparisonTarget = { id: string; label: string; kind: GeometryDiscreteTargetKind; mesh: SurfaceMeshData; sourceRevision: number; tessellation: { chordTolerance: number; angularTolerance: number; maximumEdgeLength: number; parameterDensity: number }; engine: string; fields?: GeometrySavedMeshFields; analyticSampleToVertex?: readonly number[] };
export type GeometryQuantityComparison = { quantity: GeometryComparisonQuantity; available: boolean; analyticValue: number | string | null; discreteValue: number | string | null; unit: string; statistics: GeometryComparisonStatistics | null; explanation: string };
export type GeometryAnalyticDiscreteTargetResult = {
  target: Omit<GeometryDiscreteComparisonTarget, "mesh" | "fields" | "analyticSampleToVertex"> & { vertexCount: number; faceCount: number };
  mapping: { confidence: GeometryMappingConfidence; matched: number; total: number; method: string };
  quantities: GeometryQuantityComparison[];
  heatmap: Array<{ analyticPoint: ExactSurfaceVec3; discretePoint: ExactSurfaceVec3; signedError: number; absoluteError: number }>;
  correspondenceLines: Array<{ from: ExactSurfaceVec3; to: ExactSurfaceVec3; sampleIndex: number }>;
  worstMarkers: Array<{ point: ExactSurfaceVec3; error: number; sampleIndex: number }>;
  warnings: string[];
};
export type GeometryAnalyticDiscreteComparisonResult = {
  analytic: { id: string; label: string; revision: number; engine: string; units: string; sampleCount: number };
  targets: GeometryAnalyticDiscreteTargetResult[];
  tolerance: { absolute: number; relative: number };
  conventions: { exactDistinct: true; signedPosition: string; normal: string; relative: string };
  createdAt: string;
};

const position = (mesh: SurfaceMeshData, index: number): ExactSurfaceVec3 => [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]];
const normal = (mesh: SurfaceMeshData, index: number): ExactSurfaceVec3 | null => mesh.normals ? [mesh.normals[index * 3], mesh.normals[index * 3 + 1], mesh.normals[index * 3 + 2]] : null;
const sub = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const magnitude = (a: ExactSurfaceVec3): number => Math.hypot(a[0], a[1], a[2]);
const percentile = (sorted: readonly number[], p: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : 0;
const stats = (signed: readonly number[], absolute: readonly number[], references: readonly number[]): GeometryComparisonStatistics => {
  const sorted = [...absolute].sort((a, b) => a - b);
  const indexed = absolute.map((error, index) => ({ error, index })).sort((a, b) => b.error - a.error);
  const referenceMean = references.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, references.length);
  return { signedMean: signed.reduce((sum, value) => sum + value, 0) / Math.max(1, signed.length), absoluteMean: absolute.reduce((sum, value) => sum + value, 0) / Math.max(1, absolute.length), relativeMean: referenceMean > 1e-15 ? absolute.reduce((sum, value) => sum + value, 0) / Math.max(1, absolute.length) / referenceMean : null, rms: Math.sqrt(absolute.reduce((sum, value) => sum + value * value, 0) / Math.max(1, absolute.length)), p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), maximum: sorted[sorted.length - 1] ?? 0, worstSampleIndices: indexed.slice(0, Math.min(12, indexed.length)).map((entry) => entry.index) };
};

const meshAreaVolume = (mesh: SurfaceMeshData): { area: number; volume: number } => {
  let area = 0, volume = 0;
  const indices = mesh.indices ?? Uint32Array.from({ length: Math.floor(mesh.positions.length / 3) }, (_, index) => index);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = position(mesh, indices[i]), b = position(mesh, indices[i + 1]), c = position(mesh, indices[i + 2]);
    const ab = sub(b, a), ac = sub(c, a);
    const cross: ExactSurfaceVec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    area += magnitude(cross) / 2;
    volume += dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]) / 6;
  }
  return { area, volume: Math.abs(volume) };
};
const meshBoundaryCount = (mesh: SurfaceMeshData): number => {
  const edges = new Map<string, number>();
  const indices = mesh.indices ?? Uint32Array.from({ length: Math.floor(mesh.positions.length / 3) }, (_, index) => index);
  for (let i = 0; i + 2 < indices.length; i += 3) for (const [a, b] of [[indices[i], indices[i + 1]], [indices[i + 1], indices[i + 2]], [indices[i + 2], indices[i]]] as const) { const key = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
  return [...edges.values()].filter((count) => count === 1).length;
};
const analyticArea = (id: string): number | null => id === "plane" ? 16 : id === "sphere" ? 4 * Math.PI : id === "cylinder" ? 8 * Math.PI : id === "torus" ? 4 * Math.PI ** 2 * 2 * 0.7 : null;
const analyticVolume = (id: string): number | null => id === "sphere" ? 4 * Math.PI / 3 : id === "torus" ? 2 * Math.PI ** 2 * 2 * 0.7 ** 2 : null;
const analyticBoundary = (definition: GeometryAnalyticSurfaceDefinition): number => [definition.domain.u, definition.domain.v].filter((domain) => !domain.periodic).length * 2 + definition.trims.length;
const nearestVertex = (mesh: SurfaceMeshData, point: ExactSurfaceVec3): { index: number; point: ExactSurfaceVec3; distance: number } | null => {
  const count = Math.floor(mesh.positions.length / 3);
  if (!count) return null;
  let best = { index: 0, point: position(mesh, 0), distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < count; index += 1) { const candidate = position(mesh, index); const d = magnitude(sub(candidate, point)); if (d < best.distance) best = { index, point: candidate, distance: d }; }
  return best;
};

const scalarComparison = (quantity: GeometryComparisonQuantity, analyticValue: number | null, discreteValue: number | null, unit: string, explanation: string): GeometryQuantityComparison => {
  if (analyticValue == null || discreteValue == null || !Number.isFinite(analyticValue) || !Number.isFinite(discreteValue)) return { quantity, available: false, analyticValue, discreteValue, unit, statistics: null, explanation };
  const signed = discreteValue - analyticValue, absolute = Math.abs(signed);
  return { quantity, available: true, analyticValue, discreteValue, unit, statistics: stats([signed], [absolute], [analyticValue]), explanation };
};

export const compareAnalyticGeometryToDiscrete = (args: { definition: GeometryAnalyticSurfaceDefinition; targets: GeometryDiscreteComparisonTarget[]; uCount?: number; vCount?: number; absoluteTolerance?: number; relativeTolerance?: number; analyticGeodesicLength?: number; analyticFeatureCount?: number; createdAt?: string }): GeometryAnalyticDiscreteComparisonResult => {
  const absoluteTolerance = Math.max(1e-12, args.absoluteTolerance ?? 1e-6);
  const relativeTolerance = Math.max(0, args.relativeTolerance ?? 1e-4);
  const analysis = analyzeExactSurface({ definition: args.definition, u: (args.definition.domain.u.min + args.definition.domain.u.max) / 2, v: (args.definition.domain.v.min + args.definition.domain.v.max) / 2, uCount: args.uCount ?? 17, vCount: args.vCount ?? 17, tolerance: absoluteTolerance });
  const targets = args.targets.map((target): GeometryAnalyticDiscreteTargetResult => {
    const vertexCount = Math.floor(target.mesh.positions.length / 3);
    const mapped: Array<{ sample: ExactSurfaceSample; vertexIndex: number; discrete: ExactSurfaceVec3; distance: number }> = [];
    analysis.samples.forEach((sample, sampleIndex) => {
      const explicit = target.analyticSampleToVertex?.[sampleIndex];
      if (explicit != null && explicit >= 0 && explicit < vertexCount) mapped.push({ sample, vertexIndex: explicit, discrete: position(target.mesh, explicit), distance: magnitude(sub(position(target.mesh, explicit), sample.position)) });
      else { const nearest = nearestVertex(target.mesh, sample.position); if (nearest) mapped.push({ sample, vertexIndex: nearest.index, discrete: nearest.point, distance: nearest.distance }); }
    });
    const mappingConfidence: GeometryMappingConfidence = !mapped.length ? "unavailable" : target.analyticSampleToVertex?.length === analysis.samples.length ? "exact" : mapped.length === analysis.samples.length ? "heuristic" : "partial";
    const signedPosition = mapped.map((entry) => entry.sample.normal ? dot(sub(entry.discrete, entry.sample.position), entry.sample.normal) : entry.distance);
    const absolutePosition = mapped.map((entry) => entry.distance);
    const positionStats = mapped.length ? stats(signedPosition, absolutePosition, mapped.map((entry) => magnitude(entry.sample.position))) : null;
    const normalSigned: number[] = [], normalAbsolute: number[] = [];
    mapped.forEach((entry) => { const a = entry.sample.normal, b = normal(target.mesh, entry.vertexIndex); if (!a || !b) return; const angle = Math.acos(Math.min(1, Math.max(-1, dot(a, b) / Math.max(1e-15, magnitude(a) * magnitude(b))))); normalSigned.push(angle); normalAbsolute.push(Math.abs(angle)); });
    const curvatureSigned: number[] = [], curvatureAbsolute: number[] = [], curvatureReference: number[] = [];
    mapped.forEach((entry) => { const discrete = target.fields?.gaussianCurvature?.[entry.vertexIndex]; if (entry.sample.K == null || discrete == null || !Number.isFinite(discrete)) return; curvatureSigned.push(discrete - entry.sample.K); curvatureAbsolute.push(Math.abs(discrete - entry.sample.K)); curvatureReference.push(entry.sample.K); });
    const metrics = meshAreaVolume(target.mesh);
    const quantities: GeometryQuantityComparison[] = [
      { quantity: "position", available: Boolean(positionStats), analyticValue: "analytic surface samples", discreteValue: `${mapped.length} correspondences`, unit: args.definition.units.position, statistics: positionStats, explanation: mapped.length ? "Signed error is measured along the analytic oriented normal; absolute error is Euclidean." : "No vertex correspondence is available." },
      { quantity: "normal", available: normalAbsolute.length > 0, analyticValue: "analytic normals", discreteValue: target.mesh.normals ? "mesh vertex normals" : null, unit: "rad", statistics: normalAbsolute.length ? stats(normalSigned, normalAbsolute, normalAbsolute.map(() => 1)) : null, explanation: target.mesh.normals ? "Normal angular error uses matched vertices." : "Target has no vertex-normal field." },
      { quantity: "curvature", available: curvatureAbsolute.length > 0, analyticValue: "analytic Gaussian K", discreteValue: target.fields?.gaussianCurvature ? "saved mesh Gaussian K" : null, unit: `${args.definition.units.position}⁻²`, statistics: curvatureAbsolute.length ? stats(curvatureSigned, curvatureAbsolute, curvatureReference) : null, explanation: target.fields?.gaussianCurvature ? "Compared at mapped vertices." : "No compatible saved mesh curvature field or semantic correspondence." },
      scalarComparison("area", analyticArea(args.definition.id) ?? null, target.fields?.area ?? metrics.area, `${args.definition.units.position}²`, "Analytic exact area is unavailable for this surface definition."),
      scalarComparison("volume", analyticVolume(args.definition.id), target.fields?.volume ?? metrics.volume, `${args.definition.units.position}³`, "Volume comparison requires a closed analytic surface and a watertight discrete target."),
      scalarComparison("boundary", analyticBoundary(args.definition), target.fields?.boundaryCount ?? meshBoundaryCount(target.mesh), "count", "Boundary comparison uses semantic loops versus mesh boundary edges."),
      scalarComparison("geodesic", args.analyticGeodesicLength ?? null, target.fields?.geodesicLength ?? null, args.definition.units.position, "Geodesic comparison requires compatible analytic endpoints and a saved mesh path."),
      scalarComparison("feature", args.analyticFeatureCount ?? null, target.fields?.featureCount ?? null, "count", "Feature comparison requires matched feature definitions and saved Mesh results."),
    ];
    const heatmap = mapped.map((entry, index) => ({ analyticPoint: entry.sample.position, discretePoint: entry.discrete, signedError: signedPosition[index], absoluteError: absolutePosition[index] }));
    const worst = positionStats?.worstSampleIndices ?? [];
    const warnings = quantities.filter((entry) => !entry.available).map((entry) => `${entry.quantity}: ${entry.explanation}`);
    return { target: { id: target.id, label: target.label, kind: target.kind, sourceRevision: target.sourceRevision, tessellation: target.tessellation, engine: target.engine, vertexCount, faceCount: Math.floor((target.mesh.indices?.length ?? vertexCount) / 3) }, mapping: { confidence: mappingConfidence, matched: mapped.length, total: analysis.samples.length, method: target.analyticSampleToVertex ? "Geometry↔Mesh trace map" : mapped.length ? "nearest discrete vertex" : "none" }, quantities, heatmap, correspondenceLines: mapped.slice(0, 128).map((entry, index) => ({ from: entry.sample.position, to: entry.discrete, sampleIndex: index })), worstMarkers: worst.map((index) => ({ point: mapped[index].discrete, error: absolutePosition[index], sampleIndex: index })), warnings };
  });
  return { analytic: { id: args.definition.id, label: args.definition.label, revision: args.definition.revision, engine: "Geometry exact surface core", units: args.definition.units.position, sampleCount: analysis.samples.length }, targets, tolerance: { absolute: absoluteTolerance, relative: relativeTolerance }, conventions: { exactDistinct: true, signedPosition: "dot(discrete-analytic, analytic normal)", normal: "unsigned angular error in radians", relative: "absolute error divided by mean analytic magnitude" }, createdAt: args.createdAt ?? new Date().toISOString() };
};
