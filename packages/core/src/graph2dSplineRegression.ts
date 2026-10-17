import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import { Graph2DPointTableStore, graph2DVerifiedPointTableReference, type Graph2DPointRow } from "./graph2dPointSeries";
import type { ScientificSourceGeneration } from "./scientificJobs";

const CONTROL_POINTS = 12;
const DEGREE = 3;
const CURVE_SAMPLES = 129;
const knots = Object.freeze([
  0, 0, 0, 0,
  ...Array.from({ length: CONTROL_POINTS - DEGREE - 1 }, (_, i) => (i + 1) / (CONTROL_POINTS - DEGREE)),
  1, 1, 1, 1,
]);
const sum = (values: readonly number[]) => {
  let total = 0, correction = 0;
  for (const value of values) {
    const adjusted = value - correction, next = total + adjusted;
    correction = (next - total) - adjusted; total = next;
  }
  return total;
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const basis = (z: number): number[] => {
  if (z === 1) return Array.from({ length: CONTROL_POINTS }, (_, i) => i === CONTROL_POINTS - 1 ? 1 : 0);
  let values: number[] = Array.from({ length: CONTROL_POINTS + DEGREE }, (_, i) => knots[i]! <= z && z < knots[i + 1]! ? 1 : 0);
  for (let degree = 1; degree <= DEGREE; degree++) {
    const next = Array(CONTROL_POINTS + DEGREE - degree).fill(0) as number[];
    for (let i = 0; i < next.length; i++) {
      const left = knots[i + degree]! - knots[i]!, right = knots[i + degree + 1]! - knots[i + 1]!;
      next[i] = (left ? (z - knots[i]!) * values[i]! / left : 0) +
        (right ? (knots[i + degree + 1]! - z) * values[i + 1]! / right : 0);
    }
    values = next;
  }
  return values;
};
/** Small, bounded positive-definite system. Reject unsupported rank instead of silently regularizing it. */
const choleskySolve = (matrix: number[][], rhs: number[]): number[] => {
  const lower = Array.from({ length: CONTROL_POINTS }, () => Array(CONTROL_POINTS).fill(0) as number[]);
  const largestDiagonal = Math.max(...matrix.map((row, i) => row[i]!));
  for (let i = 0; i < CONTROL_POINTS; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i]![j]!;
    for (let k = 0; k < j; k++) value -= lower[i]![k]! * lower[j]![k]!;
    if (i === j) {
      if (!(value > largestDiagonal * 1e-12) || !Number.isFinite(value))
        throw new TypeError("Spline design is singular or ill-conditioned; use more distinct, well-spread x values.");
      lower[i]![j] = Math.sqrt(value);
    } else lower[i]![j] = value / lower[j]![j]!;
  }
  const y = Array(CONTROL_POINTS).fill(0) as number[], x = Array(CONTROL_POINTS).fill(0) as number[];
  for (let i = 0; i < CONTROL_POINTS; i++) {
    let value = rhs[i]!;
    for (let j = 0; j < i; j++) value -= lower[i]![j]! * y[j]!;
    y[i] = value / lower[i]![i]!;
  }
  for (let i = CONTROL_POINTS - 1; i >= 0; i--) {
    let value = y[i]!;
    for (let j = i + 1; j < CONTROL_POINTS; j++) value -= lower[j]![i]! * x[j]!;
    x[i] = value / lower[i]![i]!;
  }
  return x;
};

export type Graph2DSplineRegression = Readonly<{
  resultId: string; objectId: string; model: "spline"; source: ScientificSourceGeneration; table: Graph2DPointTableReference;
  coefficients: readonly number[]; center: number; scale: number; n: number; excluded: number; degreesOfFreedom: number;
  sse: number; residualSD: number; rSquared: number | null; extent: Readonly<{ min: number; max: number }>;
  spline: Readonly<{ degree: 3; controlPoints: number; lambda: number; knots: readonly number[] }>;
  residuals: readonly Readonly<{ rowId: string; x: number; observed: number; fitted: number; residual: number }>[];
  curve: readonly Readonly<{ x: number; y: number }>[]; publication: AnalysisResultEnvelope;
}>;

