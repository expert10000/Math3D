import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import { Graph2DPointTableStore, graph2DVerifiedPointTableReference, type Graph2DPointRow } from "./graph2dPointSeries";
import type { ScientificSourceGeneration } from "./scientificJobs";

export type Graph2DExponentialInitial = Readonly<{ amplitude: number; rate: number }>;
export type Graph2DExponentialRegression = Readonly<{
  resultId: string; objectId: string; model: "exponential-decay"; source: ScientificSourceGeneration;
  table: Graph2DPointTableReference; coefficients: readonly [number, number];
  parameters: Readonly<{ amplitude: number; rate: number; anchor: number }>;
  initial: Graph2DExponentialInitial; n: number; excluded: number; degreesOfFreedom: number;
  sse: number; residualSD: number; rSquared: number | null; extent: Readonly<{ min: number; max: number }>;
  solver: Readonly<{ status: "converged"; iterations: number; rejectedSteps: number;
    relativeGradient: number; rateBound: number; method: "bounded-levenberg-marquardt" }>;
  residuals: readonly Readonly<{ rowId: string; x: number; observed: number; fitted: number; residual: number }>[];
  curve: readonly Readonly<{ x: number; y: number }>[]; publication: AnalysisResultEnvelope;
}>;
export type Graph2DExponentialRegressionInput = Readonly<{ document: Graph2DDocument; objectId: string;
  rows: readonly Graph2DPointRow[] | null; initial: Graph2DExponentialInitial }>;
export type Graph2DExponentialRegressionJob = Readonly<{
  progress: number; complete: boolean; cancelled: boolean;
  advance: (maxIterations?: number) => boolean; cancel: () => void; result: () => Graph2DExponentialRegression;
}>;

