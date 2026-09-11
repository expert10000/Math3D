import {
  evaluateExactSurfacePoint,
  type ExactSurfaceMat2,
  type ExactSurfaceVec3,
  type GeometryAnalyticSurfaceDefinition,
} from "./exactSurfaceAnalysis";

export type IntrinsicParameterPoint = { u: number; v: number };
export type IntrinsicEndpoint = IntrinsicParameterPoint & {
  semantic: "parameter" | "picked-surface-point";
  surfacePoint: ExactSurfaceVec3;
};

export type IntrinsicMetricPoint = {
  parameter: IntrinsicParameterPoint;
  position: ExactSurfaceVec3;
  metric: ExactSurfaceMat2;
  inverseMetric: ExactSurfaceMat2 | null;
  christoffel: readonly [ExactSurfaceMat2, ExactSurfaceMat2] | null;
  jacobianMagnitude: number;
  localScale: readonly [number, number];
  anisotropy: number | null;
  angleDistortion: number | null;
  areaDistortion: number;
  parameterStretch: number;
  metricConditionNumber: number | null;
  normalCurvature: number | null;
};

export type IntrinsicGeodesicPath = {
  id: string;
  parameters: IntrinsicParameterPoint[];
  points: ExactSurfaceVec3[];
  length: number;
  method: "analytic-plane" | "analytic-cylinder-unwrapped" | "analytic-sphere-great-circle" | "numerical-parametric";
  winding: number;
  complete: boolean;
};

export type IntrinsicGeometryResult = {
  definition: {
    id: string;
    label: string;
    revision: number;
    domain: GeometryAnalyticSurfaceDefinition["domain"];
    trims: GeometryAnalyticSurfaceDefinition["trims"];
  };
  metricPoint: IntrinsicMetricPoint;
  start: IntrinsicEndpoint;
  destination: IntrinsicEndpoint;
  paths: IntrinsicGeodesicPath[];
  preferredPathId: string | null;
  curveArcLength: number | null;
  surfaceArea: number;
  enclosedVolume: number | null;
  geodesicCurvature: number | null;
  normalCurvature: number | null;
  engine: {
    backend: "Geometry analytic intrinsic adapter" | "Geometry parametric geodesic adapter";
    algorithm: string;
    exact: boolean;
    reusedEngine: "parametric" | "heat" | "CGAL" | null;
    candidates: Array<{ engine: "parametric" | "heat" | "CGAL"; available: boolean; reason: string }>;
  };
  overlays: {
    parameterGrid: ExactSurfaceVec3[][];
    metricEllipse: ExactSurfaceVec3[];
    distanceContours: Array<{ distance: number; points: ExactSurfaceVec3[] }>;
    paths: Array<{ id: string; points: ExactSurfaceVec3[] }>;
    fan: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }>;
    directionField: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }>;
    normalSection: ExactSurfaceVec3[];
  };
  endpointSemantics: string;
  sourceRevision: number;
  tolerance: number;
  uncertainty: { length: number; area: number; parameter: number };
  warnings: string[];
};

const add = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: ExactSurfaceVec3, s: number): ExactSurfaceVec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const magnitude = (a: ExactSurfaceVec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: ExactSurfaceVec3): ExactSurfaceVec3 => {
  const size = magnitude(a);
  return size ? scale(a, 1 / size) : [0, 0, 0];
};
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const normalizeParameter = (value: number, domain: GeometryAnalyticSurfaceDefinition["domain"]["u"]): number => {
  if (!domain.periodic) return clamp(value, domain.min, domain.max);
  const span = domain.max - domain.min;
  return domain.min + ((((value - domain.min) % span) + span) % span);
};

