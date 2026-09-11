export type ExactSurfaceVec3 = readonly [number, number, number];
export type ExactSurfaceMat2 = readonly [readonly [number, number], readonly [number, number]];

export type GeometrySurfaceDerivativeCapabilities = {
  position: "exact";
  first: "exact" | "sampled" | "unavailable";
  second: "exact" | "sampled" | "unavailable";
};

export type GeometrySurfaceParameterDomain = {
  min: number;
  max: number;
  periodic: boolean;
  seam: "none" | "identified";
  singularBoundaries?: readonly ("min" | "max")[];
};

export type GeometryAnalyticSurfaceDefinition = {
  id: string;
  label: string;
  parameters: readonly [string, string];
  domain: { u: GeometrySurfaceParameterDomain; v: GeometrySurfaceParameterDomain };
  trims: readonly { id: string; description: string }[];
  units: { parameters: readonly [string, string]; position: string };
  revision: number;
  orientation: {
    sign: 1 | -1;
    description: string;
  };
  formula: readonly [string, string, string];
  capabilities: GeometrySurfaceDerivativeCapabilities;
  evaluate: (u: number, v: number) => ExactSurfaceVec3;
  derivativeU: (u: number, v: number) => ExactSurfaceVec3;
  derivativeV: (u: number, v: number) => ExactSurfaceVec3;
  derivativeUU: (u: number, v: number) => ExactSurfaceVec3;
  derivativeUV: (u: number, v: number) => ExactSurfaceVec3;
  derivativeVV: (u: number, v: number) => ExactSurfaceVec3;
};

export type ExactSurfaceClassification =
  | "elliptic"
  | "hyperbolic"
  | "parabolic"
  | "planar"
  | "umbilic"
  | "degenerate";

export type ExactSurfacePointAnalysis = {
  u: number;
  v: number;
  position: ExactSurfaceVec3;
  derivativeU: ExactSurfaceVec3;
  derivativeV: ExactSurfaceVec3;
  derivativeUU: ExactSurfaceVec3;
  derivativeUV: ExactSurfaceVec3;
  derivativeVV: ExactSurfaceVec3;
  normal: ExactSurfaceVec3 | null;
  tangentBasis: readonly [ExactSurfaceVec3, ExactSurfaceVec3] | null;
  tangentPlane: { origin: ExactSurfaceVec3; normal: ExactSurfaceVec3 } | null;
  jacobian: number;
  areaElement: number;
  firstFundamentalForm: { E: number; F: number; G: number; matrix: ExactSurfaceMat2 };
  metricTensor: ExactSurfaceMat2;
  secondFundamentalForm: { e: number | null; f: number | null; g: number | null; matrix: ExactSurfaceMat2 | null };
  shapeOperator: ExactSurfaceMat2 | null;
  principalCurvatures: { k1: number | null; k2: number | null };
  meanCurvature: number | null;
  gaussianCurvature: number | null;
  principalDirections: { d1: ExactSurfaceVec3 | null; d2: ExactSurfaceVec3 | null };
  normalCurvature: { angle: number; value: number | null; direction: ExactSurfaceVec3 | null };
  classification: ExactSurfaceClassification;
  degenerate: boolean;
};

export type ExactSurfaceSample = {
  u: number;
  v: number;
  position: ExactSurfaceVec3;
  normal: ExactSurfaceVec3 | null;
  k1: number | null;
  k2: number | null;
  H: number | null;
  K: number | null;
  classification: ExactSurfaceClassification;
};

export type ExactSurfaceAnalysisResult = {
  definition: Omit<GeometryAnalyticSurfaceDefinition, "evaluate" | "derivativeU" | "derivativeV" | "derivativeUU" | "derivativeUV" | "derivativeVV">;
  point: ExactSurfacePointAnalysis;
  samples: ExactSurfaceSample[];
  grid: { uCount: number; vCount: number };
  extrema: Record<"K" | "H" | "k1" | "k2", { min: number | null; max: number | null }>;
  classifications: Record<ExactSurfaceClassification, number>;
  visualization: {
    surfaceGrid: ExactSurfaceVec3[][];
    normalGlyphs: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }>;
    principalDirectionGlyphs: Array<{ origin: ExactSurfaceVec3; d1: ExactSurfaceVec3; d2: ExactSurfaceVec3 }>;
    normalSections: Array<{ principal: "k1" | "k2"; points: ExactSurfaceVec3[] }>;
    curvatureGlyph: { origin: ExactSurfaceVec3; normal: ExactSurfaceVec3; k1: number; k2: number } | null;
    heatmap: Array<{ u: number; v: number; K: number | null; H: number | null; k1: number | null; k2: number | null; classification: ExactSurfaceClassification }>;
  };
  conventions: {
    normal: string;
    secondFundamentalForm: string;
    principalCurvatureOrder: "k1>=k2";
    meanCurvature: "H=(k1+k2)/2";
    gaussianCurvature: "K=k1*k2";
    outwardConvex: "positive";
    meshCompatible: true;
  };
  tolerance: number;
  uncertainty: { u: number; v: number; scalar: number };
  warnings: string[];
};

