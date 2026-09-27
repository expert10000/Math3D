import type { Graph2DDisplay, Graph2DImplicitObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { GRAPH2D_MAX_SEGMENTS, GRAPH2D_SAMPLER_VERSION, type Graph2DSamplePoint,
  type Graph2DSampleSegment, type Graph2DSamplingArtifact, type Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DContourArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "implicit-contour";
  cellsVisited: number;
  unresolvedCells: number;
}>;
export type Graph2DContourRequest = Readonly<{
  object: Graph2DImplicitObject;
  variables?: Readonly<Record<string, number>>;
  viewport: Graph2DDisplay["viewport"];
  width: number;
  height: number;
  policy: Graph2DDisplay["sampling"];
  deadlineMs?: number;
}>;

/** Bounded screen-adaptive marching squares. Edge identities stitch cells without joining branches at crossings. */
export const sampleGraph2DImplicit = (request: Graph2DContourRequest): Graph2DContourArtifact => {
  const { object, viewport, policy } = request;
  if (!Number.isFinite(request.width) || request.width <= 0 || !Number.isFinite(request.height) || request.height <= 0 ||
      !Number.isSafeInteger(policy.maxSamples) || policy.maxSamples < 32 || policy.maxSamples > 200000 ||
      !Number.isFinite(policy.tolerancePx) || policy.tolerancePx < 0.1 || policy.tolerancePx > 16)
    throw new TypeError("Invalid implicit contour request.");
  const xMin = Math.max(object.domain.min, viewport.xMin), xMax = Math.min(object.domain.max, viewport.xMax);
  const yMin = Math.max(object.yDomain.min, viewport.yMin), yMax = Math.min(object.yDomain.max, viewport.yMax);
  const empty = (diagnostics: Graph2DSamplingDiagnostic[]): Graph2DContourArtifact => ({
    kind: "implicit-contour", samplerVersion: GRAPH2D_SAMPLER_VERSION, segments: [], samplesEvaluated: 0,
    converged: true, diagnostics, cellsVisited: 0, unresolvedCells: 0 });
  if (xMin >= xMax || yMin >= yMax) return empty([{ code: "empty-domain", count: 1 }]);
  const visibleWidth = request.width * (xMax - xMin) / (viewport.xMax - viewport.xMin);
  const visibleHeight = request.height * (yMax - yMin) / (viewport.yMax - viewport.yMin);
  const target = Math.max(3, Math.min(12, policy.tolerancePx * 8));
  let nx = Math.max(4, Math.ceil(visibleWidth / target));
  let ny = Math.max(4, Math.ceil(visibleHeight / target));
  const scale = Math.min(1, Math.sqrt((policy.maxSamples * 0.85) / ((nx + 1) * (ny + 1))));
  nx = Math.max(4, Math.floor(nx * scale)); ny = Math.max(4, Math.floor(ny * scale));
  const counts = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const note = (code: Graph2DSamplingDiagnostic["code"]) => counts.set(code, (counts.get(code) ?? 0) + 1);
  const values: (number | null)[] = new Array((nx + 1) * (ny + 1));
  let samplesEvaluated = 0;
  let ended = false;
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const x = (i: number) => xMin + (xMax - xMin) * i / nx;
  const y = (j: number) => yMin + (yMax - yMin) * j / ny;
  const evaluate = (px: number, py: number): number | null => {
    if (samplesEvaluated >= policy.maxSamples) { note("sample-limit"); ended = true; return null; }
    if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) { note("deadline"); ended = true; return null; }
    samplesEvaluated += 1;
    const result = evaluateGraph2DExpression(object.expression.ast, { ...request.variables, x: px, y: py },
      { deadlineMs: request.deadlineMs });
    if (!result.ok || !Number.isFinite(result.value)) { note("invalid-sample"); return null; }
    return result.value;
  };
  for (let j = 0; j <= ny && !ended; j += 1) for (let i = 0; i <= nx && !ended; i += 1)
    values[at(i, j)] = evaluate(x(i), y(j));
  if (ended) return { ...empty([...counts].map(([code, count]) => ({ code, count }))),
    samplesEvaluated, converged: false };

  type Edge = Readonly<{ a: string; b: string }>;
  const edges: Edge[] = [];
  const points = new Map<string, Graph2DSamplePoint>();
  let unresolvedCells = 0;
  const add = (a: string, b: string) => {
    if (edges.length >= GRAPH2D_MAX_SEGMENTS) { note("segment-limit"); ended = true; return; }
    edges.push({ a, b });
  };
  for (let j = 0; j < ny && !ended; j += 1) for (let i = 0; i < nx && !ended; i += 1) {
    const v = [values[at(i, j)], values[at(i + 1, j)], values[at(i + 1, j + 1)], values[at(i, j + 1)]];
    if (v.some((entry) => entry === null)) { unresolvedCells += 1; note("unresolved-cell"); continue; }
    const signs = v.map((entry) => (entry as number) >= 0);
    const crossings = [0, 1, 2, 3].filter((edge) => signs[edge] !== signs[(edge + 1) % 4]);
    if (!crossings.length) continue;
    const corners = [{ x: x(i), y: y(j) }, { x: x(i + 1), y: y(j) },
      { x: x(i + 1), y: y(j + 1) }, { x: x(i), y: y(j + 1) }];
    const edgeId = (edge: number) => edge === 0 ? `h:${i}:${j}` : edge === 1 ? `v:${i + 1}:${j}` :
      edge === 2 ? `h:${i}:${j + 1}` : `v:${i}:${j}`;
    const pointOn = (edge: number): string => {
      const id = edgeId(edge);
      if (!points.has(id)) {
        const a = edge, b = (edge + 1) % 4;
        const va = v[a] as number, vb = v[b] as number;
        const t = va === vb ? 0.5 : Math.max(0, Math.min(1, va / (va - vb)));
        points.set(id, { x: corners[a]!.x + t * (corners[b]!.x - corners[a]!.x),
          y: corners[a]!.y + t * (corners[b]!.y - corners[a]!.y) });
      }
      return id;
    };
    if (crossings.length === 2) add(pointOn(crossings[0]!), pointOn(crossings[1]!));
    else if (crossings.length === 4) {
      note("ambiguous-cell");
      const center = evaluate((x(i) + x(i + 1)) / 2, (y(j) + y(j + 1)) / 2);
      if (center === null || Math.abs(center) <= 1e-12 * Math.max(1, ...v.map((entry) => Math.abs(entry as number)))) {
        unresolvedCells += 1; note("unresolved-cell"); continue;
      }
      // Connect edges around the two corners whose sign differs from the center.
      for (let corner = 0; corner < 4; corner += 1) if (signs[corner] !== (center >= 0))
        add(pointOn((corner + 3) % 4), pointOn(corner));
    } else { unresolvedCells += 1; note("unresolved-cell"); }
  }
  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const key of [edge.a, edge.b]) adjacency.set(key, [...(adjacency.get(key) ?? []), index]);
  });
  const used = new Set<number>();
  const segments: Graph2DSampleSegment[] = [];
  const walk = (start: string, first: number) => {
    const chain: Graph2DSamplePoint[] = [points.get(start)!];
    let node = start, edgeIndex: number | undefined = first;
    while (edgeIndex !== undefined && !used.has(edgeIndex)) {
      used.add(edgeIndex);
      const edge = edges[edgeIndex]!;
      node = edge.a === node ? edge.b : edge.a;
      chain.push(points.get(node)!);
      edgeIndex = (adjacency.get(node) ?? []).find((index) => !used.has(index));
      if (chain.length > GRAPH2D_MAX_SEGMENTS + 1) break;
    }
    if (chain.length >= 2) segments.push({ points: chain, openStart: false, openEnd: false });
  };
  for (const [node, indices] of adjacency) if (indices.length !== 2)
    for (const index of indices) if (!used.has(index)) walk(node, index);
  edges.forEach((edge, index) => { if (!used.has(index)) walk(edge.a, index); });
  const diagnostics = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, count }));
  return { kind: "implicit-contour", samplerVersion: GRAPH2D_SAMPLER_VERSION, segments,
    samplesEvaluated, converged: !ended && unresolvedCells === 0, diagnostics, cellsVisited: nx * ny, unresolvedCells };
};
