import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import { Graph2DPointTableStore, graph2DVerifiedPointTableReference, type Graph2DPointRow } from "./graph2dPointSeries";
import type { ScientificSourceGeneration } from "./scientificJobs";

export type Graph2DLogisticInitial = Readonly<{ capacity: number; rate: number; midpoint: number }>;
export type Graph2DLogisticRegression = Readonly<{
  resultId: string; objectId: string; model: "logistic-growth"; source: ScientificSourceGeneration;
  table: Graph2DPointTableReference; coefficients: readonly [number, number, number];
  parameters: Graph2DLogisticInitial; initial: Graph2DLogisticInitial;
  n: number; excluded: number; degreesOfFreedom: number; sse: number; residualSD: number;
  rSquared: number | null; extent: Readonly<{ min: number; max: number }>;
  solver: Readonly<{ status: "converged"; iterations: number; rejectedSteps: number;
    relativeGradient: number; scaledRateBounds: readonly [number, number];
    method: "bounded-levenberg-marquardt" }>;
  residuals: readonly Readonly<{ rowId: string; x: number; observed: number; fitted: number; residual: number }>[];
  curve: readonly Readonly<{ x: number; y: number }>[]; publication: AnalysisResultEnvelope;
}>;
export type Graph2DLogisticRegressionInput = Readonly<{ document: Graph2DDocument; objectId: string;
  rows: readonly Graph2DPointRow[] | null; initial: Graph2DLogisticInitial }>;
export type Graph2DLogisticRegressionJob = Readonly<{
  progress: number; complete: boolean; cancelled: boolean;
  advance: (maxIterations?: number) => boolean; cancel: () => void; result: () => Graph2DLogisticRegression;
}>;

const MAX_ITERATIONS = 120;
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const sigmoid = (value: number) => value >= 0 ? 1 / (1 + Math.exp(-value)) :
  Math.exp(value) / (1 + Math.exp(value));