const canonical = (value: number): number => Object.is(value, -0) ? 0 : value;
const add = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [canonical(a[0] + b[0]), canonical(a[1] + b[1]), canonical(a[2] + b[2])];
const scale = (value: ExactSurfaceVec3, factor: number): ExactSurfaceVec3 => [canonical(value[0] * factor), canonical(value[1] * factor), canonical(value[2] * factor)];
const dot = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ExactSurfaceVec3, b: ExactSurfaceVec3): ExactSurfaceVec3 => [
  canonical(a[1] * b[2] - a[2] * b[1]),
  canonical(a[2] * b[0] - a[0] * b[2]),
  canonical(a[0] * b[1] - a[1] * b[0]),
];
const length = (value: ExactSurfaceVec3): number => Math.hypot(value[0], value[1], value[2]);
const normalize = (value: ExactSurfaceVec3, tolerance: number): ExactSurfaceVec3 | null => {
  const magnitude = length(value);
  return magnitude <= tolerance ? null : scale(value, 1 / magnitude);
};
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finiteVec = (value: ExactSurfaceVec3): boolean => value.every(Number.isFinite);

const principalVector = (shape: ExactSurfaceMat2, eigenvalue: number, tolerance: number): readonly [number, number] => {
  const a = shape[0][0] - eigenvalue;
  const b = shape[0][1];
  const c = shape[1][0];
  const d = shape[1][1] - eigenvalue;
  const first: readonly [number, number] = Math.abs(a) + Math.abs(b) >= Math.abs(c) + Math.abs(d) ? [-b, a] : [-d, c];
  const magnitude = Math.hypot(first[0], first[1]);
  return magnitude <= tolerance ? [1, 0] : [first[0] / magnitude, first[1] / magnitude];
};

const directionInSurface = (
  coefficients: readonly [number, number],
  ru: ExactSurfaceVec3,
  rv: ExactSurfaceVec3,
  tolerance: number
): ExactSurfaceVec3 | null => normalize(add(scale(ru, coefficients[0]), scale(rv, coefficients[1])), tolerance);

