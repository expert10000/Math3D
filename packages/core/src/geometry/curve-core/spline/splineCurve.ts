import type { Vec2, Vec3 } from "../../../math";
import type { AnyCurve, CurvePoint } from "../model";
import { normalizeCurveDomain } from "../model";
import { addPoint, distancePoint, isVec3Point, lengthPoint, scalePoint, subPoint } from "../utils/vector";

export type SplineKind = "bezier" | "b-spline" | "nurbs";
export type SplineSelectionMode = "curve" | "span" | "control-point" | "knot" | "weight";
export type SplineContinuity = "C0" | "C1" | "C2" | "G1" | "G2";

export type CanonicalSplineDefinition = {
  version: 1;
  id: string;
  revision: number;
  name: string;
  kind: SplineKind;
  dimension: 2 | 3;
  degree: number;
  controlPoints: CurvePoint[];
  knotVector: number[];
  weights: number[];
  closed: boolean;
  periodic: boolean;
  clamped: boolean;
  domain: { tMin: number; tMax: number };
};

export type SplineDefinitionInput = Omit<CanonicalSplineDefinition, "version" | "revision" | "knotVector" | "weights" | "closed" | "periodic" | "clamped" | "domain"> & {
  revision?: number;
  knotVector?: readonly number[];
  weights?: readonly number[];
  closed?: boolean;
  periodic?: boolean;
  clamped?: boolean;
  domain?: { tMin: number; tMax: number };
};

export type SplineCurve = AnyCurve & { spline: CanonicalSplineDefinition };
export type SplineConstructionEvidence = { parameter: number; span: number; basis: number[]; levels: CurvePoint[][]; point: CurvePoint };

const EPS = 1e-12;
const finitePoint = (point: CurvePoint, dimension: 2 | 3) => Number.isFinite(point.x) && Number.isFinite(point.y) && (dimension === 2 || isVec3Point(point) && Number.isFinite(point.z));
const coordinate = (point: CurvePoint, axis: number) => axis === 0 ? point.x : axis === 1 ? point.y : isVec3Point(point) ? point.z : 0;
const pointFrom = (values: readonly number[], dimension: 2 | 3): CurvePoint => dimension === 2 ? { x: values[0], y: values[1] } : { x: values[0], y: values[1], z: values[2] };

export const createOpenUniformKnotVector = (controlPointCount: number, degree: number): number[] => {
  if (!Number.isInteger(degree) || degree < 1 || controlPointCount <= degree) throw new Error("Spline degree requires at least degree + 1 control points.");
  const knotCount = controlPointCount + degree + 1;
  const interiorCount = controlPointCount - degree - 1;
  return Array.from({ length: knotCount }, (_, index) => {
    if (index <= degree) return 0;
    if (index >= controlPointCount) return 1;
    return (index - degree) / (interiorCount + 1);
  });
};

export const validateSplineDefinition = (definition: CanonicalSplineDefinition): string[] => {
  const errors: string[] = [];
  if (!definition.id.trim()) errors.push("Spline ID is required.");
  if (!Number.isSafeInteger(definition.revision) || definition.revision < 0) errors.push("Spline revision must be a non-negative integer.");
  if (!Number.isInteger(definition.degree) || definition.degree < 1) errors.push("Spline degree must be a positive integer.");
  if (definition.controlPoints.length <= definition.degree) errors.push("Spline requires at least degree + 1 control points.");
  if (definition.controlPoints.some((point) => !finitePoint(point, definition.dimension))) errors.push("Control points must be finite and match the spline dimension.");
  if (definition.knotVector.length !== definition.controlPoints.length + definition.degree + 1) errors.push("Knot vector length must equal control point count + degree + 1.");
  if (definition.knotVector.some((knot) => !Number.isFinite(knot))) errors.push("Knots must be finite.");
  if (definition.knotVector.some((knot, index) => index > 0 && knot < definition.knotVector[index - 1])) errors.push("Knot vector must be nondecreasing.");
  if (definition.weights.length !== definition.controlPoints.length) errors.push("Weight count must equal control point count.");
  if (definition.weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) errors.push("Weights must be positive and finite.");
  if (!(definition.domain.tMax > definition.domain.tMin)) errors.push("Spline parameter domain must have positive extent.");
  if (definition.kind === "bezier" && definition.degree !== definition.controlPoints.length - 1) errors.push("Bezier degree must equal control point count - 1.");
  if (definition.periodic && definition.clamped) errors.push("A spline cannot be both periodic and clamped.");
  return errors;
};

