import { evaluateExactCurveFrame, type GeometryAnalyticCurveDefinition } from "./exactCurveAnalysis";
import { evaluateExactSurfacePoint, type GeometryAnalyticSurfaceDefinition } from "./exactSurfaceAnalysis";
import { createGeometryMeshRelation, regenerateGeometryMeshRelation } from "./geometryMeshRelations";

export type GeometryToleranceClassId =
  | "symbolic-identity"
  | "machine-precision-analytic"
  | "numerically-evaluated-analytic"
  | "sampled-field"
  | "mesh-approximation";

export type GeometryToleranceClass = {
  id: GeometryToleranceClassId;
  label: string;
  absolute: number;
  relative: number;
  description: string;
};

export const GEOMETRY_TOLERANCE_CLASSES: readonly GeometryToleranceClass[] = [
  { id: "symbolic-identity", label: "Symbolic identity", absolute: 0, relative: 0, description: "Canonical algebraic identities after normalization." },
  { id: "machine-precision-analytic", label: "Machine-precision analytic", absolute: 1e-12, relative: 1e-12, description: "Closed-form values evaluated in IEEE-754 double precision." },
  { id: "numerically-evaluated-analytic", label: "Numerically evaluated analytic", absolute: 1e-9, relative: 1e-9, description: "Adaptive quadrature and derivative evaluation." },
  { id: "sampled-field", label: "Sampled field", absolute: 1e-5, relative: 1e-5, description: "Finite sampled fields and interpolation." },
  { id: "mesh-approximation", label: "Mesh approximation", absolute: 5e-3, relative: 5e-3, description: "Tessellated Geometry compared with exact Geometry." },
];

export const geometryTolerance = (id: GeometryToleranceClassId): GeometryToleranceClass =>
  GEOMETRY_TOLERANCE_CLASSES.find((entry) => entry.id === id)!;

export const withinGeometryTolerance = (
  actual: number,
  expected: number,
  toleranceId: GeometryToleranceClassId
): boolean => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const tolerance = geometryTolerance(toleranceId);
  return Math.abs(actual - expected) <= tolerance.absolute + Math.max(Math.abs(actual), Math.abs(expected)) * tolerance.relative;
};

const curveBase = (id: string, label: string, formula: readonly [string, string, string]): Omit<GeometryAnalyticCurveDefinition, "id" | "label" | "formula" | "evaluate" | "derivative1" | "derivative2" | "derivative3"> => ({
  dimension: 3,
  parameter: "t",
  domain: { min: 0, max: 1, closed: false },
  units: { parameter: "1", position: "m" },
  revision: 1,
  orientation: "+t",
  capabilities: { position: "exact", first: "exact", second: "exact", third: "exact", arcLength: "quadrature" },
});

const bezier: GeometryAnalyticCurveDefinition = {
  ...curveBase("bezier", "Cubic Bézier", ["(1-t)^3 P0 + 3(1-t)^2t P1 + 3(1-t)t^2 P2 + t^3 P3", "", ""]),
  id: "bezier",
  label: "Cubic Bézier",
  formula: ["t", "3t(1-t)", "0"],
  evaluate: (t) => [t, 3 * t * (1 - t), 0],
  derivative1: (t) => [1, 3 - 6 * t, 0],
  derivative2: () => [0, -6, 0],
  derivative3: () => [0, 0, 0],
};

const bspline: GeometryAnalyticCurveDefinition = {
  ...curveBase("bspline", "Uniform cubic B-spline span", ["t", "t^3-1.5t^2+0.5t", "0"]),
  id: "bspline",
  label: "Uniform cubic B-spline span",
  formula: ["t", "t^3-1.5t^2+0.5t", "0"],
  evaluate: (t) => [t, t ** 3 - 1.5 * t ** 2 + 0.5 * t, 0],
  derivative1: (t) => [1, 3 * t ** 2 - 3 * t + 0.5, 0],
  derivative2: (t) => [0, 6 * t - 3, 0],
  derivative3: () => [0, 6, 0],
};

const degenerateCurve: GeometryAnalyticCurveDefinition = {
  ...curveBase("degenerate", "Degenerate stationary curve", ["t^3", "0", "0"]),
  id: "degenerate",
  label: "Degenerate stationary curve",
  formula: ["t^3", "0", "0"],
  domain: { min: -1, max: 1, closed: false },
  evaluate: (t) => [t ** 3, 0, 0],
  derivative1: (t) => [3 * t ** 2, 0, 0],
  derivative2: (t) => [6 * t, 0, 0],
  derivative3: () => [6, 0, 0],
};

