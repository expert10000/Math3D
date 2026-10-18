import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { Graph2DTimeOdeObject } from "./graph2dDocument";
import type { Graph2DSamplePoint, Graph2DSampleSegment, Graph2DSamplingArtifact, Graph2DSamplingDiagnostic } from "./graph2dSampling";
import type { Graph2DViewport } from "./graph2dViewport";

export type Graph2DTimeOdeStop = "time-boundary" | "state-boundary" | "evaluation-failure" |
  "minimum-step" | "step-limit" | "sample-limit" | "deadline";
export type Graph2DTimeOdeDirection = Readonly<{
  stop: Graph2DTimeOdeStop; last: Readonly<{ t: number; x: number }>;
  acceptedSteps: number; rejectedSteps: number; evaluations: number;
}>;
export type Graph2DTimeOdeArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "time-ode"; seed: Readonly<{ t: number; x: number }>;
  backward: Graph2DTimeOdeDirection | null; forward: Graph2DTimeOdeDirection | null;
}>;
export type Graph2DTimeOdeRequest = Readonly<{
  object: Graph2DTimeOdeObject; variables: Readonly<Record<string, number>>;
  viewport: Graph2DViewport; maxSamples: number; deadlineMs?: number;
}>;

/** Approximate x(t) in two independently budgeted directions. Screen clipping never changes integration. */
export const sampleGraph2DTimeOde = (request: Graph2DTimeOdeRequest): Graph2DTimeOdeArtifact => {
  const { object, viewport } = request;
  if (!Number.isSafeInteger(request.maxSamples) || request.maxSamples < 1)
    throw new TypeError("Invalid time-dependent ODE evaluation budget.");
  const seed = object.seed;
  if (viewport.xScale === "log10" || viewport.yScale === "log10") return {
    samplerVersion: 1, kind: "time-ode", seed, backward: null, forward: null,
    segments: [], samplesEvaluated: 0, converged: false,
    diagnostics: [{ code: "unsupported-scale", count: 1 }],
  };
  const span = object.domain.max - object.domain.min;
  const maxStep = span / 64;
  const evaluationLimit = Math.min(request.maxSamples, 12000);
  // Allocate half to each direction; an expensive side cannot erase the other side's path.
  const backwardLimit = Math.floor(evaluationLimit / 2);
  const forwardLimit = evaluationLimit - backwardLimit;
  const integrate = (direction: -1 | 1, limit: number) => {
    const points: Graph2DSamplePoint[] = [{ x: seed.t, y: seed.x }];
    const end = direction < 0 ? object.domain.min : object.domain.max;
    let t = seed.t, x = seed.x, step = maxStep / 2;
    let acceptedSteps = 0, rejectedSteps = 0, evaluations = 0;
    let failure: "evaluation-failure" | "sample-limit" | "deadline" | null = null;
    const result = (stop: Graph2DTimeOdeStop) => ({ points,
      status: { stop, last: { t, x }, acceptedSteps, rejectedSteps, evaluations } });
    const evaluate = (atT: number, atX: number): number | null => {
      if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) { failure = "deadline"; return null; }
      if (evaluations >= limit) { failure = "sample-limit"; return null; }
      evaluations += 1;
      const value = evaluateGraph2DExpression(object.expression.ast,
        { ...request.variables, t: atT, x: atX }, { deadlineMs: request.deadlineMs });
      if (!value.ok || !Number.isFinite(value.value)) {
        failure = request.deadlineMs !== undefined && Date.now() > request.deadlineMs ? "deadline" : "evaluation-failure";
        return null;
      }
      return value.value;
    };
    const rk4 = (atT: number, atX: number, h: number): number | null => {
      const k1 = evaluate(atT, atX); if (k1 === null) return null;
      const k2 = evaluate(atT + h / 2, atX + h * k1 / 2); if (k2 === null) return null;
      const k3 = evaluate(atT + h / 2, atX + h * k2 / 2); if (k3 === null) return null;
      const k4 = evaluate(atT + h, atX + h * k3); if (k4 === null) return null;
      const next = atX + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      if (!Number.isFinite(next)) { failure = "evaluation-failure"; return null; }
      return next;
    };
    while (direction * (end - t) > 0) {
      const minimum = Math.max(span * 1e-10, 16 * Number.EPSILON * Math.max(1, Math.abs(t)));
      if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) return result("deadline");
      if (acceptedSteps >= 384) return result("step-limit");
      if (evaluations + 12 > limit) return result("sample-limit");
      const distance = Math.abs(end - t);
      if (distance <= minimum) {
        // Floating-point endpoint proximity is a completed time interval.
        return result("time-boundary");
      }
      const h = direction * Math.min(step, distance);
      failure = null;
      const full = rk4(t, x, h);
      const half = full === null ? null : rk4(t, x, h / 2);
      const fine = half === null ? null : rk4(t + h / 2, half, h / 2);
      if (full === null || fine === null) {
        rejectedSteps += 1;
        if (failure === "sample-limit" || failure === "deadline") return result(failure);
        step /= 2;
        if (step < minimum) return result("evaluation-failure");
        continue;
      }
      const error = Math.abs(fine - full) / 15;
      const tolerance = 1e-6 * (1 + Math.max(Math.abs(x), Math.abs(fine)));
      if (error > tolerance) {
        rejectedSteps += 1;
        step *= Math.max(0.2, 0.9 * (tolerance / error) ** 0.2);
        if (step < minimum) return result("minimum-step");
        continue;
      }
      const next = fine + (fine - full) / 15;
      if (!Number.isFinite(next)) return result("evaluation-failure");
      if (next < object.stateDomain.min || next > object.stateDomain.max) return result("state-boundary");
      const nextT = t + h;
      if (nextT === t) return result("minimum-step");
      t = nextT; x = next; acceptedSteps += 1;
      points.push({ x: t, y: x });
      step = Math.min(maxStep, step * (error === 0 ? 2 : Math.max(0.5, Math.min(2, 0.9 * (tolerance / error) ** 0.2))));
    }
    return result("time-boundary");
  };
  const backward = integrate(-1, backwardLimit);
  const forward = integrate(1, forwardLimit);
  const segments: Graph2DSampleSegment[] = [];
  if (backward.points.length > 1) segments.push({ points: backward.points.slice().reverse(),
    openStart: backward.status.stop !== "time-boundary" && backward.status.stop !== "state-boundary", openEnd: false });
  if (forward.points.length > 1) segments.push({ points: forward.points,
    openStart: false, openEnd: forward.status.stop !== "time-boundary" && forward.status.stop !== "state-boundary" });
  const diagnostics: Graph2DSamplingDiagnostic[] = [];
  for (const stop of [backward.status.stop, forward.status.stop]) {
    if (stop === "evaluation-failure" || stop === "minimum-step") diagnostics.push({ code: "invalid-sample", count: 1 });
    if (stop === "sample-limit" || stop === "step-limit") diagnostics.push({ code: "sample-limit", count: 1 });
    if (stop === "deadline") diagnostics.push({ code: "deadline", count: 1 });
  }
  return { samplerVersion: 1, kind: "time-ode", seed, segments,
    backward: backward.status, forward: forward.status,
    samplesEvaluated: backward.status.evaluations + forward.status.evaluations,
    converged: diagnostics.length === 0, diagnostics };
};
