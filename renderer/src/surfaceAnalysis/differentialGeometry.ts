import {
  evaluateExactSurfacePoint,
  type ExactSurfaceMat2,
  type ExactSurfaceVec3,
  type GeometryAnalyticSurfaceDefinition,
} from "../geometry/exactSurfaceAnalysis";
import type {
  CanonicalSurfaceDefinition,
  SurfaceAnalysisMethod,
  SurfaceAnalysisPayload,
  SurfaceDifferentialFieldPayload,
  SurfaceOrientation,
  SurfaceRepresentation,
  SurfaceUnits,
} from "./contracts";

export type SurfaceDifferentialVec3 = ExactSurfaceVec3;
export type SurfaceDifferentialMat2 = ExactSurfaceMat2;

export type SurfaceDifferentialMasks = {
  valid: boolean;
  uncertain: boolean;
  boundary: boolean;
  degenerate: boolean;
  singular: boolean;
  umbilic: boolean;
};

export type SurfaceDifferentialJet = {
  position: SurfaceDifferentialVec3;
  derivativeU: SurfaceDifferentialVec3;
  derivativeV: SurfaceDifferentialVec3;
  derivativeUU: SurfaceDifferentialVec3;
  derivativeUV: SurfaceDifferentialVec3;
  derivativeVV: SurfaceDifferentialVec3;
};

export type SurfaceDifferentialPoint = {
  representation: SurfaceRepresentation;
  method: SurfaceAnalysisMethod;
  parameter: readonly [number, number] | null;
  jet: SurfaceDifferentialJet | null;
  normal: SurfaceDifferentialVec3 | null;
  tangentBasis: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3] | null;
  firstFundamentalForm: { E: number; F: number; G: number; matrix: SurfaceDifferentialMat2 } | null;
  secondFundamentalForm: { L: number; M: number; N: number; matrix: SurfaceDifferentialMat2 } | null;
  metricDeterminant: number | null;
  shapeOperator: SurfaceDifferentialMat2 | null;
  gaussianCurvature: number | null;
  meanCurvature: number | null;
  principalCurvatures: readonly [number, number] | null;
  principalDirections: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3] | null;
  units: { position: string; gaussianCurvature: string; meanCurvature: string; principalCurvature: string };
  orientation: SurfaceOrientation;
  masks: SurfaceDifferentialMasks;
  uncertainty: { derivative: number; curvature: number; step: readonly [number, number] | null };
  warnings: string[];
};

export type SurfaceParameterRange = { min: number; max: number; periodic?: boolean };
export type SurfaceParametricEvaluator = (u: number, v: number) => SurfaceDifferentialVec3;

export type ParametricDifferentialInput = {
  representation?: "explicit" | "parametric" | "spline" | "constructed" | "weierstrass";
  evaluate: SurfaceParametricEvaluator;
  u: number;
  v: number;
  domain: { u: SurfaceParameterRange; v: SurfaceParameterRange };
  orientation?: SurfaceOrientation;
  units?: SurfaceUnits;
  step?: readonly [number, number];
  tolerance?: number;
  uncertaintyTolerance?: number;
};

export type GraphDifferentialInput = {
  evaluate: (x: number, y: number) => number;
  x: number;
  y: number;
  domain: { x: SurfaceParameterRange; y: SurfaceParameterRange };
  orientation?: SurfaceOrientation;
  units?: SurfaceUnits;
  step?: readonly [number, number];
  tolerance?: number;
  uncertaintyTolerance?: number;
};

export type ImplicitDifferentialInput = {
  evaluate: (x: number, y: number, z: number) => number;
  point: SurfaceDifferentialVec3;
  gradient?: SurfaceDifferentialVec3;
  hessian?: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3, SurfaceDifferentialVec3];
  method?: "analytic" | "symbolic" | "automatic-differentiation";
  orientation?: SurfaceOrientation;
  units?: SurfaceUnits;
  step?: number;
  tolerance?: number;
  uncertaintyTolerance?: number;
};

export type MeshDifferentialInput = {
  position: SurfaceDifferentialVec3;
  normal: SurfaceDifferentialVec3;
  principalCurvatures: readonly [number, number];
  principalDirections?: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3];
  units?: SurfaceUnits;
  uncertainty?: number;
  boundary?: boolean;
  valid?: boolean;
};

export type SurfaceDifferentialAnalysisInput =
  | ({ kind: "graph" } & GraphDifferentialInput)
  | ({ kind: "parametric" } & ParametricDifferentialInput)
  | ({
    kind: "exact";
    definition: GeometryAnalyticSurfaceDefinition;
    u: number;
    v: number;
    representation?: "explicit" | "parametric" | "spline" | "constructed" | "weierstrass";
    units?: SurfaceUnits;
    tolerance?: number;
  })
  | ({ kind: "implicit" } & ImplicitDifferentialInput)
  | ({ kind: "mesh" } & MeshDifferentialInput);

