import { differentiateGraph2DExpression, numericalGraph2DDerivative } from
  "./graph2dDerivatives";
import type { Graph2DExplicitObject, Graph2DSavedDerivativeObject,
  Graph2DDisplay } from "./graph2dDocument";
import type { Graph2DViewport } from "./graph2dViewport";
import { sampleGraph2DExplicit, type Graph2DSamplingArtifact,
  type Graph2DSamplePoint, type Graph2DSampleSegment } from "./graph2dSampling";

/** Saved recipe sampling; numerical rows are approximate and never an authored formula. */
export function sampleGraph2DSavedDerivative(request: Readonly<{
  object: Graph2DSavedDerivativeObject; source: Graph2DExplicitObject;
  variables: Readonly<Record<string, number>>; viewport: Graph2DViewport;
  width: number; height: number; policy: Graph2DDisplay["sampling"];
  deadlineMs?: number;
}>): Graph2DSamplingArtifact {
  const { object, source } = request;
  const symbolic = differentiateGraph2DExpression(source.expression.ast, object.order);
  if (object.method === "symbolic-rules" && symbolic.ok)
    return sampleGraph2DExplicit({ ast: symbolic.ast, domain: object.domain,
      variables: request.variables, viewport: request.viewport,
      width: request.width, height: request.height, policy: request.policy,
      deadlineMs: request.deadlineMs });
  if (object.method !== "finite-difference" || object.fallback !== "finite-difference")
    return { samplerVersion: 1, segments: [], samplesEvaluated: 0,
      converged: false, diagnostics: [{ code: "invalid-sample", count: 1 }] };
  const min = Math.max(object.domain.min, request.viewport.xMin);
  const max = Math.min(object.domain.max, request.viewport.xMax);
  if (!(min < max)) return { samplerVersion: 1, segments: [],
    samplesEvaluated: 0, converged: true,
    diagnostics: [{ code: "empty-domain", count: 1 }] };
  const count = Math.min(129, Math.max(32, request.policy.maxSamples));
  const segments: Graph2DSampleSegment[] = [];
  let run: Graph2DSamplePoint[] = [], invalid = 0, evaluated = 0;
  let deadline = false;
  const flush = () => { if (run.length > 1)
    segments.push({ points: run, openStart: true, openEnd: true }); run = []; };
  for (let index = 0; index < count; index++) {
    if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) {
      deadline = true; flush(); break;
    }
    const x = min + (max - min) * index / (count - 1);
    const estimate = numericalGraph2DDerivative(source.expression.ast,
      request.variables, object.domain, x, object.order, object.tolerance);
    evaluated++;
    const y = "value" in estimate ? estimate.value : null;
    if (y === null || !Number.isFinite(y) ||
        request.viewport.yScale === "log10" && y <= 0) {
      invalid++; flush(); continue;
    }
    run.push({ x, y });
  }
  flush();
  return { samplerVersion: 1, segments, samplesEvaluated: evaluated,
    converged: !deadline && invalid === 0,
    diagnostics: [...(invalid ? [{ code: "invalid-sample" as const, count: invalid }] : []),
      ...(deadline ? [{ code: "deadline" as const, count: 1 }] : [])] };
}