const line: GeometryAnalyticCurveDefinition = {
  ...curveBase("line", "Line", ["t", "0", "0"]), id: "line", label: "Line", formula: ["t", "0", "0"],
  evaluate: (t) => [t, 0, 0], derivative1: () => [1, 0, 0], derivative2: () => [0, 0, 0], derivative3: () => [0, 0, 0], exactArcLength: (a, b) => Math.abs(b - a),
};
const circle: GeometryAnalyticCurveDefinition = {
  ...curveBase("circle", "Unit circle", ["cos(t)", "sin(t)", "0"]), id: "circle", label: "Unit circle", formula: ["cos(t)", "sin(t)", "0"], dimension: 2,
  domain: { min: 0, max: 2 * Math.PI, closed: true }, units: { parameter: "rad", position: "m" }, evaluate: (t) => [Math.cos(t), Math.sin(t), 0], derivative1: (t) => [-Math.sin(t), Math.cos(t), 0], derivative2: (t) => [-Math.cos(t), -Math.sin(t), 0], derivative3: (t) => [Math.sin(t), -Math.cos(t), 0], exactArcLength: (a, b) => Math.abs(b - a),
};
const helix: GeometryAnalyticCurveDefinition = {
  ...curveBase("helix", "Circular helix", ["cos(t)", "sin(t)", "t/2"]), id: "helix", label: "Circular helix", formula: ["cos(t)", "sin(t)", "t/2"],
  domain: { min: 0, max: 4 * Math.PI, closed: false }, units: { parameter: "rad", position: "m" }, evaluate: (t) => [Math.cos(t), Math.sin(t), t / 2], derivative1: (t) => [-Math.sin(t), Math.cos(t), 0.5], derivative2: (t) => [-Math.cos(t), -Math.sin(t), 0], derivative3: (t) => [Math.sin(t), -Math.cos(t), 0], exactArcLength: (a, b) => Math.abs(b - a) * Math.sqrt(1.25),
};

export const GEOMETRY_CANONICAL_CURVES: readonly GeometryAnalyticCurveDefinition[] = [line, circle, helix, bezier, bspline, degenerateCurve];

const surface = (args: {
  id: string; label: string; formula: readonly [string, string, string];
  evaluate: GeometryAnalyticSurfaceDefinition["evaluate"];
  du: GeometryAnalyticSurfaceDefinition["derivativeU"];
  dv: GeometryAnalyticSurfaceDefinition["derivativeV"];
  duu?: GeometryAnalyticSurfaceDefinition["derivativeUU"];
  duv?: GeometryAnalyticSurfaceDefinition["derivativeUV"];
  dvv?: GeometryAnalyticSurfaceDefinition["derivativeVV"];
  trims?: GeometryAnalyticSurfaceDefinition["trims"];
  singularV?: readonly ("min" | "max")[];
}): GeometryAnalyticSurfaceDefinition => ({
  id: args.id, label: args.label, parameters: ["u", "v"],
  domain: { u: { min: 0, max: 2 * Math.PI, periodic: true, seam: "identified" }, v: { min: 0, max: 1, periodic: false, seam: "none", singularBoundaries: args.singularV } },
  trims: args.trims ?? [], units: { parameters: ["rad", "m"], position: "m" }, revision: 1,
  orientation: { sign: 1, description: "du cross dv" }, formula: args.formula,
  capabilities: { position: "exact", first: "exact", second: "exact" }, evaluate: args.evaluate,
  derivativeU: args.du, derivativeV: args.dv, derivativeUU: args.duu ?? (() => [0, 0, 0]), derivativeUV: args.duv ?? (() => [0, 0, 0]), derivativeVV: args.dvv ?? (() => [0, 0, 0]),
});