export const evaluateExactSurfacePoint = (args: {
  definition: GeometryAnalyticSurfaceDefinition;
  u: number;
  v: number;
  normalCurvatureAngle?: number;
  tolerance?: number;
}): ExactSurfacePointAnalysis => {
  const { definition } = args;
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-9);
  const u = clamp(args.u, definition.domain.u.min, definition.domain.u.max);
  const v = clamp(args.v, definition.domain.v.min, definition.domain.v.max);
  const position = definition.evaluate(u, v);
  const derivativeU = definition.derivativeU(u, v);
  const derivativeV = definition.derivativeV(u, v);
  const derivativeUU = definition.derivativeUU(u, v);
  const derivativeUV = definition.derivativeUV(u, v);
  const derivativeVV = definition.derivativeVV(u, v);
  if (![position, derivativeU, derivativeV, derivativeUU, derivativeUV, derivativeVV].every(finiteVec)) {
    throw new Error(`Surface ${definition.label} returned non-finite analytic derivatives at (${u}, ${v}).`);
  }
  const crossUV = cross(derivativeU, derivativeV);
  const jacobian = length(crossUV);
  const normalBase = normalize(crossUV, tolerance);
  const normal = normalBase ? scale(normalBase, definition.orientation.sign) : null;
  const E = dot(derivativeU, derivativeU);
  const F = dot(derivativeU, derivativeV);
  const G = dot(derivativeV, derivativeV);
  const metricTensor: ExactSurfaceMat2 = [[E, F], [F, G]];
  const determinant = E * G - F * F;
  const tangentU = normalize(derivativeU, tolerance);
  const tangentVOrthogonal = tangentU
    ? normalize(add(derivativeV, scale(tangentU, -dot(derivativeV, tangentU))), tolerance)
    : null;
  const tangentBasis = tangentU && tangentVOrthogonal ? [tangentU, tangentVOrthogonal] as const : null;
  const degenerate = !normal || determinant <= tolerance * tolerance;
  if (degenerate) {
    return {
      u,
      v,
      position,
      derivativeU,
      derivativeV,
      derivativeUU,
      derivativeUV,
      derivativeVV,
      normal,
      tangentBasis,
      tangentPlane: normal ? { origin: position, normal } : null,
      jacobian,
      areaElement: jacobian,
      firstFundamentalForm: { E, F, G, matrix: metricTensor },
      metricTensor,
      secondFundamentalForm: { e: null, f: null, g: null, matrix: null },
      shapeOperator: null,
      principalCurvatures: { k1: null, k2: null },
      meanCurvature: null,
      gaussianCurvature: null,
      principalDirections: { d1: null, d2: null },
      normalCurvature: { angle: args.normalCurvatureAngle ?? 0, value: null, direction: null },
      classification: "degenerate",
      degenerate: true,
    };
  }

  // Sign convention matches Mesh: S = I^-1(-<r_ij,n>), so outward-convex curvature is positive.
  const e = canonical(-dot(derivativeUU, normal));
  const f = canonical(-dot(derivativeUV, normal));
  const g = canonical(-dot(derivativeVV, normal));
  const secondMatrix: ExactSurfaceMat2 = [[e, f], [f, g]];
  const inverseScale = 1 / determinant;
  const shape: ExactSurfaceMat2 = [
    [canonical((G * e - F * f) * inverseScale), canonical((G * f - F * g) * inverseScale)],
    [canonical((-F * e + E * f) * inverseScale), canonical((-F * f + E * g) * inverseScale)],
  ];
  const H = 0.5 * (shape[0][0] + shape[1][1]);
  const K = (e * g - f * f) / determinant;
  const discriminant = Math.max(0, H * H - K);
  const root = Math.sqrt(discriminant);
  const k1 = H + root;
  const k2 = H - root;
  const coeff1 = principalVector(shape, k1, tolerance);
  const coeff2 = principalVector(shape, k2, tolerance);
  let d1 = directionInSurface(coeff1, derivativeU, derivativeV, tolerance);
  let d2 = directionInSurface(coeff2, derivativeU, derivativeV, tolerance);
  if (Math.abs(k1 - k2) <= tolerance && tangentBasis) {
    [d1, d2] = tangentBasis;
  } else if (d1 && normal) {
    d2 = normalize(cross(normal, d1), tolerance);
  }
  const angle = args.normalCurvatureAngle ?? 0;
  const normalDirection = d1 && d2
    ? normalize(add(scale(d1, Math.cos(angle)), scale(d2, Math.sin(angle))), tolerance)
    : null;
  const normalCurvature = k1 * Math.cos(angle) ** 2 + k2 * Math.sin(angle) ** 2;
  const classification: ExactSurfaceClassification = Math.abs(k1) <= tolerance && Math.abs(k2) <= tolerance
    ? "planar"
    : Math.abs(k1 - k2) <= tolerance
      ? "umbilic"
      : K > tolerance
        ? "elliptic"
        : K < -tolerance
          ? "hyperbolic"
          : "parabolic";
  return {
    u,
    v,
    position,
    derivativeU,
    derivativeV,
    derivativeUU,
    derivativeUV,
    derivativeVV,
    normal,
    tangentBasis,
    tangentPlane: { origin: position, normal },
    jacobian,
    areaElement: jacobian,
    firstFundamentalForm: { E, F, G, matrix: metricTensor },
    metricTensor,
    secondFundamentalForm: { e, f, g, matrix: secondMatrix },
    shapeOperator: shape,
    principalCurvatures: { k1, k2 },
    meanCurvature: H,
    gaussianCurvature: K,
    principalDirections: { d1, d2 },
    normalCurvature: { angle, value: normalCurvature, direction: normalDirection },
    classification,
    degenerate: false,
  };
};

const numericExtrema = (values: Array<number | null>): { min: number | null; max: number | null } => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? { min: Math.min(...finite), max: Math.max(...finite) } : { min: null, max: null };
};

