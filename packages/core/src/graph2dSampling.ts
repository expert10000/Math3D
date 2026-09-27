import { evaluateGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";
import type { Graph2DDomain, Graph2DDisplay } from "./graph2dDocument";

export const GRAPH2D_SAMPLER_VERSION = 1 as const;
export const GRAPH2D_MAX_SEGMENTS = 10000;
export const GRAPH2D_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
export type Graph2DSamplePoint = Readonly<{ x: number; y: number; parameter?: number }>;
export type Graph2DSampleSegment = Readonly<{
  points: readonly Graph2DSamplePoint[];
  openStart: boolean;
  openEnd: boolean;
}>;
export type Graph2DSamplingDiagnostic = Readonly<{
  code: "empty-domain" | "invalid-sample" | "suspected-jump" | "depth-limit" | "sample-limit" | "segment-limit" | "output-limit" | "deadline";
  count: number;
}>;
export type Graph2DSamplingArtifact = Readonly<{
  samplerVersion: typeof GRAPH2D_SAMPLER_VERSION;
  segments: readonly Graph2DSampleSegment[];
  samplesEvaluated: number;
  converged: boolean;
  diagnostics: readonly Graph2DSamplingDiagnostic[];
}>;
export type Graph2DSamplingRequest = Readonly<{
  ast: Graph2DExpressionAst;
  variables?: Readonly<Record<string, number>>;
  domain: Graph2DDomain;
  viewport: Graph2DDisplay["viewport"];
  width: number;
  height: number;
  policy: Graph2DDisplay["sampling"];
  deadlineMs?: number;
}>;

type ObservedPoint = Graph2DSamplePoint | null;
type Leaf = Readonly<{ left: ObservedPoint; right: ObservedPoint; split: boolean }>;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const pixelsY = (point: Graph2DSamplePoint, request: Graph2DSamplingRequest): number =>
  (request.viewport.yMax - point.y) / (request.viewport.yMax - request.viewport.yMin) * request.height;

/** Pure sample artifact: callers key it by exact source generation, viewport, and policy. */
export const sampleGraph2DExplicit = (request: Graph2DSamplingRequest): Graph2DSamplingArtifact => {
  if (!finite(request.width) || !finite(request.height) || request.width <= 0 || request.height <= 0 ||
      !finite(request.domain.min) || !finite(request.domain.max) || request.domain.min >= request.domain.max ||
      !finite(request.viewport.xMin) || !finite(request.viewport.xMax) || request.viewport.xMin >= request.viewport.xMax ||
      !finite(request.viewport.yMin) || !finite(request.viewport.yMax) || request.viewport.yMin >= request.viewport.yMax ||
      !Number.isSafeInteger(request.policy.maxSamples) || request.policy.maxSamples < 32 || request.policy.maxSamples > 200000 ||
      !Number.isSafeInteger(request.policy.maxDepth) || request.policy.maxDepth < 1 || request.policy.maxDepth > 24 ||
      !finite(request.policy.tolerancePx) || request.policy.tolerancePx < 0.1 || request.policy.tolerancePx > 16)
    throw new TypeError("Invalid Graph2D sampling request.");

  const min = Math.max(request.domain.min, request.viewport.xMin);
  const max = Math.min(request.domain.max, request.viewport.xMax);
  if (min >= max) return { samplerVersion: GRAPH2D_SAMPLER_VERSION, segments: [], samplesEvaluated: 0,
    converged: true, diagnostics: [{ code: "empty-domain", count: 1 }] };

  const counts = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const note = (code: Graph2DSamplingDiagnostic["code"]) => counts.set(code, (counts.get(code) ?? 0) + 1);
  const cache = new Map<number, ObservedPoint>();
  let samplesEvaluated = 0;
  let budgetEnded = false;
  const evaluate = (x: number): ObservedPoint => {
    if (cache.has(x)) return cache.get(x)!;
    if (samplesEvaluated >= request.policy.maxSamples) { note("sample-limit"); budgetEnded = true; return null; }
    if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) { note("deadline"); budgetEnded = true; return null; }
    samplesEvaluated += 1;
    const result = evaluateGraph2DExpression(request.ast, { ...request.variables, x }, { deadlineMs: request.deadlineMs });
    const point = result.ok ? { x, y: result.value } : null;
    if (!point) note("invalid-sample");
    cache.set(x, point);
    return point;
  };

  const leaves: Leaf[] = [];
  const subdivide = (left: ObservedPoint, right: ObservedPoint, a: number, b: number, depth: number): void => {
    if (budgetEnded) { leaves.push({ left, right, split: !left || !right }); return; }
    const middleX = (a + b) / 2;
    if (middleX === a || middleX === b) { leaves.push({ left, right, split: !left || !right }); return; }
    const middle = evaluate(middleX);
    const pixelWidth = (b - a) / (request.viewport.xMax - request.viewport.xMin) * request.width;
    const invalid = !left || !right || !middle;
    let deviation = 0;
    let jump = false;
    if (!invalid) {
      const linearY = (pixelsY(left, request) + pixelsY(right, request)) / 2;
      deviation = Math.abs(pixelsY(middle, request) - linearY);
      if (deviation <= request.policy.tolerancePx && pixelWidth > 4 && !budgetEnded) {
        const firstQuarter = evaluate((a + middleX) / 2);
        const thirdQuarter = evaluate((middleX + b) / 2);
        if (!firstQuarter || !thirdQuarter) deviation = Number.POSITIVE_INFINITY;
        else deviation = Math.max(deviation,
          Math.abs(pixelsY(firstQuarter, request) - (3 * pixelsY(left, request) + pixelsY(right, request)) / 4),
          Math.abs(pixelsY(thirdQuarter, request) - (pixelsY(left, request) + 3 * pixelsY(right, request)) / 4));
      }
      const verticalSpan = Math.abs(pixelsY(right, request) - pixelsY(left, request));
      jump = pixelWidth <= 1 && verticalSpan > Math.max(12, request.height * 0.03);
    }
    const refine = invalid || deviation > request.policy.tolerancePx || jump;
    if (refine && depth < request.policy.maxDepth && !budgetEnded) {
      subdivide(left, middle, a, middleX, depth + 1);
      subdivide(middle, right, middleX, b, depth + 1);
      return;
    }
    if (refine && depth >= request.policy.maxDepth && !invalid && !jump) note("depth-limit");
    if (jump) note("suspected-jump");
    leaves.push({ left, right, split: invalid || jump });
  };

  const seeds = Math.min(64, Math.max(8, Math.floor(request.width / 12)), Math.floor(request.policy.maxSamples / 4));
  for (let index = 0; index < seeds; index += 1) {
    const a = min + (max - min) * (index / seeds);
    const b = index === seeds - 1 ? max : min + (max - min) * ((index + 1) / seeds);
    subdivide(evaluate(a), evaluate(b), a, b, 0);
  }

  const segments: Graph2DSampleSegment[] = [];
  let current: Graph2DSamplePoint[] = [];
  let outputBytes = 0;
  let outputEnded = false;
  const append = (point: Graph2DSamplePoint) => {
    if (outputEnded || current.at(-1)?.x === point.x) return;
    outputBytes += JSON.stringify(point).length + 1;
    if (outputBytes > GRAPH2D_MAX_OUTPUT_BYTES) { note("output-limit"); outputEnded = true; return; }
    current.push(point);
  };
  const flush = () => {
    if (current.length >= 2) {
      if (segments.length >= GRAPH2D_MAX_SEGMENTS) { note("segment-limit"); outputEnded = true; }
      else segments.push({ points: current, openStart: current[0]!.x === request.domain.min && !request.domain.includeMin,
        openEnd: current.at(-1)!.x === request.domain.max && !request.domain.includeMax });
    }
    current = [];
  };
  for (const leaf of leaves) {
    if (outputEnded) break;
    if (leaf.split) { flush(); continue; }
    if (leaf.left && leaf.right) { append(leaf.left); append(leaf.right); }
  }
  flush();
  const diagnostics = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count }));
  const incomplete = diagnostics.some((item) => ["depth-limit", "sample-limit", "segment-limit", "output-limit", "deadline"].includes(item.code));
  return { samplerVersion: GRAPH2D_SAMPLER_VERSION, segments, samplesEvaluated, converged: !incomplete, diagnostics };
};
