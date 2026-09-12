import {
  normalizeCurveDomain,
  sampleUniform,
  type AnyCurve,
  type Curve2D,
  type Curve3D,
  type CurvePoint,
} from "@math3d/core";
import type { AnalysisParameters } from "../analysis/contracts";
import type { SurfaceCurveResultLayer, SurfaceFeatureResultLayer } from "../surfaceAnalysis/contracts";
import type { CanonicalCurveDefinition, CurveDependency } from "./contracts";
import { adaptCoreCurveDefinition } from "./adapters";
import { adaptCurveDefinition } from "./infrastructure";

export type GeometryCurveSourceKind = "analytic-curve" | "section" | "intersection" | "construction-path" | "boundary" | "edge-selection" | "path-selection";
export type SurfaceCurveSourceKind = "boundary" | "iso-u" | "iso-v" | "geodesic" | "section" | "principal-k1" | "principal-k2" | "feature" | "surface-intersection";
export type CurveInteroperabilitySource = {
  module: "geometry" | "surfaces";
  kind: GeometryCurveSourceKind | SurfaceCurveSourceKind;
  objectId: string;
  revision: number;
  label: string;
  branchId?: string;
  hostSurface?: { surfaceId: string; revision: number };
  units?: { position: string; parameter: string };
  generation?: AnalysisParameters;
};

export type CurveSelectionCorrespondence = {
  kind: "exact-parameter" | "surface-chart" | "sample-index" | "unavailable";
  sourceEntityIds: readonly string[];
  parameters?: Float64Array;
  chartCoordinates?: Float64Array;
  sampleIndices?: Uint32Array;
  confidence?: Float32Array;
  explanation: string;
};

export type CanonicalCurveExchange = {
  version: 1;
  exchangeId: string;
  definition: CanonicalCurveDefinition;
  runtimeCurve: AnyCurve;
  source: CurveInteroperabilitySource;
  fidelity: "exact" | "parametric" | "polyline-approximation";
  approximationTolerance: number | null;
  correspondence: CurveSelectionCorrespondence;
  state: "current" | "stale" | "detached";
  staleReason: string | null;
  navigation: { source: string; derivative: string | null };
  warnings: readonly string[];
};

export type CurveExchangeCollection = {
  collectionId: string;
  source: CurveInteroperabilitySource;
  branches: CanonicalCurveExchange[];
  warnings: string[];
};

const stableHash = (value: unknown) => {
  const text = JSON.stringify(value, Object.keys(value as object).sort()); let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
};
const point3 = (point: CurvePoint) => ({ x: point.x, y: point.y, z: "z" in point ? point.z : 0 });
const distance = (a: CurvePoint, b: CurvePoint) => { const aa = point3(a); const bb = point3(b); return Math.hypot(aa.x - bb.x, aa.y - bb.y, aa.z - bb.z); };

export const polylineCurve = (args: { id: string; name: string; points: readonly CurvePoint[]; closed?: boolean; dimension?: 2 | 3 }): AnyCurve => {
  if (args.points.length < 2) throw new Error("A polyline curve requires at least two points.");
  const dimension = args.dimension ?? (args.points.some((point) => "z" in point) ? 3 : 2);
  const segments = args.closed ? args.points.length : args.points.length - 1;
  const evaluate = (uRaw: number) => {
    const u = Math.min(1, Math.max(0, uRaw)); const scaled = u * segments;
    const index = Math.min(segments - 1, Math.floor(scaled)); const alpha = u >= 1 ? 1 : scaled - index;
    const a = args.points[index]; const b = args.points[(index + 1) % args.points.length];
    const values = { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, z: point3(a).z + (point3(b).z - point3(a).z) * alpha };
    return dimension === 2 ? { x: values.x, y: values.y } : values;
  };
  return { id: args.id, name: args.name, kind: "polyline", family: "polyline", subtype: dimension === 2 ? "2d" : "3d", dimension, domain: normalizeCurveDomain({ tMin: 0, tMax: 1, closed: args.closed, periodic: args.closed }), eval: evaluate } as AnyCurve;
};