const vec = (x: number, y: number, z: number): SurfaceDifferentialVec3 => [x, y, z];
const add = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3): SurfaceDifferentialVec3 => vec(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
const scale = (a: SurfaceDifferentialVec3, value: number): SurfaceDifferentialVec3 => vec(a[0] * value, a[1] * value, a[2] * value);
const dot = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3): SurfaceDifferentialVec3 => vec(
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
);
const length = (a: SurfaceDifferentialVec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: SurfaceDifferentialVec3, tolerance: number): SurfaceDifferentialVec3 | null => {
  const magnitude = length(a);
  return Number.isFinite(magnitude) && magnitude > tolerance ? scale(a, 1 / magnitude) : null;
};
const subtract = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3): SurfaceDifferentialVec3 => add(a, scale(b, -1));
const finiteVector = (value: SurfaceDifferentialVec3): boolean => value.every(Number.isFinite);
const vectorDistance = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3): number => length(subtract(a, b));
const canonicalNumber = (value: number): number => Object.is(value, -0) ? 0 : value;

const defaultUnits = (units?: SurfaceUnits) => ({
  position: units?.length ?? "unit",
  gaussianCurvature: `${units?.length ?? "unit"}^-2`,
  meanCurvature: `${units?.length ?? "unit"}^-1`,
  principalCurvature: `${units?.length ?? "unit"}^-1`,
});

const defaultOrientation = (representation: SurfaceRepresentation): SurfaceOrientation => representation === "explicit"
  ? { convention: "graph-up", sign: 1, description: "Upward graph normal" }
  : representation === "implicit"
    ? { convention: "gradient", sign: 1, description: "Normalized gradient" }
    : representation === "mesh-backed"
      ? { convention: "mesh-winding", sign: 1, description: "Source mesh winding" }
      : { convention: "parameter-cross", sign: 1, description: "Normalized r_u cross r_v" };

const emptyPoint = (args: {
  representation: SurfaceRepresentation;
  method: SurfaceAnalysisMethod;
  parameter?: readonly [number, number] | null;
  position?: SurfaceDifferentialVec3;
  units?: SurfaceUnits;
  orientation?: SurfaceOrientation;
  boundary?: boolean;
  singular?: boolean;
  warning: string;
}): SurfaceDifferentialPoint => ({
  representation: args.representation,
  method: args.method,
  parameter: args.parameter ?? null,
  jet: args.position ? {
    position: args.position,
    derivativeU: vec(0, 0, 0), derivativeV: vec(0, 0, 0),
    derivativeUU: vec(0, 0, 0), derivativeUV: vec(0, 0, 0), derivativeVV: vec(0, 0, 0),
  } : null,
  normal: null,
  tangentBasis: null,
  firstFundamentalForm: null,
  secondFundamentalForm: null,
  metricDeterminant: null,
  shapeOperator: null,
  gaussianCurvature: null,
  meanCurvature: null,
  principalCurvatures: null,
  principalDirections: null,
  units: defaultUnits(args.units),
  orientation: args.orientation ?? defaultOrientation(args.representation),
  masks: { valid: false, uncertain: false, boundary: args.boundary ?? false, degenerate: true, singular: args.singular ?? false, umbilic: false },
  uncertainty: { derivative: 0, curvature: 0, step: null },
  warnings: [args.warning],
});

const eigenDirection = (shape: SurfaceDifferentialMat2, eigenvalue: number, tolerance: number): readonly [number, number] => {
  const a = shape[0][0] - eigenvalue;
  const b = shape[0][1];
  const c = shape[1][0];
  const d = shape[1][1] - eigenvalue;
  const candidate: readonly [number, number] = Math.abs(a) + Math.abs(b) >= Math.abs(c) + Math.abs(d) ? [-b, a] : [-d, c];
  const magnitude = Math.hypot(candidate[0], candidate[1]);
  return magnitude > tolerance ? [candidate[0] / magnitude, candidate[1] / magnitude] : [1, 0];
};

