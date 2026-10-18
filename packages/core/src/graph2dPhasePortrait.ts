import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { Graph2DPhasePortraitObject } from "./graph2dDocument";
import type { Graph2DSamplePoint, Graph2DSampleSegment, Graph2DSamplingArtifact, Graph2DSamplingDiagnostic } from "./graph2dSampling";
import type { Graph2DViewport } from "./graph2dViewport";

type Point = Readonly<{ x: number; y: number }>;
export type Graph2DPhaseStop = "time-horizon" | "domain-boundary" | "equilibrium" | "singular" | "sample-limit" | "step-limit" | "deadline";
export type Graph2DPhaseOrbit = Readonly<{
  seedIndex: number; seed: Point; backward: Graph2DPhaseStop; forward: Graph2DPhaseStop;
  acceptedSteps: number; rejectedSteps: number;
}>;
export type Graph2DPhasePortraitArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "phase-portrait";
  fieldSegments: readonly Graph2DSampleSegment[];
  orbits: readonly Graph2DPhaseOrbit[];
}>;
export type Graph2DPhasePortraitRequest = Readonly<{
  object: Graph2DPhasePortraitObject;
  variables: Readonly<Record<string, number>>;
  viewport: Graph2DViewport;
  width: number; height: number; maxSamples: number; deadlineMs?: number;
}>;

