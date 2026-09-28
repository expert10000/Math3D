import type { Graph2DDisplay, Graph2DDomain, Graph2DPiecewiseObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { GRAPH2D_MAX_SEGMENTS, GRAPH2D_SAMPLER_VERSION, sampleGraph2DExplicit,
  type Graph2DSamplePoint, type Graph2DSamplingArtifact, type Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DPiecewiseDomainIssue = Readonly<{
  kind: "gap" | "overlap";
  leftPiece: number;
  rightPiece: number;
  at: readonly [number, number];
}>;
export type Graph2DPiecewiseArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "piecewise";
  endpoints: readonly Readonly<{ x: number; y: number; open: boolean; side: "start" | "end" }>[];
}>;

/** Parses conventional interval notation such as [-2, 3). */
export const parseGraph2DInterval = (source: string): Graph2DDomain => {
  const match = /^\s*([[(])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*,\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([\])])\s*$/i.exec(source);
  if (!match) throw new TypeError("Use interval notation such as [-2, 3)." );
  const min = Number(match[2]), max = Number(match[3]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new TypeError("Interval endpoints must be finite and increasing.");
  return { min, max, includeMin: match[1] === "[", includeMax: match[4] === "]" };
};

export const inspectGraph2DPiecewiseDomains = (object: Pick<Graph2DPiecewiseObject, "pieces">): readonly Graph2DPiecewiseDomainIssue[] => {
  const issues: Graph2DPiecewiseDomainIssue[] = [];
  for (let index = 1; index < object.pieces.length; index += 1) {
    const left = object.pieces[index - 1]!.domain, right = object.pieces[index]!.domain;
    const overlap = right.min < left.max || right.min === left.max && left.includeMax && right.includeMin;
    const gap = right.min > left.max || right.min === left.max && !left.includeMax && !right.includeMin;
    if (overlap || gap) issues.push({ kind: overlap ? "overlap" : "gap", leftPiece: index - 1,
      rightPiece: index, at: overlap ? [right.min, left.max] : [left.max, right.min] });
  }
  return issues;
};

export const evaluateGraph2DPiecewise = (object: Graph2DPiecewiseObject,
  variables: Readonly<Record<string, number>>, x: number): Graph2DSamplePoint | null => {
  const piece = object.pieces.find(({ domain }) => x >= domain.min && x <= domain.max &&
    (x !== domain.min || domain.includeMin) && (x !== domain.max || domain.includeMax));
  if (!piece) return null;
  const value = evaluateGraph2DExpression(piece.expression.ast, { ...variables, x });
  return value.ok ? { x, y: value.value } : null;
};

export const sampleGraph2DPiecewise = (request: Readonly<{
  object: Graph2DPiecewiseObject;
  variables?: Readonly<Record<string, number>>;
  viewport: Graph2DDisplay["viewport"];
  width: number;
  height: number;
  policy: Graph2DDisplay["sampling"];
  deadlineMs?: number;
}>): Graph2DPiecewiseArtifact => {
  const diagnostics = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const segments = [], pieceBudget = Math.max(32, Math.floor(request.policy.maxSamples / request.object.pieces.length) - 2);
  let samplesEvaluated = 0, converged = true;
  const endpoints: Graph2DPiecewiseArtifact["endpoints"][number][] = [];
  for (const piece of request.object.pieces) {
    const remaining = request.policy.maxSamples - samplesEvaluated;
    if (remaining < 32) { converged = false; diagnostics.set("sample-limit", (diagnostics.get("sample-limit") ?? 0) + 1); break; }
    const artifact = sampleGraph2DExplicit({ ast: piece.expression.ast, variables: request.variables,
      domain: piece.domain, viewport: request.viewport, width: request.width, height: request.height,
      deadlineMs: request.deadlineMs, policy: { ...request.policy, maxSamples: Math.min(pieceBudget, remaining) } });
    samplesEvaluated += artifact.samplesEvaluated;
    converged &&= artifact.converged;
    for (const diagnostic of artifact.diagnostics) diagnostics.set(diagnostic.code,
      (diagnostics.get(diagnostic.code) ?? 0) + diagnostic.count);
    segments.push(...artifact.segments.slice(0, Math.max(0, GRAPH2D_MAX_SEGMENTS - segments.length)));
    if (segments.length >= GRAPH2D_MAX_SEGMENTS) break;
    for (const [x, open, side] of [[piece.domain.min, !piece.domain.includeMin, "start"],
      [piece.domain.max, !piece.domain.includeMax, "end"]] as const) {
      if (samplesEvaluated >= request.policy.maxSamples) { converged = false; diagnostics.set("sample-limit", (diagnostics.get("sample-limit") ?? 0) + 1); break; }
      samplesEvaluated += 1;
      const value = evaluateGraph2DExpression(piece.expression.ast, { ...request.variables, x });
      if (value.ok) endpoints.push({ x, y: value.value, open, side });
    }
  }
  return { kind: "piecewise", endpoints, samplerVersion: GRAPH2D_SAMPLER_VERSION, segments, samplesEvaluated, converged,
    diagnostics: [...diagnostics].sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => ({ code, count })) };
};