const MAX_ITERATIONS = 80;
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/** Fits y = amplitude·exp(−rate·(x−anchor)); anchor is the smallest included x. */
export function createGraph2DExponentialRegressionJob(input: Graph2DExponentialRegressionInput): Graph2DExponentialRegressionJob {
  const started = Date.now(), { document, objectId } = input;
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "point-series") throw new TypeError("Choose a point series for exponential decay fitting.");
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
  if (rows.length < 3) throw new TypeError("Exponential decay needs at least three non-missing in-domain observations.");
  const min = Math.min(...rows.map(row => row.x)), max = Math.max(...rows.map(row => row.x));
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) throw new TypeError("Singular x range: use distinct finite coordinates.");
  const initial = input.initial;
  if (!Number.isFinite(initial.amplitude) || !Number.isFinite(initial.rate) || initial.rate < 0 ||
      initial.rate * span > 40 || Math.abs(initial.amplitude) > 1e12)
    throw new TypeError(`Initial amplitude must be finite and at most 1e12 in magnitude; rate must be 0–${(40 / span).toPrecision(5)} per x unit.`);
  const normalized = rows.map(row => ({ row, z: (row.x - min) / span }));
  const state = (amplitude: number, scaledRate: number) => {
    let sse = 0, hAA = 0, hAK = 0, hKK = 0, gA = 0, gK = 0;
    for (const { row, z } of normalized) {
      const e = Math.exp(-scaledRate * z), fitted = amplitude * e, residual = row.y! - fitted;
      const ja = e, jk = -amplitude * z * e;
      sse += residual * residual; hAA += ja * ja; hAK += ja * jk; hKK += jk * jk;
      gA += ja * residual; gK += jk * residual;
    }
    if (![sse, hAA, hAK, hKK, gA, gK].every(Number.isFinite))
      throw new TypeError("Exponential fit exceeds finite floating-point range; rescale the data.");
    return { sse, hAA, hAK, hKK, gA, gK };
  };
  let amplitude = initial.amplitude, scaledRate = initial.rate * span, lambda = .001;
  let current = state(amplitude, scaledRate), iterations = 0, rejectedSteps = 0;
  let fitted: Graph2DExponentialRegression | null = null, cancelled = false;
  const rankCheck = () => {
    const scale = Math.sqrt(current.hAA * current.hKK);
    if (!(scale > 1e-12) || 1 - (current.hAK / scale) ** 2 < 1e-9)
      throw new TypeError("Exponential parameters are not identifiable from this dataset (singular design).");
  };
  const publish = () => {
    rankCheck();
    const rate = scaledRate / span;
    const residuals = normalized.map(({ row, z }) => { const value = amplitude * Math.exp(-scaledRate * z);
      return { rowId: row.id, x: row.x, observed: row.y!, fitted: value, residual: row.y! - value }; });
    const n = rows.length, degreesOfFreedom = n - 2;
    const yMean = rows.reduce((total, row) => total + row.y! / n, 0);
    const sst = rows.reduce((total, row) => total + (row.y! - yMean) ** 2, 0);
    const residualSD = Math.sqrt(current.sse / degreesOfFreedom);
    const rSquared = sst > 0 ? Math.max(0, Math.min(1, 1 - current.sse / sst)) : null;
    const curve = Array.from({ length: 129 }, (_, index) => { const x = index === 128 ? max : min + span * index / 128;
      return { x, y: amplitude * Math.exp(-rate * (x - min)) }; });
    const source = { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, generation: document.identity.revision };
    const solver = { status: "converged" as const, iterations, rejectedSteps,
      relativeGradient: Math.max(Math.abs(current.gA) / Math.max(1, current.hAA),
        Math.abs(current.gK) / Math.max(1, current.hKK)), rateBound: 40 / span,
      method: "bounded-levenberg-marquardt" as const };
    const resultId = "graph2d.regression." + structuralHash({ source, objectId, model: "exponential-decay",
      checksum: ref.checksum, initial, algorithm: "bounded-lm-v1" }).slice(7);
    const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
      operation: { type: "graph2d.regression", algorithm: solver.method, algorithmVersion: "1",
        parameters: { objectId, model: "exponential-decay", initial, table: { ...ref }, maxIterations: MAX_ITERATIONS,
          maxScaledRate: 40, curveSamples: 129 } },
      numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" },
      elapsedMs: Math.max(0, Date.now() - started) },
      summary: { model: "exponential-decay", equation: "y=amplitude*exp(-rate*(x-anchor))",
        parameters: { amplitude, rate, anchor: min }, n, excluded: input.rows!.length - n,
        degreesOfFreedom, sse: current.sse, residualSD, rSquared, extent: { min, max },
        intervalSemantics: "none", solver, datasetChecksum: ref.checksum },
      warnings: ["Bounded local nonlinear least-squares result; convergence does not establish a global minimum or unique parameters.",
        "No parameter uncertainty or confidence/prediction intervals are reported; rank and residual assumptions need separate validation.",
        "Unweighted fit in original y units; x is treated as fixed. No extrapolation beyond included x extent."],
      diagnostics: [], artifacts: [] });
    fitted = freeze({ resultId, objectId, model: "exponential-decay" as const, source, table: { ...ref },
      coefficients: [amplitude, rate] as [number, number], parameters: { amplitude, rate, anchor: min }, initial,
      n, excluded: input.rows!.length - n, degreesOfFreedom, sse: current.sse, residualSD, rSquared,
      extent: { min, max }, solver, residuals, curve, publication });
  };
  return {
    get progress() { return fitted ? 1 : iterations / MAX_ITERATIONS; },
    get complete() { return fitted !== null; },
    get cancelled() { return cancelled; },
    cancel() { cancelled = true; },
    result() { if (!fitted || cancelled) throw new TypeError("Exponential fit has not completed."); return fitted; },
    advance(maxIterations = 1) {
      if (cancelled) throw new TypeError("Exponential fit was cancelled.");
      if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_ITERATIONS)
        throw new TypeError("Invalid exponential fit iteration budget.");
      for (let batch = 0; batch < maxIterations && !fitted; batch++) {
        if (iterations >= MAX_ITERATIONS) throw new TypeError("Exponential fit reached 80 iterations without convergence.");
        rankCheck(); iterations++;
        const gradient = Math.max(Math.abs(current.gA) / Math.max(1, current.hAA),
          Math.abs(current.gK) / Math.max(1, current.hKK));
        if (gradient < 1e-10) { publish(); break; }
        const aa = current.hAA * (1 + lambda), kk = current.hKK * (1 + lambda);
        const determinant = aa * kk - current.hAK ** 2;
        if (!(determinant > 0)) throw new TypeError("Exponential fit has a singular normal matrix.");
        const da = (current.gA * kk - current.gK * current.hAK) / determinant;
        const dk = (aa * current.gK - current.hAK * current.gA) / determinant;
        const nextAmplitude = amplitude + da, nextRate = Math.max(0, Math.min(40, scaledRate + dk));
        if (!Number.isFinite(nextAmplitude) || Math.abs(nextAmplitude) > 1e12)
          throw new TypeError("Exponential fit left its bounded amplitude range.");
        const candidate = state(nextAmplitude, nextRate);
        if (candidate.sse < current.sse) {
          const improvement = current.sse - candidate.sse;
          amplitude = nextAmplitude; scaledRate = nextRate; current = candidate; lambda = Math.max(1e-12, lambda / 3);
          const nextGradient = Math.max(Math.abs(current.gA) / Math.max(1, current.hAA),
            Math.abs(current.gK) / Math.max(1, current.hKK));
          if (improvement <= 1e-12 * (1 + current.sse) && nextGradient < 1e-7 ||
              Math.abs(da) <= 1e-10 * (1 + Math.abs(amplitude)) && Math.abs(dk) <= 1e-10 * (1 + scaledRate))
            publish();
        } else { rejectedSteps++; lambda *= 10;
          if (lambda > 1e12) throw new TypeError("Exponential fit stalled; try a different initial amplitude and rate."); }
      }
      return fitted !== null;
    },
  };
}

export const analyzeGraph2DExponentialRegression = (input: Graph2DExponentialRegressionInput): Graph2DExponentialRegression => {
  const job = createGraph2DExponentialRegressionJob(input);
  while (!job.advance(10)) { /* bounded work, no UI thread yield in this synchronous entry point */ }
  return job.result();
};
