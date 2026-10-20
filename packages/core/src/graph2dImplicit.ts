import type { Graph2DDisplay, Graph2DImplicitObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { graph2DAxisCoordinate, graph2DAxisValue } from "./graph2dViewport";
import { graph2DExpressionInterval } from "./graph2dInterval";
import { GRAPH2D_MAX_SEGMENTS, GRAPH2D_SAMPLER_VERSION, type Graph2DSamplePoint,
  type Graph2DSampleSegment, type Graph2DSamplingArtifact, type Graph2DSamplingDiagnostic } from "./graph2dSampling";

export type Graph2DContourArtifact = Graph2DSamplingArtifact & Readonly<{
  kind: "implicit-contour";
  cellsVisited: number;
  refinedCells: number;
  ambiguousCells: number;
  unresolvedCells: number;
  resolutionPx: number;
  zeroCandidates: readonly Graph2DSamplePoint[];
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
    converged: true, diagnostics, cellsVisited: 0, refinedCells: 0, ambiguousCells: 0,
    unresolvedCells: 0, resolutionPx: 0, zeroCandidates: [] });
  if (xMin >= xMax || yMin >= yMax) return empty([{ code: "empty-domain", count: 1 }]);
  const sx = (v: number) => graph2DAxisCoordinate(v, viewport.xScale), sy = (v: number) => graph2DAxisCoordinate(v, viewport.yScale);
  const visibleWidth = request.width * (sx(xMax) - sx(xMin)) / (sx(viewport.xMax) - sx(viewport.xMin));
  const visibleHeight = request.height * (sy(yMax) - sy(yMin)) / (sy(viewport.yMax) - sy(viewport.yMin));
  const target = Math.max(3, Math.min(12, policy.tolerancePx * 8));
  let nx = Math.max(4, Math.ceil(visibleWidth / target));
  let ny = Math.max(4, Math.ceil(visibleHeight / target));
  // Reserve evaluations for cells where interval screening cannot rule out hidden zeros.
  const scale = Math.min(1, Math.sqrt((policy.maxSamples * 0.48) / ((nx + 1) * (ny + 1))));
  nx = Math.max(4, Math.floor(nx * scale)); ny = Math.max(4, Math.floor(ny * scale));
  const counts = new Map<Graph2DSamplingDiagnostic["code"], number>();
  const note = (code: Graph2DSamplingDiagnostic["code"]) => counts.set(code, (counts.get(code) ?? 0) + 1);
  const values: (number | null)[] = new Array((nx + 1) * (ny + 1));
  const cache = new Map<string, number | null>();
  let samplesEvaluated = 0;
  let ended = false;
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const x = (i: number) => graph2DAxisValue(sx(xMin) + (sx(xMax) - sx(xMin)) * i / nx, viewport.xScale);
  const y = (j: number) => graph2DAxisValue(sy(yMin) + (sy(yMax) - sy(yMin)) * j / ny, viewport.yScale);
  const evaluate = (px: number, py: number): number | null => {
    const key = `${px.toPrecision(15)}:${py.toPrecision(15)}`;
    if (cache.has(key)) return cache.get(key)!;
    if (samplesEvaluated >= policy.maxSamples) { note("sample-limit"); ended = true; return null; }
    if (request.deadlineMs !== undefined && Date.now() > request.deadlineMs) { note("deadline"); ended = true; return null; }
    samplesEvaluated += 1;
    const result = evaluateGraph2DExpression(object.expression.ast, { ...request.variables, x: px, y: py },
      { deadlineMs: request.deadlineMs });
    if (!result.ok || !Number.isFinite(result.value)) { note("invalid-sample"); cache.set(key, null); return null; }
    cache.set(key, result.value);
    return result.value;
  };
  for (let j = 0; j <= ny && !ended; j += 1) for (let i = 0; i <= nx && !ended; i += 1)
    values[at(i, j)] = evaluate(x(i), y(j));
  if (ended) return { ...empty([...counts].map(([code, count]) => ({ code, count }))),
    samplesEvaluated, converged: false };

  type Edge = Readonly<{ a: string; b: string }>;
  const edges: Edge[] = [];
  const points = new Map<string, Graph2DSamplePoint>();
  let unresolvedCells = 0, refinedCells = 0, ambiguousCells = 0, resolutionPx = 0;
  const zeroCandidates = new Map<string, Graph2DSamplePoint>();
  const add = (a: string, b: string) => {
    if (edges.length >= GRAPH2D_MAX_SEGMENTS) { note("segment-limit"); ended = true; return; }
    edges.push({ a, b });
  };
  let cellsVisited = 0;
  const coordinateKey = (value: number) => value.toPrecision(14);
  const traceCell = (x0: number, x1: number, y0: number, y1: number,
    v: readonly (number | null)[], depth: number): void => {
    cellsVisited += 1;
    if (v.some(entry => entry === null)) { unresolvedCells += 1; note("unresolved-cell"); return; }
    const numbers = v as readonly number[];
    const signs = numbers.map(entry => entry >= 0);
    const crossings = [0, 1, 2, 3].filter(edge => signs[edge] !== signs[(edge + 1) % 4]);
    const cellWidthPx = request.width * (sx(x1) - sx(x0)) / (sx(viewport.xMax) - sx(viewport.xMin));
    const cellHeightPx = request.height * (sy(y1) - sy(y0)) / (sy(viewport.yMax) - sy(viewport.yMin));
    if (!crossings.length) {
      const interval = graph2DExpressionInterval(object.expression.ast, [x0, x1], [y0, y1], request.variables);
      if (interval && (interval[0] > 0 || interval[1] < 0)) return;
      // A same-sign cell may contain a small loop or a tangency. Subdivide only that cell.
      const candidate = interval !== null || Math.min(...numbers.map(Math.abs)) <
        0.15 * Math.max(...numbers.map(Math.abs));
      if (!candidate) return;
      if (!ended && depth < Math.min(policy.maxDepth, 3) && Math.max(cellWidthPx, cellHeightPx) > policy.tolerancePx) {
        const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        const bottom = evaluate(xm, y0), right = evaluate(x1, ym), center = evaluate(xm, ym);
        const top = evaluate(xm, y1), left = evaluate(x0, ym);
        if (!ended) {
          refinedCells += 1;
          traceCell(x0, xm, y0, ym, [numbers[0]!, bottom, center, left], depth + 1);
          traceCell(xm, x1, y0, ym, [bottom, numbers[1]!, right, center], depth + 1);
          traceCell(xm, x1, ym, y1, [center, right, numbers[2]!, top], depth + 1);
          traceCell(x0, xm, ym, y1, [left, center, top, numbers[3]!], depth + 1);
          return;
        }
      }
      for (const [index, value] of numbers.entries()) if (value === 0) {
        const px = index === 0 || index === 3 ? x0 : x1;
        const py = index < 2 ? y0 : y1;
        zeroCandidates.set(`${coordinateKey(px)}:${coordinateKey(py)}`, { x: px, y: py });
      }
      unresolvedCells += 1; note("unresolved-cell");
      return;
    }
    resolutionPx = Math.max(resolutionPx, Math.hypot(cellWidthPx, cellHeightPx));
    const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const edgeId = (edge: number) => {
      const a = corners[edge]!, b = corners[(edge + 1) % 4]!;
      return a.y === b.y ? `h:${coordinateKey(Math.min(a.x, b.x))}:${coordinateKey(Math.max(a.x, b.x))}:${coordinateKey(a.y)}` :
        `v:${coordinateKey(a.x)}:${coordinateKey(Math.min(a.y, b.y))}:${coordinateKey(Math.max(a.y, b.y))}`;
    };
    const pointOn = (edge: number): string => {
      const id = edgeId(edge);
      if (!points.has(id)) {
        const a = edge, b = (edge + 1) % 4;
        const va = numbers[a]!, vb = numbers[b]!;
        const t = va === vb ? 0.5 : Math.max(0, Math.min(1, va / (va - vb)));
        points.set(id, { x: corners[a]!.x + t * (corners[b]!.x - corners[a]!.x),
          y: corners[a]!.y + t * (corners[b]!.y - corners[a]!.y) });
      }
      return id;
    };
    if (crossings.length === 2) { add(pointOn(crossings[0]!), pointOn(crossings[1]!)); return; }
    if (crossings.length === 4) {
      ambiguousCells += 1; note("ambiguous-cell");
      // The bilinear asymptotic decider is stable when the determinant is separated from zero.
      const determinant = numbers[0]! * numbers[2]! - numbers[1]! * numbers[3]!;
      const scale = Math.max(1, ...numbers.map(Math.abs));
      let centerPositive: boolean | null = Math.abs(determinant) > 1e-12 * scale * scale ?
        (determinant > 0) === signs[0] : null;
      if (centerPositive === null) {
        const center = evaluate((x0 + x1) / 2, (y0 + y1) / 2);
        if (center !== null && Math.abs(center) > 1e-12 * scale) centerPositive = center >= 0;
      }
      if (centerPositive === null) { unresolvedCells += 1; note("unresolved-cell"); return; }
      for (let corner = 0; corner < 4; corner += 1) if (signs[corner] !== centerPositive)
        add(pointOn((corner + 3) % 4), pointOn(corner));
      return;
    }
    unresolvedCells += 1; note("unresolved-cell");
  };
  for (let j = 0; j < ny && !ended; j += 1) for (let i = 0; i < nx && !ended; i += 1)
    traceCell(x(i), x(i + 1), y(j), y(j + 1),
      [values[at(i, j)] ?? null, values[at(i + 1, j)] ?? null,
        values[at(i + 1, j + 1)] ?? null, values[at(i, j + 1)] ?? null], 0);
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
    samplesEvaluated, converged: !ended && unresolvedCells === 0, diagnostics, cellsVisited,
    refinedCells, ambiguousCells, unresolvedCells, resolutionPx, zeroCandidates: [...zeroCandidates.values()] };
};
