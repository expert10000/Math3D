import {
  analyzeExactSurface,
  type ExactSurfaceAnalysisResult,
  type ExactSurfaceSample,
  type ExactSurfaceVec3,
  type GeometryAnalyticSurfaceDefinition,
} from "./exactSurfaceAnalysis";

export type CharacteristicLayerKind = "points" | "polylines" | "isolines" | "bands" | "glyphs" | "labels";
export type CharacteristicFeatureKind = "umbilic" | "parabolic" | "elliptic-region" | "hyperbolic-region" | "ridge" | "valley" | "silhouette" | "isophote" | "curvature-extremum" | "singularity";
export type CharacteristicResultLayer = {
  id: string;
  label: string;
  feature: CharacteristicFeatureKind;
  kind: CharacteristicLayerKind;
  points: ExactSurfaceVec3[];
  polylines: ExactSurfaceVec3[][];
  confidence: number;
  uncertainty: number;
  displayOnly: true;
  sourceRevision: number;
};

export type GeometrySingularity = {
  kind: "rank-deficient-jacobian" | "pole" | "identified-seam" | "trim-singularity" | "collapsed-span";
  parameter: { u: number; v: number } | null;
  position: ExactSurfaceVec3 | null;
  severity: "info" | "warning" | "error";
  description: string;
};

export type GeometryIntersectionPair = "curve-curve" | "curve-surface" | "surface-surface" | "surface-solid" | "self-intersection";
export type GeometryIntersectionType = "transverse" | "tangent" | "overlap" | "near-contact" | "degenerate" | "disjoint";
export type GeometryIntersectionProbe = {
  pair: GeometryIntersectionPair;
  distance: number;
  directionA?: ExactSurfaceVec3;
  directionB?: ExactSurfaceVec3;
  normalA?: ExactSurfaceVec3;
  normalB?: ExactSurfaceVec3;
  overlapMeasure?: number;
  rank?: number;
  expectedRank?: number;
};
export type GeometryIntersectionClassification = {
  pair: GeometryIntersectionPair;
  type: GeometryIntersectionType;
  confidence: number;
  uncertainty: number;
  explanation: string;
};

export type CharacteristicGeometryResult = {
  definition: { id: string; label: string; revision: number };
  layers: CharacteristicResultLayer[];
  counts: Record<CharacteristicFeatureKind, number>;
  singularities: GeometrySingularity[];
  intersections: GeometryIntersectionClassification[];
  scalarRanges: ExactSurfaceAnalysisResult["extrema"];
  conventions: { curvature: string; silhouette: string; isophote: string; promotion: string };
  tolerance: number;
  uncertainty: number;
  warnings: string[];
};

const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossMagnitude = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
const length = (a: ExactSurfaceVec3): number => Math.hypot(a[0], a[1], a[2]);
const normalizedDot = (a?: ExactSurfaceVec3, b?: ExactSurfaceVec3): number | null => a && b && length(a) > 0 && length(b) > 0 ? dot(a, b) / (length(a) * length(b)) : null;

export const classifyGeometryIntersection = (probe: GeometryIntersectionProbe, tolerance = 1e-6): GeometryIntersectionClassification => {
  const uncertainty = Math.max(1e-12, tolerance);
  if (!Number.isFinite(probe.distance) || (probe.expectedRank != null && (probe.rank ?? 0) < probe.expectedRank)) {
    return { pair: probe.pair, type: "degenerate", confidence: 0.45, uncertainty, explanation: "The local intersection system is rank deficient or contains non-finite data." };
  }
  if ((probe.overlapMeasure ?? 0) > tolerance) return { pair: probe.pair, type: "overlap", confidence: 0.98, uncertainty, explanation: "Coincident geometry persists over a positive-length or positive-area neighborhood." };
  if (probe.distance > tolerance) {
    const near = probe.distance <= tolerance * 10;
    return { pair: probe.pair, type: near ? "near-contact" : "disjoint", confidence: near ? 0.7 : 0.99, uncertainty, explanation: near ? "Separation is above the intersection tolerance but inside the near-contact band." : "Separation exceeds the near-contact band." };
  }
  let transverseMeasure: number | null = null;
  if (probe.pair === "curve-curve" || probe.pair === "self-intersection") transverseMeasure = probe.directionA && probe.directionB ? crossMagnitude(probe.directionA, probe.directionB) / Math.max(1e-15, length(probe.directionA) * length(probe.directionB)) : null;
  if (probe.pair === "curve-surface") transverseMeasure = Math.abs(normalizedDot(probe.directionA, probe.normalB) ?? 0);
  if (probe.pair === "surface-surface") transverseMeasure = probe.normalA && probe.normalB ? crossMagnitude(probe.normalA, probe.normalB) / Math.max(1e-15, length(probe.normalA) * length(probe.normalB)) : null;
  if (probe.pair === "surface-solid") transverseMeasure = 1 - Math.abs(normalizedDot(probe.normalA, probe.normalB) ?? 1);
  const transverse = (transverseMeasure ?? 0) > Math.sqrt(tolerance);
  return { pair: probe.pair, type: transverse ? "transverse" : "tangent", confidence: Math.min(0.99, 0.72 + Math.abs(transverseMeasure ?? 0) * 0.25), uncertainty, explanation: transverse ? "Independent local tangent spaces meet with non-zero crossing angle." : "The local tangent spaces agree within angular tolerance." };
};

