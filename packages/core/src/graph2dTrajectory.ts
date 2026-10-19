import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { Graph2DSlopeFieldObject, Graph2DTrajectoryObject } from "./graph2dDocument";
import type { Graph2DSamplingArtifact, Graph2DSamplePoint, Graph2DSamplingDiagnostic } from "./graph2dSampling";
import type { Graph2DViewport } from "./graph2dViewport";

export type Graph2DTrajectoryStop = "domain-boundary" | "singular" | "step-limit" | "deadline" | "sample-limit";
export type Graph2DTrajectoryArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "trajectory";
  sourceFieldId: string;
  seed: Readonly<{ x: number; y: number }>;
  stops: Readonly<{ backward: Graph2DTrajectoryStop; forward: Graph2DTrajectoryStop }>;
  acceptedSteps: number;
  rejectedSteps: number;
}>;
export type Graph2DTrajectoryRequest = Readonly<{
  object: Graph2DTrajectoryObject;
  field: Graph2DSlopeFieldObject;
  variables: Readonly<Record<string, number>>;
  viewport: Graph2DViewport;
  maxSamples: number;
  deadlineMs?: number;
}>;

/** Adaptive RK4 step doubling. The local tolerance is 1e-6 in world y units, with 1e-6 relative allowance. */
export const sampleGraph2DTrajectory = (request: Graph2DTrajectoryRequest): Graph2DTrajectoryArtifact => {
  const { object, field, viewport } = request;
  if (field.id !== object.sourceFieldId || !Number.isSafeInteger(request.maxSamples) || request.maxSamples < 1)
    throw new TypeError("Invalid trajectory source or evaluation budget.");
  const seed = object.seed;
  if (viewport.xScale === "log10" || viewport.yScale === "log10") return {
    samplerVersion: 1, kind: "trajectory", sourceFieldId: field.id, seed, segments: [], samplesEvaluated: 0,
    acceptedSteps: 0, rejectedSteps: 0, converged: false,
    stops: { backward: "domain-boundary", forward: "domain-boundary" },
    diagnostics: [{ code: "unsupported-scale", count: 1 }],
  };
  const span = field.domain.max - field.domain.min;
  const maxStep = span / 64;
  const minStep = Math.max(1e-12, span * 1e-10);
  const maxEvaluations = Math.min(request.maxSamples, 12000);
  const maxAcceptedSteps = Math.min(2048, Math.floor(maxEvaluations / 12));
  let samplesEvaluated = 0, acceptedSteps = 0, rejectedSteps = 0;
  const slope = (x: number, y: number): number | null => {
    if (samplesEvaluated >= maxEvaluations || request.deadlineMs !== undefined && Date.now() > request.deadlineMs) return null;
    samplesEvaluated += 1;
    const result = evaluateGraph2DExpression(field.expression.ast, { ...request.variables, x, y },
      { deadlineMs: request.deadlineMs });
    return result.ok && Number.isFinite(result.value) ? result.value : null;
  };
  const rk4 = (x: number, y: number, h: number): number | null => {
    const k1 = slope(x, y);
    if (k1 === null) return null;
    const k2 = slope(x + h / 2, y + h * k1 / 2);
    if (k2 === null) return null;
    const k3 = slope(x + h / 2, y + h * k2 / 2);
    if (k3 === null) return null;
    const k4 = slope(x + h, y + h * k3);
    if (k4 === null) return null;
    const next = y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
    return Number.isFinite(next) ? next : null;
  };
  const limitReason = (): Graph2DTrajectoryStop => request.deadlineMs !== undefined && Date.now() > request.deadlineMs ?
    "deadline" : samplesEvaluated >= maxEvaluations ? "sample-limit" : "singular";
  const integrate = (direction: -1 | 1): { points: Graph2DSamplePoint[]; stop: Graph2DTrajectoryStop } => {
    const points: Graph2DSamplePoint[] = [{ x: seed.x, y: seed.y }];
    let x = seed.x, y = seed.y, step = maxStep / 2;
    const boundary = direction < 0 ? field.domain.min : field.domain.max;
    while (direction * (boundary - x) > minStep) {
      if (acceptedSteps >= maxAcceptedSteps) return { points, stop: "step-limit" };
      if (samplesEvaluated + 12 > maxEvaluations) return { points, stop: "sample-limit" };
      if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) return { points, stop: "deadline" };
      const h = direction * Math.min(step, Math.abs(boundary - x));
      const full = rk4(x, y, h);
      const half = rk4(x, y, h / 2);
      const fine = half === null ? null : rk4(x + h / 2, half, h / 2);
      if (full === null || fine === null) {
        rejectedSteps += 1; step /= 2;
        if (step < minStep) return { points, stop: limitReason() };
        continue;
      }
      const error = Math.abs(fine - full) / 15;
      const tolerance = 1e-6 * (1 + Math.max(Math.abs(y), Math.abs(fine)));
      if (error > tolerance) {
        rejectedSteps += 1;
        step = Math.max(minStep / 2, step * Math.max(0.2, 0.9 * (tolerance / error) ** 0.2));
        if (step < minStep) return { points, stop: "singular" };
        continue;
      }
      const nextY = fine + (fine - full) / 15;
      if (!Number.isFinite(nextY) || nextY < field.yDomain.min || nextY > field.yDomain.max)
        return { points, stop: "domain-boundary" };
      x += h; y = nextY; points.push({ x, y }); acceptedSteps += 1;
      step = Math.min(maxStep, step * (error === 0 ? 2 : Math.max(0.5, Math.min(2, 0.9 * (tolerance / error) ** 0.2))));
    }
    return { points, stop: "domain-boundary" };
  };
  const backward = integrate(-1), forward = integrate(1);
  const points = [...backward.points.slice().reverse(), ...forward.points.slice(1)];
  const stops = { backward: backward.stop, forward: forward.stop };
  const diagnostics: Graph2DSamplingDiagnostic[] = [];
  for (const reason of [stops.backward, stops.forward]) {
    if (reason === "singular") diagnostics.push({ code: "invalid-sample", count: 1 });
    if (reason === "sample-limit" || reason === "step-limit") diagnostics.push({ code: "sample-limit", count: 1 });
    if (reason === "deadline") diagnostics.push({ code: "deadline", count: 1 });
  }
  return { samplerVersion: 1, kind: "trajectory", sourceFieldId: field.id, seed,
    segments: points.length > 1 ? [{ points, openStart: backward.stop !== "domain-boundary",
      openEnd: forward.stop !== "domain-boundary" }] : [],
    samplesEvaluated, acceptedSteps, rejectedSteps, stops, diagnostics,
    converged: diagnostics.length === 0 };
};