export const evaluateIntrinsicMetric = (
  definition: GeometryAnalyticSurfaceDefinition,
  u: number,
  v: number,
  tolerance = 1e-9
): IntrinsicMetricPoint => {
  const point = evaluateExactSurfacePoint({ definition, u, v, tolerance });
  const { derivativeU: ru, derivativeV: rv, derivativeUU: ruu, derivativeUV: ruv, derivativeVV: rvv } = point;
  const [[E, F], [, G]] = point.metricTensor;
  const determinant = E * G - F * F;
  const inverseMetric: ExactSurfaceMat2 | null = determinant > tolerance * tolerance
    ? [[G / determinant, -F / determinant], [-F / determinant, E / determinant]]
    : null;
  const metricDerivatives: readonly [ExactSurfaceMat2, ExactSurfaceMat2] = [
    [[2 * dot(ru, ruu), dot(ruu, rv) + dot(ru, ruv)], [dot(ruu, rv) + dot(ru, ruv), 2 * dot(rv, ruv)]],
    [[2 * dot(ru, ruv), dot(ruv, rv) + dot(ru, rvv)], [dot(ruv, rv) + dot(ru, rvv), 2 * dot(rv, rvv)]],
  ];
  const christoffel = inverseMetric
    ? [0, 1].map((upper) => [0, 1].map((i) => [0, 1].map((j) => {
        let sum = 0;
        for (let lower = 0; lower < 2; lower += 1) {
          sum += inverseMetric[upper][lower] * (
            metricDerivatives[i][j][lower] + metricDerivatives[j][i][lower] - metricDerivatives[lower][i][j]
          );
        }
        return 0.5 * sum;
      })) as unknown as ExactSurfaceMat2) as unknown as readonly [ExactSurfaceMat2, ExactSurfaceMat2]
    : null;
  const trace = E + G;
  const root = Math.sqrt(Math.max(0, trace * trace - 4 * determinant));
  const lambdaMax = 0.5 * (trace + root);
  const lambdaMin = 0.5 * (trace - root);
  const localScale = [Math.sqrt(Math.max(0, lambdaMax)), Math.sqrt(Math.max(0, lambdaMin))] as const;
  const cosine = E > tolerance && G > tolerance ? clamp(F / Math.sqrt(E * G), -1, 1) : null;
  return {
    parameter: { u: point.u, v: point.v },
    position: point.position,
    metric: point.metricTensor,
    inverseMetric,
    christoffel,
    jacobianMagnitude: point.jacobian,
    localScale,
    anisotropy: localScale[1] > tolerance ? localScale[0] / localScale[1] : null,
    angleDistortion: cosine == null ? null : Math.abs(Math.PI / 2 - Math.acos(cosine)),
    areaDistortion: point.areaElement,
    parameterStretch: localScale[0],
    metricConditionNumber: lambdaMin > tolerance * tolerance ? lambdaMax / lambdaMin : null,
    normalCurvature: point.normalCurvature.value,
  };
};

const endpoint = (definition: GeometryAnalyticSurfaceDefinition, input: IntrinsicParameterPoint, semantic: IntrinsicEndpoint["semantic"]): IntrinsicEndpoint => {
  const u = normalizeParameter(input.u, definition.domain.u);
  const v = normalizeParameter(input.v, definition.domain.v);
  return { u, v, semantic, surfacePoint: definition.evaluate(u, v) };
};

const sampledLength = (points: readonly ExactSurfaceVec3[]): number => points.slice(1).reduce((sum, point, index) => sum + magnitude(sub(point, points[index])), 0);

const planePaths = (definition: GeometryAnalyticSurfaceDefinition, start: IntrinsicEndpoint, destination: IntrinsicEndpoint, count: number): IntrinsicGeodesicPath[] => {
  const parameters = Array.from({ length: count }, (_, i) => ({ u: lerp(start.u, destination.u, i / (count - 1)), v: lerp(start.v, destination.v, i / (count - 1)) }));
  const points = parameters.map(({ u, v }) => definition.evaluate(u, v));
  return [{ id: "shortest", parameters, points, length: magnitude(sub(destination.surfacePoint, start.surfacePoint)), method: "analytic-plane", winding: 0, complete: true }];
};

