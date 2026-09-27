import type { Graph2DPolarObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { sampleGraph2DPath, type Graph2DPathSamplingRequest } from "./graph2dParametric";
import type { Graph2DSamplingArtifact } from "./graph2dSampling";

export type Graph2DPolarPoint = Readonly<{ x: number; y: number; parameter: number; radius: number }>;

/** A signed radius reverses the Cartesian direction while preserving source θ and r. */
export const evaluateGraph2DPolar = (object: Graph2DPolarObject,
  variables: Readonly<Record<string, number>>, theta: number): Graph2DPolarPoint | null => {
  if (!Number.isFinite(theta) || theta < object.domain.min || theta > object.domain.max ||
    theta === object.domain.min && !object.domain.includeMin ||
    theta === object.domain.max && !object.domain.includeMax) return null;
  const evaluated = evaluateGraph2DExpression(object.rExpression.ast, { ...variables, theta });
  if (!evaluated.ok) return null;
  const radius = evaluated.value;
  const x = radius * Math.cos(theta), y = radius * Math.sin(theta);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, parameter: theta, radius } : null;
};

export const sampleGraph2DPolar = (request: Omit<Graph2DPathSamplingRequest, "domain" | "evaluate"> &
  Readonly<{ object: Graph2DPolarObject; variables?: Readonly<Record<string, number>> }>): Graph2DSamplingArtifact =>
  sampleGraph2DPath({ ...request, domain: request.object.domain,
    evaluate: (theta) => evaluateGraph2DPolar(request.object, request.variables ?? {}, theta) });
