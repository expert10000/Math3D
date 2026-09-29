import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DPointTableReference } from "./graph2dDocument";
import { Graph2DPointTableStore, type Graph2DPointRow } from "./graph2dPointSeries";
import type { ScientificSourceGeneration } from "./scientificJobs";
import type { Graph2DPublicationTable } from "./graph2dPublication";
export type Graph2DRegressionModel = "linear" | "quadratic";
export const GRAPH2D_REGRESSION_ASSUMPTIONS = Object.freeze([
  "Unweighted ordinary least squares in original world coordinates; x is treated as fixed and measured without error.",
  "Intervals assume independent, normally distributed, constant-variance errors and a correctly specified model; these assumptions are not tested automatically.",
  "95% intervals are pointwise, not a simultaneous confidence band. Mean response uncertainty differs from a new observation prediction interval.",
  "Missing y and rows outside the authored domain are excluded, not imputed. No extrapolation beyond the fitted x extent.",
]);
export type Graph2DRegressionPoint = Readonly<{ x: number; y: number; meanLow: number; meanHigh: number; predictionLow: number; predictionHigh: number }>;
export type Graph2DRegression = Readonly<{ resultId: string; objectId: string; model: Graph2DRegressionModel;
  source: ScientificSourceGeneration; table: Graph2DPointTableReference; coefficients: readonly number[]; center: number; scale: number;
  n: number; excluded: number; degreesOfFreedom: number; sse: number; residualSD: number; rSquared: number | null; tCritical: number;
  extent: Readonly<{ min: number; max: number }>;
  residuals: readonly Readonly<{ rowId: string; x: number; observed: number; fitted: number; residual: number }>[];
  curve: readonly Graph2DRegressionPoint[]; publication: AnalysisResultEnvelope }>;
const sum = (values: readonly number[]): number => {
  let total = 0, correction = 0;
  for (const value of values) { const adjusted = value - correction, next = total + adjusted; correction = (next - total) - adjusted; total = next; }
  return total;
};
// Half/integer log-Gamma recurrence is sufficient for integer residual degrees of freedom.
const logGammaHalf = (x: number) => { let answer = x % 1 === 0 ? 0 : .5 * Math.log(Math.PI), at = x % 1 === 0 ? 1 : .5;
  for (; at < x; at++) answer += Math.log(at); return answer; };