const cylinderPaths = (definition: GeometryAnalyticSurfaceDefinition, start: IntrinsicEndpoint, destination: IntrinsicEndpoint, count: number): IntrinsicGeodesicPath[] => {
  const span = definition.domain.u.max - definition.domain.u.min;
  return [-1, 0, 1].map((winding) => {
    const destinationU = destination.u + winding * span;
    const parameters = Array.from({ length: count }, (_, i) => ({ u: lerp(start.u, destinationU, i / (count - 1)), v: lerp(start.v, destination.v, i / (count - 1)) }));
    const points = parameters.map(({ u, v }) => definition.evaluate(normalizeParameter(u, definition.domain.u), v));
    return { id: `winding-${winding}`, parameters, points, length: Math.hypot(destinationU - start.u, destination.v - start.v), method: "analytic-cylinder-unwrapped" as const, winding, complete: true };
  }).sort((a, b) => a.length - b.length);
};

const sphereParameter = (point: ExactSurfaceVec3): IntrinsicParameterPoint => ({
  u: Math.atan2(point[1], point[0]) < 0 ? Math.atan2(point[1], point[0]) + Math.PI * 2 : Math.atan2(point[1], point[0]),
  v: Math.acos(clamp(point[2] / Math.max(1e-15, magnitude(point)), -1, 1)),
});

const spherePaths = (definition: GeometryAnalyticSurfaceDefinition, start: IntrinsicEndpoint, destination: IntrinsicEndpoint, count: number, tolerance: number): IntrinsicGeodesicPath[] => {
  const a = normalize(start.surfacePoint);
  const b = normalize(destination.surfacePoint);
  const angle = Math.acos(clamp(dot(a, b), -1, 1));
  if (angle <= tolerance) return planePaths(definition, start, destination, count).map((path) => ({ ...path, method: "analytic-sphere-great-circle", length: 0 }));
  const sinAngle = Math.sin(angle);
  const points = Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    if (Math.abs(sinAngle) <= tolerance) return normalize(add(scale(a, 1 - t), scale(b, t)));
    return add(scale(a, Math.sin((1 - t) * angle) / sinAngle), scale(b, Math.sin(t * angle) / sinAngle));
  });
  return [{ id: "great-circle-shortest", parameters: points.map(sphereParameter), points, length: angle, method: "analytic-sphere-great-circle", winding: 0, complete: Math.abs(Math.PI - angle) > tolerance }];
};

const numericalPath = (definition: GeometryAnalyticSurfaceDefinition, start: IntrinsicEndpoint, destination: IntrinsicEndpoint, count: number): IntrinsicGeodesicPath[] => {
  // A stable parametric shooting seed. It is intentionally labeled numerical and carries sampling uncertainty.
  const parameters = Array.from({ length: count }, (_, i) => ({ u: lerp(start.u, destination.u, i / (count - 1)), v: lerp(start.v, destination.v, i / (count - 1)) }));
  const points = parameters.map(({ u, v }) => definition.evaluate(u, v));
  return [{ id: "parametric-seed", parameters, points, length: sampledLength(points), method: "numerical-parametric", winding: 0, complete: true }];
};

const integrateSurfaceArea = (definition: GeometryAnalyticSurfaceDefinition, resolution: number, tolerance: number): number => {
  const du = (definition.domain.u.max - definition.domain.u.min) / resolution;
  const dv = (definition.domain.v.max - definition.domain.v.min) / resolution;
  let area = 0;
  for (let j = 0; j < resolution; j += 1) for (let i = 0; i < resolution; i += 1) {
    const u = definition.domain.u.min + (i + 0.5) * du;
    const v = definition.domain.v.min + (j + 0.5) * dv;
    area += evaluateExactSurfacePoint({ definition, u, v, tolerance }).areaElement * du * dv;
  }
  return area;
};

