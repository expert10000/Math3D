import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { differentiateGraph2DExpression } from "./graph2dDerivatives";
import type { Graph2DDocument, Graph2DPolarObject } from "./graph2dDocument";
import { evaluateGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_POLAR_MEASUREMENT_VERSION = "1" as const;
export const GRAPH2D_POLAR_MEASUREMENT_CELLS = 256;
export const GRAPH2D_POLAR_MEASUREMENT_MAX_EVALUATIONS = 12000;
export type Graph2DPolarMeasurementKind = "swept-area" | "arc-length";
export type Graph2DPolarMeasurement = Readonly<{
  kind: Graph2DPolarMeasurementKind;
  objectId: string;
  resultId: string;
  source: ScientificSourceGeneration;
  interval: Readonly<{ min: number; max: number }>;
  status: "complete" | "incomplete";
  value: number | null;
  partialValue: number;
  errorEstimate: number | null;
  tolerance: number;
  evaluations: number;
  unresolvedCells: number;
  cancelled: boolean;
  method: "direct-radius" | "symbolic-slope" | "finite-difference-slope";
  publication: AnalysisResultEnvelope;
}>;

/** Measures an authored polar traversal. Swept area retains traversal multiplicity. */
export function analyzeGraph2DPolarMeasurement(input: Readonly<{
  document: Graph2DDocument;
  objectId: string;
  kind: Graph2DPolarMeasurementKind;
  interval: Readonly<{ min: number; max: number }>;
  tolerance?: number;
  maxEvaluations?: number;
  signal?: AbortSignal;
}>): Graph2DPolarMeasurement {
  const object = input.document.source.objects.find(entry => entry.id === input.objectId);
  if (!object || object.kind !== "polar" || !["swept-area", "arc-length"].includes(input.kind))
    throw new TypeError("Invalid Graph2D polar measurement request.");
  if (!Number.isFinite(input.interval.min) || !Number.isFinite(input.interval.max) ||
    input.interval.min >= input.interval.max || input.interval.min < object.domain.min ||
    input.interval.max > object.domain.max || input.interval.max - input.interval.min > 1e6)
    throw new TypeError("Choose increasing angles within the authored angular domain.");
  const tolerance = input.tolerance ?? 1e-6;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.1)
    throw new TypeError("Invalid Graph2D polar measurement tolerance.");
  const maxEvaluations = input.maxEvaluations ?? GRAPH2D_POLAR_MEASUREMENT_MAX_EVALUATIONS;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 1 ||
    maxEvaluations > GRAPH2D_POLAR_MEASUREMENT_MAX_EVALUATIONS)
    throw new TypeError("Invalid Graph2D polar measurement budget.");

  const started = Date.now();
  const source: ScientificSourceGeneration = { documentId: input.document.identity.id,
    revision: input.document.identity.revision, structuralHash: input.document.identity.structuralHash,
    generation: input.document.identity.revision };
  const resultId = `graph2d.polar-${input.kind}.` + structuralHash({ source, objectId: object.id,
    interval: input.interval, tolerance, maxEvaluations, algorithmVersion: GRAPH2D_POLAR_MEASUREMENT_VERSION }).slice(7);
  const variables = Object.fromEntries(input.document.source.variables.map(entry => [entry.name, entry.value]));
  const symbolic = input.kind === "arc-length" ? differentiateGraph2DExpression(object.rExpression.ast, 1, "theta") : null;
  const method = input.kind === "swept-area" ? "direct-radius" : symbolic?.ok ? "symbolic-slope" : "finite-difference-slope";
  let evaluations = 0;
  const radiusCache = new Map<number, number | null>();
  const integrandCache = new Map<number, number | null>();
  const evaluate = (ast: Graph2DExpressionAst, theta: number): number | null => {
    if (input.signal?.aborted || evaluations >= maxEvaluations) return null;
    evaluations += 1;
    const result = evaluateGraph2DExpression(ast, { ...variables, theta });
    return result.ok && Number.isFinite(result.value) ? result.value : null;
  };
  const radius = (theta: number): number | null => {
    if (radiusCache.has(theta)) return radiusCache.get(theta)!;
    if (theta < object.domain.min || theta > object.domain.max ||
      theta === object.domain.min && !object.domain.includeMin ||
      theta === object.domain.max && !object.domain.includeMax) return null;
    const value = evaluate(object.rExpression.ast, theta);
    radiusCache.set(theta, value);
    return value;
  };
  const slope = (theta: number, r: number): number | null => {
    if (symbolic?.ok) return evaluate(symbolic.ast, theta);
    const scale = Math.max(1, Math.abs(theta));
    const h = Math.min(Math.cbrt(Number.EPSILON) * scale, (object.domain.max - object.domain.min) / 1000);
    if (!(h > Number.EPSILON * scale * 8)) return null;
    const left = theta - h >= object.domain.min ? radius(theta - h) : null;
    const right = theta + h <= object.domain.max ? radius(theta + h) : null;
    if (left !== null && right !== null) {
      const leftSlope = (r - left) / h, rightSlope = (right - r) / h;
      if (Math.abs(leftSlope - rightSlope) > 1e-3 * Math.max(1, Math.abs(leftSlope), Math.abs(rightSlope))) return null;
      return (right - left) / (2 * h);
    }
    if (right !== null) {
      const farRight = radius(theta + 2 * h);
      return farRight === null ? null : (-3 * r + 4 * right - farRight) / (2 * h);
    }
    if (left !== null) {
      const farLeft = radius(theta - 2 * h);
      return farLeft === null ? null : (3 * r - 4 * left + farLeft) / (2 * h);
    }
    return null;
  };
  const integrand = (theta: number): number | null => {
    if (integrandCache.has(theta)) return integrandCache.get(theta)!;
    const r = radius(theta);
    if (r === null) { integrandCache.set(theta, null); return null; }
    const derivative = input.kind === "arc-length" ? slope(theta, r) : 0;
    const value = derivative === null ? null : input.kind === "swept-area" ? r * r / 2 : Math.hypot(r, derivative);
    const finite = value !== null && Number.isFinite(value) ? value : null;
    integrandCache.set(theta, finite);
    return finite;
  };
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) =>
    (b - a) * (fa + 4 * fm + fb) / 6;
  const refine = (a: number, b: number, fa: number, fm: number, fb: number,
    coarse: number, allowedError: number, depth: number): { value: number; error: number } | null => {
    const midpoint = (a + b) / 2;
    const leftMid = integrand((a + midpoint) / 2), rightMid = integrand((midpoint + b) / 2);
    if (leftMid === null || rightMid === null) return null;
    const left = simpson(a, midpoint, fa, leftMid, fm);
    const right = simpson(midpoint, b, fm, rightMid, fb);
    const delta = left + right - coarse;
    if (Math.abs(delta) <= 15 * allowedError)
      return { value: left + right + delta / 15, error: Math.abs(delta) / 15 };
    if (depth === 0) return null;
    const first = refine(a, midpoint, fa, leftMid, fm, left, allowedError / 2, depth - 1);
    if (!first) return null;
    const second = refine(midpoint, b, fm, rightMid, fb, right, allowedError / 2, depth - 1);
    return second ? { value: first.value + second.value, error: first.error + second.error } : null;
  };
  const width = (input.interval.max - input.interval.min) / GRAPH2D_POLAR_MEASUREMENT_CELLS;
  let partialValue = 0, error = 0, unresolvedCells = 0;
  for (let index = 0; index < GRAPH2D_POLAR_MEASUREMENT_CELLS; index += 1) {
    if (input.signal?.aborted) { unresolvedCells += GRAPH2D_POLAR_MEASUREMENT_CELLS - index; break; }
    const a = input.interval.min + index * width;
    const b = index === GRAPH2D_POLAR_MEASUREMENT_CELLS - 1 ? input.interval.max : input.interval.min + (index + 1) * width;
    const fa = integrand(a), fm = integrand((a + b) / 2), fb = integrand(b);
    if (fa === null || fm === null || fb === null) { unresolvedCells += 1; continue; }
    const part = refine(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb),
      tolerance / GRAPH2D_POLAR_MEASUREMENT_CELLS, 10);
    if (!part || !Number.isFinite(part.value)) { unresolvedCells += 1; continue; }
    partialValue += part.value;
    error += part.error;
  }
  const cancelled = input.signal?.aborted ?? false;
  const status = unresolvedCells ? "incomplete" : "complete";
  const value = status === "complete" ? partialValue : null;
  const publication = createAnalysisResultEnvelope({ resultId, status: status === "complete" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: `graph2d.polar-${input.kind}`, algorithm: `cellwise-adaptive-simpson-${method}`,
      algorithmVersion: GRAPH2D_POLAR_MEASUREMENT_VERSION,
      parameters: { objectId: object.id, interval: input.interval, angleUnit: "radian", measure: input.kind,
        gridCells: GRAPH2D_POLAR_MEASUREMENT_CELLS, maxEvaluations } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: tolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_POLAR_MEASUREMENT_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { interval: input.interval, angleUnit: "radian", measure: input.kind, status,
      value, partialValue, errorEstimate: status === "complete" ? error : null, unresolvedCells, evaluations, method },
    warnings: ["Simpson refinement error is estimated, not certified; narrow singularities may be missed.",
      ...(input.kind === "swept-area" ? ["Swept area counts repeated traversal; it is not geometric union area."] : []),
      ...(unresolvedCells ? ["The full angular interval result is unavailable; only a partial value is shown."] : [])],
    diagnostics: unresolvedCells ? [{ code: cancelled ? "cancelled" : "unresolved-cells", severity: "warning",
      message: cancelled ? "Measurement was cancelled." : `${unresolvedCells} cells crossed an invalid source, open endpoint, work limit, or failed convergence.` }] : [],
    artifacts: [] });
  return { kind: input.kind, objectId: object.id, resultId, source, interval: input.interval, status, value,
    partialValue, errorEstimate: status === "complete" ? error : null, tolerance, evaluations,
    unresolvedCells, cancelled, method, publication };
}

export const isGraph2DPolarMeasurementCurrent = (result: Graph2DPolarMeasurement, document: Graph2DDocument): boolean =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry): entry is Graph2DPolarObject => entry.id === result.objectId && entry.kind === "polar");