const computeFromJet = (args: {
  jet: SurfaceDifferentialJet;
  representation: SurfaceRepresentation;
  method: SurfaceAnalysisMethod;
  parameter?: readonly [number, number] | null;
  orientation?: SurfaceOrientation;
  units?: SurfaceUnits;
  tolerance?: number;
  boundary?: boolean;
  derivativeUncertainty?: number;
  curvatureUncertainty?: number;
  uncertaintyTolerance?: number;
  step?: readonly [number, number] | null;
  warnings?: readonly string[];
}): SurfaceDifferentialPoint => {
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-9);
  const orientation = args.orientation ?? defaultOrientation(args.representation);
  if (!Object.values(args.jet).every(finiteVector)) {
    return emptyPoint({ ...args, orientation, warning: "Surface derivatives contain non-finite values." });
  }
  const normalBase = normalize(cross(args.jet.derivativeU, args.jet.derivativeV), tolerance);
  const E = dot(args.jet.derivativeU, args.jet.derivativeU);
  const F = dot(args.jet.derivativeU, args.jet.derivativeV);
  const G = dot(args.jet.derivativeV, args.jet.derivativeV);
  const determinant = E * G - F * F;
  if (!normalBase || !Number.isFinite(determinant) || determinant <= tolerance * tolerance) {
    return emptyPoint({ ...args, orientation, position: args.jet.position, warning: "Surface parameterization is rank-deficient at this sample." });
  }
  const normal = scale(normalBase, orientation.sign);
  const tangentU = normalize(args.jet.derivativeU, tolerance)!;
  const tangentV = normalize(subtract(args.jet.derivativeV, scale(tangentU, dot(args.jet.derivativeV, tangentU))), tolerance);
  if (!tangentV) return emptyPoint({ ...args, orientation, position: args.jet.position, warning: "Surface tangent basis is degenerate." });

  // Math3D convention: II_ij = -<r_ij,n>. This makes outward-convex curvature positive.
  const L = canonicalNumber(-dot(args.jet.derivativeUU, normal));
  const M = canonicalNumber(-dot(args.jet.derivativeUV, normal));
  const N = canonicalNumber(-dot(args.jet.derivativeVV, normal));
  const inverseDeterminant = 1 / determinant;
  const shape: SurfaceDifferentialMat2 = [
    [(G * L - F * M) * inverseDeterminant, (G * M - F * N) * inverseDeterminant],
    [(-F * L + E * M) * inverseDeterminant, (-F * M + E * N) * inverseDeterminant],
  ];
  const H = 0.5 * (shape[0][0] + shape[1][1]);
  const K = (L * N - M * M) * inverseDeterminant;
  const discriminant = Math.max(0, H * H - K);
  const root = Math.sqrt(discriminant);
  const k1 = H + root;
  const k2 = H - root;
  const curvatureScale = Math.max(1, Math.abs(k1), Math.abs(k2));
  const umbilic = Math.abs(k1 - k2) <= tolerance * curvatureScale * 8;
  let principalDirections: SurfaceDifferentialPoint["principalDirections"] = null;
  if (!umbilic) {
    const uvDirection = eigenDirection(shape, k1, tolerance);
    const d1 = normalize(add(scale(args.jet.derivativeU, uvDirection[0]), scale(args.jet.derivativeV, uvDirection[1])), tolerance);
    const d2 = d1 ? normalize(cross(normal, d1), tolerance) : null;
    if (d1 && d2) principalDirections = [d1, d2];
  }
  const derivativeUncertainty = Math.max(0, args.derivativeUncertainty ?? 0);
  const curvatureUncertainty = Math.max(0, args.curvatureUncertainty ?? 0);
  const uncertaintyTolerance = Math.max(tolerance, args.uncertaintyTolerance ?? 2e-3);
  const uncertain = derivativeUncertainty > uncertaintyTolerance || curvatureUncertainty > uncertaintyTolerance * curvatureScale;
  const warnings = [...(args.warnings ?? [])];
  if (umbilic) warnings.push("Principal directions are undefined at an umbilic sample.");
  if (uncertain) warnings.push("Adaptive derivative estimates exceed the requested uncertainty tolerance.");
  return {
    representation: args.representation,
    method: args.method,
    parameter: args.parameter ?? null,
    jet: args.jet,
    normal,
    tangentBasis: [tangentU, tangentV],
    firstFundamentalForm: { E, F, G, matrix: [[E, F], [F, G]] },
    secondFundamentalForm: { L, M, N, matrix: [[L, M], [M, N]] },
    metricDeterminant: determinant,
    shapeOperator: shape,
    gaussianCurvature: K,
    meanCurvature: H,
    principalCurvatures: [k1, k2],
    principalDirections,
    units: defaultUnits(args.units),
    orientation,
    masks: { valid: true, uncertain, boundary: args.boundary ?? false, degenerate: false, singular: false, umbilic },
    uncertainty: { derivative: derivativeUncertainty, curvature: curvatureUncertainty, step: args.step ?? null },
    warnings,
  };
};

