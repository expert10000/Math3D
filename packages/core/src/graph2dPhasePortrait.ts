import { evaluateGraph2DExpression } from "./graph2dExpression";
import { sampleGraph2DImplicit } from "./graph2dImplicit";
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
  nullclines: Readonly<{ x: readonly Graph2DSampleSegment[]; y: readonly Graph2DSampleSegment[] }>;
  equilibria: readonly Readonly<{ x: number; y: number; residual: number }> [];
  analysis: Readonly<{ status: "complete" | "partial" | "unavailable";
    method: "contour-intersection-newton"; gridScale: number | null;
    candidates: number; unresolved: number; evaluations: number }>;
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
    nullclines: { x: [], y: [] }, equilibria: [],
    analysis: { status: "unavailable", method: "contour-intersection-newton", gridScale: null,
      candidates: 0, unresolved: 0, evaluations: 0 },
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
  const analysisStart = samplesEvaluated;
  let nullclines: Graph2DPhasePortraitArtifact["nullclines"] = { x: [], y: [] };
  const equilibria: { x: number; y: number; residual: number }[] = [];
  let analysisStatus: Graph2DPhasePortraitArtifact["analysis"]["status"] = "unavailable";
  let gridScale: number | null = null, candidates = 0, unresolved = 0;
  const remaining = maxEvaluations - samplesEvaluated;
  if (xMin < xMax && yMin < yMax && remaining >= 96 && (deadlineMs === undefined || Date.now() <= deadlineMs)) {
    const contourBudget = Math.min(512, Math.floor(remaining * 0.38));
    const contour = (expression: Graph2DPhasePortraitObject["xDerivative"]) => {
      const sampled = sampleGraph2DImplicit({ object: { id: object.id, kind: "implicit", label: object.label,
        expression, domain: object.domain, yDomain: object.yDomain }, variables: request.variables,
        viewport, width, height, policy: { maxSamples: contourBudget, maxDepth: 8, tolerancePx: 1.5 }, deadlineMs });
      samplesEvaluated += sampled.samplesEvaluated;
      return sampled;
    };
    const xContour = contour(object.xDerivative), yContour = contour(object.yDerivative);
    nullclines = { x: xContour.segments, y: yContour.segments };
    gridScale = Math.hypot(xMax - xMin, yMax - yMin) /
      Math.sqrt(Math.max(1, Math.min(xContour.cellsVisited, yContour.cellsVisited)));
    analysisStatus = xContour.converged && yContour.converged ? "complete" : "partial";
    const intersections = (a: Point, b: Point, c: Point, d: Point): Point | null => {
      const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - c.x, vy = d.y - c.y;
      const det = ux * vy - uy * vx;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-14 * Math.max(1, Math.hypot(ux, uy) * Math.hypot(vx, vy))) return null;
      const wx = c.x - a.x, wy = c.y - a.y;
      const t = (wx * vy - wy * vx) / det, u = (wx * uy - wy * ux) / det;
      return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ?
        { x: a.x + t * ux, y: a.y + t * uy } : null;
    };
    const linePieces = (segments: readonly Graph2DSampleSegment[]) => segments.flatMap(segment =>
      segment.points.slice(1).map((point, index) => [segment.points[index]!, point] as const)).slice(0, 512);
    const xs = linePieces(nullclines.x), ys = linePieces(nullclines.y);
    const seen: Point[] = [];
    outer: for (const [a, b] of xs) for (const [c, d] of ys) {
      const crossing = intersections(a, b, c, d);
      if (!crossing || seen.some(point => Math.hypot(point.x - crossing.x, point.y - crossing.y) < (gridScale ?? 0) * 0.25)) continue;
      seen.push(crossing); candidates += 1;
      if (candidates > 32) { analysisStatus = "partial"; unresolved += 1; break outer; }
      let point = crossing, value = evaluate(point), resolved = false;
      for (let iteration = 0; iteration < 5 && value; iteration += 1) {
        const residual = Math.hypot(value.x, value.y);
        if (residual <= 1e-7 * (1 + Math.hypot(point.x, point.y))) {
          if (!equilibria.some(other => Math.hypot(other.x - point.x, other.y - point.y) < (gridScale ?? 0) * 0.25))
            equilibria.push({ ...point, residual });
          resolved = true; break;
        }
        const hx = Math.max(1e-7, (xMax - xMin) * 1e-5), hy = Math.max(1e-7, (yMax - yMin) * 1e-5);
        const px = evaluate({ x: Math.min(xMax, point.x + hx), y: point.y });
        const py = evaluate({ x: point.x, y: Math.min(yMax, point.y + hy) });
        if (!px || !py) break;
        const dx = Math.min(xMax, point.x + hx) - point.x, dy = Math.min(yMax, point.y + hy) - point.y;
        if (dx <= 0 || dy <= 0) break;
        const j11 = (px.x - value.x) / dx, j21 = (px.y - value.y) / dx;
        const j12 = (py.x - value.x) / dy, j22 = (py.y - value.y) / dy;
        const det = j11 * j22 - j12 * j21;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-12 * Math.max(1, Math.hypot(j11, j21) * Math.hypot(j12, j22))) break;
        const next = { x: point.x + (-value.x * j22 + j12 * value.y) / det,
          y: point.y + (j21 * value.x - j11 * value.y) / det };
        if (!inside(next)) break;
        point = next; value = evaluate(point);
      }
      if (!resolved) { unresolved += 1; analysisStatus = "partial"; }
      if (samplesEvaluated + 8 > maxEvaluations || deadlineMs !== undefined && Date.now() > deadlineMs) {
        analysisStatus = "partial"; break outer;
      }
    }
  }
  const diagnostics: Graph2DSamplingDiagnostic[] = [];
  if (invalidGlyphs) diagnostics.push({ code: "invalid-sample", count: invalidGlyphs });
  if (fieldTimedOut) diagnostics.push({ code: "deadline", count: 1 });
  for (const orbit of orbits) for (const stop of [orbit.backward, orbit.forward]) {
    if (stop === "singular") diagnostics.push({ code: "invalid-sample", count: 1 });
    if (stop === "sample-limit" || stop === "step-limit") diagnostics.push({ code: "sample-limit", count: 1 });
    if (stop === "deadline") diagnostics.push({ code: "deadline", count: 1 });
  }
  return { samplerVersion: 1, kind: "phase-portrait", fieldSegments, orbits, segments, nullclines, equilibria,
    analysis: { status: analysisStatus, method: "contour-intersection-newton", gridScale,
      candidates, unresolved, evaluations: samplesEvaluated - analysisStart },
    samplesEvaluated, converged: analysisStatus === "complete" && !diagnostics.some(item => item.code === "deadline" || item.code === "sample-limit" ||
      item.code === "invalid-sample" && orbits.some(orbit => orbit.backward === "singular" || orbit.forward === "singular")), diagnostics };
};