/** Pivoted three-parameter normal-equation step; a singular system is an explicit failure. */
const solve3 = (matrix: readonly (readonly number[])[], vector: readonly number[]): [number, number, number] => {
  const a = matrix.map((row, i) => [...row, vector[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    if (!(Math.abs(a[pivot]![col]!) > 1e-20)) throw new TypeError("Logistic fit has a singular normal matrix.");
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let row = col + 1; row < 3; row++) {
      const factor = a[row]![col]! / a[col]![col]!;
      for (let j = col; j < 4; j++) a[row]![j] -= factor * a[col]![j]!;
    }
  }
  const result = [0, 0, 0];
  for (let row = 2; row >= 0; row--) result[row] =
    (a[row]![3]! - result.slice(row + 1).reduce((sum, x, i) => sum + a[row]![row + 1 + i]! * x, 0)) / a[row]![row]!;
  if (!result.every(Number.isFinite)) throw new TypeError("Logistic fit step exceeded finite range.");
  return result as [number, number, number];
};

/** Fits a positive-capacity logistic curve over the observed x range, with a local bounded solver. */
export function createGraph2DLogisticRegressionJob(input: Graph2DLogisticRegressionInput): Graph2DLogisticRegressionJob {
  const started = Date.now(), { document, objectId } = input;
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "point-series") throw new TypeError("Choose a point series for logistic growth fitting.");
  if (!input.rows) throw new TypeError("Nonlinear fitting requires the original checked point-table sidecar.");
  const certified = graph2DVerifiedPointTableReference(input.rows);
  const store = certified ? null : new Graph2DPointTableStore();
  const ref = certified ?? store!.publish(input.rows);
  if (ref.id !== object.table.id || ref.checksum !== object.table.checksum || ref.rowCount !== object.table.rowCount)
    throw new TypeError("Nonlinear fit sidecar checksum does not match the dataset.");
  const rows = (certified ? input.rows : store!.resolve(ref)!).filter(row => row.y !== null &&
    row.x >= object.domain.min && row.x <= object.domain.max &&
    (object.domain.includeMin || row.x !== object.domain.min) &&
    (object.domain.includeMax || row.x !== object.domain.max));
  if (rows.length < 5) throw new TypeError("Logistic growth needs at least five non-missing in-domain observations.");
  const min = Math.min(...rows.map(row => row.x)), max = Math.max(...rows.map(row => row.x)), span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) throw new TypeError("Singular x range: use distinct finite coordinates.");
  const yScale = Math.max(...rows.map(row => Math.abs(row.y!)));
  if (!(yScale > 0) || !Number.isFinite(yScale))
    throw new TypeError("Logistic capacity is not identifiable from zero or non-finite observations.");
  const initial = input.initial;
  if (!Number.isFinite(initial.capacity) || initial.capacity <= 0 || initial.capacity > 1e12 ||
      !Number.isFinite(initial.rate) || initial.rate * span < .01 || initial.rate * span > 40 ||
      !Number.isFinite(initial.midpoint) || initial.midpoint < min || initial.midpoint > max)
    throw new TypeError(`Initial capacity must be positive and at most 1e12; rate×span must be 0.01–40 and midpoint must be within [${min}, ${max}].`);
  const normalized = rows.map(row => ({ row, z: (row.x - min) / span, target: row.y! / yScale }));
  const state = (capacity: number, scaledRate: number, midpoint: number) => {
    let sse = 0;
    const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (const { z, target } of normalized) {
      const s = sigmoid(scaledRate * (z - midpoint)), fitted = capacity * s;
      const residual = target - fitted, slope = capacity * s * (1 - s);
      const j = [s, slope * (z - midpoint), -slope * scaledRate];
      sse += residual * residual;
      for (let i = 0; i < 3; i++) { g[i] += j[i]! * residual;
        for (let k = 0; k < 3; k++) h[i]![k] += j[i]! * j[k]!; }
    }
    if (![sse, ...g, ...h.flat()].every(Number.isFinite))
      throw new TypeError("Logistic fit exceeds finite floating-point range; rescale the data.");
    return { sse, h, g };
  };
  let capacity = initial.capacity / yScale, scaledRate = initial.rate * span,
    midpoint = (initial.midpoint - min) / span, lambda = .001;
  let current = state(capacity, scaledRate, midpoint), iterations = 0, rejectedSteps = 0;
  let fitted: Graph2DLogisticRegression | null = null, cancelled = false;
  const gradient = () => Math.max(...current.g.map((value, i) => Math.abs(value) / Math.max(1, current.h[i]![i]!)));
  const rankCheck = () => {
    const h = current.h, diagonal = h.map((row, i) => row[i]!);
    const determinant = h[0]![0]! * (h[1]![1]! * h[2]![2]! - h[1]![2]! ** 2) -
      h[0]![1]! * (h[0]![1]! * h[2]![2]! - h[0]![2]! * h[1]![2]!) +
      h[0]![2]! * (h[0]![1]! * h[1]![2]! - h[0]![2]! * h[1]![1]!);
    if (diagonal.some(value => !(value > 1e-14)) ||
        !(determinant / (diagonal[0]! * diagonal[1]! * diagonal[2]!) > 1e-10))
      throw new TypeError("Logistic parameters are not identifiable from this dataset (singular design).");
  };
  const publish = () => {
    rankCheck();
    const parameters = { capacity: capacity * yScale, rate: scaledRate / span, midpoint: min + midpoint * span };
    const residuals = normalized.map(({ row, z }) => { const value = parameters.capacity * sigmoid(scaledRate * (z - midpoint));
      return { rowId: row.id, x: row.x, observed: row.y!, fitted: value, residual: row.y! - value }; });
    const n = rows.length, degreesOfFreedom = n - 3, sse = current.sse * yScale * yScale;
    const mean = rows.reduce((total, row) => total + row.y! / n, 0);
    const sst = rows.reduce((total, row) => total + (row.y! - mean) ** 2, 0);
    const residualSD = Math.sqrt(sse / degreesOfFreedom), rSquared = sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : null;
    const curve = Array.from({ length: 129 }, (_, index) => { const x = index === 128 ? max : min + span * index / 128;
      return { x, y: parameters.capacity * sigmoid(parameters.rate * (x - parameters.midpoint)) }; });
    const source = { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, generation: document.identity.revision };
    const solver = { status: "converged" as const, iterations, rejectedSteps, relativeGradient: gradient(),
      scaledRateBounds: [.01, 40] as [number, number], method: "bounded-levenberg-marquardt" as const };
    const resultId = "graph2d.regression." + structuralHash({ source, objectId, model: "logistic-growth",
      checksum: ref.checksum, initial, algorithm: "bounded-lm-v1" }).slice(7);
    const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
      operation: { type: "graph2d.regression", algorithm: solver.method, algorithmVersion: "1",
        parameters: { objectId, model: "logistic-growth", initial, table: { ...ref }, maxIterations: MAX_ITERATIONS,
          bounds: { capacity: [0, 1e12], scaledRate: [.01, 40], midpoint: [min, max] }, curveSamples: 129 } },
      numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" },
      elapsedMs: Math.max(0, Date.now() - started) },
      summary: { model: "logistic-growth", equation: "y=capacity/(1+exp(-rate*(x-midpoint)))",
        parameters, n, excluded: input.rows!.length - n, degreesOfFreedom, sse, residualSD, rSquared,
        extent: { min, max }, intervalSemantics: "none", solver, datasetChecksum: ref.checksum },
      warnings: ["Bounded local nonlinear least-squares result; convergence does not establish a global minimum or unique parameters.",
        "No parameter uncertainty or confidence/prediction intervals are reported: a residual variance estimate alone does not validate the local Jacobian, error model or identifiability assumptions.",
        "Unweighted fit in original y units; x is treated as fixed. No extrapolation beyond included x extent."],
      diagnostics: [], artifacts: [] });
    fitted = freeze({ resultId, objectId, model: "logistic-growth" as const, source, table: { ...ref },
      coefficients: [parameters.capacity, parameters.rate, parameters.midpoint] as [number, number, number],
      parameters, initial, n, excluded: input.rows!.length - n, degreesOfFreedom, sse, residualSD,
      rSquared, extent: { min, max }, solver, residuals, curve, publication });
  };
  return {
    get progress() { return fitted ? 1 : iterations / MAX_ITERATIONS; },
    get complete() { return fitted !== null; }, get cancelled() { return cancelled; },
    cancel() { cancelled = true; },
    result() { if (!fitted || cancelled) throw new TypeError("Logistic fit has not completed."); return fitted; },
    advance(maxIterations = 1) {
      if (cancelled) throw new TypeError("Logistic fit was cancelled.");
      if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS)
        throw new TypeError("Invalid logistic fit iteration budget.");
      for (let batch = 0; batch < maxIterations && !fitted; batch++) {
        if (iterations >= MAX_ITERATIONS) throw new TypeError("Logistic fit reached 120 iterations without convergence.");
        rankCheck(); iterations++;
        if (gradient() < 1e-10) { publish(); break; }
        const damped = current.h.map((row, i) => row.map((value, j) => i === j ? value * (1 + lambda) : value));
        const [dc, dk, dm] = solve3(damped, current.g);
        const nextCapacity = Math.max(1e-12, Math.min(1e12 / yScale, capacity + dc));
        const nextRate = Math.max(.01, Math.min(40, scaledRate + dk));
        const nextMidpoint = Math.max(0, Math.min(1, midpoint + dm));
        const candidate = state(nextCapacity, nextRate, nextMidpoint);
        if (candidate.sse < current.sse) {
          const improvement = current.sse - candidate.sse;
          capacity = nextCapacity; scaledRate = nextRate; midpoint = nextMidpoint; current = candidate;
          lambda = Math.max(1e-12, lambda / 3);
          if (improvement <= 1e-12 * (1 + current.sse) && gradient() < 1e-7 ||
              Math.abs(dc) <= 1e-10 * (1 + Math.abs(capacity)) &&
              Math.abs(dk) <= 1e-10 * (1 + scaledRate) && Math.abs(dm) <= 1e-10)
            publish();
        } else { rejectedSteps++; lambda *= 10;
          if (lambda > 1e12) throw new TypeError("Logistic fit stalled; try different initial parameters."); }
      }
      return fitted !== null;
    },
  };
}

export const analyzeGraph2DLogisticRegression = (input: Graph2DLogisticRegressionInput): Graph2DLogisticRegression => {
  const job = createGraph2DLogisticRegressionJob(input);
  while (!job.advance(10)) { /* bounded work, no UI thread yield in this synchronous entry point */ }
  return job.result();
};