const wrap = (value: number, range: SurfaceParameterRange): number => {
  if (!range.periodic) return Math.min(range.max, Math.max(range.min, value));
  const span = range.max - range.min;
  if (!(span > 0)) return range.min;
  return range.min + ((((value - range.min) % span) + span) % span);
};

const sampleNodes = (value: number, range: SurfaceParameterRange, step: number): { nodes: readonly [number, number, number]; boundary: boolean } => {
  if (range.periodic || (value - step >= range.min && value + step <= range.max)) return { nodes: [value - step, value, value + step], boundary: false };
  if (value - step < range.min) return { nodes: [value, value + step, Math.min(range.max, value + 2 * step)], boundary: true };
  return { nodes: [Math.max(range.min, value - 2 * step), value - step, value], boundary: true };
};

const lagrangeWeights = (nodes: readonly [number, number, number], at: number): { value: readonly [number, number, number]; first: readonly [number, number, number]; second: readonly [number, number, number] } => {
  const value = nodes.map((xi, i) => {
    const others = [0, 1, 2].filter((index) => index !== i);
    return ((at - nodes[others[0]]) * (at - nodes[others[1]])) / ((xi - nodes[others[0]]) * (xi - nodes[others[1]]));
  }) as unknown as readonly [number, number, number];
  const first = nodes.map((xi, i) => {
    const others = [0, 1, 2].filter((index) => index !== i);
    const [j, k] = others;
    return ((at - nodes[k]) + (at - nodes[j])) / ((xi - nodes[j]) * (xi - nodes[k]));
  }) as unknown as readonly [number, number, number];
  const second = nodes.map((xi, i) => {
    const others = [0, 1, 2].filter((index) => index !== i);
    return 2 / ((xi - nodes[others[0]]) * (xi - nodes[others[1]]));
  }) as unknown as readonly [number, number, number];
  return { value, first, second };
};

const numericalJet = (
  evaluate: SurfaceParametricEvaluator,
  u: number,
  v: number,
  domain: { u: SurfaceParameterRange; v: SurfaceParameterRange },
  step: readonly [number, number]
): { jet: SurfaceDifferentialJet; boundary: boolean } => {
  const uSamples = sampleNodes(u, domain.u, step[0]);
  const vSamples = sampleNodes(v, domain.v, step[1]);
  const uWeights = lagrangeWeights(uSamples.nodes, u);
  const vWeights = lagrangeWeights(vSamples.nodes, v);
  const grid = uSamples.nodes.map((uu) => vSamples.nodes.map((vv) => evaluate(wrap(uu, domain.u), wrap(vv, domain.v))));
  const weighted = (uWeight: readonly number[], vWeight: readonly number[]): SurfaceDifferentialVec3 => {
    let result = vec(0, 0, 0);
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) result = add(result, scale(grid[i][j], uWeight[i] * vWeight[j]));
    return result;
  };
  const position = evaluate(wrap(u, domain.u), wrap(v, domain.v));
  return {
    jet: {
      position,
      derivativeU: weighted(uWeights.first, vWeights.value),
      derivativeV: weighted(uWeights.value, vWeights.first),
      derivativeUU: weighted(uWeights.second, vWeights.value),
      derivativeUV: weighted(uWeights.first, vWeights.first),
      derivativeVV: weighted(uWeights.value, vWeights.second),
    },
    boundary: uSamples.boundary || vSamples.boundary,
  };
};

const jetDifference = (left: SurfaceDifferentialJet, right: SurfaceDifferentialJet): number => Math.max(
  vectorDistance(left.derivativeU, right.derivativeU),
  vectorDistance(left.derivativeV, right.derivativeV),
  vectorDistance(left.derivativeUU, right.derivativeUU),
  vectorDistance(left.derivativeUV, right.derivativeUV),
  vectorDistance(left.derivativeVV, right.derivativeVV)
);

const curvatureDifference = (left: SurfaceDifferentialPoint, right: SurfaceDifferentialPoint): number => Math.max(
  left.masks.valid === right.masks.valid ? Math.abs((left.gaussianCurvature ?? 0) - (right.gaussianCurvature ?? 0)) : Number.POSITIVE_INFINITY,
  left.masks.valid === right.masks.valid ? Math.abs((left.meanCurvature ?? 0) - (right.meanCurvature ?? 0)) : Number.POSITIVE_INFINITY,
  left.masks.valid === right.masks.valid ? Math.abs((left.principalCurvatures?.[0] ?? 0) - (right.principalCurvatures?.[0] ?? 0)) : Number.POSITIVE_INFINITY,
  left.masks.valid === right.masks.valid ? Math.abs((left.principalCurvatures?.[1] ?? 0) - (right.principalCurvatures?.[1] ?? 0)) : Number.POSITIVE_INFINITY
);