const definitionForPolyline = (curve: AnyCurve, source: CurveInteroperabilitySource, pointCount: number, tolerance: number, correspondence: CurveSelectionCorrespondence) => adaptCurveDefinition({
  id: curve.id, revision: source.revision, label: curve.name, representation: "polyline", dimension: curve.dimension,
  domain: { parameter: "u", min: 0, max: 1, closed: Boolean(curve.domain.closed), periodic: Boolean(curve.domain.periodic) },
  points: Array.from({ length: pointCount }, () => [] as number[]), sourceLabel: `${source.module}:${source.kind}:polyline-approximation`, sourceModule: source.module,
  sampling: { strategy: "source-samples", tolerance, minimumSamples: pointCount, maximumSamples: pointCount },
  units: { position: source.units?.position ?? "scene-unit", parameter: source.units?.parameter ?? "normalized polyline", angle: "rad" },
  dependencies: [{ module: source.module, objectId: source.objectId, revision: String(source.revision), relation: source.kind, correspondence: correspondence.explanation }],
  warnings: [`Polyline approximation at tolerance ${tolerance}. No source evaluator was available.`],
});

const exchange = (args: {
  source: CurveInteroperabilitySource; curve: AnyCurve; fidelity: CanonicalCurveExchange["fidelity"];
  definition: CanonicalCurveDefinition; tolerance?: number | null; correspondence: CurveSelectionCorrespondence; branch: number;
}): CanonicalCurveExchange => ({
  version: 1, exchangeId: `${args.source.module}:${args.source.objectId}@${args.source.revision}:${args.source.kind}:${args.branch}:${stableHash({ source: args.source, fingerprint: args.definition.fingerprint })}`,
  definition: args.definition, runtimeCurve: args.curve, source: { ...args.source, branchId: args.source.branchId ?? `branch-${args.branch}` }, fidelity: args.fidelity,
  approximationTolerance: args.tolerance ?? null, correspondence: args.correspondence, state: "current", staleReason: null,
  navigation: { source: `${args.source.module}:${args.source.objectId}@${args.source.revision}`, derivative: `${args.definition.identity.curveId}@${args.definition.identity.curveRevision}` },
  warnings: [...args.definition.warnings],
});

export const openEvaluatorCurveInCurves = (args: { source: CurveInteroperabilitySource; curve: AnyCurve; exact?: boolean; formulas?: { x: string; y: string; z?: string }; correspondence?: CurveSelectionCorrespondence }): CurveExchangeCollection => {
  const dependency: CurveDependency = { module: args.source.module, objectId: args.source.objectId, revision: String(args.source.revision), relation: args.source.kind, correspondence: args.correspondence?.explanation };
  const definition = adaptCoreCurveDefinition(args.curve, { revision: args.source.revision, sourceModule: args.source.module, formulas: args.formulas, dependencies: [dependency], units: args.source.units });
  const correspondence = args.correspondence ?? { kind: "exact-parameter", sourceEntityIds: [args.source.objectId], explanation: "The curve parameter maps directly to its source analytic entity." };
  return { collectionId: `${args.source.module}:${args.source.objectId}@${args.source.revision}`, source: args.source, branches: [exchange({ source: args.source, curve: args.curve, definition, fidelity: args.exact ? "exact" : "parametric", correspondence, branch: 0 })], warnings: [] };
};

