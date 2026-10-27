import { structuralHash } from "./documentIdentity";
import type { Graph2DPhasePortraitObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { Graph2DViewport } from "./graph2dViewport";

export const GRAPH2D_VECTOR_FIELD_ANALYSIS_VERSION = "1" as const;
export const GRAPH2D_VECTOR_FIELD_MAX_EVALUATIONS = 12000;
export type Graph2DVectorFieldSource = Pick<Graph2DPhasePortraitObject,
  "id" | "xDerivative" | "yDerivative" | "domain" | "yDomain">;
type Point = Readonly<{ x: number; y: number }>;
type Summary = Readonly<{ min: number; max: number; mean: number }>;
export type Graph2DVectorFieldAnalysis = Readonly<{
  resultId: string;
  status: "complete" | "partial" | "unavailable";
  reason: "none" | "undefined-samples" | "deadline" | "unsupported-scale" | "empty-domain";
  domain: Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>;
  gridSize: number;
  validCells: number;
  invalidCells: number;
  evaluations: number;
  evaluationBudget: number;
  speed: Summary | null;
  divergence: Summary | null;
  curl: Summary | null;
}>;

/** A separate sampled planar field scan; it does not spend arrow, orbit, or equilibrium work. */
export const analyzeGraph2DVectorField = (request: Readonly<{
  object: Graph2DVectorFieldSource;
  variables: Readonly<Record<string, number>>;
  viewport: Graph2DViewport;
  maxEvaluations: number;
  deadlineMs?: number;
}>): Graph2DVectorFieldAnalysis => {
  const { object, viewport, maxEvaluations, deadlineMs } = request;
  if (!Number.isSafeInteger(maxEvaluations) || maxEvaluations < 10 ||
    maxEvaluations > GRAPH2D_VECTOR_FIELD_MAX_EVALUATIONS)
    throw new TypeError("Vector field analysis budget must be 10–12000 evaluations.");
  const domain = { xMin: Math.max(viewport.xMin, object.domain.min),
    xMax: Math.min(viewport.xMax, object.domain.max),
    yMin: Math.max(viewport.yMin, object.yDomain.min),
    yMax: Math.min(viewport.yMax, object.yDomain.max) };
  const source = { id: object.id, xDerivative: object.xDerivative, yDerivative: object.yDerivative,
    domain: object.domain, yDomain: object.yDomain };
  const resultId = "graph2d.vector-field." + structuralHash({ source, variables: request.variables,
    viewport, maxEvaluations, version: GRAPH2D_VECTOR_FIELD_ANALYSIS_VERSION }).slice(7);
  const base = { resultId, domain, gridSize: 0, validCells: 0, invalidCells: 0,
    evaluations: 0, evaluationBudget: maxEvaluations,
    speed: null, divergence: null, curl: null } as const;
  if (viewport.xScale === "log10" || viewport.yScale === "log10")
    return { ...base, status: "unavailable", reason: "unsupported-scale" };
  if (!(domain.xMin < domain.xMax && domain.yMin < domain.yMax))
    return { ...base, status: "unavailable", reason: "empty-domain" };

  // Five vector probes per cell, two scalar evaluations per probe. A fixed grid
  // keeps the numerical scan independent of viewport pixels and arrow density.
  const gridSize = Math.min(32, Math.floor(Math.sqrt(maxEvaluations / 10)));
  const dx = (domain.xMax - domain.xMin) / gridSize;
  const dy = (domain.yMax - domain.yMin) / gridSize;
  const hx = dx / 4, hy = dy / 4;
  let evaluations = 0, validCells = 0, invalidCells = 0, timedOut = false;
  const speeds: number[] = [], divergences: number[] = [], curls: number[] = [];
  const evaluate = (point: Point): Point | null => {
    if (evaluations + 2 > maxEvaluations || deadlineMs !== undefined && Date.now() > deadlineMs) {
      timedOut = true; return null;
    }
    const scope = { ...request.variables, ...point };
    const px = evaluateGraph2DExpression(object.xDerivative.ast, scope, { deadlineMs });
    const qy = evaluateGraph2DExpression(object.yDerivative.ast, scope, { deadlineMs });
    evaluations += 2;
    if ((!px.ok || !qy.ok) && deadlineMs !== undefined && Date.now() > deadlineMs) timedOut = true;
    return px.ok && qy.ok && Number.isFinite(px.value) && Number.isFinite(qy.value) ?
      { x: px.value, y: qy.value } : null;
  };
  outer: for (let row = 0; row < gridSize; row += 1) for (let column = 0; column < gridSize; column += 1) {
    const x = domain.xMin + (column + 0.5) * dx;
    const y = domain.yMin + (row + 0.5) * dy;
    const center = evaluate({ x, y });
    const left = center && evaluate({ x: x - hx, y });
    const right = center && evaluate({ x: x + hx, y });
    const down = center && evaluate({ x, y: y - hy });
    const up = center && evaluate({ x, y: y + hy });
    if (timedOut) break outer;
    if (!center || !left || !right || !down || !up) { invalidCells += 1; continue; }
    const speed = Math.hypot(center.x, center.y);
    const divergence = (right.x - left.x) / (2 * hx) + (up.y - down.y) / (2 * hy);
    const curl = (right.y - left.y) / (2 * hx) - (up.x - down.x) / (2 * hy);
    if (![speed, divergence, curl].every(Number.isFinite)) { invalidCells += 1; continue; }
    speeds.push(speed); divergences.push(divergence); curls.push(curl); validCells += 1;
  }
  const summary = (values: readonly number[]): Summary | null => values.length ? {
    min: Math.min(...values), max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  } : null;
  return { resultId, domain, gridSize, validCells, invalidCells, evaluations,
    evaluationBudget: maxEvaluations, speed: summary(speeds),
    divergence: summary(divergences), curl: summary(curls),
    status: timedOut || invalidCells ? "partial" : "complete",
    reason: timedOut ? "deadline" : invalidCells ? "undefined-samples" : "none" };
};