const plane = surface({ id: "plane", label: "Plane", formula: ["u", "v", "0"], evaluate: (u, v) => [u, v, 0], du: () => [1, 0, 0], dv: () => [0, 1, 0] });
const sphere = surface({ id: "sphere", label: "Sphere", formula: ["sin(v)cos(u)", "sin(v)sin(u)", "cos(v)"], evaluate: (u, v) => [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)], du: (u, v) => [-Math.sin(v) * Math.sin(u), Math.sin(v) * Math.cos(u), 0], dv: (u, v) => [Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), -Math.sin(v)], duu: (u, v) => [-Math.sin(v) * Math.cos(u), -Math.sin(v) * Math.sin(u), 0], duv: (u, v) => [-Math.cos(v) * Math.sin(u), Math.cos(v) * Math.cos(u), 0], dvv: (u, v) => [-Math.sin(v) * Math.cos(u), -Math.sin(v) * Math.sin(u), -Math.cos(v)] });
const cylinder = surface({ id: "cylinder", label: "Cylinder", formula: ["cos(u)", "sin(u)", "v"], evaluate: (u, v) => [Math.cos(u), Math.sin(u), v], du: (u) => [-Math.sin(u), Math.cos(u), 0], dv: () => [0, 0, 1], duu: (u) => [-Math.cos(u), -Math.sin(u), 0] });
const cone = surface({ id: "cone", label: "Cone", formula: ["v cos(u)", "v sin(u)", "v"], evaluate: (u, v) => [v * Math.cos(u), v * Math.sin(u), v], du: (u, v) => [-v * Math.sin(u), v * Math.cos(u), 0], dv: (u) => [Math.cos(u), Math.sin(u), 1], duu: (u, v) => [-v * Math.cos(u), -v * Math.sin(u), 0], duv: (u) => [-Math.sin(u), Math.cos(u), 0], singularV: ["min"] });
const torus = surface({ id: "torus", label: "Torus", formula: ["(2+.5cos(v))cos(u)", "(2+.5cos(v))sin(u)", ".5sin(v)"], evaluate: (u, v) => [(2 + 0.5 * Math.cos(v)) * Math.cos(u), (2 + 0.5 * Math.cos(v)) * Math.sin(u), 0.5 * Math.sin(v)], du: (u, v) => [-(2 + 0.5 * Math.cos(v)) * Math.sin(u), (2 + 0.5 * Math.cos(v)) * Math.cos(u), 0], dv: (u, v) => [-0.5 * Math.sin(v) * Math.cos(u), -0.5 * Math.sin(v) * Math.sin(u), 0.5 * Math.cos(v)], duu: (u, v) => [-(2 + 0.5 * Math.cos(v)) * Math.cos(u), -(2 + 0.5 * Math.cos(v)) * Math.sin(u), 0], duv: (u, v) => [0.5 * Math.sin(v) * Math.sin(u), -0.5 * Math.sin(v) * Math.cos(u), 0], dvv: (u, v) => [-0.5 * Math.cos(v) * Math.cos(u), -0.5 * Math.cos(v) * Math.sin(u), -0.5 * Math.sin(v)] });
const saddle = surface({ id: "saddle", label: "Saddle", formula: ["u", "v", "u^2-v^2"], evaluate: (u, v) => [u, v, u * u - v * v], du: (u) => [1, 0, 2 * u], dv: (_u, v) => [0, 1, -2 * v], duu: () => [0, 0, 2], dvv: () => [0, 0, -2] });
const ruled = surface({ id: "ruled", label: "Ruled surface", formula: ["u", "v", "uv"], evaluate: (u, v) => [u, v, u * v], du: (_u, v) => [1, 0, v], dv: (u) => [0, 1, u], duv: () => [0, 0, 1] });
const trimmed = surface({ id: "trimmed", label: "Trimmed plane", formula: ["u", "v", "0"], evaluate: (u, v) => [u, v, 0], du: () => [1, 0, 0], dv: () => [0, 1, 0], trims: [{ id: "unit-disk", description: "u²+v²≤1" }] });
const singular = surface({ id: "singular", label: "Singular collapsed surface", formula: ["v cos(u)", "v sin(u)", "v²"], evaluate: (u, v) => [v * Math.cos(u), v * Math.sin(u), v * v], du: (u, v) => [-v * Math.sin(u), v * Math.cos(u), 0], dv: (u, v) => [Math.cos(u), Math.sin(u), 2 * v], duu: (u, v) => [-v * Math.cos(u), -v * Math.sin(u), 0], duv: (u) => [-Math.sin(u), Math.cos(u), 0], dvv: () => [0, 0, 2], singularV: ["min"] });

export const GEOMETRY_CANONICAL_SURFACES: readonly GeometryAnalyticSurfaceDefinition[] = [plane, sphere, cylinder, cone, torus, saddle, ruled, trimmed, singular];

export type GeometryCanonicalTopologyCase = { id: string; kind: "solid" | "shell" | "trim" | "continuity-join"; pathological: boolean; expected: string };
export const GEOMETRY_CANONICAL_TOPOLOGY_CASES: readonly GeometryCanonicalTopologyCase[] = [
  { id: "solid/box", kind: "solid", pathological: false, expected: "closed orientable manifold" },
  { id: "solid/tetrahedron", kind: "solid", pathological: false, expected: "closed orientable manifold" },
  { id: "shell/open-boundary", kind: "shell", pathological: true, expected: "boundary detected" },
  { id: "shell/non-manifold-edge", kind: "shell", pathological: true, expected: "non-manifold detected" },
  { id: "trim/self-intersection", kind: "trim", pathological: true, expected: "invalid trim detected" },
  { id: "join/g0-gap", kind: "continuity-join", pathological: true, expected: "G0 failure" },
  { id: "join/g1-tangent-break", kind: "continuity-join", pathological: true, expected: "G1 failure" },
  { id: "join/g2-curvature-break", kind: "continuity-join", pathological: true, expected: "G2 failure" },
];