export const analyzeParametricDifferentialPoint = (input: ParametricDifferentialInput): SurfaceDifferentialPoint => {
  const uSpan = input.domain.u.max - input.domain.u.min;
  const vSpan = input.domain.v.max - input.domain.v.min;
  if (!(uSpan > 0) || !(vSpan > 0)) throw new Error("Parametric Surface domain must have positive extent.");
  if (!Number.isFinite(input.u) || !Number.isFinite(input.v) || input.u < input.domain.u.min || input.u > input.domain.u.max || input.v < input.domain.v.min || input.v > input.domain.v.max) {
    throw new Error("Surface parameters must be finite and inside the declared domain.");
  }
  const requestedStep = input.step ?? [Math.max(1e-5, uSpan * 2e-3), Math.max(1e-5, vSpan * 2e-3)];
  if (!requestedStep.every((value) => Number.isFinite(value) && value > 0)) throw new Error("Derivative steps must be finite and positive.");
  const coarseStep: readonly [number, number] = [Math.min(requestedStep[0], uSpan / 3), Math.min(requestedStep[1], vSpan / 3)];
  const fineStep: readonly [number, number] = [coarseStep[0] / 2, coarseStep[1] / 2];
  const coarse = numericalJet(input.evaluate, input.u, input.v, input.domain, coarseStep);
  const fine = numericalJet(input.evaluate, input.u, input.v, input.domain, fineStep);
  const common = {
    representation: input.representation ?? "parametric" as const,
    method: "numerical-derivatives" as const,
    parameter: [input.u, input.v] as const,
    orientation: input.orientation,
    units: input.units,
    tolerance: input.tolerance,
    boundary: fine.boundary,
    uncertaintyTolerance: input.uncertaintyTolerance,
  };
  const coarsePoint = computeFromJet({ ...common, jet: coarse.jet, step: coarseStep });
  const finePoint = computeFromJet({ ...common, jet: fine.jet, step: fineStep });
  return computeFromJet({
    ...common,
    jet: fine.jet,
    step: fineStep,
    derivativeUncertainty: jetDifference(coarse.jet, fine.jet),
    curvatureUncertainty: curvatureDifference(coarsePoint, finePoint),
    warnings: ["Adaptive finite differences were used because exact derivatives were unavailable."],
  });
};

export const analyzeGraphDifferentialPoint = (input: GraphDifferentialInput): SurfaceDifferentialPoint => analyzeParametricDifferentialPoint({
  representation: "explicit",
  evaluate: (x, y) => [x, y, input.evaluate(x, y)],
  u: input.x,
  v: input.y,
  domain: { u: input.domain.x, v: input.domain.y },
  orientation: input.orientation ?? defaultOrientation("explicit"),
  units: input.units,
  step: input.step,
  tolerance: input.tolerance,
  uncertaintyTolerance: input.uncertaintyTolerance,
});

export const analyzeExactSurfaceDifferentialPoint = (args: {
  definition: GeometryAnalyticSurfaceDefinition;
  u: number;
  v: number;
  representation?: "explicit" | "parametric" | "spline" | "constructed" | "weierstrass";
  units?: SurfaceUnits;
  tolerance?: number;
}): SurfaceDifferentialPoint => {
  const evaluated = evaluateExactSurfacePoint({ definition: args.definition, u: args.u, v: args.v, tolerance: args.tolerance });
  const boundary = (!args.definition.domain.u.periodic && (args.u <= args.definition.domain.u.min || args.u >= args.definition.domain.u.max)) ||
    (!args.definition.domain.v.periodic && (args.v <= args.definition.domain.v.min || args.v >= args.definition.domain.v.max));
  return computeFromJet({
    jet: {
      position: evaluated.position,
      derivativeU: evaluated.derivativeU,
      derivativeV: evaluated.derivativeV,
      derivativeUU: evaluated.derivativeUU,
      derivativeUV: evaluated.derivativeUV,
      derivativeVV: evaluated.derivativeVV,
    },
    representation: args.representation ?? "parametric",
    method: args.definition.capabilities.first === "exact" && args.definition.capabilities.second === "exact" ? "analytic" : "surface-sampling",
    parameter: [evaluated.u, evaluated.v],
    orientation: { convention: "parameter-cross", sign: args.definition.orientation.sign, description: args.definition.orientation.description },
    units: args.units ?? { length: args.definition.units.position, angle: "rad", parameter: args.definition.units.parameters.join(",") },
    tolerance: args.tolerance,
    boundary,
  });
};

const orthonormalBasis = (normal: SurfaceDifferentialVec3, tolerance: number): readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3] | null => {
  const reference: SurfaceDifferentialVec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const first = normalize(cross(reference, normal), tolerance);
  const second = first ? normalize(cross(normal, first), tolerance) : null;
  return first && second ? [first, second] : null;
};

