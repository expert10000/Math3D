import type { AnyCurve, CurveEvalResult, CurvePoint } from "../model";
import { buildArcLengthTableFromSamples, invertArcLengthTable, type ArcLengthTable } from "../utils/reparameterization";
import { distancePoint, dotPoint, finitePoint, lengthPoint, lerpPoint, subPoint } from "../utils/vector";

export type RobustSamplingMode = "geometric" | "tangent-angle" | "curvature-aware" | "hybrid";

export type RobustSamplingOptions = {
  mode?: RobustSamplingMode;
  tolerance?: number;
  angularTolerance?: number;
  curvatureThreshold?: number;
  minimumSamples?: number;
  maximumSamples?: number;
  maximumEvaluations?: number;
  maxDepth?: number;
  breakpoints?: readonly number[];
  closed?: boolean;
  periodic?: boolean;
  discontinuityTolerance?: number;
};

export type CurveSamplingDiagnosticCode =
  | "invalid-evaluation"
  | "maximum-depth"
  | "maximum-samples"
  | "maximum-evaluations"
  | "closed-seam-mismatch"
  | "zero-length";

export type CurveSamplingDiagnostic = {
  code: CurveSamplingDiagnosticCode;
  severity: "info" | "warning" | "error";
  message: string;
  interval?: readonly [number, number];
};

export type CurveSamplingStatistics = {
  mode: RobustSamplingMode;
  sampleCount: number;
  validSampleCount: number;
  evaluationCount: number;
  evaluationBudget: number;
  subdivisionCount: number;
  acceptedIntervalCount: number;
  maximumDepthReached: number;
  maxObservedGeometricError: number;
  maxObservedTangentAngle: number;
  seamDuplicateRemoved: boolean;
  subdivisionReasonCounts: Record<CurveSubdivisionReason, number>;
};

export type CurveSubdivisionReason = "invalid" | "geometric-error" | "tangent-angle" | "curvature" | "discontinuity";

export type RobustCurveSamplingResult = {
  samples: CurveEvalResult[];
  renderSamples: CurveEvalResult[];
  arcLengthTable: ArcLengthTable;
  diagnostics: CurveSamplingDiagnostic[];
  statistics: CurveSamplingStatistics;
};

type EvaluatedSample = CurveEvalResult & { valid: boolean };
type IntervalAssessment = {
  a: number;
  b: number;
  depth: number;
  score: number;
  geometricError: number;
  tangentAngle: number;
  invalid: boolean;
  reason: CurveSubdivisionReason;
};

class IntervalMaxHeap {
  private rows: IntervalAssessment[] = [];

  get size(): number { return this.rows.length; }

  push(value: IntervalAssessment): void {
    this.rows.push(value);
    let index = this.rows.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.higher(this.rows[index], this.rows[parent])) break;
      [this.rows[index], this.rows[parent]] = [this.rows[parent], this.rows[index]];
      index = parent;
    }
  }

  pop(): IntervalAssessment | undefined {
    if (!this.rows.length) return undefined;
    const first = this.rows[0];
    const last = this.rows.pop()!;
    if (this.rows.length) {
      this.rows[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let next = index;
        if (left < this.rows.length && this.higher(this.rows[left], this.rows[next])) next = left;
        if (right < this.rows.length && this.higher(this.rows[right], this.rows[next])) next = right;
        if (next === index) break;
        [this.rows[index], this.rows[next]] = [this.rows[next], this.rows[index]];
        index = next;
      }
    }
    return first;
  }

  private higher(left: IntervalAssessment, right: IntervalAssessment): boolean {
    if (left.score !== right.score) return left.score > right.score;
    if (left.depth !== right.depth) return left.depth < right.depth;
    return left.a < right.a;
  }
}

const finitePositive = (value: number | undefined, fallback: number): number =>
  value != null && Number.isFinite(value) && value > 0 ? value : fallback;

const integerAtLeast = (value: number | undefined, minimum: number, fallback: number): number =>
  value != null && Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;

const invalidPoint = (curve: AnyCurve): CurvePoint => curve.dimension === 3
  ? { x: NaN, y: NaN, z: NaN }
  : { x: NaN, y: NaN };

