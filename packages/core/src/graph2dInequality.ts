import type { Graph2DDisplay, Graph2DInequalityClause, Graph2DInequalityObject,
  Graph2DImplicitObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { sampleGraph2DImplicit } from "./graph2dImplicit";
import { GRAPH2D_SAMPLER_VERSION, type Graph2DSampleSegment,
  type Graph2DSamplingArtifact, type Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DRegionFill = Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>;
export type Graph2DRegionArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "inequality-region";
  state: "resolved" | "unresolved" | "complexity-limit";
  fills: readonly Graph2DRegionFill[];
  boundaries: readonly Readonly<{ strict: boolean; segments: readonly Graph2DSampleSegment[] }>[];
}>;
export type Graph2DRegionRequest = Readonly<{
  object: Graph2DInequalityObject;
  variables?: Readonly<Record<string, number>>;
  viewport: Graph2DDisplay["viewport"];
  width: number;
  height: number;
  policy: Graph2DDisplay["sampling"];
  deadlineMs?: number;
}>;

const holds = (value: number, comparator: Graph2DInequalityClause["comparator"]): boolean =>
  comparator === "<" ? value < 0 : comparator === "<=" ? value <= 0 :
    comparator === ">" ? value > 0 : value >= 0;

/** Evaluate the source predicates. Null means the region is unresolved at this point. */
export const evaluateGraph2DRegion = (object: Graph2DInequalityObject,
  variables: Readonly<Record<string, number>>, x: number, y: number,
  skipClause = -1): boolean | null => {
  const values: (boolean | null)[] = [];
  for (let index = 0; index < object.clauses.length; index += 1) {
    if (index === skipClause) continue;
    const clause = object.clauses[index]!;
    const result = evaluateGraph2DExpression(clause.ast, { ...variables, x, y });
    values.push(result.ok ? holds(result.value, clause.comparator) : null);
  }
  if (object.operator === "all") return values.includes(false) ? false : values.includes(null) ? null : true;
  return values.includes(true) ? true : values.includes(null) ? null : false;
};

/** Region fill and visible boundary are derived artifacts; no sampled cells enter the document. */
export const sampleGraph2DInequality = (request: Graph2DRegionRequest): Graph2DRegionArtifact => {
  const { object, viewport, policy } = request;
  const xMin = Math.max(object.domain.min, viewport.xMin), xMax = Math.min(object.domain.max, viewport.xMax);
  const yMin = Math.max(object.yDomain.min, viewport.yMin), yMax = Math.min(object.yDomain.max, viewport.yMax);
  const counts = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const note = (code: Graph2DSamplingDiagnostic["code"], count = 1) => counts.set(code, (counts.get(code) ?? 0) + count);
  const result = (fills: Graph2DRegionFill[], boundaries: Graph2DRegionArtifact["boundaries"],
    samplesEvaluated: number, state: Graph2DRegionArtifact["state"]): Graph2DRegionArtifact => ({
    kind: "inequality-region", samplerVersion: GRAPH2D_SAMPLER_VERSION, fills, boundaries,
    segments: boundaries.flatMap((entry) => entry.segments), samplesEvaluated,
    converged: state === "resolved", state,
    diagnostics: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count })),
  });
  if (xMin >= xMax || yMin >= yMax) { note("empty-domain"); return result([], [], 0, "resolved"); }
  if (object.clauses.length * 96 > policy.maxSamples) { note("sample-limit"); return result([], [], 0, "complexity-limit"); }
  const fillBudget = Math.floor(policy.maxSamples * 0.35);
  const xPixels = request.width * (xMax - xMin) / (viewport.xMax - viewport.xMin);
  const yPixels = request.height * (yMax - yMin) / (viewport.yMax - viewport.yMin);
  const target = Math.max(5, policy.tolerancePx * 10);
  let nx = Math.max(4, Math.ceil(xPixels / target)), ny = Math.max(4, Math.ceil(yPixels / target));
  const scale = Math.min(1, Math.sqrt(fillBudget / (nx * ny * object.clauses.length)));
  nx = Math.max(4, Math.floor(nx * scale)); ny = Math.max(4, Math.floor(ny * scale));
  const variables = request.variables ?? {};
  const fills: Graph2DRegionFill[] = [];
  let samplesEvaluated = 0, unresolved = false, limited = false;
  for (let j = 0; j < ny && !limited; j += 1) {
    let runStart = -1;
    const flush = (end: number) => {
      if (runStart < 0) return;
      fills.push({ xMin: xMin + (xMax - xMin) * runStart / nx, xMax: xMin + (xMax - xMin) * end / nx,
        yMin: yMin + (yMax - yMin) * j / ny, yMax: yMin + (yMax - yMin) * (j + 1) / ny });
      runStart = -1;
    };
    for (let i = 0; i < nx; i += 1) {
      if (samplesEvaluated + object.clauses.length > fillBudget ||
          request.deadlineMs !== undefined && Date.now() > request.deadlineMs) {
        note("sample-limit"); limited = true; flush(i); break;
      }
      const cx = xMin + (xMax - xMin) * (i + 0.5) / nx;
      const cy = yMin + (yMax - yMin) * (j + 0.5) / ny;
      samplesEvaluated += object.clauses.length;
      const inside = evaluateGraph2DRegion(object, variables, cx, cy);
      if (inside === null) { unresolved = true; note("unresolved-cell"); }
      if (inside && runStart < 0) runStart = i;
      if (!inside) flush(i);
    }
    flush(nx);
  }
  const remaining = Math.max(0, policy.maxSamples - samplesEvaluated);
  const perClause = Math.floor(remaining * 0.5 / object.clauses.length);
  if (perClause < 32) { note("sample-limit"); return result(fills, [], samplesEvaluated, "complexity-limit"); }
  const boundaries: { strict: boolean; segments: Graph2DSampleSegment[] }[] = [];
  for (let clauseIndex = 0; clauseIndex < object.clauses.length; clauseIndex += 1) {
    const clause = object.clauses[clauseIndex]!;
    const contourObject: Graph2DImplicitObject = { id: object.id, kind: "implicit", label: object.label,
      expression: { source: clause.source, variable: "xy", ast: clause.ast },
      domain: object.domain, yDomain: object.yDomain };
    const contour = sampleGraph2DImplicit({ ...request, object: contourObject,
      policy: { ...policy, maxSamples: Math.min(200000, perClause) } });
    samplesEvaluated += contour.samplesEvaluated;
    for (const diagnostic of contour.diagnostics) note(diagnostic.code, diagnostic.count);
    if (!contour.converged) unresolved = true;
    const segments: Graph2DSampleSegment[] = [];
    for (const segment of contour.segments) {
      let chain: Graph2DSampleSegment["points"][number][] = [];
      const flush = () => { if (chain.length >= 2) segments.push({ points: chain, openStart: false, openEnd: false }); chain = []; };
      for (let index = 0; index < segment.points.length - 1; index += 1) {
        const a = segment.points[index]!, b = segment.points[index + 1]!;
        if (samplesEvaluated + object.clauses.length - 1 > policy.maxSamples) {
          limited = true; note("sample-limit"); flush(); break;
        }
        samplesEvaluated += object.clauses.length - 1;
        const other = evaluateGraph2DRegion(object, variables, (a.x + b.x) / 2, (a.y + b.y) / 2, clauseIndex);
        // AND shows the boundary within every other condition; OR hides it inside another region.
        const visible = object.clauses.length === 1 ||
          other !== null && (object.operator === "all" ? other : !other);
        if (other === null) { unresolved = true; note("unresolved-cell"); }
        if (visible) { if (!chain.length) chain.push(a); chain.push(b); } else flush();
      }
      flush();
      if (limited) break;
    }
    boundaries.push({ strict: clause.comparator === "<" || clause.comparator === ">", segments });
    if (limited) break;
  }
  return result(fills, boundaries, samplesEvaluated, limited ? "complexity-limit" : unresolved ? "unresolved" : "resolved");
};
