import { analyzeExactCurve, type GeometryAnalyticCurveDefinition } from "./exactCurveAnalysis";
import { analyzeExactSurface, type ExactSurfaceVec3, type GeometryAnalyticSurfaceDefinition } from "./exactSurfaceAnalysis";
import { analyzeIntrinsicGeometry } from "./intrinsicGeometry";

export type GeometryMeasurementMethod = "exact-analytic" | "numerical-parametric" | "tessellated-fallback";
export type GeometryMeasurementNotation = "fixed" | "scientific" | "engineering";
export type GeometryMeasurementQuantity = "point-distance" | "curve-length" | "angle" | "dihedral" | "radius" | "diameter" | "area" | "volume" | "centroid" | "bounds" | "principal-extents" | "curvature" | "gaussian-curvature" | "torsion";
export type GeometryCanonicalMeasurement = { id: string; quantity: GeometryMeasurementQuantity; label: string; value: number | ExactSurfaceVec3 | readonly [ExactSurfaceVec3, ExactSurfaceVec3] | readonly [number, number, number]; unit: string; dimension: -2 | -1 | 0 | 1 | 2 | 3; method: GeometryMeasurementMethod; absoluteTolerance: number; relativeTolerance: number; sourceRevision: number };
export type GeometrySectionKind = "plane" | "axis" | "normal" | "parameter" | "iso-u" | "iso-v";
export type GeometryCanonicalSection = { id: string; kind: GeometrySectionKind; parameter: number; points: ExactSurfaceVec3[]; closed: boolean; method: GeometryMeasurementMethod; sourceRevision: number };
export type GeometryMeasurementReport = {
  id: string;
  title: string;
  source: { id: string; label: string; revision: number };
  selection: { semantic: string; entityId: string | null };
  units: string;
  engine: string;
  parameters: Record<string, number | string | boolean>;
  timestamp: string;
  precision: { digits: number; notation: GeometryMeasurementNotation; absoluteTolerance: number; relativeTolerance: number };
  measurements: GeometryCanonicalMeasurement[];
  sections: GeometryCanonicalSection[];
  rows: Array<{ quantity: string; value: string; unit: string; method: GeometryMeasurementMethod }>;
};

const distance = (a: ExactSurfaceVec3, b: ExactSurfaceVec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vectorAngle = (a: ExactSurfaceVec3, b: ExactSurfaceVec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b) / Math.max(1e-15, Math.hypot(...a) * Math.hypot(...b)))));
const analyticArea = (id: string): number | null => id === "plane" ? 16 : id === "sphere" ? 4 * Math.PI : id === "cylinder" ? 8 * Math.PI : id === "torus" ? 4 * Math.PI ** 2 * 2 * 0.7 : null;
const analyticVolume = (id: string): number | null => id === "sphere" ? 4 * Math.PI / 3 : id === "torus" ? 2 * Math.PI ** 2 * 2 * 0.7 ** 2 : null;

export const formatGeometryMeasurement = (value: number, digits: number, notation: GeometryMeasurementNotation): string => {
  if (!Number.isFinite(value)) return String(value);
  const safeDigits = Math.max(1, Math.min(15, Math.floor(digits)));
  if (notation === "scientific") return value.toExponential(safeDigits - 1);
  if (notation === "engineering") {
    if (value === 0) return "0";
    const exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
    return `${(value / 10 ** exponent).toFixed(Math.max(0, safeDigits - 1))}e${exponent >= 0 ? "+" : ""}${exponent}`;
  }
  return value.toFixed(safeDigits);
};

const makeSection = (definition: GeometryAnalyticSurfaceDefinition, kind: GeometrySectionKind, parameter: number, count: number): GeometryCanonicalSection => {
  const p = Math.min(1, Math.max(0, parameter));
  const uValue = definition.domain.u.min + p * (definition.domain.u.max - definition.domain.u.min);
  const vValue = definition.domain.v.min + p * (definition.domain.v.max - definition.domain.v.min);
  const varyU = kind === "iso-v" || kind === "axis" || kind === "plane";
  const points = Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const u = varyU ? definition.domain.u.min + t * (definition.domain.u.max - definition.domain.u.min) : uValue;
    const v = varyU ? vValue : definition.domain.v.min + t * (definition.domain.v.max - definition.domain.v.min);
    return definition.evaluate(u, v);
  });
  return { id: `section:${definition.id}:r${definition.revision}:${kind}:${p.toFixed(6)}`, kind, parameter: p, points, closed: varyU ? definition.domain.u.periodic : definition.domain.v.periodic, method: "exact-analytic", sourceRevision: definition.revision };
};

