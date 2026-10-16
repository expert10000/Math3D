import { structuralHash } from "./documentIdentity";
import { applyGraph2DConstructionAction, type Graph2DPointOnCurveConstruction } from "./graph2dConstructions";
import type { Graph2DDocument, Graph2DGraphObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { evaluateGraph2DParametric } from "./graph2dParametric";
import { evaluateGraph2DPolar } from "./graph2dPolar";
import { graph2DWorldToScreen, type Graph2DScreenPoint, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";

type Point = Readonly<{ x: number; y: number }>;
export type Graph2DConstrainedPointProjection = Readonly<{
  parameter: number; point: Point; screen: Point; distancePx: number;
}>;
const SAMPLES = 129;
const REFINE_STEPS = 28;

const pointAt = (source: Graph2DGraphObject, variables: Readonly<Record<string, number>>, value: number): Point | null => {
  if (source.kind === "parametric") return evaluateGraph2DParametric(source, variables, value);
  if (source.kind === "polar") return evaluateGraph2DPolar(source, variables, value);
  if (source.kind !== "explicit-cartesian" || value < source.domain.min || value > source.domain.max ||
      value === source.domain.min && !source.domain.includeMin || value === source.domain.max && !source.domain.includeMax) return null;
  const result = evaluateGraph2DExpression(source.expression.ast, { ...variables, x: value });
  return result.ok ? { x: value, y: result.value } : null;
};

/** Bounded screen-space projection onto an authored curve; a prior parameter favors the same branch at crossings. */
export function projectGraph2DConstrainedPoint(document: Graph2DDocument, pointId: string,
  viewport: Graph2DViewport, size: Graph2DScreenSize, pointer: Graph2DScreenPoint,
  previousParameter: number): Graph2DConstrainedPointProjection | null {
  const definition = document.source.constructions?.objects.find(item => item.id === pointId);
  if (definition?.kind !== "point-on-curve" || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y) ||
      !Number.isFinite(previousParameter) || size.width <= 0 || size.height <= 0) return null;
  const source = document.source.objects.find(item => item.id === definition.inputs[0]?.objectId);
  if (!source || (source.kind !== "explicit-cartesian" && source.kind !== "parametric" && source.kind !== "polar")) return null;
  const span = source.domain.max - source.domain.min;
  if (!(span > 0)) return null;
  const inset = Math.min(span / 4, Math.max(span * 1e-12,
    Number.EPSILON * Math.max(1, Math.abs(source.domain.min), Math.abs(source.domain.max)) * 16));
  const min = source.domain.min + (source.domain.includeMin ? 0 : inset);
  const max = source.domain.max - (source.domain.includeMax ? 0 : inset);
  if (!(max > min)) return null;
  const variables = Object.fromEntries(document.source.variables.map(item => [item.name, item.value]));
  const evaluate = (parameter: number) => {
    const point = pointAt(source, variables, parameter);
    if (!point) return null;
    const screen = graph2DWorldToScreen(viewport, size, point);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
    const distance2 = (screen.x - pointer.x) ** 2 + (screen.y - pointer.y) ** 2;
    const branchPenalty = 24 * (parameter - previousParameter) / span;
    return { parameter, point, screen, distance2, score: distance2 + branchPenalty * branchPenalty };
  };
  let best: ReturnType<typeof evaluate> = null;
  let bestIndex = -1;
  for (let index = 0; index < SAMPLES; index++) {
    const candidate = evaluate(min + (max - min) * index / (SAMPLES - 1));
    if (candidate && (!best || candidate.score < best.score)) { best = candidate; bestIndex = index; }
  }
  const previous = evaluate(Math.max(min, Math.min(max, previousParameter)));
  if (previous && (!best || previous.score < best.score)) { best = previous; bestIndex = -1; }
  if (!best) return null;
  let left = Math.max(min, best.parameter - (max - min) / (SAMPLES - 1));
  let right = Math.min(max, best.parameter + (max - min) / (SAMPLES - 1));
  if (bestIndex >= 0) {
    left = min + (max - min) * Math.max(0, bestIndex - 1) / (SAMPLES - 1);
    right = min + (max - min) * Math.min(SAMPLES - 1, bestIndex + 1) / (SAMPLES - 1);
  }
  for (let step = 0; step < REFINE_STEPS; step++) {
    const a = left + (right - left) / 3, b = right - (right - left) / 3;
    const first = evaluate(a), second = evaluate(b);
    if ((first?.score ?? Infinity) <= (second?.score ?? Infinity)) right = b;
    else left = a;
    if (first && first.score < best.score) best = first;
    if (second && second.score < best.score) best = second;
  }
  for (const parameter of [left, (left + right) / 2, right]) {
    const candidate = evaluate(parameter);
    if (candidate && candidate.score < best.score) best = candidate;
  }
  return { parameter: best.parameter, point: best.point, screen: best.screen, distancePx: Math.sqrt(best.distance2) };
}

/** Ephemeral source projection for live geometry; the saved document changes only on release. */
export function previewGraph2DConstrainedPoint(document: Graph2DDocument, pointId: string, parameter: number): Graph2DDocument {
  const definition = document.source.constructions?.objects.find(item => item.id === pointId);
  if (definition?.kind !== "point-on-curve") throw new TypeError("Choose a saved point on a curve.");
  const source = document.source.objects.find(item => item.id === definition.inputs[0]?.objectId);
  const variables = Object.fromEntries(document.source.variables.map(item => [item.name, item.value]));
  if (!source || !Number.isFinite(parameter) || !pointAt(source, variables, parameter))
    throw new TypeError("The dragged point is outside its finite authored curve.");
  const updated: Graph2DPointOnCurveConstruction = { ...definition, anchor: { ...definition.anchor, value: parameter } };
  const nextSource = applyGraph2DConstructionAction(document.source, { type: "update", object: updated });
  return { ...document, source: nextSource, identity: { ...document.identity, structuralHash: structuralHash(nextSource) } };
}