export type Graph2DSplineRegressionInput = { document: Graph2DDocument; objectId: string;
  rows: readonly Graph2DPointRow[] | null; smoothing: number };
export type Graph2DSplineRegressionJob = Readonly<{
  progress: number; complete: boolean; cancelled: boolean;
  advance: (maxRows?: number) => boolean; cancel: () => void; result: () => Graph2DSplineRegression;
}>;

/** Fixed-size penalized cubic B-spline. Advance in bounded row batches to let mobile input run between them. */
export function createGraph2DSplineRegressionJob(input: Graph2DSplineRegressionInput): Graph2DSplineRegressionJob {
  const started = Date.now(), { document, objectId, smoothing } = input;
  const object = document.source.objects.find(o => o.id === objectId);
  if (object?.kind !== "point-series") throw new TypeError("Select a point series for spline fitting.");
  if (!Number.isFinite(smoothing) || smoothing < 0 || smoothing > 1)
    throw new TypeError("Spline smoothness λ must be between 0 and 1.");
  if (!input.rows) throw new TypeError("Spline fitting needs the original checked point-table sidecar; displayed points are not data.");
  const certified = graph2DVerifiedPointTableReference(input.rows);
  const checked = certified ? null : new Graph2DPointTableStore(), ref = certified ?? checked!.publish(input.rows);
  if (ref.checksum !== object.table.checksum || ref.id !== object.table.id || ref.rowCount !== object.table.rowCount)
    throw new TypeError("Spline sidecar checksum does not match the dataset.");
  const rows = (certified ? input.rows : checked!.resolve(ref)!).filter(row => row.y !== null &&
    row.x >= object.domain.min && row.x <= object.domain.max &&
    (object.domain.includeMin || row.x !== object.domain.min) && (object.domain.includeMax || row.x !== object.domain.max));
  const n = rows.length;
  if (n < 24) throw new TypeError("Spline fitting needs at least 24 non-missing in-domain observations.");
  if (new Set(rows.map(row => row.x)).size < CONTROL_POINTS)
    throw new TypeError("Spline fitting needs at least 12 distinct x values.");
  const min = Math.min(...rows.map(row => row.x)), max = Math.max(...rows.map(row => row.x));
  const range = max - min;
  if (!(range > 0) || !Number.isFinite(range)) throw new TypeError("Spline x range is numerically unsupported.");
  const yCenter = sum(rows.map(row => row.y! / n));
  const matrix = Array.from({ length: CONTROL_POINTS }, () => Array(CONTROL_POINTS).fill(0) as number[]);
  const rhs = Array(CONTROL_POINTS).fill(0) as number[];
  const residuals: { rowId: string; x: number; observed: number; fitted: number; residual: number }[] = [];
  let matrixRows = 0, residualRows = 0, coefficients: number[] | null = null;
  let fitted: Graph2DSplineRegression | null = null, cancelled = false;
  const evaluate = (x: number) => sum(basis((x - min) / range).map((value, i) => value * coefficients![i]!));
  const finish = () => {
    const sse = sum(residuals.map(row => row.residual ** 2));
    const sst = sum(rows.map(row => (row.y! - yCenter) ** 2));
    const residualSD = Math.sqrt(sse / n), rSquared = sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : null;
    const curve = Array.from({ length: CURVE_SAMPLES }, (_, i) => {
      const x = i === CURVE_SAMPLES - 1 ? max : min + range * i / (CURVE_SAMPLES - 1);
      return { x, y: evaluate(x) };
    });
    if (![...coefficients!, yCenter, sse, sst, residualSD, ...curve.flatMap(point => [point.x, point.y])].every(Number.isFinite))
      throw new TypeError("Spline fit exceeds finite floating-point range; rescale the source data explicitly.");
    const source = { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, generation: document.identity.revision };
    const resultId = "graph2d.regression." + structuralHash({ source, objectId, model: "spline", checksum: ref.checksum,
      smoothing, algorithm: "penalized-cubic-bspline-v1" }).slice(7);
    const spline = { degree: DEGREE, controlPoints: CONTROL_POINTS, lambda: smoothing, knots: [...knots] } as const;
    const summary = { model: "spline", spline, n, excluded: input.rows!.length - n, sse, residualSD, rSquared,
      residualSDMeaning: "descriptive root mean squared residual", intervalSemantics: "none", extent: { min, max },
      datasetChecksum: ref.checksum };
    const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
      operation: { type: "graph2d.regression", algorithm: "penalized-cubic-b-spline-cholesky", algorithmVersion: "1",
        parameters: { objectId, model: "spline", table: { ...ref }, smoothing, controlPoints: CONTROL_POINTS, curveSamples: CURVE_SAMPLES } },
      numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" }, elapsedMs: Math.max(0, Date.now() - started) },
      summary, warnings: ["Unweighted penalized cubic B-spline in original world coordinates; x is fixed and measured without error.",
        "Smoothness λ is a dimensionless second-control-difference penalty, scaled by the observation count; 0 is unpenalized.",
        "Residual SD is descriptive RMSE. No confidence or prediction intervals are provided for this regularized model.",
        "Missing y and rows outside the authored domain are excluded; no extrapolation beyond fitted x extent.",
        ...(sst === 0 ? ["Constant response: R² is undefined."] : [])], diagnostics: [], artifacts: [] });
    fitted = freeze({ resultId, objectId, model: "spline" as const, source, table: { ...ref }, coefficients: coefficients!,
      center: min, scale: range, n, excluded: input.rows!.length - n, degreesOfFreedom: n - CONTROL_POINTS,
      sse, residualSD, rSquared, extent: { min, max }, spline, residuals, curve, publication });
  };
  return {
    get progress() { return (matrixRows + residualRows) / (2 * n); },
    get complete() { return fitted !== null; },
    get cancelled() { return cancelled; },
    cancel() { cancelled = true; },
    result() { if (!fitted || cancelled) throw new TypeError("Spline fit has not completed."); return fitted; },
    advance(maxRows = 128) {
      if (cancelled) throw new TypeError("Spline fit was cancelled.");
      if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new TypeError("Invalid spline batch size.");
      if (fitted) return true;
      if (matrixRows < n) {
        const end = Math.min(n, matrixRows + maxRows);
        for (; matrixRows < end; matrixRows++) {
          const row = rows[matrixRows]!, vector = basis((row.x - min) / range);
          for (let i = 0; i < CONTROL_POINTS; i++) {
            rhs[i]! += vector[i]! * (row.y! - yCenter);
            for (let j = 0; j <= i; j++) matrix[i]![j]! += vector[i]! * vector[j]!;
          }
        }
        if (matrixRows === n) {
          for (let i = 0; i < CONTROL_POINTS; i++) for (let j = 0; j < i; j++) matrix[j]![i] = matrix[i]![j]!;
          for (let k = 0; k < CONTROL_POINTS - 2; k++) {
            const indices = [k, k + 1, k + 2], weights = [1, -2, 1];
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
              matrix[indices[i]!]![indices[j]!]! += smoothing * n * weights[i]! * weights[j]!;
          }
          coefficients = choleskySolve(matrix, rhs).map(value => value + yCenter);
        }
        return false;
      }
      const end = Math.min(n, residualRows + maxRows);
      for (; residualRows < end; residualRows++) {
        const row = rows[residualRows]!, fittedY = evaluate(row.x);
        residuals.push({ rowId: row.id, x: row.x, observed: row.y!, fitted: fittedY, residual: row.y! - fittedY });
      }
      if (residualRows === n) finish();
      return fitted !== null;
    },
  };
}

/** Synchronous shared-core entry point for desktop workers and direct callers. */
export function analyzeGraph2DSplineRegression(input: Graph2DSplineRegressionInput): Graph2DSplineRegression {
  const job = createGraph2DSplineRegressionJob(input);
  while (!job.advance(10000)) { /* same bounded stages, without yielding */ }
  return job.result();
}