const layer = (args: Omit<CharacteristicResultLayer, "displayOnly">): CharacteristicResultLayer => ({ ...args, displayOnly: true });
const midpoint = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const zeroSegments = (samples: ExactSurfaceSample[], uCount: number, vCount: number, value: (sample: ExactSurfaceSample) => number | null, tolerance: number): ExactSurfaceVec3[][] => {
  const result: ExactSurfaceVec3[][] = [];
  const edge = (a: ExactSurfaceSample, b: ExactSurfaceSample) => {
    const av = value(a);
    const bv = value(b);
    if (av == null || bv == null) return;
    if (Math.abs(av) <= tolerance || Math.abs(bv) <= tolerance || av * bv < 0) result.push([a.position, midpoint(a.position, b.position)]);
  };
  for (let j = 0; j < vCount; j += 1) for (let i = 0; i < uCount; i += 1) {
    const index = j * uCount + i;
    if (i + 1 < uCount) edge(samples[index], samples[index + 1]);
    if (j + 1 < vCount) edge(samples[index], samples[index + uCount]);
  }
  return result;
};

const localExtrema = (samples: ExactSurfaceSample[], uCount: number, vCount: number, key: "k1" | "k2", mode: "max" | "min", tolerance: number): ExactSurfaceVec3[] => {
  const points: ExactSurfaceVec3[] = [];
  for (let j = 1; j < vCount - 1; j += 1) for (let i = 1; i < uCount - 1; i += 1) {
    const index = j * uCount + i;
    const value = samples[index][key];
    if (value == null) continue;
    const neighbors = [samples[index - 1][key], samples[index + 1][key], samples[index - uCount][key], samples[index + uCount][key]].filter((entry): entry is number => entry != null);
    if (neighbors.length === 4 && (mode === "max" ? neighbors.every((entry) => value >= entry - tolerance) : neighbors.every((entry) => value <= entry + tolerance)) && neighbors.some((entry) => Math.abs(value - entry) > tolerance)) points.push(samples[index].position);
  }
  return points;
};

