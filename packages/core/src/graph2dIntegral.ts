import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_INTEGRAL_ALGORITHM_VERSION = "1" as const;
export const GRAPH2D_INTEGRAL_GRID_CELLS = 256;
export const GRAPH2D_INTEGRAL_MAX_EVALUATIONS = 12000;
export type Graph2DIntegralMode = "signed" | "absolute";
export type Graph2DAreaFillSegment = Readonly<{
  artifactId: string;
  resultId: string;
  points: readonly Readonly<{ x: number; y: number }>[];
}>;
export type Graph2DIntegralAnalysis = Readonly<{
  objectId: string;
  resultId: string;
  source: ScientificSourceGeneration;
  interval: Readonly<{ min: number; max: number }>;
  mode: Graph2DIntegralMode;
  status: "complete" | "incomplete";
  value: number | null;
  partialValue: number;
  errorEstimate: number | null;
  tolerance: number;
  evaluations: number;
  skippedCells: number;
  fillSegments: readonly Graph2DAreaFillSegment[];
  publication: AnalysisResultEnvelope;
}>;

/** Adaptive Simpson integration over bounded cells, with explicit gaps and fill geometry. */
export const analyzeGraph2DIntegral = (input: Readonly<{
  document: Graph2DDocument;
  objectId: string;
  interval: Readonly<{ min: number; max: number }>;
  mode: Graph2DIntegralMode;
  tolerance?: number;
}>): Graph2DIntegralAnalysis => {
  const object = input.document.source.objects.find((entry) => entry.id === input.objectId);
  if (!object || !Number.isFinite(input.interval.min) || !Number.isFinite(input.interval.max) ||
    input.interval.min >= input.interval.max || !["signed", "absolute"].includes(input.mode))
    throw new TypeError("Invalid Graph2D integral request.");
  const tolerance = input.tolerance ?? 1e-6;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.1)
    throw new TypeError("Invalid Graph2D integral tolerance.");
  const started = Date.now();
  const source: ScientificSourceGeneration = { documentId: input.document.identity.id,
    revision: input.document.identity.revision, structuralHash: input.document.identity.structuralHash,
    generation: input.document.identity.revision };
  const resultId = "graph2d.integral." + structuralHash({ source, objectId: object.id, interval: input.interval,
    mode: input.mode, tolerance, algorithmVersion: GRAPH2D_INTEGRAL_ALGORITHM_VERSION }).slice(7);
  const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
  let evaluations = 0;
  const raw = (x: number): number | null => {
    if (x < object.domain.min || x > object.domain.max ||
      x === object.domain.min && !object.domain.includeMin ||
      x === object.domain.max && !object.domain.includeMax ||
      evaluations >= GRAPH2D_INTEGRAL_MAX_EVALUATIONS) return null;
    evaluations += 1;
    const result = evaluateGraph2DExpression(object.expression.ast, { ...variables, x });
    return result.ok ? result.value : null;
  };
  const integrand = (value: number) => input.mode === "absolute" ? Math.abs(value) : value;
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) =>
    (b - a) * (fa + 4 * fm + fb) / 6;
  const integrate = (a: number, b: number, fa: number, fm: number, fb: number,
    coarse: number, allowedError: number, depth: number): { value: number; error: number } | null => {
    const midpoint = (a + b) / 2;
    const leftMid = raw((a + midpoint) / 2), rightMid = raw((midpoint + b) / 2);
    if (leftMid === null || rightMid === null) return null;
    const left = simpson(a, midpoint, fa, integrand(leftMid), fm);
    const right = simpson(midpoint, b, fm, integrand(rightMid), fb);
    const delta = left + right - coarse;
    if (Math.abs(delta) <= 15 * allowedError) return { value: left + right + delta / 15, error: Math.abs(delta) / 15 };
    if (depth === 0) return null;
    const first = integrate(a, midpoint, fa, integrand(leftMid), fm, left, allowedError / 2, depth - 1);
    if (!first) return null;
    const second = integrate(midpoint, b, fm, integrand(rightMid), fb, right, allowedError / 2, depth - 1);
    return second ? { value: first.value + second.value, error: first.error + second.error } : null;
  };
  const width = (input.interval.max - input.interval.min) / GRAPH2D_INTEGRAL_GRID_CELLS;
  const allowedError = tolerance / GRAPH2D_INTEGRAL_GRID_CELLS;
  const fillSegments: Graph2DAreaFillSegment[] = [];
  let partialValue = 0, errorEstimate = 0, skippedCells = 0;
  for (let index = 0; index < GRAPH2D_INTEGRAL_GRID_CELLS; index += 1) {
    const a = input.interval.min + index * width;
    const b = index === GRAPH2D_INTEGRAL_GRID_CELLS - 1 ? input.interval.max : input.interval.min + (index + 1) * width;
    const midpoint = (a + b) / 2;
    const fa = raw(a), fm = raw(midpoint), fb = raw(b);
    if (fa === null || fm === null || fb === null) { skippedCells += 1; continue; }
    const result = integrate(a, b, integrand(fa), integrand(fm), integrand(fb),
      simpson(a, b, integrand(fa), integrand(fm), integrand(fb)), allowedError, 10);
    if (!result || !Number.isFinite(result.value)) { skippedCells += 1; continue; }
    partialValue += result.value;
    errorEstimate += result.error;
    fillSegments.push({ artifactId: `${resultId}.${index}`, resultId,
      points: [{ x: a, y: 0 }, { x: a, y: fa }, { x: midpoint, y: fm }, { x: b, y: fb }, { x: b, y: 0 }] });
  }
  const status = skippedCells ? "incomplete" : "complete";
  const value = status === "complete" ? partialValue : null;
  const publication = createAnalysisResultEnvelope({ resultId, status: status === "complete" ? "numerical" : "heuristic",
    provenance: { source, operation: { type: "graph2d.integral", algorithm: "cellwise-adaptive-simpson",
      algorithmVersion: GRAPH2D_INTEGRAL_ALGORITHM_VERSION,
      parameters: { objectId: object.id, interval: input.interval, mode: input.mode,
        gridCells: GRAPH2D_INTEGRAL_GRID_CELLS, maxEvaluations: GRAPH2D_INTEGRAL_MAX_EVALUATIONS } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_INTEGRAL_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { interval: input.interval, mode: input.mode, status, value, partialValue,
      errorEstimate: status === "complete" ? errorEstimate : null, skippedCells, evaluations },
    warnings: ["Error estimate measures Simpson refinement only; it is not a certified bound.",
      ...(skippedCells ? ["Undefined or unresolved cells were skipped; the full interval area is unavailable."] : [])],
    diagnostics: skippedCells ? [{ code: "skipped-cells", severity: "warning",
      message: `${skippedCells} cells crossed an undefined value, domain boundary, or work limit.` }] : [],
    artifacts: [] });
  return { objectId: object.id, resultId, source, interval: input.interval, mode: input.mode, status,
    value, partialValue, errorEstimate: status === "complete" ? errorEstimate : null,
    tolerance, evaluations, skippedCells, fillSegments, publication };
};

export const isGraph2DIntegralCurrent = (result: Graph2DIntegralAnalysis, document: Graph2DDocument): boolean =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry) => entry.id === result.objectId);