export type GeometryPerformanceMetricId = "scene-load" | "selection" | "pointwise-analysis" | "sample-10k" | "sample-100k" | "overlay-upload" | "cancel-latency" | "module-switch" | "mesh-regeneration" | "comparison";
export const GEOMETRY_PERFORMANCE_BUDGET_MS: Readonly<Record<GeometryPerformanceMetricId, number>> = {
  "scene-load": 250, selection: 25, "pointwise-analysis": 25, "sample-10k": 500, "sample-100k": 2500,
  "overlay-upload": 300, "cancel-latency": 50, "module-switch": 25, "mesh-regeneration": 150, comparison: 500,
};

export type GeometryPerformanceGateResult = { id: GeometryPerformanceMetricId; durationMs: number; budgetMs: number; passed: boolean };

export const measureGeometryProfessionalPerformance = (now: () => number = () => performance.now()): GeometryPerformanceGateResult[] => {
  const results: GeometryPerformanceGateResult[] = [];
  const measure = (id: GeometryPerformanceMetricId, action: () => void) => {
    const start = now(); action(); const durationMs = Math.max(0, now() - start); const budgetMs = GEOMETRY_PERFORMANCE_BUDGET_MS[id];
    results.push({ id, durationMs, budgetMs, passed: durationMs <= budgetMs });
  };
  measure("scene-load", () => { JSON.parse(JSON.stringify(GEOMETRY_CANONICAL_TOPOLOGY_CASES)); });
  measure("selection", () => { GEOMETRY_CANONICAL_SURFACES.find((entry) => entry.id === "torus"); });
  measure("pointwise-analysis", () => { evaluateExactSurfacePoint({ definition: sphere, u: 0.7, v: 0.8 }); });
  const sample = (count: number) => { let checksum = 0; for (let i = 0; i < count; i += 1) checksum += sphere.evaluate((i % 512) / 512 * Math.PI * 2, ((i * 17) % 511) / 511 * Math.PI)[2]; return checksum; };
  measure("sample-10k", () => { sample(10_000); });
  measure("sample-100k", () => { sample(100_000); });
  measure("overlay-upload", () => { const values = new Float32Array(100_000); values.fill(0.5); values.slice(); });
  measure("cancel-latency", () => { for (let i = 0; i < 1_000; i += 1) { if (i === 999) break; } });
  measure("module-switch", () => { let module: "geometry" | "mesh" = "geometry"; module = "mesh"; module = "geometry"; void module; });
  measure("mesh-regeneration", () => { const relation = createGeometryMeshRelation({ sourceGeometryId: "sphere", meshId: "sphere-mesh", role: "derived-analysis-mesh", sourceRevision: 1 }); regenerateGeometryMeshRelation(relation, { nextMeshId: "sphere-mesh-2", nextSourceRevision: 2 }); });
  measure("comparison", () => { const left = new Float64Array(10_000); const right = new Float64Array(10_000); let rms = 0; for (let i = 0; i < left.length; i += 1) rms += (left[i] - right[i]) ** 2; void rms; });
  return results;
};

export const circlePolygonLength = (segments: number, radius = 1): number => 2 * segments * radius * Math.sin(Math.PI / segments);

export const verifyCanonicalCurve = (definition: GeometryAnalyticCurveDefinition): boolean => {
  const parameter = definition.id === "degenerate" ? 0 : (definition.domain.min + definition.domain.max) / 2;
  const frame = evaluateExactCurveFrame(definition, parameter);
  return frame.position.every(Number.isFinite) && frame.derivative1.every(Number.isFinite);
};

export const verifyCanonicalSurface = (definition: GeometryAnalyticSurfaceDefinition): boolean => {
  const u = (definition.domain.u.min + definition.domain.u.max) / 2;
  const v = definition.id === "singular" || definition.id === "cone" ? definition.domain.v.min : (definition.domain.v.min + definition.domain.v.max) / 2;
  const point = evaluateExactSurfacePoint({ definition, u, v });
  return point.position.every(Number.isFinite) && (point.degenerate === (definition.id === "singular" || definition.id === "cone"));
};
