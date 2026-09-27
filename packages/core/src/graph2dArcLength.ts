import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { analyzeGraph2DDerivative, differentiateGraph2DExpression } from "./graph2dDerivatives";
import type { Graph2DDocument } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_ARC_LENGTH_ALGORITHM_VERSION = "1" as const;
export const GRAPH2D_ARC_LENGTH_GRID_CELLS = 256;
export const GRAPH2D_ARC_LENGTH_MAX_EVALUATIONS = 12000;
export type Graph2DArcLengthAnalysis = Readonly<{
  objectId: string;
  resultId: string;
  source: ScientificSourceGeneration;
  interval: Readonly<{ min: number; max: number }>;
  status: "complete" | "unavailable";
  value: number | null;
  partialValue: number;
  errorEstimate: number | null;
  tolerance: number;
  evaluations: number;
  unresolvedCells: number;
  method: "adaptive-simpson-symbolic-slope" | "adaptive-simpson-finite-difference-slope";
  publication: AnalysisResultEnvelope;
}>;

/** Integrates sqrt(1 + f'(x)^2), refusing a full value across unresolved cells. */
export const analyzeGraph2DArcLength = (input: Readonly<{
  document: Graph2DDocument;
  objectId: string;
  interval: Readonly<{ min: number; max: number }>;
  tolerance?: number;
}>): Graph2DArcLengthAnalysis => {
  const object = input.document.source.objects.find((entry) => entry.id === input.objectId);
  if (!object || object.kind !== "explicit-cartesian" || !Number.isFinite(input.interval.min) || !Number.isFinite(input.interval.max) ||
    input.interval.min >= input.interval.max) throw new TypeError("Invalid Graph2D arc-length request.");
  const tolerance = input.tolerance ?? 1e-6;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.1)
    throw new TypeError("Invalid Graph2D arc-length tolerance.");
  const started = Date.now();
  const source: ScientificSourceGeneration = { documentId: input.document.identity.id,
    revision: input.document.identity.revision, structuralHash: input.document.identity.structuralHash,
    generation: input.document.identity.revision };
  const resultId = "graph2d.arc-length." + structuralHash({ source, objectId: object.id, interval: input.interval,
    tolerance, algorithmVersion: GRAPH2D_ARC_LENGTH_ALGORITHM_VERSION }).slice(7);
  const symbolic = differentiateGraph2DExpression(object.expression.ast, 1);
  const method = symbolic.ok ? "adaptive-simpson-symbolic-slope" : "adaptive-simpson-finite-difference-slope";
  const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
  let evaluations = 0;
  const cache = new Map<number, number | null>();
  const integrand = (x: number): number | null => {
    if (cache.has(x)) return cache.get(x)!;
    if (x < object.domain.min || x > object.domain.max ||
      x === object.domain.min && !object.domain.includeMin ||
      x === object.domain.max && !object.domain.includeMax ||
      evaluations >= GRAPH2D_ARC_LENGTH_MAX_EVALUATIONS) return null;
    evaluations += 1;
    const y = evaluateGraph2DExpression(object.expression.ast, { ...variables, x });
    if (!y.ok) { cache.set(x, null); return null; }
    const slope = symbolic.ok ? evaluateGraph2DExpression(symbolic.ast, { ...variables, x }) : null;
    const value = slope?.ok ? slope.value : analyzeGraph2DDerivative({ document: input.document,
      objectId: object.id, x, order: 1 }).value;
    const result = value === null || !Number.isFinite(value) ? null : Math.hypot(1, value);
    cache.set(x, result);
    return result;
  };
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) =>
    (b - a) * (fa + 4 * fm + fb) / 6;
  const refine = (a: number, b: number, fa: number, fm: number, fb: number,
    coarse: number, allowedError: number, depth: number): { value: number; error: number } | null => {
    const mid = (a + b) / 2;
    const leftMid = integrand((a + mid) / 2), rightMid = integrand((mid + b) / 2);
    if (leftMid === null || rightMid === null) return null;
    const left = simpson(a, mid, fa, leftMid, fm);
    const right = simpson(mid, b, fm, rightMid, fb);
    const delta = left + right - coarse;
    if (Math.abs(delta) <= 15 * allowedError) return { value: left + right + delta / 15, error: Math.abs(delta) / 15 };
    if (!depth) return null;
    const first = refine(a, mid, fa, leftMid, fm, left, allowedError / 2, depth - 1);
    if (!first) return null;
    const second = refine(mid, b, fm, rightMid, fb, right, allowedError / 2, depth - 1);
    return second ? { value: first.value + second.value, error: first.error + second.error } : null;
  };
  const cellWidth = (input.interval.max - input.interval.min) / GRAPH2D_ARC_LENGTH_GRID_CELLS;
  let partialValue = 0, error = 0, unresolvedCells = 0;
  for (let index = 0; index < GRAPH2D_ARC_LENGTH_GRID_CELLS; index += 1) {
    const a = input.interval.min + index * cellWidth;
    const b = index === GRAPH2D_ARC_LENGTH_GRID_CELLS - 1 ? input.interval.max : a + cellWidth;
    const fa = integrand(a), fm = integrand((a + b) / 2), fb = integrand(b);
    if (fa === null || fm === null || fb === null) { unresolvedCells += 1; continue; }
    const part = refine(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb),
      tolerance / GRAPH2D_ARC_LENGTH_GRID_CELLS, 10);
    if (!part || !Number.isFinite(part.value)) { unresolvedCells += 1; continue; }
    partialValue += part.value;
    error += part.error;
  }
  const status = unresolvedCells ? "unavailable" : "complete";
  const value = status === "complete" ? partialValue : null;
  const publication = createAnalysisResultEnvelope({ resultId, status: status === "complete" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: "graph2d.arc-length", algorithm: method,
      algorithmVersion: GRAPH2D_ARC_LENGTH_ALGORITHM_VERSION,
      parameters: { objectId: object.id, interval: input.interval,
        gridCells: GRAPH2D_ARC_LENGTH_GRID_CELLS, maxEvaluations: GRAPH2D_ARC_LENGTH_MAX_EVALUATIONS } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_ARC_LENGTH_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { interval: input.interval, status, value, partialValue,
      errorEstimate: status === "complete" ? error : null, unresolvedCells, evaluations, method },
    warnings: ["Refinement error is estimated, not certified; unresolved discontinuities may be missed.",
      ...(unresolvedCells ? ["The full interval length is unavailable because some cells did not resolve."] : [])],
    diagnostics: unresolvedCells ? [{ code: "unresolved-cells", severity: "warning",
      message: `${unresolvedCells} cells crossed an invalid source or failed numerical convergence.` }] : [], artifacts: [] });
  return { objectId: object.id, resultId, source, interval: input.interval, status, value, partialValue,
    errorEstimate: status === "complete" ? error : null, tolerance, evaluations, unresolvedCells, method, publication };
};

export const isGraph2DArcLengthCurrent = (result: Graph2DArcLengthAnalysis, document: Graph2DDocument): boolean =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry) => entry.id === result.objectId);