const angleBetween = (left: CurvePoint, right: CurvePoint): number => {
  const leftLength = lengthPoint(left);
  const rightLength = lengthPoint(right);
  if (leftLength <= 1e-14 || rightLength <= 1e-14) return 0;
  const cosine = Math.max(-1, Math.min(1, dotPoint(left, right) / (leftLength * rightLength)));
  return Math.acos(cosine);
};

const uniqueSorted = (values: readonly number[], min: number, max: number): number[] => {
  const filtered = values.filter((value) => Number.isFinite(value) && value >= min && value <= max).sort((left, right) => left - right);
  const output: number[] = [];
  for (const value of filtered) {
    if (!output.length || Math.abs(value - output[output.length - 1]) > Math.max(1e-14, Math.abs(max - min) * 1e-14)) output.push(value);
  }
  return output;
};

export const sampleCurveRobust = (curve: AnyCurve, options: RobustSamplingOptions = {}): RobustCurveSamplingResult => {
  const mode = options.mode ?? "hybrid";
  const tolerance = finitePositive(options.tolerance, 1e-3);
  const angularTolerance = finitePositive(options.angularTolerance, 0.12);
  const curvatureThreshold = finitePositive(options.curvatureThreshold, 0.18);
  const minimumSamples = integerAtLeast(options.minimumSamples, 2, 8);
  const declaredBreakpoints = uniqueSorted(options.breakpoints ?? curve.domain.breakpoints ?? [], curve.domain.tMin, curve.domain.tMax);
  const maximumSamples = Math.max(minimumSamples, declaredBreakpoints.length + 2, integerAtLeast(options.maximumSamples, 2, 4096));
  const maximumEvaluations = Math.max(minimumSamples * 5, integerAtLeast(options.maximumEvaluations, 5, maximumSamples * 12));
  const maxDepth = integerAtLeast(options.maxDepth, 1, 12);
  const closed = options.closed ?? Boolean(curve.domain.closed);
  const periodic = options.periodic ?? Boolean(curve.domain.periodic ?? curve.domain.closed);
  const discontinuityTolerance = options.discontinuityTolerance == null ? null : finitePositive(options.discontinuityTolerance, tolerance * 50);
  const diagnostics: CurveSamplingDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const addDiagnostic = (diagnostic: CurveSamplingDiagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.interval?.[0] ?? ""}:${diagnostic.interval?.[1] ?? ""}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(diagnostic);
  };

  let evaluationCount = 0;
  let evaluationBudgetExceeded = false;
  const evaluationCache = new Map<number, EvaluatedSample>();
  const evaluate = (t: number): EvaluatedSample => {
    const cached = evaluationCache.get(t);
    if (cached) return cached;
    if (evaluationCount >= maximumEvaluations) {
      evaluationBudgetExceeded = true;
      const row: EvaluatedSample = { t, point: invalidPoint(curve), valid: false };
      evaluationCache.set(t, row);
      addDiagnostic({ code: "maximum-evaluations", severity: "warning", message: `Sampling stopped at the ${maximumEvaluations}-evaluation budget.` });
      return row;
    }
    evaluationCount += 1;
    try {
      const point = curve.eval(t);
      const valid = finitePoint(point);
      const row: EvaluatedSample = { t, point: valid ? point : invalidPoint(curve), valid };
      evaluationCache.set(t, row);
      if (!valid) addDiagnostic({ code: "invalid-evaluation", severity: "error", message: `Curve evaluation is not finite at t=${t}.`, interval: [t, t] });
      return row;
    } catch (error) {
      const row: EvaluatedSample = { t, point: invalidPoint(curve), valid: false };
      evaluationCache.set(t, row);
      addDiagnostic({ code: "invalid-evaluation", severity: "error", message: `Curve evaluation failed at t=${t}: ${error instanceof Error ? error.message : String(error)}`, interval: [t, t] });
      return row;
    }
  };

  let maxObservedGeometricError = 0;
  let maxObservedTangentAngle = 0;
  const assess = (a: number, b: number, depth: number): IntervalAssessment => {
    const span = b - a;
    // Irrational-like interior probes avoid the midpoint/quarter aliasing that can
    // completely miss a high-frequency curve whose dyadic samples land on zeros.
    const probeAlphas = [0, 0.21132486540518713, 0.5, 0.7886751345948129, 1];
    const rows = probeAlphas.map((alpha) => evaluate(a + span * alpha));
    const invalid = rows.some((row) => !row.valid);
    let geometricError = 0;
    let tangentAngle = 0;
    let polylineLength = 0;
    if (!invalid) {
      for (let index = 1; index < rows.length - 1; index += 1) {
        const alpha = probeAlphas[index];
        geometricError = Math.max(geometricError, distancePoint(rows[index].point, lerpPoint(rows[0].point, rows[rows.length - 1].point, alpha)));
      }
      for (let index = 1; index < rows.length; index += 1) {
        const segment = subPoint(rows[index].point, rows[index - 1].point);
        polylineLength += lengthPoint(segment);
        if (index > 1) {
          const previous = subPoint(rows[index - 1].point, rows[index - 2].point);
          tangentAngle = Math.max(tangentAngle, angleBetween(previous, segment));
        }
      }
    }
    maxObservedGeometricError = Math.max(maxObservedGeometricError, geometricError);
    maxObservedTangentAngle = Math.max(maxObservedTangentAngle, tangentAngle);
    const geometricScore = geometricError / tolerance;
    const tangentScore = tangentAngle / angularTolerance;
    const curvatureScore = tangentAngle * Math.max(1, polylineLength / Math.max(tolerance, 1e-12)) / curvatureThreshold;
    const discontinuityScore = discontinuityTolerance == null || invalid
      ? 0
      : Math.max(...rows.slice(1).map((row, index) => distancePoint(rows[index].point, row.point))) / discontinuityTolerance;
    const score = invalid
      ? Number.POSITIVE_INFINITY
      : mode === "geometric"
        ? Math.max(geometricScore, discontinuityScore)
        : mode === "tangent-angle"
          ? Math.max(tangentScore, discontinuityScore)
          : mode === "curvature-aware"
            ? Math.max(curvatureScore, discontinuityScore)
            : Math.max(geometricScore, tangentScore, curvatureScore, discontinuityScore);
    const scoredReasons: Array<[CurveSubdivisionReason, number]> = [
      ["geometric-error", geometricScore],
      ["tangent-angle", tangentScore],
      ["curvature", curvatureScore],
      ["discontinuity", discontinuityScore],
    ];
    const reason = invalid
      ? "invalid"
      : scoredReasons.reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
    return { a, b, depth, score, geometricError, tangentAngle, invalid, reason };
  };

  const tMin = curve.domain.tMin;
  const tMax = curve.domain.tMax;
  const uniformBoundaries = Array.from({ length: minimumSamples }, (_, index) =>
    index === minimumSamples - 1 ? tMax : tMin + (tMax - tMin) * index / (minimumSamples - 1));
  const boundaries = uniqueSorted([tMin, ...uniformBoundaries, ...declaredBreakpoints, tMax], tMin, tMax);
  const sampleParameters = new Set(boundaries);
  const sampleDepth = new Map(boundaries.map((t) => [t, 0]));
  const sampleError = new Map(boundaries.map((t) => [t, 0]));
  const subdivisionReasonCounts: Record<CurveSubdivisionReason, number> = {
    invalid: 0,
    "geometric-error": 0,
    "tangent-angle": 0,
    curvature: 0,
    discontinuity: 0,
  };
  const heap = new IntervalMaxHeap();
  for (let index = 1; index < boundaries.length; index += 1) heap.push(assess(boundaries[index - 1], boundaries[index], 0));

  let subdivisionCount = 0;
  let maximumDepthReached = 0;
  while (heap.size) {
    if (evaluationBudgetExceeded) break;
    const interval = heap.pop()!;
    if (interval.score <= 1) continue;
    maximumDepthReached = Math.max(maximumDepthReached, interval.depth);
    if (interval.depth >= maxDepth) {
      addDiagnostic({
        code: "maximum-depth",
        severity: interval.invalid ? "error" : "warning",
        message: `Sampling tolerance was not met before maximum depth ${maxDepth}.`,
        interval: [interval.a, interval.b],
      });
      continue;
    }
    if (sampleParameters.size >= maximumSamples) {
      addDiagnostic({ code: "maximum-samples", severity: "warning", message: `Sampling stopped at the ${maximumSamples}-sample budget.`, interval: [interval.a, interval.b] });
      break;
    }
    const midpoint = (interval.a + interval.b) / 2;
    if (sampleParameters.has(midpoint)) continue;
    const nextDepth = interval.depth + 1;
    sampleParameters.add(midpoint);
    sampleDepth.set(midpoint, nextDepth);
    sampleError.set(midpoint, interval.geometricError);
    subdivisionReasonCounts[interval.reason] += 1;
    subdivisionCount += 1;
    maximumDepthReached = Math.max(maximumDepthReached, nextDepth);
    heap.push(assess(interval.a, midpoint, nextDepth));
    heap.push(assess(midpoint, interval.b, nextDepth));
  }

  const sortedParameters = [...sampleParameters].sort((left, right) => left - right);
  const rawSamples: EvaluatedSample[] = sortedParameters.map((t) => ({
    ...evaluate(t),
    samplingDepth: sampleDepth.get(t) ?? 0,
    geometricError: sampleError.get(t) ?? 0,
  }));
  const arcLengthTable = buildArcLengthTableFromSamples(rawSamples);
  const samples: CurveEvalResult[] = rawSamples.map((sample, index) => ({
    ...sample,
    arcLength: arcLengthTable.lengths[index] ?? 0,
    normalizedArcLength: arcLengthTable.normalizedLengths?.[index] ?? 0,
  }));
  let seamDuplicateRemoved = false;
  let renderSamples = samples;
  if ((closed || periodic) && samples.length > 2) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first.valid !== false && last.valid !== false && distancePoint(first.point, last.point) <= Math.max(tolerance, 1e-9)) {
      renderSamples = samples.slice(0, -1);
      seamDuplicateRemoved = true;
    } else if (closed) {
      addDiagnostic({
        code: "closed-seam-mismatch",
        severity: "warning",
        message: "Curve is marked closed but its endpoint samples do not meet within tolerance.",
        interval: [tMin, tMax],
      });
    }
  }
  if (arcLengthTable.totalLength <= 1e-12) addDiagnostic({ code: "zero-length", severity: "warning", message: "Sampled Curve has zero measurable length." });

  return {
    samples,
    renderSamples,
    arcLengthTable,
    diagnostics,
    statistics: {
      mode,
      sampleCount: samples.length,
      validSampleCount: samples.filter((sample) => sample.valid !== false).length,
      evaluationCount,
      evaluationBudget: maximumEvaluations,
      subdivisionCount,
      acceptedIntervalCount: Math.max(0, samples.length - 1),
      maximumDepthReached,
      maxObservedGeometricError,
      maxObservedTangentAngle,
      seamDuplicateRemoved,
      subdivisionReasonCounts,
    },
  };
};

export const sampleUniformArcLength = (
  curve: AnyCurve,
  sampleCount = 128,
  options: Omit<RobustSamplingOptions, "minimumSamples"> = {}
): CurveEvalResult[] => {
  const count = Math.max(2, Math.floor(sampleCount));
  const source = sampleCurveRobust(curve, {
    ...options,
    mode: options.mode ?? "hybrid",
    minimumSamples: Math.max(8, Math.min(count, 64)),
    maximumSamples: Math.max(count * 8, options.maximumSamples ?? 4096),
  });
  const table = source.arcLengthTable;
  return Array.from({ length: count }, (_, index) => {
    const normalizedArcLength = count === 1 ? 0 : index / (count - 1);
    const arcLength = table.totalLength * normalizedArcLength;
    const t = invertArcLengthTable(table, arcLength);
    try {
      const point = curve.eval(t);
      return { t, point: finitePoint(point) ? point : invalidPoint(curve), valid: finitePoint(point), arcLength, normalizedArcLength };
    } catch {
      return { t, point: invalidPoint(curve), valid: false, arcLength, normalizedArcLength };
    }
  });
};