/** Bounded planar direction grid plus two-sided adaptive RK4 orbits. Time is a parameter, not the screen x coordinate. */
export const sampleGraph2DPhasePortrait = (request: Graph2DPhasePortraitRequest): Graph2DPhasePortraitArtifact => {
  const { object, viewport, width, height } = request;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 ||
      !Number.isSafeInteger(request.maxSamples) || request.maxSamples < 1)
    throw new TypeError("Invalid phase-portrait sampling request.");
  if (viewport.xScale === "log10" || viewport.yScale === "log10") return {
    samplerVersion: 1, kind: "phase-portrait", segments: [], fieldSegments: [], orbits: [], samplesEvaluated: 0,
    converged: false, diagnostics: [{ code: "unsupported-scale", count: 1 }],
  };
  const maxEvaluations = Math.min(request.maxSamples, 12000);
  const deadlineMs = request.deadlineMs;
  let samplesEvaluated = 0, invalidGlyphs = 0, fieldTimedOut = false;
  const evaluate = (point: Point): Point | null => {
    if (samplesEvaluated + 2 > maxEvaluations || deadlineMs !== undefined && Date.now() > deadlineMs) return null;
    const x = evaluateGraph2DExpression(object.xDerivative.ast, { ...request.variables, ...point }, { deadlineMs });
    const y = evaluateGraph2DExpression(object.yDerivative.ast, { ...request.variables, ...point }, { deadlineMs });
    samplesEvaluated += 2;
    return x.ok && y.ok && Number.isFinite(x.value) && Number.isFinite(y.value) ? { x: x.value, y: y.value } : null;
  };
  const xMin = Math.max(viewport.xMin, object.domain.min), xMax = Math.min(viewport.xMax, object.domain.max);
  const yMin = Math.max(viewport.yMin, object.yDomain.min), yMax = Math.min(viewport.yMax, object.yDomain.max);
  const fieldSegments: Graph2DSampleSegment[] = [];
  if (xMin < xMax && yMin < yMax) {
    let columns = Math.max(1, Math.min(20, Math.floor(width / 48)));
    let rows = Math.max(1, Math.min(20, Math.floor(height / 48)));
    // Reserve most evaluations for saved orbits, especially when another graph shares the scene budget.
    const glyphBudget = Math.max(1, Math.min(256, Math.floor(maxEvaluations / 20)));
    while (columns * rows > glyphBudget) {
      if (columns >= rows && columns > 1) columns -= 1;
      else rows -= 1;
    }
    const pxPerX = width / (viewport.xMax - viewport.xMin);
    const pxPerY = height / (viewport.yMax - viewport.yMin);
    const lengthPx = Math.min(24, 0.4 * Math.min(width / columns, height / rows));
    for (let row = 0; row < rows && !fieldTimedOut; row += 1) for (let column = 0; column < columns; column += 1) {
      if (deadlineMs !== undefined && Date.now() > deadlineMs) { fieldTimedOut = true; break; }
      const center = { x: xMin + (column + 0.5) * (xMax - xMin) / columns,
        y: yMin + (row + 0.5) * (yMax - yMin) / rows };
      const vector = evaluate(center);
      if (!vector) { invalidGlyphs += 1; continue; }
      const norm = Math.hypot(vector.x * pxPerX, vector.y * pxPerY);
      if (!Number.isFinite(norm) || norm === 0) continue;
      const dx = vector.x * lengthPx / (2 * norm), dy = vector.y * lengthPx / (2 * norm);
      if (![dx, dy].every(Number.isFinite)) { invalidGlyphs += 1; continue; }
      fieldSegments.push({ points: [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }],
        openStart: false, openEnd: false });
    }
  }
  const maxStep = object.timeSpan / 16, minStep = Math.max(1e-10, object.timeSpan * 1e-9);
  const inside = (point: Point) => point.x >= object.domain.min && point.x <= object.domain.max &&
    point.y >= object.yDomain.min && point.y <= object.yDomain.max;
  const rk4 = (point: Point, h: number): Point | null => {
    const k1 = evaluate(point);
    if (!k1) return null;
    const k2 = evaluate({ x: point.x + h * k1.x / 2, y: point.y + h * k1.y / 2 });
    if (!k2) return null;
    const k3 = evaluate({ x: point.x + h * k2.x / 2, y: point.y + h * k2.y / 2 });
    if (!k3) return null;
    const k4 = evaluate({ x: point.x + h * k3.x, y: point.y + h * k3.y });
    if (!k4) return null;
    const next = { x: point.x + h * (k1.x + 2 * k2.x + 2 * k3.x + k4.x) / 6,
      y: point.y + h * (k1.y + 2 * k2.y + 2 * k3.y + k4.y) / 6 };
    return Number.isFinite(next.x) && Number.isFinite(next.y) ? next : null;
  };
  const limitReason = (): Graph2DPhaseStop => deadlineMs !== undefined && Date.now() > deadlineMs ? "deadline" :
    samplesEvaluated + 24 > maxEvaluations ? "sample-limit" : "singular";
  const segments: Graph2DSampleSegment[] = [], orbits: Graph2DPhaseOrbit[] = [];
  for (const [seedIndex, seed] of object.seeds.entries()) {
    const initial = evaluate(seed);
    const integrate = (direction: -1 | 1): { points: Graph2DSamplePoint[]; stop: Graph2DPhaseStop; accepted: number; rejected: number } => {
      const points: Graph2DSamplePoint[] = [{ ...seed, parameter: 0 }];
      if (!initial) return { points, stop: limitReason(), accepted: 0, rejected: 0 };
      if (initial.x === 0 && initial.y === 0) return { points, stop: "equilibrium", accepted: 0, rejected: 0 };
      let current: Point = seed, t = 0, step = maxStep / 2, accepted = 0, rejected = 0;
      while (Math.abs(t) + minStep < object.timeSpan) {
        if (accepted >= 2048) return { points, stop: "step-limit", accepted, rejected };
        if (samplesEvaluated + 24 > maxEvaluations) return { points, stop: "sample-limit", accepted, rejected };
        if (deadlineMs !== undefined && Date.now() > deadlineMs) return { points, stop: "deadline", accepted, rejected };
        const h = direction * Math.min(step, object.timeSpan - Math.abs(t));
        const full = rk4(current, h), half = rk4(current, h / 2);
        const fine = half ? rk4(half, h / 2) : null;
        if (!full || !fine) {
          rejected += 1; step /= 2;
          if (step < minStep) return { points, stop: limitReason(), accepted, rejected };
          continue;
        }
        const error = Math.hypot(fine.x - full.x, fine.y - full.y) / 15;
        const tolerance = 1e-6 * (1 + Math.max(Math.hypot(current.x, current.y), Math.hypot(fine.x, fine.y)));
        if (error > tolerance) {
          rejected += 1; step *= Math.max(0.2, 0.9 * (tolerance / error) ** 0.2);
          if (step < minStep) return { points, stop: "singular", accepted, rejected };
          continue;
        }
        const next = { x: fine.x + (fine.x - full.x) / 15, y: fine.y + (fine.y - full.y) / 15 };
        if (!inside(next)) return { points, stop: "domain-boundary", accepted, rejected };
        t += h; current = next; points.push({ ...next, parameter: t }); accepted += 1;
        step = Math.min(maxStep, step * (error === 0 ? 2 : Math.max(0.5, Math.min(2, 0.9 * (tolerance / error) ** 0.2))));
      }
      return { points, stop: "time-horizon", accepted, rejected };
    };
    const backward = integrate(-1), forward = integrate(1);
    const points = [...backward.points.slice().reverse(), ...forward.points.slice(1)];
    if (points.length > 1) segments.push({ points, openStart: !["time-horizon", "domain-boundary"].includes(backward.stop),
      openEnd: !["time-horizon", "domain-boundary"].includes(forward.stop) });
    orbits.push({ seedIndex, seed, backward: backward.stop, forward: forward.stop,
      acceptedSteps: backward.accepted + forward.accepted, rejectedSteps: backward.rejected + forward.rejected });
  }
  const diagnostics: Graph2DSamplingDiagnostic[] = [];
  if (invalidGlyphs) diagnostics.push({ code: "invalid-sample", count: invalidGlyphs });
  if (fieldTimedOut) diagnostics.push({ code: "deadline", count: 1 });
  for (const orbit of orbits) for (const stop of [orbit.backward, orbit.forward]) {
    if (stop === "singular") diagnostics.push({ code: "invalid-sample", count: 1 });
    if (stop === "sample-limit" || stop === "step-limit") diagnostics.push({ code: "sample-limit", count: 1 });
    if (stop === "deadline") diagnostics.push({ code: "deadline", count: 1 });
  }
  return { samplerVersion: 1, kind: "phase-portrait", fieldSegments, orbits, segments,
    samplesEvaluated, converged: !diagnostics.some(item => item.code === "deadline" || item.code === "sample-limit" ||
      item.code === "invalid-sample" && orbits.some(orbit => orbit.backward === "singular" || orbit.forward === "singular")), diagnostics };
};
