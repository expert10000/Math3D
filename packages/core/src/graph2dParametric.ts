import type { Graph2DDomain, Graph2DDisplay, Graph2DParametricObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { GRAPH2D_MAX_OUTPUT_BYTES, GRAPH2D_MAX_SEGMENTS, GRAPH2D_SAMPLER_VERSION,
  type Graph2DSamplePoint, type Graph2DSampleSegment, type Graph2DSamplingArtifact,
  type Graph2DSamplingDiagnostic } from "./graph2dSampling";

export const evaluateGraph2DParametric = (object: Graph2DParametricObject,
  variables: Readonly<Record<string, number>>, parameter: number): Graph2DSamplePoint | null => {
  if (!Number.isFinite(parameter) || parameter < object.domain.min || parameter > object.domain.max ||
    parameter === object.domain.min && !object.domain.includeMin ||
    parameter === object.domain.max && !object.domain.includeMax) return null;
  const x = evaluateGraph2DExpression(object.xExpression.ast, { ...variables, t: parameter });
  const y = evaluateGraph2DExpression(object.yExpression.ast, { ...variables, t: parameter });
  return x.ok && y.ok ? { x: x.value, y: y.value, parameter } : null;
};

export type Graph2DPathSamplingRequest = Readonly<{
  domain: Graph2DDomain;
  viewport: Graph2DDisplay["viewport"];
  width: number;
  height: number;
  policy: Graph2DDisplay["sampling"];
  evaluate: (parameter: number) => Graph2DSamplePoint | null;
  deadlineMs?: number;
}>;

/** Shared bounded 2D path sampler for parametric and polar source objects. */
export const sampleGraph2DPath = (request: Graph2DPathSamplingRequest): Graph2DSamplingArtifact => {
  if (!Number.isFinite(request.width) || !Number.isFinite(request.height) || request.width <= 0 || request.height <= 0 ||
    !Number.isFinite(request.domain.min) || !Number.isFinite(request.domain.max) || request.domain.min >= request.domain.max ||
    !Number.isSafeInteger(request.policy.maxSamples) || request.policy.maxSamples < 32 ||
    !Number.isSafeInteger(request.policy.maxDepth) || request.policy.maxDepth < 1 ||
    !Number.isFinite(request.policy.tolerancePx) || request.policy.tolerancePx <= 0)
    throw new TypeError("Invalid Graph2D path sampling request.");
  const counts = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const note = (code: Graph2DSamplingDiagnostic["code"]) => counts.set(code, (counts.get(code) ?? 0) + 1);
  const cache = new Map<number, Graph2DSamplePoint | null>();
  let samplesEvaluated = 0, ended = false;
  const point = (parameter: number) => {
    if (cache.has(parameter)) return cache.get(parameter)!;
    if (samplesEvaluated >= request.policy.maxSamples) { note("sample-limit"); ended = true; return null; }
    if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) { note("deadline"); ended = true; return null; }
    samplesEvaluated += 1;
    const result = request.evaluate(parameter);
    if (!result || !Number.isFinite(result.x) || !Number.isFinite(result.y)) note("invalid-sample");
    const safe = result && Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
    cache.set(parameter, safe);
    return safe;
  };
  const screen = (value: Graph2DSamplePoint) => ({
    x: (value.x - request.viewport.xMin) / (request.viewport.xMax - request.viewport.xMin) * request.width,
    y: (request.viewport.yMax - value.y) / (request.viewport.yMax - request.viewport.yMin) * request.height,
  });
  const leaves: { left: Graph2DSamplePoint | null; right: Graph2DSamplePoint | null; split: boolean }[] = [];
  const subdivide = (a: number, b: number, left: Graph2DSamplePoint | null,
    right: Graph2DSamplePoint | null, depth: number): void => {
    if (ended || (a + b) / 2 === a || (a + b) / 2 === b) {
      leaves.push({ left, right, split: !left || !right }); return;
    }
    const mid = (a + b) / 2, middle = point(mid);
    let deviation = Infinity, jump = false;
    if (left && middle && right) {
      const l = screen(left), m = screen(middle), r = screen(right);
      deviation = Math.hypot(m.x - (l.x + r.x) / 2, m.y - (l.y + r.y) / 2);
      const span = Math.hypot(r.x - l.x, r.y - l.y);
      jump = b - a < (request.domain.max - request.domain.min) / 2048 && span > 20;
      if (deviation <= request.policy.tolerancePx && span > 4 && !ended) {
        for (const fraction of [0.25, 0.75]) {
          const quarter = point(a + (b - a) * fraction);
          if (!quarter) { deviation = Infinity; break; }
          const q = screen(quarter);
          deviation = Math.max(deviation, Math.hypot(q.x - (l.x + (r.x - l.x) * fraction),
            q.y - (l.y + (r.y - l.y) * fraction)));
        }
      }
    }
    const refine = !left || !middle || !right || deviation > request.policy.tolerancePx || jump;
    if (refine && depth < request.policy.maxDepth && !ended) {
      subdivide(a, mid, left, middle, depth + 1);
      subdivide(mid, b, middle, right, depth + 1);
    } else {
      if (refine && depth >= request.policy.maxDepth && left && middle && right && !jump) note("depth-limit");
      if (jump) note("suspected-jump");
      leaves.push({ left, right, split: !left || !right || jump });
    }
  };
  const seeds = Math.min(64, Math.max(8, Math.floor(request.width / 12)), Math.floor(request.policy.maxSamples / 4));
  for (let index = 0; index < seeds; index += 1) {
    const a = request.domain.min + (request.domain.max - request.domain.min) * index / seeds;
    const b = index === seeds - 1 ? request.domain.max :
      request.domain.min + (request.domain.max - request.domain.min) * (index + 1) / seeds;
    subdivide(a, b, point(a), point(b), 0);
  }
  const segments: Graph2DSampleSegment[] = [];
  let current: Graph2DSamplePoint[] = [], bytes = 0;
  const flush = () => {
    if (current.length >= 2) {
      if (segments.length >= GRAPH2D_MAX_SEGMENTS) { note("segment-limit"); ended = true; }
      else segments.push({ points: current,
        openStart: current[0]!.parameter === request.domain.min && !request.domain.includeMin,
        openEnd: current.at(-1)!.parameter === request.domain.max && !request.domain.includeMax });
    }
    current = [];
  };
  const append = (value: Graph2DSamplePoint) => {
    if (current.at(-1)?.parameter === value.parameter) return;
    bytes += JSON.stringify(value).length + 1;
    if (bytes > GRAPH2D_MAX_OUTPUT_BYTES) { note("output-limit"); ended = true; return; }
    current.push(value);
  };
  for (const leaf of leaves) {
    if (ended) break;
    if (leaf.split) { flush(); continue; }
    if (leaf.left && leaf.right) { append(leaf.left); append(leaf.right); }
  }
  flush();
  const diagnostics = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count }));
  return { samplerVersion: GRAPH2D_SAMPLER_VERSION, segments, samplesEvaluated,
    converged: !diagnostics.some((entry) => ["depth-limit", "sample-limit", "segment-limit", "output-limit", "deadline"].includes(entry.code)),
    diagnostics };
};

export const sampleGraph2DParametric = (request: Omit<Graph2DPathSamplingRequest, "domain" | "evaluate"> &
  Readonly<{ object: Graph2DParametricObject; variables?: Readonly<Record<string, number>> }>): Graph2DSamplingArtifact =>
  sampleGraph2DPath({ ...request, domain: request.object.domain,
    evaluate: (parameter) => evaluateGraph2DParametric(request.object, request.variables ?? {}, parameter) });