const numericImplicitDerivatives = (
  evaluate: ImplicitDifferentialInput["evaluate"],
  point: SurfaceDifferentialVec3,
  step: number
): { gradient: SurfaceDifferentialVec3; hessian: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3, SurfaceDifferentialVec3] } => {
  const sample = (dx: number, dy: number, dz: number) => evaluate(point[0] + dx, point[1] + dy, point[2] + dz);
  const center = sample(0, 0, 0);
  const axis = ([x, y, z]: SurfaceDifferentialVec3) => sample(x * step, y * step, z * step);
  const ex: SurfaceDifferentialVec3 = [1, 0, 0];
  const ey: SurfaceDifferentialVec3 = [0, 1, 0];
  const ez: SurfaceDifferentialVec3 = [0, 0, 1];
  const gradient: SurfaceDifferentialVec3 = [
    (axis(ex) - axis(scale(ex, -1))) / (2 * step),
    (axis(ey) - axis(scale(ey, -1))) / (2 * step),
    (axis(ez) - axis(scale(ez, -1))) / (2 * step),
  ];
  const diagonal = (direction: SurfaceDifferentialVec3) => (axis(direction) - 2 * center + axis(scale(direction, -1))) / (step * step);
  const mixed = (a: SurfaceDifferentialVec3, b: SurfaceDifferentialVec3) => (
    sample((a[0] + b[0]) * step, (a[1] + b[1]) * step, (a[2] + b[2]) * step) -
    sample((a[0] - b[0]) * step, (a[1] - b[1]) * step, (a[2] - b[2]) * step) -
    sample((-a[0] + b[0]) * step, (-a[1] + b[1]) * step, (-a[2] + b[2]) * step) +
    sample((-a[0] - b[0]) * step, (-a[1] - b[1]) * step, (-a[2] - b[2]) * step)
  ) / (4 * step * step);
  const xx = diagonal(ex); const yy = diagonal(ey); const zz = diagonal(ez);
  const xy = mixed(ex, ey); const xz = mixed(ex, ez); const yz = mixed(ey, ez);
  return { gradient, hessian: [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]] };
};

const matrixVector = (matrix: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3, SurfaceDifferentialVec3], value: SurfaceDifferentialVec3): SurfaceDifferentialVec3 => [
  dot(matrix[0], value), dot(matrix[1], value), dot(matrix[2], value),
];

const implicitFromDerivatives = (args: {
  point: SurfaceDifferentialVec3;
  gradient: SurfaceDifferentialVec3;
  hessian: readonly [SurfaceDifferentialVec3, SurfaceDifferentialVec3, SurfaceDifferentialVec3];
  method: SurfaceAnalysisMethod;
  orientation?: SurfaceOrientation;
  units?: SurfaceUnits;
  tolerance?: number;
  derivativeUncertainty?: number;
  curvatureUncertainty?: number;
  step?: number;
  uncertaintyTolerance?: number;
  warnings?: readonly string[];
}): SurfaceDifferentialPoint => {
  const tolerance = Math.max(1e-12, args.tolerance ?? 1e-9);
  const orientation = args.orientation ?? defaultOrientation("implicit");
  const gradientMagnitude = length(args.gradient);
  if (!Number.isFinite(gradientMagnitude) || gradientMagnitude <= tolerance) {
    return emptyPoint({ representation: "implicit", method: args.method, position: args.point, orientation, units: args.units, singular: true, warning: "Implicit gradient is zero; this point is singular." });
  }
  const baseNormal = scale(args.gradient, 1 / gradientMagnitude);
  const normal = scale(baseNormal, orientation.sign);
  const basis = orthonormalBasis(normal, tolerance);
  if (!basis) return emptyPoint({ representation: "implicit", method: args.method, position: args.point, orientation, units: args.units, singular: true, warning: "Implicit tangent basis is singular." });
  const [du, dv] = basis;
  const signedScale = orientation.sign / gradientMagnitude;
  const L = dot(du, matrixVector(args.hessian, du)) * signedScale;
  const M = dot(du, matrixVector(args.hessian, dv)) * signedScale;
  const N = dot(dv, matrixVector(args.hessian, dv)) * signedScale;
  // Choose local geodesic coordinates at the point; their normal second derivatives encode II.
  const jet: SurfaceDifferentialJet = {
    position: args.point,
    derivativeU: du,
    derivativeV: dv,
    derivativeUU: scale(normal, -L),
    derivativeUV: scale(normal, -M),
    derivativeVV: scale(normal, -N),
  };
  return computeFromJet({
    jet,
    representation: "implicit",
    method: args.method,
    orientation: { ...orientation, convention: "source-defined", description: `${orientation.description}; implicit gradient/Hessian local chart` },
    units: args.units,
    tolerance,
    derivativeUncertainty: args.derivativeUncertainty,
    curvatureUncertainty: args.curvatureUncertainty,
    uncertaintyTolerance: args.uncertaintyTolerance,
    step: args.step ? [args.step, args.step] : null,
    warnings: args.warnings,
  });
};