export const openSampledCurvesInCurves = (args: { source: CurveInteroperabilitySource; branches: ReadonlyArray<ReadonlyArray<CurvePoint>>; parameterBranches?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>; closed?: boolean; tolerance: number }): CurveExchangeCollection => {
  const branches = args.branches.filter((points) => points.length >= 2).map((points, branch) => {
    const curve = polylineCurve({ id: `${args.source.objectId}:${args.source.kind}:branch-${branch}`, name: `${args.source.label} · branch ${branch + 1} (polyline approximation)`, points, closed: args.closed });
    const chart = args.parameterBranches?.[branch];
    const correspondence: CurveSelectionCorrespondence = chart?.length === points.length
      ? { kind: "surface-chart", sourceEntityIds: [args.source.objectId], parameters: Float64Array.from(points.map((_, index) => index / Math.max(1, points.length - 1))), chartCoordinates: Float64Array.from(chart.flatMap((uv) => [uv[0], uv[1]])), sampleIndices: Uint32Array.from(points.map((_, index) => index),), explanation: "Polyline samples retain their host Surface chart coordinates." }
      : { kind: "sample-index", sourceEntityIds: [args.source.objectId], parameters: Float64Array.from(points.map((_, index) => index / Math.max(1, points.length - 1))), sampleIndices: Uint32Array.from(points.map((_, index) => index)), explanation: "Polyline samples retain source order; no continuous evaluator or chart mapping was provided." };
    return exchange({ source: { ...args.source, branchId: args.source.branchId ?? `branch-${branch}` }, curve, fidelity: "polyline-approximation", definition: definitionForPolyline(curve, args.source, points.length, args.tolerance, correspondence), tolerance: args.tolerance, correspondence, branch });
  });
  return { collectionId: `${args.source.module}:${args.source.objectId}@${args.source.revision}:${args.source.kind}`, source: args.source, branches, warnings: branches.length ? [] : ["No branch contains enough finite points to open in Curves."] };
};

export const openSurfaceLayerInCurves = (layer: SurfaceCurveResultLayer | SurfaceFeatureResultLayer, options: { surfaceLabel?: string; tolerance?: number } = {}): CurveExchangeCollection => {
  const layerPolylines = "polylines" in layer ? layer.polylines : [];
  return openSampledCurvesInCurves({
    source: { module: "surfaces", kind: layer.layerKind === "geodesic" ? "geodesic" : layer.layerKind === "principal-k1" || layer.layerKind === "principal-k2" ? layer.layerKind : layer.layerKind === "level" ? "section" : "feature", objectId: layer.layerId, revision: layer.identity.surfaceRevision, label: options.surfaceLabel ?? layer.label, hostSurface: { surfaceId: layer.identity.surfaceId, revision: layer.identity.surfaceRevision }, units: { position: layer.identity.label ? "scene-unit" : "scene-unit", parameter: "normalized polyline" }, generation: layer.parameters },
    branches: layerPolylines.map((line) => line.map(([x, y, z]) => ({ x, y, z }))),
    parameterBranches: "parameterPolylines" in layer ? layer.parameterPolylines : undefined,
    tolerance: options.tolerance ?? 1e-3,
  });
};

export type SourceSelectionLocation = { state: "mapped" | "partial" | "unavailable" | "stale"; sourceEntityId: string | null; sourceParameter: number | null; chart: readonly [number, number] | null; sampleIndex: number | null; confidence: number | null; explanation: string };
export const mapCurveLocationToSource = (exchangeValue: CanonicalCurveExchange, parameter: number): SourceSelectionLocation => {
  if (exchangeValue.state === "stale") return { state: "stale", sourceEntityId: exchangeValue.source.objectId, sourceParameter: null, chart: null, sampleIndex: null, confidence: null, explanation: exchangeValue.staleReason ?? "Source revision changed." };
  const u = Math.min(1, Math.max(0, (parameter - exchangeValue.runtimeCurve.domain.tMin) / (exchangeValue.runtimeCurve.domain.tMax - exchangeValue.runtimeCurve.domain.tMin)));
  const correspondence = exchangeValue.correspondence;
  if (correspondence.kind === "exact-parameter") return { state: "mapped", sourceEntityId: correspondence.sourceEntityIds[0] ?? exchangeValue.source.objectId, sourceParameter: parameter, chart: null, sampleIndex: null, confidence: 1, explanation: correspondence.explanation };
  const count = correspondence.sampleIndices?.length ?? 0;
  if (!count) return { state: "unavailable", sourceEntityId: exchangeValue.source.objectId, sourceParameter: null, chart: null, sampleIndex: null, confidence: null, explanation: correspondence.explanation };
  const index = Math.min(count - 1, Math.round(u * (count - 1))); const sampleIndex = correspondence.sampleIndices![index];
  const chart = correspondence.chartCoordinates?.length === count * 2 ? [correspondence.chartCoordinates[index * 2], correspondence.chartCoordinates[index * 2 + 1]] as const : null;
  return { state: chart || correspondence.kind === "sample-index" ? "mapped" : "partial", sourceEntityId: correspondence.sourceEntityIds[0] ?? exchangeValue.source.objectId, sourceParameter: correspondence.parameters?.[index] ?? u, chart, sampleIndex, confidence: correspondence.confidence?.[index] ?? 1, explanation: correspondence.explanation };
};