export const createSplineDefinition = (input: SplineDefinitionInput): CanonicalSplineDefinition => {
  const generatedKnots = createOpenUniformKnotVector(input.controlPoints.length, input.degree);
  const knotVector = [...(input.knotVector ?? (input.domain
    ? generatedKnots.map((knot) => input.domain!.tMin + knot * (input.domain!.tMax - input.domain!.tMin))
    : generatedKnots))];
  const weights = [...(input.weights ?? input.controlPoints.map(() => 1))];
  const domain = input.domain ?? { tMin: knotVector[input.degree], tMax: knotVector[input.controlPoints.length] };
  const definition: CanonicalSplineDefinition = {
    version: 1, id: input.id, revision: input.revision ?? 1, name: input.name, kind: input.kind,
    dimension: input.dimension, degree: input.degree,
    controlPoints: input.controlPoints.map((point) => ({ ...point })), knotVector, weights,
    closed: input.closed ?? false, periodic: input.periodic ?? false, clamped: input.clamped ?? !input.periodic,
    domain: { ...domain },
  };
  const errors = validateSplineDefinition(definition);
  if (errors.length) throw new Error(errors.join(" "));
  return definition;
};

export const findSplineKnotSpan = (definition: CanonicalSplineDefinition, parameter: number): number => {
  const n = definition.controlPoints.length - 1;
  const u = Math.min(definition.domain.tMax, Math.max(definition.domain.tMin, parameter));
  if (u >= definition.domain.tMax) return n;
  let low = definition.degree; let high = n + 1; let mid = Math.floor((low + high) / 2);
  while (u < definition.knotVector[mid] || u >= definition.knotVector[mid + 1]) {
    if (u < definition.knotVector[mid]) high = mid; else low = mid;
    mid = Math.floor((low + high) / 2);
  }
  return mid;
};

export const evaluateSplineBasis = (definition: CanonicalSplineDefinition, parameter: number): number[] => {
  const p = definition.degree; const span = findSplineKnotSpan(definition, parameter);
  const u = Math.min(definition.domain.tMax, Math.max(definition.domain.tMin, parameter));
  const local = new Array<number>(p + 1).fill(0); local[0] = 1;
  const left = new Array<number>(p + 1).fill(0); const right = new Array<number>(p + 1).fill(0);
  for (let j = 1; j <= p; j += 1) {
    left[j] = u - definition.knotVector[span + 1 - j]; right[j] = definition.knotVector[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r += 1) {
      const denominator = right[r + 1] + left[j - r]; const term = Math.abs(denominator) <= EPS ? 0 : local[r] / denominator;
      local[r] = saved + right[r + 1] * term; saved = left[j - r] * term;
    }
    local[j] = saved;
  }
  const basis = new Array<number>(definition.controlPoints.length).fill(0);
  for (let j = 0; j <= p; j += 1) basis[span - p + j] = local[j];
  return basis;
};

const weightedCoordinates = (definition: CanonicalSplineDefinition): number[][] => definition.controlPoints.map((point, index) => {
  const weight = definition.kind === "nurbs" ? definition.weights[index] : 1;
  const values = Array.from({ length: definition.dimension }, (_, axis) => coordinate(point, axis) * weight);
  return [...values, weight];
});

export const evaluateSpline = (definition: CanonicalSplineDefinition, parameter: number): CurvePoint => {
  const basis = evaluateSplineBasis(definition, parameter);
  const dimension = definition.dimension;
  const sum = new Array<number>(dimension + 1).fill(0);
  const homogeneous = weightedCoordinates(definition);
  for (let index = 0; index < basis.length; index += 1) for (let axis = 0; axis <= dimension; axis += 1) sum[axis] += basis[index] * homogeneous[index][axis];
  const divisor = definition.kind === "nurbs" ? sum[dimension] : 1;
  if (Math.abs(divisor) <= EPS) return pointFrom(new Array(dimension).fill(Number.NaN), dimension);
  return pointFrom(sum.slice(0, dimension).map((value) => value / divisor), dimension);
};

const evaluateDerivativeOrder = (definition: CanonicalSplineDefinition, parameter: number, order: 1 | 2): CurvePoint => {
  const span = definition.domain.tMax - definition.domain.tMin;
  const h = Math.max(1e-7, span * 1e-5);
  const lo = Math.max(definition.domain.tMin, parameter - h); const hi = Math.min(definition.domain.tMax, parameter + h);
  if (order === 1) return scalePoint(subPoint(evaluateSpline(definition, hi), evaluateSpline(definition, lo)), 1 / Math.max(EPS, hi - lo));
  const center = Math.min(definition.domain.tMax - h, Math.max(definition.domain.tMin + h, parameter));
  return scalePoint(addPoint(subPoint(evaluateSpline(definition, center + h), scalePoint(evaluateSpline(definition, center), 2)), evaluateSpline(definition, center - h)), 1 / (h * h));
};