export const analyzeCanonicalMeasurements = (args: {
  sourceId: string;
  surface: GeometryAnalyticSurfaceDefinition;
  curve?: GeometryAnalyticCurveDefinition;
  pointA?: ExactSurfaceVec3;
  pointB?: ExactSurfaceVec3;
  directionA?: ExactSurfaceVec3;
  directionB?: ExactSurfaceVec3;
  sectionParameter?: number;
  sceneUnit?: string;
  digits?: number;
  notation?: GeometryMeasurementNotation;
  absoluteTolerance?: number;
  relativeTolerance?: number;
  timestamp?: string;
}): GeometryMeasurementReport => {
  const unit = args.sceneUnit ?? "scene-unit";
  const digits = Math.max(1, Math.min(15, Math.floor(args.digits ?? 6)));
  const notation = args.notation ?? "fixed";
  const absoluteTolerance = Math.max(0, args.absoluteTolerance ?? 1e-9);
  const relativeTolerance = Math.max(0, args.relativeTolerance ?? 1e-6);
  const surface = analyzeExactSurface({ definition: args.surface, u: (args.surface.domain.u.min + args.surface.domain.u.max) / 2, v: (args.surface.domain.v.min + args.surface.domain.v.max) / 2, uCount: 25, vCount: 25, tolerance: absoluteTolerance || 1e-12 });
  const intrinsic = analyzeIntrinsicGeometry({ definition: args.surface, start: { u: args.surface.domain.u.min, v: args.surface.domain.v.min }, destination: { u: args.surface.domain.u.max, v: args.surface.domain.v.max }, gridResolution: 32, tolerance: absoluteTolerance || 1e-12 });
  const samples = surface.samples.map((sample) => sample.position);
  const min: ExactSurfaceVec3 = [Math.min(...samples.map((p) => p[0])), Math.min(...samples.map((p) => p[1])), Math.min(...samples.map((p) => p[2]))];
  const max: ExactSurfaceVec3 = [Math.max(...samples.map((p) => p[0])), Math.max(...samples.map((p) => p[1])), Math.max(...samples.map((p) => p[2]))];
  const centroid: ExactSurfaceVec3 = [samples.reduce((s, p) => s + p[0], 0) / samples.length, samples.reduce((s, p) => s + p[1], 0) / samples.length, samples.reduce((s, p) => s + p[2], 0) / samples.length];
  const extents: ExactSurfaceVec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const method: GeometryMeasurementMethod = analyticArea(args.surface.id) != null ? "exact-analytic" : "numerical-parametric";
  const base = (id: string, quantity: GeometryMeasurementQuantity, label: string, value: GeometryCanonicalMeasurement["value"], dimension: GeometryCanonicalMeasurement["dimension"], measurementUnit: string, measurementMethod = method): GeometryCanonicalMeasurement => ({ id, quantity, label, value, dimension, unit: measurementUnit, method: measurementMethod, absoluteTolerance, relativeTolerance, sourceRevision: args.surface.revision });
  const measurements: GeometryCanonicalMeasurement[] = [
    base("area", "area", "Surface area", analyticArea(args.surface.id) ?? intrinsic.surfaceArea, 2, `${unit}²`),
    base("centroid", "centroid", "Sampled centroid", centroid, 1, unit, "numerical-parametric"),
    base("bounds", "bounds", "Bounds", [min, max], 1, unit, "numerical-parametric"),
    base("principal-extents", "principal-extents", "Principal extents", extents, 1, unit, "numerical-parametric"),
    base("curvature", "curvature", "Mean curvature", surface.point.meanCurvature ?? Number.NaN, -1, `${unit}⁻¹`, "exact-analytic"),
    base("gaussian-curvature", "gaussian-curvature", "Gaussian curvature", surface.point.gaussianCurvature ?? Number.NaN, -2, `${unit}⁻²`, "exact-analytic"),
  ];
  const volume = analyticVolume(args.surface.id);
  if (volume != null) measurements.push(base("volume", "volume", "Enclosed volume", volume, 3, `${unit}³`, "exact-analytic"));
  if (args.pointA && args.pointB) measurements.push(base("point-distance", "point-distance", "Point-point distance", distance(args.pointA, args.pointB), 1, unit, "exact-analytic"));
  if (args.directionA && args.directionB) {
    measurements.push(base("angle", "angle", "Angle", vectorAngle(args.directionA, args.directionB), 0, "rad", "exact-analytic"));
    measurements.push(base("dihedral", "dihedral", "Dihedral angle", vectorAngle(args.directionA, args.directionB), 0, "rad", "exact-analytic"));
  }
  if (args.surface.id === "sphere" || args.surface.id === "cylinder") {
    measurements.push(base("radius", "radius", "Radius", 1, 1, unit, "exact-analytic"), base("diameter", "diameter", "Diameter", 2, 1, unit, "exact-analytic"));
  }
  if (args.curve) {
    const curve = analyzeExactCurve({ definition: args.curve, parameter: (args.curve.domain.min + args.curve.domain.max) / 2, sampleCount: 129, tolerance: absoluteTolerance || 1e-12 });
    measurements.push(base("curve-length", "curve-length", "Curve / edge length", curve.arcLength.value, 1, unit, curve.arcLength.method === "closed-form" ? "exact-analytic" : "numerical-parametric"));
    measurements.push(base("torsion", "torsion", "Curve torsion", curve.point.torsion ?? Number.NaN, -1, `${unit}⁻¹`, args.curve.capabilities.third === "exact" ? "exact-analytic" : "numerical-parametric"));
  }
  const kinds: GeometrySectionKind[] = ["plane", "axis", "normal", "parameter", "iso-u", "iso-v"];
  const sections = kinds.map((kind) => makeSection(args.surface, kind, args.sectionParameter ?? 0.5, 65));
  const printable = (value: GeometryCanonicalMeasurement["value"]): string => typeof value === "number" ? formatGeometryMeasurement(value, digits, notation) : JSON.stringify(value);
  return {
    id: `measurement-report:${args.sourceId}:r${args.surface.revision}`,
    title: `${args.surface.label} quantitative report`,
    source: { id: args.sourceId, label: args.surface.label, revision: args.surface.revision },
    selection: { semantic: "Geometry analytic surface", entityId: `face:${args.surface.id}` },
    units: unit,
    engine: "Geometry canonical measurement core",
    parameters: { surface: args.surface.id, sectionParameter: args.sectionParameter ?? 0.5 },
    timestamp: args.timestamp ?? new Date().toISOString(),
    precision: { digits, notation, absoluteTolerance, relativeTolerance },
    measurements,
    sections,
    rows: measurements.map((entry) => ({ quantity: entry.label, value: printable(entry.value), unit: entry.unit, method: entry.method })),
  };
};