export const analyzeImplicitDifferentialPoint = (input: ImplicitDifferentialInput): SurfaceDifferentialPoint => {
  if (input.gradient && input.hessian) return implicitFromDerivatives({
    ...input,
    gradient: input.gradient,
    hessian: input.hessian,
    method: input.method ?? "analytic",
  });
  const step = Math.max(1e-6, input.step ?? 1e-3);
  const coarse = numericImplicitDerivatives(input.evaluate, input.point, step);
  const fine = numericImplicitDerivatives(input.evaluate, input.point, step / 2);
  const coarsePoint = implicitFromDerivatives({ ...input, ...coarse, method: "numerical-derivatives", step });
  const finePoint = implicitFromDerivatives({ ...input, ...fine, method: "numerical-derivatives", step: step / 2 });
  const derivativeUncertainty = Math.max(vectorDistance(coarse.gradient, fine.gradient), ...coarse.hessian.map((row, index) => vectorDistance(row, fine.hessian[index])));
  return implicitFromDerivatives({
    ...input,
    ...fine,
    method: "numerical-derivatives",
    step: step / 2,
    derivativeUncertainty,
    curvatureUncertainty: curvatureDifference(coarsePoint, finePoint),
    warnings: ["Adaptive finite differences estimated the implicit gradient and Hessian."],
  });
};

export const adaptMeshDifferentialPoint = (input: MeshDifferentialInput): SurfaceDifferentialPoint => {
  const tolerance = 1e-9;
  const normal = normalize(input.normal, tolerance);
  if (!normal || input.valid === false || !input.principalCurvatures.every(Number.isFinite)) {
    return emptyPoint({ representation: "mesh-backed", method: "mesh-approximation", position: input.position, units: input.units, boundary: input.boundary, warning: "Discrete mesh differential sample is invalid." });
  }
  const suppliedFirst = input.principalDirections
    ? normalize(subtract(input.principalDirections[0], scale(normal, dot(input.principalDirections[0], normal))), tolerance)
    : null;
  const basis = suppliedFirst
    ? [suppliedFirst, normalize(cross(normal, suppliedFirst), tolerance)!] as const
    : input.principalDirections
      ? null
      : orthonormalBasis(normal, tolerance);
  if (!basis) return emptyPoint({ representation: "mesh-backed", method: "mesh-approximation", position: input.position, units: input.units, boundary: input.boundary, warning: "Discrete mesh tangent basis is invalid." });
  const [rawK1, rawK2] = input.principalCurvatures;
  const k1 = Math.max(rawK1, rawK2);
  const k2 = Math.min(rawK1, rawK2);
  const jet: SurfaceDifferentialJet = {
    position: input.position,
    derivativeU: basis[0], derivativeV: basis[1],
    derivativeUU: scale(normal, -k1), derivativeUV: [0, 0, 0], derivativeVV: scale(normal, -k2),
  };
  return computeFromJet({
    jet,
    representation: "mesh-backed",
    method: "mesh-approximation",
    orientation: defaultOrientation("mesh-backed"),
    units: input.units,
    boundary: input.boundary,
    derivativeUncertainty: input.uncertainty,
    curvatureUncertainty: input.uncertainty,
    warnings: ["Curvature is a discrete mesh approximation, not an analytic Surface result."],
  });
};

export const analyzeSurfaceDifferentialPoint = (input: SurfaceDifferentialAnalysisInput): SurfaceDifferentialPoint => {
  switch (input.kind) {
    case "exact": return analyzeExactSurfaceDifferentialPoint(input);
    case "graph": return analyzeGraphDifferentialPoint(input);
    case "parametric": return analyzeParametricDifferentialPoint(input);
    case "implicit": return analyzeImplicitDifferentialPoint(input);
    case "mesh": return adaptMeshDifferentialPoint(input);
  }
};

const writeVec = (target: Float64Array, offset: number, value: SurfaceDifferentialVec3 | null) => {
  target[offset] = value?.[0] ?? NaN;
  target[offset + 1] = value?.[1] ?? NaN;
  target[offset + 2] = value?.[2] ?? NaN;
};