export const evaluateSplineDerivative = (definition: CanonicalSplineDefinition, parameter: number, order: 1 | 2 = 1): CurvePoint => evaluateDerivativeOrder(definition, parameter, order);

export const splineEndpoint = (definition: CanonicalSplineDefinition, end: "start" | "end") => evaluateSpline(definition, end === "start" ? definition.domain.tMin : definition.domain.tMax);

export const buildSplineCurve = (definition: CanonicalSplineDefinition): SplineCurve => ({
  id: definition.id, name: definition.name, kind: definition.kind === "b-spline" ? "bspline" : definition.kind,
  family: "parametric", subtype: definition.kind === "nurbs" ? "nurbs" : definition.kind === "b-spline" ? "spline" : "polynomial",
  dimension: definition.dimension,
  domain: normalizeCurveDomain({ tMin: definition.domain.tMin, tMax: definition.domain.tMax, closed: definition.closed, periodic: definition.periodic }),
  eval: (parameter) => evaluateSpline(definition, parameter) as never,
  derivative: (parameter) => evaluateSplineDerivative(definition, parameter, 1) as never,
  secondDerivative: (parameter) => evaluateSplineDerivative(definition, parameter, 2) as never,
  spline: definition,
} as SplineCurve);

const blendLevels = (controlPoints: readonly CurvePoint[], parameter: number): CurvePoint[][] => {
  const levels: CurvePoint[][] = [controlPoints.map((point) => ({ ...point }))];
  for (let level = 1; level < controlPoints.length; level += 1) levels.push(levels[level - 1].slice(0, -1).map((point, index) => addPoint(scalePoint(point, 1 - parameter), scalePoint(levels[level - 1][index + 1], parameter))));
  return levels;
};

export const splineConstructionEvidence = (definition: CanonicalSplineDefinition, parameter: number): SplineConstructionEvidence => {
  const span = findSplineKnotSpan(definition, parameter); const basis = evaluateSplineBasis(definition, parameter);
  if (definition.kind === "bezier") {
    const u = (parameter - definition.domain.tMin) / (definition.domain.tMax - definition.domain.tMin);
    const levels = blendLevels(definition.controlPoints, u);
    return { parameter, span, basis, levels, point: levels.at(-1)?.[0] ?? evaluateSpline(definition, parameter) };
  }
  const p = definition.degree; const local = definition.controlPoints.slice(span - p, span + 1).map((point) => ({ ...point }));
  const levels: CurvePoint[][] = [local];
  for (let r = 1; r <= p; r += 1) {
    const previous = levels[r - 1]; const next: CurvePoint[] = [];
    for (let j = r; j <= p; j += 1) {
      const index = span - p + j; const denominator = definition.knotVector[index + p + 1 - r] - definition.knotVector[index];
      const alpha = Math.abs(denominator) <= EPS ? 0 : (parameter - definition.knotVector[index]) / denominator;
      next.push(addPoint(scalePoint(previous[j - r], 1 - alpha), scalePoint(previous[j - r + 1], alpha)));
    }
    levels.push(next);
  }
  return { parameter, span, basis, levels, point: evaluateSpline(definition, parameter) };
};

const nextRevision = (definition: CanonicalSplineDefinition, patch: Partial<CanonicalSplineDefinition>): CanonicalSplineDefinition => createSplineDefinition({ ...definition, ...patch, revision: definition.revision + 1 });

export const moveSplineControlPoint = (definition: CanonicalSplineDefinition, index: number, point: CurvePoint): CanonicalSplineDefinition => {
  if (index < 0 || index >= definition.controlPoints.length) throw new Error("Control point index is out of range.");
  const controlPoints = definition.controlPoints.map((entry, entryIndex) => entryIndex === index ? { ...point } : { ...entry });
  return nextRevision(definition, { controlPoints });
};

export const setSplineWeight = (definition: CanonicalSplineDefinition, index: number, weight: number): CanonicalSplineDefinition => {
  if (definition.kind !== "nurbs") throw new Error("Only NURBS curves expose editable weights.");
  if (index < 0 || index >= definition.weights.length || !Number.isFinite(weight) || weight <= 0) throw new Error("Weight must be positive and target a valid control point.");
  const weights = definition.weights.map((entry, entryIndex) => entryIndex === index ? weight : entry);
  return nextRevision(definition, { weights });
};