export const markCurveExchangeStale = (value: CanonicalCurveExchange, currentSourceRevision: number): CanonicalCurveExchange => currentSourceRevision === value.source.revision || value.state === "detached" ? value : { ...value, state: "stale", staleReason: `Source changed from revision ${value.source.revision} to ${currentSourceRevision}.`, navigation: { ...value.navigation, derivative: null } };
export const detachCurveExchange = (value: CanonicalCurveExchange): CanonicalCurveExchange => ({ ...value, state: "detached", staleReason: null, navigation: { ...value.navigation, derivative: null } });

export type SurfaceConstructionKind = "extrusion" | "revolution" | "sweep" | "ruled-surface" | "loft" | "tube-surface";
export type CurveToSurfaceRequest = { version: 1; requestId: string; kind: SurfaceConstructionKind; inputs: ReadonlyArray<{ curveId: string; curveRevision: number; exchangeId: string; fidelity: CanonicalCurveExchange["fidelity"] }>; parameters: AnalysisParameters; sourceNavigation: string[]; warnings: string[] };
export const createCurveToSurfaceRequest = (kind: SurfaceConstructionKind, exchanges: readonly CanonicalCurveExchange[], parameters: AnalysisParameters = {}): CurveToSurfaceRequest => {
  const required = kind === "ruled-surface" || kind === "loft" ? 2 : 1;
  if (exchanges.length < required) throw new Error(`${kind} requires at least ${required} Curve input${required === 1 ? "" : "s"}.`);
  if (exchanges.some((entry) => entry.state === "stale")) throw new Error("Stale Curve inputs must be regenerated or detached before Surface construction.");
  return { version: 1, requestId: `curve-to-surface:${kind}:${stableHash({ ids: exchanges.map((entry) => entry.exchangeId), parameters })}`, kind, inputs: exchanges.map((entry) => ({ curveId: entry.definition.identity.curveId, curveRevision: entry.definition.identity.curveRevision, exchangeId: entry.exchangeId, fidelity: entry.fidelity })), parameters: { ...parameters }, sourceNavigation: exchanges.map((entry) => entry.navigation.source), warnings: exchanges.filter((entry) => entry.fidelity === "polyline-approximation").map((entry) => `${entry.definition.identity.label} is a polyline approximation at tolerance ${entry.approximationTolerance}.`) };
};

export const verifyCurveExchangeParity = (exchangeValue: CanonicalCurveExchange, samples = 64, tolerance = 1e-9): { ok: boolean; maximumDeviation: number; sampleCount: number } => {
  const runtime = sampleUniform(exchangeValue.runtimeCurve, samples); let maximumDeviation = 0;
  for (const row of runtime) maximumDeviation = Math.max(maximumDeviation, distance(row.point, exchangeValue.runtimeCurve.eval(row.t)));
  return { ok: maximumDeviation <= tolerance, maximumDeviation, sampleCount: runtime.length };
};