export const buildSurfaceDifferentialField = (samples: readonly SurfaceDifferentialPoint[]): SurfaceDifferentialFieldPayload => {
  const count = samples.length;
  const payload: SurfaceDifferentialFieldPayload = {
    kind: "differential",
    sampleCount: count,
    parameters: new Float64Array(count * 2).fill(NaN),
    positions: new Float64Array(count * 3).fill(NaN),
    firstDerivatives: new Float64Array(count * 6).fill(NaN),
    secondDerivatives: new Float64Array(count * 9).fill(NaN),
    normals: new Float64Array(count * 3).fill(NaN),
    firstFundamentalForms: new Float64Array(count * 3).fill(NaN),
    secondFundamentalForms: new Float64Array(count * 3).fill(NaN),
    shapeOperators: new Float64Array(count * 4).fill(NaN),
    gaussianCurvature: new Float64Array(count).fill(NaN),
    meanCurvature: new Float64Array(count).fill(NaN),
    principalCurvatures: new Float64Array(count * 2).fill(NaN),
    principalDirections: new Float64Array(count * 6).fill(NaN),
    validityMask: new Uint8Array(count), uncertaintyMask: new Uint8Array(count), boundaryMask: new Uint8Array(count),
    degeneracyMask: new Uint8Array(count), singularityMask: new Uint8Array(count), umbilicMask: new Uint8Array(count),
  };
  samples.forEach((sample, index) => {
    if (sample.parameter) { payload.parameters[index * 2] = sample.parameter[0]; payload.parameters[index * 2 + 1] = sample.parameter[1]; }
    writeVec(payload.positions, index * 3, sample.jet?.position ?? null);
    writeVec(payload.firstDerivatives, index * 6, sample.jet?.derivativeU ?? null);
    writeVec(payload.firstDerivatives, index * 6 + 3, sample.jet?.derivativeV ?? null);
    writeVec(payload.secondDerivatives, index * 9, sample.jet?.derivativeUU ?? null);
    writeVec(payload.secondDerivatives, index * 9 + 3, sample.jet?.derivativeUV ?? null);
    writeVec(payload.secondDerivatives, index * 9 + 6, sample.jet?.derivativeVV ?? null);
    writeVec(payload.normals, index * 3, sample.normal);
    if (sample.firstFundamentalForm) payload.firstFundamentalForms.set([sample.firstFundamentalForm.E, sample.firstFundamentalForm.F, sample.firstFundamentalForm.G], index * 3);
    if (sample.secondFundamentalForm) payload.secondFundamentalForms.set([sample.secondFundamentalForm.L, sample.secondFundamentalForm.M, sample.secondFundamentalForm.N], index * 3);
    if (sample.shapeOperator) payload.shapeOperators.set([...sample.shapeOperator[0], ...sample.shapeOperator[1]], index * 4);
    payload.gaussianCurvature[index] = sample.gaussianCurvature ?? NaN;
    payload.meanCurvature[index] = sample.meanCurvature ?? NaN;
    if (sample.principalCurvatures) payload.principalCurvatures.set(sample.principalCurvatures, index * 2);
    if (sample.principalDirections) { writeVec(payload.principalDirections, index * 6, sample.principalDirections[0]); writeVec(payload.principalDirections, index * 6 + 3, sample.principalDirections[1]); }
    payload.validityMask[index] = Number(sample.masks.valid); payload.uncertaintyMask[index] = Number(sample.masks.uncertain);
    payload.boundaryMask[index] = Number(sample.masks.boundary); payload.degeneracyMask[index] = Number(sample.masks.degenerate);
    payload.singularityMask[index] = Number(sample.masks.singular); payload.umbilicMask[index] = Number(sample.masks.umbilic);
  });
  return payload;
};

export const createSurfaceDifferentialPayload = (args: {
  definition: CanonicalSurfaceDefinition;
  method: SurfaceAnalysisMethod;
  samples: readonly SurfaceDifferentialPoint[];
}): SurfaceAnalysisPayload => {
  const method = args.definition.representation === "mesh-backed" ? "mesh-approximation" : args.method;
  const methodWarnings = args.definition.representation === "mesh-backed" && args.method !== "mesh-approximation"
    ? ["Mesh-backed Surface differential results are explicitly labelled mesh approximation."]
    : [];
  return ({
  version: 1,
  surfaceId: args.definition.identity.surfaceId,
  surfaceRevision: args.definition.identity.surfaceRevision,
  representation: args.definition.representation,
  method,
  units: args.definition.units,
  orientation: args.definition.orientation,
  warnings: [...new Set([...args.definition.warnings, ...methodWarnings, ...args.samples.flatMap((sample) => sample.warnings)])],
  data: buildSurfaceDifferentialField(args.samples),
  });
};