const normalSection = (
  point: ExactSurfacePointAnalysis,
  principal: "k1" | "k2",
  tolerance: number
): { principal: "k1" | "k2"; points: ExactSurfaceVec3[] } | null => {
  const direction = principal === "k1" ? point.principalDirections.d1 : point.principalDirections.d2;
  const curvature = principal === "k1" ? point.principalCurvatures.k1 : point.principalCurvatures.k2;
  if (!direction || !point.normal || curvature == null) return null;
  const points = Array.from({ length: 25 }, (_, index) => {
    const s = -0.6 + (index / 24) * 1.2;
    return add(add(point.position, scale(direction, s)), scale(point.normal!, 0.5 * curvature * s * s));
  });
  return tolerance >= 0 ? { principal, points } : null;
};

export const analyzeExactSurface = (args: {
  definition: GeometryAnalyticSurfaceDefinition;
  u: number;
  v: number;
  uCount?: number;
  vCount?: number;
  normalCurvatureAngle?: number;
  tolerance?: number;
}): ExactSurfaceAnalysisResult => {
  const { definition } = args;
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-9);
  const uCount = Math.max(5, Math.min(128, Math.floor(args.uCount ?? 25)));
  const vCount = Math.max(5, Math.min(128, Math.floor(args.vCount ?? 17)));
  const uSpan = definition.domain.u.max - definition.domain.u.min;
  const vSpan = definition.domain.v.max - definition.domain.v.min;
  if (![uSpan, vSpan].every((span) => Number.isFinite(span) && span > 0)) throw new Error(`Surface ${definition.label} has an invalid parameter domain.`);
  const point = evaluateExactSurfacePoint({ ...args, tolerance });
  const rows: ExactSurfaceVec3[][] = [];
  const samples: ExactSurfaceSample[] = [];
  const classifications: Record<ExactSurfaceClassification, number> = { elliptic: 0, hyperbolic: 0, parabolic: 0, planar: 0, umbilic: 0, degenerate: 0 };
  const normalGlyphs: Array<{ origin: ExactSurfaceVec3; vector: ExactSurfaceVec3 }> = [];
  const principalDirectionGlyphs: Array<{ origin: ExactSurfaceVec3; d1: ExactSurfaceVec3; d2: ExactSurfaceVec3 }> = [];
  const glyphStrideU = Math.max(1, Math.floor(uCount / 8));
  const glyphStrideV = Math.max(1, Math.floor(vCount / 6));
  for (let vIndex = 0; vIndex < vCount; vIndex += 1) {
    const v = definition.domain.v.min + (vIndex / (vCount - 1)) * vSpan;
    const row: ExactSurfaceVec3[] = [];
    for (let uIndex = 0; uIndex < uCount; uIndex += 1) {
      const u = definition.domain.u.min + (uIndex / (uCount - 1)) * uSpan;
      const evaluated = evaluateExactSurfacePoint({ definition, u, v, normalCurvatureAngle: args.normalCurvatureAngle, tolerance });
      row.push(evaluated.position);
      samples.push({
        u,
        v,
        position: evaluated.position,
        normal: evaluated.normal,
        k1: evaluated.principalCurvatures.k1,
        k2: evaluated.principalCurvatures.k2,
        H: evaluated.meanCurvature,
        K: evaluated.gaussianCurvature,
        classification: evaluated.classification,
      });
      classifications[evaluated.classification] += 1;
      if (uIndex % glyphStrideU === 0 && vIndex % glyphStrideV === 0 && evaluated.normal) {
        normalGlyphs.push({ origin: evaluated.position, vector: evaluated.normal });
        if (evaluated.principalDirections.d1 && evaluated.principalDirections.d2) {
          principalDirectionGlyphs.push({ origin: evaluated.position, d1: evaluated.principalDirections.d1, d2: evaluated.principalDirections.d2 });
        }
      }
    }
    rows.push(row);
  }
  const sections = [normalSection(point, "k1", tolerance), normalSection(point, "k2", tolerance)]
    .filter((section): section is NonNullable<typeof section> => section != null);
  const warnings: string[] = [];
  if (definition.capabilities.first !== "exact" || definition.capabilities.second !== "exact") {
    warnings.push("One or more surface derivatives use sampled fallback; exact differential guarantees do not apply to those quantities.");
  }
  if (point.degenerate) warnings.push("The selected parameter is singular or rank-deficient; normal, forms, and curvature are undefined.");
  if (classifications.degenerate) warnings.push(`${classifications.degenerate} sampled parameter point(s) are degenerate, typically at a declared singular boundary.`);
  if (definition.trims.length) warnings.push(`${definition.trims.length} trim boundary definition(s) constrain the valid parameter region.`);
  return {
    definition: {
      id: definition.id,
      label: definition.label,
      parameters: definition.parameters,
      domain: definition.domain,
      trims: definition.trims,
      units: definition.units,
      revision: definition.revision,
      orientation: definition.orientation,
      formula: definition.formula,
      capabilities: definition.capabilities,
    },
    point,
    samples,
    grid: { uCount, vCount },
    extrema: {
      K: numericExtrema(samples.map((sample) => sample.K)),
      H: numericExtrema(samples.map((sample) => sample.H)),
      k1: numericExtrema(samples.map((sample) => sample.k1)),
      k2: numericExtrema(samples.map((sample) => sample.k2)),
    },
    classifications,
    visualization: {
      surfaceGrid: rows,
      normalGlyphs,
      principalDirectionGlyphs,
      normalSections: sections,
      curvatureGlyph: point.normal && point.principalCurvatures.k1 != null && point.principalCurvatures.k2 != null
        ? { origin: point.position, normal: point.normal, k1: point.principalCurvatures.k1, k2: point.principalCurvatures.k2 }
        : null,
      heatmap: samples.map(({ u, v, K, H, k1, k2, classification }) => ({ u, v, K, H, k1, k2, classification })),
    },
    conventions: {
      normal: `n = ${definition.orientation.sign === 1 ? "" : "-"}normalize(r_u × r_v): ${definition.orientation.description}`,
      secondFundamentalForm: "II_ij = -<r_ij,n>",
      principalCurvatureOrder: "k1>=k2",
      meanCurvature: "H=(k1+k2)/2",
      gaussianCurvature: "K=k1*k2",
      outwardConvex: "positive",
      meshCompatible: true,
    },
    tolerance,
    uncertainty: { u: uSpan / (2 * (uCount - 1)), v: vSpan / (2 * (vCount - 1)), scalar: tolerance },
    warnings,
  };
};