export const analyzeCharacteristicGeometry = (args: {
  definition: GeometryAnalyticSurfaceDefinition;
  uCount?: number;
  vCount?: number;
  viewDirection?: ExactSurfaceVec3;
  lightDirection?: ExactSurfaceVec3;
  isophoteLevel?: number;
  tolerance?: number;
  intersectionProbes?: GeometryIntersectionProbe[];
}): CharacteristicGeometryResult => {
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-6);
  const uCount = Math.max(9, Math.min(128, Math.floor(args.uCount ?? 33)));
  const vCount = Math.max(9, Math.min(128, Math.floor(args.vCount ?? 25)));
  const surface = analyzeExactSurface({ definition: args.definition, u: (args.definition.domain.u.min + args.definition.domain.u.max) / 2, v: (args.definition.domain.v.min + args.definition.domain.v.max) / 2, uCount, vCount, tolerance });
  const view: ExactSurfaceVec3 = args.viewDirection ?? [0, 0, 1];
  const light: ExactSurfaceVec3 = args.lightDirection ?? [0.3, 0.4, 1];
  const isophoteLevel = args.isophoteLevel ?? 0.5;
  const umbilics = surface.samples.filter((sample) => sample.k1 != null && sample.k2 != null && Math.abs(sample.k1 - sample.k2) <= tolerance * 10).map((sample) => sample.position);
  const elliptic = surface.samples.filter((sample) => (sample.K ?? 0) > tolerance).map((sample) => sample.position);
  const hyperbolic = surface.samples.filter((sample) => (sample.K ?? 0) < -tolerance).map((sample) => sample.position);
  const parabolic = zeroSegments(surface.samples, uCount, vCount, (sample) => sample.K, tolerance);
  const silhouettes = zeroSegments(surface.samples, uCount, vCount, (sample) => sample.normal ? normalizedDot(sample.normal, view) : null, tolerance * 10);
  const isophotes = zeroSegments(surface.samples, uCount, vCount, (sample) => sample.normal ? (normalizedDot(sample.normal, light) ?? 0) - isophoteLevel : null, tolerance * 10);
  const ridges = localExtrema(surface.samples, uCount, vCount, "k1", "max", tolerance);
  const valleys = localExtrema(surface.samples, uCount, vCount, "k2", "min", tolerance);
  const curvatureExtrema = [...ridges, ...valleys];
  const singularities: GeometrySingularity[] = [];
  surface.samples.filter((sample) => sample.classification === "degenerate").forEach((sample) => singularities.push({ kind: "rank-deficient-jacobian", parameter: { u: sample.u, v: sample.v }, position: sample.position, severity: "error", description: "Surface Jacobian rank is below two." }));
  for (const axis of ["u", "v"] as const) {
    const domain = args.definition.domain[axis];
    if (domain.seam === "identified") singularities.push({ kind: "identified-seam", parameter: null, position: null, severity: "info", description: `${axis} minimum and maximum boundaries are identified.` });
    for (const boundary of domain.singularBoundaries ?? []) singularities.push({ kind: "pole", parameter: null, position: null, severity: "warning", description: `${axis} ${boundary} boundary is a declared pole.` });
    if (domain.max - domain.min <= tolerance) singularities.push({ kind: "collapsed-span", parameter: null, position: null, severity: "error", description: `${axis} parameter span is collapsed.` });
  }
  args.definition.trims.forEach((trim) => singularities.push({ kind: "trim-singularity", parameter: null, position: null, severity: "warning", description: `Trim ${trim.id}: ${trim.description}` }));
  const uncertainty = Math.max((args.definition.domain.u.max - args.definition.domain.u.min) / (uCount - 1), (args.definition.domain.v.max - args.definition.domain.v.min) / (vCount - 1));
  const layers: CharacteristicResultLayer[] = [
    layer({ id: "umbilics", label: "Umbilics", feature: "umbilic", kind: "points", points: umbilics, polylines: [], confidence: 0.9, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "parabolic", label: "Parabolic curves", feature: "parabolic", kind: "isolines", points: [], polylines: parabolic, confidence: 0.82, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "elliptic", label: "Elliptic regions", feature: "elliptic-region", kind: "bands", points: elliptic, polylines: [], confidence: 0.95, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "hyperbolic", label: "Hyperbolic regions", feature: "hyperbolic-region", kind: "bands", points: hyperbolic, polylines: [], confidence: 0.95, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "ridges", label: "Ridges", feature: "ridge", kind: "glyphs", points: ridges, polylines: [], confidence: 0.72, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "valleys", label: "Valleys", feature: "valley", kind: "glyphs", points: valleys, polylines: [], confidence: 0.72, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "silhouettes", label: "Silhouettes", feature: "silhouette", kind: "isolines", points: [], polylines: silhouettes, confidence: 0.86, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "isophotes", label: "Isophotes", feature: "isophote", kind: "isolines", points: [], polylines: isophotes, confidence: 0.82, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "curvature-extrema", label: "Curvature extrema", feature: "curvature-extremum", kind: "labels", points: curvatureExtrema, polylines: [], confidence: 0.72, uncertainty, sourceRevision: args.definition.revision }),
    layer({ id: "singularities", label: "Singularities", feature: "singularity", kind: "points", points: singularities.flatMap((entry) => entry.position ? [entry.position] : []), polylines: [], confidence: 0.98, uncertainty, sourceRevision: args.definition.revision }),
  ];
  const counts = Object.fromEntries(layers.map((entry) => [entry.feature, entry.points.length + entry.polylines.length])) as Record<CharacteristicFeatureKind, number>;
  const warnings = [...surface.warnings];
  if (uncertainty > tolerance * 100) warnings.push("Characteristic isolines are sample-localized; refine the grid for lower positional uncertainty.");
  if (singularities.some((entry) => entry.severity === "error")) warnings.push("Rank-deficient samples are excluded from curvature-based feature classification.");
  return {
    definition: { id: args.definition.id, label: args.definition.label, revision: args.definition.revision },
    layers,
    counts,
    singularities,
    intersections: (args.intersectionProbes ?? []).map((probe) => classifyGeometryIntersection(probe, tolerance)),
    scalarRanges: surface.extrema,
    conventions: { curvature: "Mesh-compatible k1>=k2 and outward-convex positive", silhouette: "n·view=0", isophote: `n·light=${isophoteLevel}`, promotion: "Result layers remain display-only until explicit promotion." },
    tolerance,
    uncertainty,
    warnings,
  };
};

export const promoteCharacteristicLayer = (result: CharacteristicGeometryResult, layerId: string, explicit: boolean): { id: string; label: string; points: ExactSurfaceVec3[]; sourceRevision: number } => {
  if (!explicit) throw new Error("Characteristic overlay promotion requires an explicit user action.");
  const selected = result.layers.find((entry) => entry.id === layerId);
  if (!selected) throw new Error(`Characteristic layer ${layerId} is unavailable.`);
  return { id: `geometry-characteristic-${selected.id}`, label: `${selected.label} (promoted)`, points: selected.polylines.flat().length ? selected.polylines.flat() : selected.points, sourceRevision: selected.sourceRevision };
};