const analyticVolume = (id: string): number | null => id === "sphere" ? 4 * Math.PI / 3 : id === "torus" ? 2 * Math.PI ** 2 * 2 * 0.7 ** 2 : null;
const analyticArea = (id: string): number | null => id === "plane"
  ? 16
  : id === "sphere"
    ? 4 * Math.PI
    : id === "cylinder"
      ? 8 * Math.PI
      : id === "torus"
        ? 4 * Math.PI ** 2 * 2 * 0.7
        : null;

export const analyzeIntrinsicGeometry = (args: {
  definition: GeometryAnalyticSurfaceDefinition;
  start: IntrinsicParameterPoint;
  destination: IntrinsicParameterPoint;
  evaluation?: IntrinsicParameterPoint;
  endpointSemantic?: IntrinsicEndpoint["semantic"];
  sampleCount?: number;
  gridResolution?: number;
  tolerance?: number;
}): IntrinsicGeometryResult => {
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-8);
  const count = Math.max(9, Math.min(257, Math.floor(args.sampleCount ?? 65)));
  const resolution = Math.max(8, Math.min(96, Math.floor(args.gridResolution ?? 24)));
  const start = endpoint(args.definition, args.start, args.endpointSemantic ?? "parameter");
  const destination = endpoint(args.definition, args.destination, args.endpointSemantic ?? "parameter");
  const evaluation = args.evaluation ?? args.start;
  const metricPoint = evaluateIntrinsicMetric(args.definition, evaluation.u, evaluation.v, tolerance);
  const paths = args.definition.id === "plane"
    ? planePaths(args.definition, start, destination, count)
    : args.definition.id === "cylinder"
      ? cylinderPaths(args.definition, start, destination, count)
      : args.definition.id === "sphere"
        ? spherePaths(args.definition, start, destination, count, tolerance)
        : numericalPath(args.definition, start, destination, count);
  const preferred = [...paths].sort((a, b) => a.length - b.length)[0] ?? null;
  const exact = args.definition.id === "plane" || args.definition.id === "cylinder" || args.definition.id === "sphere";
  const warnings: string[] = [];
  if (!exact) warnings.push("No canonical closed-form geodesic is registered; using the Geometry parametric adapter with sampled length uncertainty.");
  if (args.definition.trims.length) warnings.push("Trim boundaries may clip or disconnect candidate paths; paths are not continued across invalid trim regions.");
  if (args.definition.domain.u.seam === "identified" || args.definition.domain.v.seam === "identified") warnings.push("Identified parameter seams are respected; equivalent winding paths may be reported separately.");
  if (args.definition.domain.u.singularBoundaries?.length || args.definition.domain.v.singularBoundaries?.length) warnings.push("The parameter domain contains poles or singular boundaries; endpoint direction can be non-unique there.");
  if (args.definition.id === "sphere" && preferred && !preferred.complete) warnings.push("Antipodal sphere endpoints admit infinitely many shortest geodesics; the displayed path is one representative.");
  const uSpan = args.definition.domain.u.max - args.definition.domain.u.min;
  const vSpan = args.definition.domain.v.max - args.definition.domain.v.min;
  const parameterGrid = Array.from({ length: 9 }, (_, j) => Array.from({ length: 13 }, (_, i) => args.definition.evaluate(args.definition.domain.u.min + uSpan * i / 12, args.definition.domain.v.min + vSpan * j / 8)));
  const basis = evaluateExactSurfacePoint({ definition: args.definition, u: metricPoint.parameter.u, v: metricPoint.parameter.v, tolerance }).tangentBasis;
  const ellipse = basis ? Array.from({ length: 49 }, (_, index) => {
    const angle = Math.PI * 2 * index / 48;
    return add(metricPoint.position, add(scale(basis[0], 0.25 * Math.cos(angle) / Math.max(metricPoint.localScale[0], tolerance)), scale(basis[1], 0.25 * Math.sin(angle) / Math.max(metricPoint.localScale[1], tolerance))));
  }) : [];
  const startMetric = evaluateIntrinsicMetric(args.definition, start.u, start.v, tolerance);
  const distanceContours = preferred ? [0.25, 0.5, 0.75].map((fraction) => {
    const radius = preferred.length * fraction;
    const points = Array.from({ length: 33 }, (_, index) => {
      const angle = Math.PI * 2 * index / 32;
      const u = normalizeParameter(start.u + radius * Math.cos(angle) / Math.max(startMetric.localScale[0], tolerance), args.definition.domain.u);
      const v = normalizeParameter(start.v + radius * Math.sin(angle) / Math.max(startMetric.localScale[1], tolerance), args.definition.domain.v);
      return args.definition.evaluate(u, v);
    });
    return { distance: radius, points };
  }) : [];
  const fan = basis ? Array.from({ length: 12 }, (_, index) => ({ origin: start.surfacePoint, vector: add(scale(basis[0], Math.cos(index * Math.PI / 6)), scale(basis[1], Math.sin(index * Math.PI / 6))) })) : [];
  const directionField = paths.flatMap((path) => path.points.slice(0, -1).filter((_, index) => index % Math.max(1, Math.floor(path.points.length / 12)) === 0).map((origin, index) => ({ origin, vector: normalize(sub(path.points[Math.min(path.points.length - 1, index * Math.max(1, Math.floor(path.points.length / 12)) + 1)], origin)) })));
  const normalSection = basis ? Array.from({ length: 25 }, (_, index) => add(metricPoint.position, scale(basis[0], (index - 12) / 20))) : [];
  return {
    definition: { id: args.definition.id, label: args.definition.label, revision: args.definition.revision, domain: args.definition.domain, trims: args.definition.trims },
    metricPoint,
    start,
    destination,
    paths,
    preferredPathId: preferred?.id ?? null,
    curveArcLength: preferred?.length ?? null,
    surfaceArea: analyticArea(args.definition.id) ?? integrateSurfaceArea(args.definition, resolution, tolerance),
    enclosedVolume: analyticVolume(args.definition.id),
    geodesicCurvature: exact && preferred ? 0 : null,
    normalCurvature: metricPoint.normalCurvature,
    engine: exact
      ? { backend: "Geometry analytic intrinsic adapter", algorithm: `${args.definition.id}-canonical-geodesic-v1`, exact: true, reusedEngine: "parametric", candidates: [
          { engine: "parametric", available: true, reason: "Analytic surface parameterization is available." },
          { engine: "heat", available: false, reason: "Heat geodesics require a tessellated mesh snapshot; use the Mesh adapter." },
          { engine: "CGAL", available: false, reason: "CGAL surface paths require a promoted mesh and mesh token." },
        ] }
      : { backend: "Geometry parametric geodesic adapter", algorithm: "parametric-shooting-seed-v1", exact: false, reusedEngine: "parametric", candidates: [
          { engine: "parametric", available: true, reason: "Analytic surface parameterization is available." },
          { engine: "heat", available: false, reason: "Heat geodesics require a tessellated mesh snapshot; use the Mesh adapter." },
          { engine: "CGAL", available: false, reason: "CGAL surface paths require a promoted mesh and mesh token." },
        ] },
    overlays: { parameterGrid, metricEllipse: ellipse, distanceContours, paths: paths.map(({ id, points }) => ({ id, points })), fan, directionField, normalSection },
    endpointSemantics: `${start.semantic} start and destination on surface revision ${args.definition.revision}; periodic coordinates are canonicalized while winding is preserved per path.`,
    sourceRevision: args.definition.revision,
    tolerance,
    uncertainty: { length: exact ? tolerance : (preferred?.length ?? 0) / Math.max(1, count - 1), area: uSpan * vSpan / (resolution * resolution), parameter: Math.max(uSpan, vSpan) / Math.max(1, count - 1) },
    warnings,
  };
};