export const setSplineKnot = (definition: CanonicalSplineDefinition, index: number, knot: number): CanonicalSplineDefinition => {
  if (definition.kind === "bezier") throw new Error("Bezier knots are fixed by its Bernstein basis.");
  if (index <= definition.degree || index >= definition.knotVector.length - definition.degree - 1) throw new Error("Clamped endpoint knots cannot be edited.");
  if (!Number.isFinite(knot) || knot < definition.knotVector[index - 1] || knot > definition.knotVector[index + 1]) throw new Error("Edited knot must remain between adjacent knots.");
  const knotVector = definition.knotVector.map((entry, entryIndex) => entryIndex === index ? knot : entry);
  return nextRevision(definition, { knotVector, domain: { tMin: knotVector[definition.degree], tMax: knotVector[definition.controlPoints.length] } });
};

export const subdivideBezier = (definition: CanonicalSplineDefinition, parameter: number): [CanonicalSplineDefinition, CanonicalSplineDefinition] => {
  if (definition.kind !== "bezier") throw new Error("Bezier subdivision requires a Bezier curve.");
  const u = (parameter - definition.domain.tMin) / (definition.domain.tMax - definition.domain.tMin);
  if (!(u > 0 && u < 1)) throw new Error("Subdivision parameter must lie strictly inside the Bezier domain.");
  const levels = blendLevels(definition.controlPoints, u);
  const left = levels.map((level) => level[0]); const right = levels.map((level) => level.at(-1)!).reverse();
  return [
    createSplineDefinition({ ...definition, id: `${definition.id}:left`, revision: definition.revision + 1, controlPoints: left, domain: { tMin: definition.domain.tMin, tMax: parameter }, knotVector: undefined }),
    createSplineDefinition({ ...definition, id: `${definition.id}:right`, revision: definition.revision + 1, controlPoints: right, domain: { tMin: parameter, tMax: definition.domain.tMax }, knotVector: undefined }),
  ];
};

export const elevateBezierDegree = (definition: CanonicalSplineDefinition): CanonicalSplineDefinition => {
  if (definition.kind !== "bezier") throw new Error("Degree elevation requires a Bezier curve.");
  const n = definition.degree; const controlPoints: CurvePoint[] = [{ ...definition.controlPoints[0] }];
  for (let index = 1; index <= n; index += 1) controlPoints.push(addPoint(scalePoint(definition.controlPoints[index - 1], index / (n + 1)), scalePoint(definition.controlPoints[index], 1 - index / (n + 1))));
  controlPoints.push({ ...definition.controlPoints[n] });
  return nextRevision(definition, { degree: n + 1, controlPoints, knotVector: createOpenUniformKnotVector(controlPoints.length, n + 1), weights: controlPoints.map(() => 1) });
};

export const reduceBezierDegree = (definition: CanonicalSplineDefinition, tolerance = 1e-8): CanonicalSplineDefinition | null => {
  if (definition.kind !== "bezier" || definition.degree <= 1) return null;
  const n = definition.degree; const reduced: CurvePoint[] = [{ ...definition.controlPoints[0] }];
  for (let index = 1; index < n; index += 1) reduced.push(scalePoint(subPoint(definition.controlPoints[index], scalePoint(reduced[index - 1], index / n)), 1 / (1 - index / n)));
  const candidate = createSplineDefinition({ ...definition, revision: definition.revision + 1, degree: n - 1, controlPoints: reduced, knotVector: undefined, weights: reduced.map(() => 1) });
  const elevated = elevateBezierDegree({ ...candidate, revision: definition.revision - 1 });
  return elevated.controlPoints.every((point, index) => distancePoint(point, definition.controlPoints[index]) <= tolerance) ? candidate : null;
};