const betaFraction = (a: number, b: number, x: number) => {
  const tiny = 1e-300, guard = (v: number) => Math.abs(v) < tiny ? tiny : v;
  let c = 1, d = 1 / guard(1 - (a + b) * x / (a + 1)), h = d;
  for (let m = 1; m <= 256; m++) {
    const term = (value: number) => { d = 1 / guard(1 + value * d); c = guard(1 + value / c); const change = d * c; h *= change; return change; };
    term(m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)));
    const change = term(-(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1)));
    if (Math.abs(change - 1) < 2e-14) return h;
  }
  throw new TypeError("Student-t interval calculation did not converge.");
};
/** Inverse Student-t CDF at .975, evaluated with bounded incomplete-beta continued fractions. */
export const graph2DStudentTCritical95 = (degreesOfFreedom: number): number => {
  if (!Number.isSafeInteger(degreesOfFreedom) || degreesOfFreedom < 1 || degreesOfFreedom > 10000) throw new TypeError("Invalid residual degrees of freedom.");
  const a = degreesOfFreedom / 2, b = .5, normalization = logGammaHalf(a + b) - logGammaHalf(a) - logGammaHalf(b);
  const beta = (x: number) => {
    const weight = Math.exp(normalization + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2) ? weight * betaFraction(a, b, x) / a : 1 - weight * betaFraction(b, a, 1 - x) / b;
  };
  const cdf = (t: number) => 1 - .5 * beta(degreesOfFreedom / (degreesOfFreedom + t * t));
  let lo = 0, hi = 2; while (cdf(hi) < .975 && hi < 1024) hi *= 2;
  for (let i = 0; i < 64; i++) { const mid = (lo + hi) / 2; if (cdf(mid) < .975) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
/** Bounded reviewed models only; checksum-verified data, centered/scaled reorthogonalized QR, no normal equations. */
export function analyzeGraph2DRegression(input: { document: Graph2DDocument; objectId: string; rows: readonly Graph2DPointRow[] | null; model: Graph2DRegressionModel }): Graph2DRegression {
  const started = Date.now(), { document, objectId, model } = input;
  const object = document.source.objects.find(o => o.id === objectId);
  if (object?.kind !== "point-series" || !["linear", "quadratic"].includes(model)) throw new TypeError("Select a point series and a reviewed linear/quadratic model.");
  if (!input.rows) throw new TypeError("Regression needs the original checked point-table sidecar; sampled/displayed points are not data.");
  const checked = new Graph2DPointTableStore(), ref = checked.publish(input.rows);
  if (ref.checksum !== object.table.checksum || ref.id !== object.table.id || ref.rowCount !== object.table.rowCount) throw new TypeError("Regression sidecar checksum does not match the dataset.");
  const rows = checked.resolve(ref)!.filter(row => row.y !== null && row.x >= object.domain.min && row.x <= object.domain.max &&
    (object.domain.includeMin || row.x !== object.domain.min) && (object.domain.includeMax || row.x !== object.domain.max));
  const count = model === "linear" ? 2 : 3, n = rows.length, degreesOfFreedom = n - count;
  if (degreesOfFreedom < 1) throw new TypeError(`Need at least ${count + 1} non-missing in-domain observations for this model and its uncertainty.`);
  const min = Math.min(...rows.map(row => row.x)), max = Math.max(...rows.map(row => row.x));
  const center = min + (max - min) / 2, scale = (max - min) / 2;
  if (!(scale > 0) || !Number.isFinite(center) || !Number.isFinite(scale)) throw new TypeError("Singular or numerically unsupported x range.");
  const basis = (x: number) => { const z = (x - center) / scale; return count === 2 ? [1, z] : [1, z, z * z]; };
  const columns = Array.from({ length: count }, (_, j) => rows.map(row => basis(row.x)[j]));
  const q: number[][] = [], r: number[][] = Array.from({ length: count }, () => Array(count).fill(0));
  for (let j = 0; j < count; j++) {
    const v = [...columns[j]];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < j; i++) {
      const projection = sum(v.map((value, k) => value * q[i][k])); r[i][j] += projection;
      for (let k = 0; k < n; k++) v[k] -= projection * q[i][k];
    }
    r[j][j] = Math.sqrt(sum(v.map(v => v * v)));
    if (r[j][j] < 1e-10 * Math.sqrt(n)) throw new TypeError("Singular or ill-conditioned design: need distinct, sufficiently separated x values.");
    q.push(v.map(v => v / r[j][j]));
  }
  const yCenter = sum(rows.map(row => row.y! / n));
  const rhs = q.map(column => sum(column.map((value, i) => value * (rows[i].y! - yCenter))));
  const solve = (b: number[]) => { const answer = Array(count).fill(0); for (let i = count - 1; i >= 0; i--) answer[i] = (b[i] - sum(answer.map((value, j) => j > i ? r[i][j] * value : 0))) / r[i][i]; return answer; };
  const coefficients = solve(rhs); coefficients[0] += yCenter;
  const evaluate = (x: number) => sum(basis(x).map((v, i) => v * coefficients[i]));
  const residuals = rows.map(row => { const fitted = evaluate(row.x); return { rowId: row.id, x: row.x, observed: row.y!, fitted, residual: row.y! - fitted }; });
  const sse = sum(residuals.map(row => row.residual ** 2)), sst = sum(rows.map(row => (row.y! - yCenter) ** 2)), variance = sse / degreesOfFreedom;
  if (![...coefficients, yCenter, sse, sst, variance].every(Number.isFinite)) throw new TypeError("Regression exceeds finite floating-point range; rescale the source data explicitly.");
  const residualSD = Math.sqrt(variance), rSquared = sst > 0 ? Math.max(0, Math.min(1, 1 - sse / sst)) : null, tCritical = graph2DStudentTCritical95(degreesOfFreedom);
  const inverseColumns = Array.from({ length: count }, (_, j) => solve(Array.from({ length: count }, (_, i) => i === j ? 1 : 0)));
  const curve = Array.from({ length: 129 }, (_, i) => {
    const x = i === 128 ? max : min + (max - min) * i / 128, vector = basis(x), y = evaluate(x);
    const leverage = sum(inverseColumns.map(column => sum(column.map((v, j) => v * vector[j])) ** 2));
    const mean = tCritical * residualSD * Math.sqrt(leverage), prediction = tCritical * residualSD * Math.sqrt(1 + leverage);
    if (![x, y, y - mean, y + mean, y - prediction, y + prediction].every(Number.isFinite)) throw new TypeError("Uncertainty exceeds finite range.");
    return { x, y, meanLow: y - mean, meanHigh: y + mean, predictionLow: y - prediction, predictionHigh: y + prediction };
  });
  const source = { documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision };
  const resultId = "graph2d.regression." + structuralHash({ source, objectId, model, checksum: ref.checksum, algorithm: "centered-scaled-qr-v1", confidence: .95 }).slice(7);
  const summary = { model, coefficients, basis: "z=(x-center)/scale; y=c0+c1*z+c2*z^2 (c2 only for quadratic)", center, scale, n, excluded: input.rows.length - n,
    degreesOfFreedom, sse, residualSD, rSquared, tCritical, confidence: .95, intervalSemantics: "pointwise-mean-response-and-new-observation", extent: { min, max }, datasetChecksum: ref.checksum };
  const publication = createAnalysisResultEnvelope({ resultId, status: "numerical", provenance: { source,
    operation: { type: "graph2d.regression", algorithm: "centered-scaled-reorthogonalized-qr", algorithmVersion: "1",
      parameters: { objectId, model, table: { ...ref }, confidence: .95, maxRows: 10000, curveSamples: 129 } },
    numericContext: { precision: { binaryBits: 53 } }, engine: { name: "math3d-core", version: "1" }, elapsedMs: Math.max(0, Date.now() - started) },
    summary, warnings: [...GRAPH2D_REGRESSION_ASSUMPTIONS, ...(sst === 0 ? ["Constant response: R² is undefined."] : [])], diagnostics: [], artifacts: [] });
  return freeze({ resultId, objectId, model, source, table: { ...ref }, coefficients, center, scale, n, excluded: input.rows.length - n,
    degreesOfFreedom, sse, residualSD, rSquared, tCritical, extent: { min, max }, residuals, curve, publication });
}
export const isGraph2DRegressionCurrent = (result: Graph2DRegression, document: Graph2DDocument) =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision && result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some(o => o.id === result.objectId && o.kind === "point-series" && o.table.checksum === result.table.checksum);
/** Explicit bounded residual table, retaining the existing scientific envelope and original row IDs. */
export const graph2DRegressionResidualTable = (result: Graph2DRegression): Graph2DPublicationTable => ({ publication: result.publication,
  columns: ["Row", "x", "Observed y", "Fitted y", "Residual"], rows: result.residuals.slice(0, 2048).map(r => [r.rowId, r.x, r.observed, r.fitted, r.residual]) });
export const graph2DRegressionCurveTable = (result: Graph2DRegression): Graph2DPublicationTable => ({ publication: result.publication,
  columns: ["x", "Fitted y", "95% mean low", "95% mean high", "95% prediction low", "95% prediction high"],
  rows: result.curve.map(p => [p.x, p.y, p.meanLow, p.meanHigh, p.predictionLow, p.predictionHigh]) });
export const graph2DRegressionOverlaySeries = (result: Graph2DRegression) => (["y", "meanLow", "meanHigh", "predictionLow", "predictionHigh"] as const).map(key => ({
  objectId: `${result.objectId}-regression-${key}`, style: { objectId: `${result.objectId}-regression-${key}`, visible: true,
    color: key === "y" ? "#b45309" : "#7c3aed", lineWidth: key === "y" ? 2 : 1, lineStyle: key === "y" ? "solid" as const : key.startsWith("mean") ? "dashed" as const : "dotted" as const },
  artifact: { samplerVersion: 1 as const, converged: true, samplesEvaluated: 0, diagnostics: [], segments: [{ openStart: false, openEnd: false,
    points: result.curve.map(point => ({ x: point.x, y: point[key] })) }] } }));