const exactCapabilities: GeometrySurfaceDerivativeCapabilities = { position: "exact", first: "exact", second: "exact" };
const periodic = (min: number, max: number): GeometrySurfaceParameterDomain => ({ min, max, periodic: true, seam: "identified" });
const bounded = (min: number, max: number): GeometrySurfaceParameterDomain => ({ min, max, periodic: false, seam: "none" });

export type GeometryExactSurfacePresetId = "plane" | "sphere" | "cylinder" | "torus" | "saddle";

export const GEOMETRY_EXACT_SURFACE_PRESETS: readonly GeometryAnalyticSurfaceDefinition[] = [
  {
    id: "plane",
    label: "Exact plane",
    parameters: ["u", "v"],
    domain: { u: bounded(-2, 2), v: bounded(-2, 2) },
    trims: [],
    units: { parameters: ["scene-unit", "scene-unit"], position: "scene-unit" },
    revision: 1,
    orientation: { sign: 1, description: "+Z" },
    formula: ["u", "v", "0"],
    capabilities: exactCapabilities,
    evaluate: (u, v) => [u, v, 0],
    derivativeU: () => [1, 0, 0],
    derivativeV: () => [0, 1, 0],
    derivativeUU: () => [0, 0, 0],
    derivativeUV: () => [0, 0, 0],
    derivativeVV: () => [0, 0, 0],
  },
  {
    id: "sphere",
    label: "Exact unit sphere",
    parameters: ["u", "v"],
    domain: { u: periodic(0, Math.PI * 2), v: { ...bounded(0, Math.PI), singularBoundaries: ["min", "max"] } },
    trims: [],
    units: { parameters: ["rad", "rad"], position: "scene-unit" },
    revision: 1,
    orientation: { sign: -1, description: "outward radial" },
    formula: ["sin(v)cos(u)", "sin(v)sin(u)", "cos(v)"],
    capabilities: exactCapabilities,
    evaluate: (u, v) => [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)],
    derivativeU: (u, v) => [-Math.sin(v) * Math.sin(u), Math.sin(v) * Math.cos(u), 0],
    derivativeV: (u, v) => [Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), -Math.sin(v)],
    derivativeUU: (u, v) => [-Math.sin(v) * Math.cos(u), -Math.sin(v) * Math.sin(u), 0],
    derivativeUV: (u, v) => [-Math.cos(v) * Math.sin(u), Math.cos(v) * Math.cos(u), 0],
    derivativeVV: (u, v) => [-Math.sin(v) * Math.cos(u), -Math.sin(v) * Math.sin(u), -Math.cos(v)],
  },
  {
    id: "cylinder",
    label: "Exact unit cylinder",
    parameters: ["u", "v"],
    domain: { u: periodic(0, Math.PI * 2), v: bounded(-2, 2) },
    trims: [],
    units: { parameters: ["rad", "scene-unit"], position: "scene-unit" },
    revision: 1,
    orientation: { sign: 1, description: "outward radial" },
    formula: ["cos(u)", "sin(u)", "v"],
    capabilities: exactCapabilities,
    evaluate: (u, v) => [Math.cos(u), Math.sin(u), v],
    derivativeU: (u) => [-Math.sin(u), Math.cos(u), 0],
    derivativeV: () => [0, 0, 1],
    derivativeUU: (u) => [-Math.cos(u), -Math.sin(u), 0],
    derivativeUV: () => [0, 0, 0],
    derivativeVV: () => [0, 0, 0],
  },
  {
    id: "torus",
    label: "Exact torus R=2, r=0.7",
    parameters: ["u", "v"],
    domain: { u: periodic(0, Math.PI * 2), v: periodic(0, Math.PI * 2) },
    trims: [],
    units: { parameters: ["rad", "rad"], position: "scene-unit" },
    revision: 1,
    orientation: { sign: 1, description: "outward from tube centerline" },
    formula: ["(2+0.7cos(v))cos(u)", "(2+0.7cos(v))sin(u)", "0.7sin(v)"],
    capabilities: exactCapabilities,
    evaluate: (u, v) => [(2 + 0.7 * Math.cos(v)) * Math.cos(u), (2 + 0.7 * Math.cos(v)) * Math.sin(u), 0.7 * Math.sin(v)],
    derivativeU: (u, v) => [-(2 + 0.7 * Math.cos(v)) * Math.sin(u), (2 + 0.7 * Math.cos(v)) * Math.cos(u), 0],
    derivativeV: (u, v) => [-0.7 * Math.sin(v) * Math.cos(u), -0.7 * Math.sin(v) * Math.sin(u), 0.7 * Math.cos(v)],
    derivativeUU: (u, v) => [-(2 + 0.7 * Math.cos(v)) * Math.cos(u), -(2 + 0.7 * Math.cos(v)) * Math.sin(u), 0],
    derivativeUV: (u, v) => [0.7 * Math.sin(v) * Math.sin(u), -0.7 * Math.sin(v) * Math.cos(u), 0],
    derivativeVV: (u, v) => [-0.7 * Math.cos(v) * Math.cos(u), -0.7 * Math.cos(v) * Math.sin(u), -0.7 * Math.sin(v)],
  },
  {
    id: "saddle",
    label: "Exact hyperbolic paraboloid",
    parameters: ["u", "v"],
    domain: { u: bounded(-1.5, 1.5), v: bounded(-1.5, 1.5) },
    trims: [],
    units: { parameters: ["scene-unit", "scene-unit"], position: "scene-unit" },
    revision: 1,
    orientation: { sign: 1, description: "positive Z component" },
    formula: ["u", "v", "uv"],
    capabilities: exactCapabilities,
    evaluate: (u, v) => [u, v, u * v],
    derivativeU: (_u, v) => [1, 0, v],
    derivativeV: (u) => [0, 1, u],
    derivativeUU: () => [0, 0, 0],
    derivativeUV: () => [0, 0, 1],
    derivativeVV: () => [0, 0, 0],
  },
];

const GEOMETRY_EXACT_SURFACE_BY_ID = new Map(GEOMETRY_EXACT_SURFACE_PRESETS.map((definition) => [definition.id, definition]));

export const getGeometryExactSurfacePreset = (id: GeometryExactSurfacePresetId | string): GeometryAnalyticSurfaceDefinition =>
  GEOMETRY_EXACT_SURFACE_BY_ID.get(id) ?? GEOMETRY_EXACT_SURFACE_PRESETS[0];