export const insertSplineKnot = (definition: CanonicalSplineDefinition, knot: number): CanonicalSplineDefinition => {
  if (definition.kind === "bezier") throw new Error("Convert a Bezier curve to B-spline form before inserting knots.");
  if (knot < definition.domain.tMin || knot > definition.domain.tMax) throw new Error("Inserted knot must lie inside the valid domain.");
  const p = definition.degree; const k = findSplineKnotSpan(definition, knot); const multiplicity = definition.knotVector.filter((entry) => Math.abs(entry - knot) <= EPS).length;
  if (multiplicity >= p) throw new Error("Knot multiplicity cannot exceed the degree for an interior insertion.");
  const homogeneous = weightedCoordinates(definition); const output: number[][] = new Array(homogeneous.length + 1);
  for (let index = 0; index <= k - p; index += 1) output[index] = [...homogeneous[index]];
  for (let index = k - multiplicity; index < homogeneous.length; index += 1) output[index + 1] = [...homogeneous[index]];
  for (let index = k - p + 1; index <= k - multiplicity; index += 1) {
    const denominator = definition.knotVector[index + p] - definition.knotVector[index];
    const alpha = Math.abs(denominator) <= EPS ? 0 : (knot - definition.knotVector[index]) / denominator;
    output[index] = homogeneous[index - 1].map((value, axis) => (1 - alpha) * value + alpha * homogeneous[index][axis]);
  }
  const controlPoints = output.map((point) => pointFrom(point.slice(0, definition.dimension).map((value) => value / point[definition.dimension]), definition.dimension));
  const weights = output.map((point) => definition.kind === "nurbs" ? point[definition.dimension] : 1);
  const knotVector = [...definition.knotVector.slice(0, k + 1), knot, ...definition.knotVector.slice(k + 1)];
  return nextRevision(definition, { controlPoints, weights, knotVector });
};

const solveLinearSystem = (matrix: number[][], values: number[]): number[] | null => {
  const n = values.length; const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column; for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) <= EPS) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column]; for (let entry = column; entry <= n; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < n; row += 1) if (row !== column) { const factor = augmented[row][column]; for (let entry = column; entry <= n; entry += 1) augmented[row][entry] -= factor * augmented[column][entry]; }
  }
  return augmented.map((row) => row[n]);
};

export const removeSplineKnot = (definition: CanonicalSplineDefinition, knotIndex: number, tolerance = 1e-7): CanonicalSplineDefinition | null => {
  if (definition.kind === "bezier" || knotIndex <= definition.degree || knotIndex >= definition.knotVector.length - definition.degree - 1) return null;
  const knotVector = definition.knotVector.filter((_, index) => index !== knotIndex); const count = definition.controlPoints.length - 1;
  if (count <= definition.degree) return null;
  const shell = createSplineDefinition({ ...definition, controlPoints: definition.controlPoints.slice(0, count), weights: definition.weights.slice(0, count), knotVector });
  const parameters = Array.from({ length: count }, (_, index) => definition.domain.tMin + (index / (count - 1)) * (definition.domain.tMax - definition.domain.tMin));
  const matrix = parameters.map((parameter) => evaluateSplineBasis(shell, parameter));
  const homogeneous = parameters.map((parameter) => {
    const point = evaluateSpline(definition, parameter); const weight = definition.kind === "nurbs" ? evaluateSplineBasis(definition, parameter).reduce((sum, basis, index) => sum + basis * definition.weights[index], 0) : 1;
    return [...Array.from({ length: definition.dimension }, (_, axis) => coordinate(point, axis) * weight), weight];
  });
  const solved = Array.from({ length: definition.dimension + 1 }, (_, axis) => solveLinearSystem(matrix, homogeneous.map((row) => row[axis])));
  if (solved.some((row) => !row)) return null;
  const output = Array.from({ length: count }, (_, index) => solved.map((axis) => axis![index]));
  const weights = output.map((row) => definition.kind === "nurbs" ? row[definition.dimension] : 1);
  if (weights.some((weight) => weight <= EPS)) return null;
  const controlPoints = output.map((row) => pointFrom(row.slice(0, definition.dimension).map((value) => value / row[definition.dimension]), definition.dimension));
  const candidate = createSplineDefinition({ ...definition, revision: definition.revision + 1, controlPoints, weights, knotVector });
  for (let index = 0; index <= 128; index += 1) { const parameter = definition.domain.tMin + index / 128 * (definition.domain.tMax - definition.domain.tMin); if (distancePoint(evaluateSpline(definition, parameter), evaluateSpline(candidate, parameter)) > tolerance) return null; }
  return candidate;
};

export const constrainSplineJoin = (left: CanonicalSplineDefinition, right: CanonicalSplineDefinition, continuity: SplineContinuity): CanonicalSplineDefinition => {
  if (left.dimension !== right.dimension) throw new Error("Joined spline dimensions must match.");
  const points = right.controlPoints.map((point) => ({ ...point })); const leftEnd = left.controlPoints.at(-1)!; points[0] = { ...leftEnd };
  if (continuity !== "C0" && points.length > 1 && left.controlPoints.length > 1) {
    const leftTangent = subPoint(leftEnd, left.controlPoints.at(-2)!);
    if (continuity === "G1" || continuity === "G2") {
      const length = lengthPoint(subPoint(points[1], points[0])); const sourceLength = lengthPoint(leftTangent);
      points[1] = addPoint(points[0], scalePoint(leftTangent, sourceLength <= EPS ? 0 : length / sourceLength));
    } else points[1] = addPoint(points[0], scalePoint(leftTangent, left.degree / right.degree));
  }
  if ((continuity === "C2" || continuity === "G2") && points.length > 2 && left.controlPoints.length > 2) {
    const second = addPoint(subPoint(leftEnd, scalePoint(left.controlPoints.at(-2)!, 2)), left.controlPoints.at(-3)!);
    points[2] = addPoint(scalePoint(points[1], 2), subPoint(scalePoint(second, (left.degree * (left.degree - 1)) / Math.max(1, right.degree * (right.degree - 1))), points[0]));
  }
  return nextRevision(right, { controlPoints: points });
};

export type SplineHistory = { entries: CanonicalSplineDefinition[]; index: number };
export const createSplineHistory = (definition: CanonicalSplineDefinition): SplineHistory => ({ entries: [definition], index: 0 });
export const pushSplineHistory = (history: SplineHistory, definition: CanonicalSplineDefinition): SplineHistory => ({ entries: [...history.entries.slice(0, history.index + 1), definition], index: history.index + 1 });
export const undoSplineHistory = (history: SplineHistory): SplineHistory => ({ ...history, index: Math.max(0, history.index - 1) });
export const redoSplineHistory = (history: SplineHistory): SplineHistory => ({ ...history, index: Math.min(history.entries.length - 1, history.index + 1) });
export const currentSplineRevision = (history: SplineHistory): CanonicalSplineDefinition => history.entries[history.index];

export const serializeSplineDefinition = (definition: CanonicalSplineDefinition): string => JSON.stringify(definition);
export const parseSplineDefinition = (serialized: string): CanonicalSplineDefinition => {
  const parsed = JSON.parse(serialized) as CanonicalSplineDefinition;
  if (parsed.version !== 1) throw new Error("Unsupported spline definition version.");
  return createSplineDefinition(parsed);
};

export const RATIONAL_NURBS_CIRCLE: CanonicalSplineDefinition = createSplineDefinition({
  id: "nurbs-circle", name: "Rational NURBS circle", kind: "nurbs", dimension: 2, degree: 2, closed: true,
  controlPoints: [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 },
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 },
  ],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
  knotVector: [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1],
});

export const DEFAULT_BEZIER_CURVE: CanonicalSplineDefinition = createSplineDefinition({
  id: "bezierCubic", name: "Bezier cubic", kind: "bezier", dimension: 3, degree: 3,
  controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 0.5 }, { x: 2, y: -1, z: 1 }, { x: 3, y: 1, z: 0 }],
});

export const DEFAULT_BSPLINE_CURVE: CanonicalSplineDefinition = createSplineDefinition({
  id: "bSplineDemo", name: "B-spline demo", kind: "b-spline", dimension: 3, degree: 3,
  controlPoints: [{ x: -1.4, y: -0.8, z: -0.35 }, { x: -0.9, y: 1.1, z: 0.2 }, { x: -0.1, y: 0.1, z: 0.9 }, { x: 0.8, y: -0.9, z: -0.15 }, { x: 1.5, y: 0.7, z: 0.65 }, { x: 2, y: -0.25, z: 0.1 }],
});

export const DEFAULT_NURBS_QUARTER_ARC: CanonicalSplineDefinition = createSplineDefinition({
  id: "nurbsQuarterArc", name: "NURBS quarter arc", kind: "nurbs", dimension: 2, degree: 2,
  controlPoints: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], weights: [1, Math.SQRT1_2, 1],
});

export const cloneSplineFixture = (definition: CanonicalSplineDefinition): CanonicalSplineDefinition => parseSplineDefinition(serializeSplineDefinition(definition));
export const splinePointToTuple = (point: CurvePoint): [number, number] | [number, number, number] => isVec3Point(point) ? [point.x, point.y, point.z] : [point.x, point.y];
export const tupleToSplinePoint = (tuple: readonly number[], dimension: 2 | 3): Vec2 | Vec3 => pointFrom(tuple, dimension) as Vec2 | Vec3;
