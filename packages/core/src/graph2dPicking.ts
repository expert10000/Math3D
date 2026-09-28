import { evaluateGraph2DExpression } from "./graph2dExpression";
import { evaluateGraph2DParametric } from "./graph2dParametric";
import { evaluateGraph2DPolar } from "./graph2dPolar";
import { evaluateGraph2DPiecewise } from "./graph2dPiecewise";
import type { Graph2DDocument, Graph2DSelection } from "./graph2dDocument";
import type { Graph2DSamplePoint, Graph2DSamplingArtifact } from "./graph2dSampling";
import { graph2DScreenToWorld, graph2DWorldToScreen, type Graph2DScreenPoint, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";

export type Graph2DPickSeries = Readonly<{ objectId: string; artifact: Graph2DSamplingArtifact }>;
export type Graph2DPick = Readonly<{ selection: Graph2DSelection; distancePx: number }>;
const empty: Graph2DSelection = { objectId: null, probe: null };

/** Search only segments close to the pointer's x coordinate, then refine on the exact expression. */
export const pickGraph2DProbe = (input: Readonly<{
  document: Graph2DDocument;
  series: readonly Graph2DPickSeries[];
  viewport: Graph2DViewport;
  size: Graph2DScreenSize;
  screen: Graph2DScreenPoint;
  previous?: Graph2DSelection;
  radiusPx?: number;
}>): Graph2DPick => {
  const radius = input.radiusPx ?? 12;
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100 || !Number.isFinite(input.screen.x) || !Number.isFinite(input.screen.y))
    throw new TypeError("Invalid Graph2D picking request.");
  const left = graph2DScreenToWorld(input.viewport, input.size, { x: input.screen.x - radius, y: input.screen.y }).x;
  const right = graph2DScreenToWorld(input.viewport, input.size, { x: input.screen.x + radius, y: input.screen.y }).x;
  const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
  const artifacts = new Map(input.series.map((entry) => [entry.objectId, entry.artifact]));
  const candidates: { objectId: string; x: number; y: number; parameter?: number; rowId?: string;
    distancePx: number; order: number }[] = [];
  input.document.source.objects.forEach((object, order) => {
    if (!input.document.display.objects[order]?.visible) return;
    const artifact = artifacts.get(object.id);
    if (!artifact) return;
    if (object.kind === "point-series") {
      for (const segment of artifact.segments) for (const point of segment.points) {
        if (!point.rowId) continue;
        const screen = graph2DWorldToScreen(input.viewport, input.size, point);
        const distancePx = Math.hypot(screen.x - input.screen.x, screen.y - input.screen.y);
        if (distancePx <= radius) candidates.push({ objectId: object.id, x: point.x, y: point.y,
          rowId: point.rowId, distancePx, order });
      }
      return;
    }
    if (object.kind === "implicit" || object.kind === "inequality") {
      for (const segment of artifact.segments) for (let index = 0; index < segment.points.length - 1; index += 1) {
        const a = segment.points[index]!, b = segment.points[index + 1]!;
        const sa = graph2DWorldToScreen(input.viewport, input.size, a);
        const sb = graph2DWorldToScreen(input.viewport, input.size, b);
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const fraction = dx * dx + dy * dy > 0 ? Math.max(0, Math.min(1,
          ((input.screen.x - sa.x) * dx + (input.screen.y - sa.y) * dy) / (dx * dx + dy * dy))) : 0;
        const distancePx = Math.hypot(sa.x + fraction * dx - input.screen.x, sa.y + fraction * dy - input.screen.y);
        if (distancePx <= radius) candidates.push({ objectId: object.id,
          x: a.x + fraction * (b.x - a.x), y: a.y + fraction * (b.y - a.y), distancePx, order });
      }
      return;
    }
    if (object.kind === "parametric" || object.kind === "polar") {
      const evaluate = (parameter: number) => {
        const point = object.kind === "parametric" ? evaluateGraph2DParametric(object, variables, parameter) :
          evaluateGraph2DPolar(object, variables, parameter);
        if (!point) return null;
        const screen = graph2DWorldToScreen(input.viewport, input.size, point);
        return { ...point, distancePx: Math.hypot(screen.x - input.screen.x, screen.y - input.screen.y) };
      };
      const branchCandidates: typeof candidates = [];
      for (const segment of artifact.segments) for (let index = 0; index < segment.points.length - 1; index += 1) {
        const a = segment.points[index]!, b = segment.points[index + 1]!;
        if (a.parameter === undefined || b.parameter === undefined) continue;
        const sa = graph2DWorldToScreen(input.viewport, input.size, a);
        const sb = graph2DWorldToScreen(input.viewport, input.size, b);
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const projection = dx * dx + dy * dy > 0 ? Math.max(0, Math.min(1,
          ((input.screen.x - sa.x) * dx + (input.screen.y - sa.y) * dy) / (dx * dx + dy * dy))) : 0;
        if (Math.hypot(sa.x + projection * dx - input.screen.x,
          sa.y + projection * dy - input.screen.y) > radius + 2) continue;
        let min = a.parameter, max = b.parameter;
        for (let step = 0; step < 10; step += 1) {
          const p1 = min + (max - min) / 3, p2 = max - (max - min) / 3;
          const d1 = evaluate(p1)?.distancePx ?? Infinity, d2 = evaluate(p2)?.distancePx ?? Infinity;
          if (d1 <= d2) max = p2; else min = p1;
        }
        const best = evaluate((min + max) / 2);
        if (best && best.distancePx <= radius) branchCandidates.push({ ...best, objectId: object.id, order });
      }
      branchCandidates.sort((a, b) => a.distancePx - b.distancePx);
      const separation = (object.domain.max - object.domain.min) / 128;
      for (const candidate of branchCandidates) {
        if (!candidates.some((entry) => entry.objectId === object.id && entry.parameter !== undefined &&
          Math.abs(entry.parameter - candidate.parameter!) < separation)) candidates.push(candidate);
      }
      return;
    }
    let best = { x: 0, y: 0, distancePx: Number.POSITIVE_INFINITY };
    const evaluate = (x: number) => {
      const point = object.kind === "piecewise" ? evaluateGraph2DPiecewise(object, variables, x) : (() => {
        if ((x <= object.domain.min && !object.domain.includeMin) || (x >= object.domain.max && !object.domain.includeMax)) return null;
        const result = evaluateGraph2DExpression(object.expression.ast, { ...variables, x });
        return result.ok ? { x, y: result.value } : null;
      })();
      if (!point) return null;
      const screen = graph2DWorldToScreen(input.viewport, input.size, point);
      const distancePx = Math.hypot(screen.x - input.screen.x, screen.y - input.screen.y);
      return Number.isFinite(distancePx) ? { ...point, distancePx } : null;
    };
    const consider = (x: number) => {
      const point = evaluate(x);
      if (point && point.distancePx < best.distancePx) best = point;
    };
    for (const segment of artifact.segments) {
      const points = segment.points;
      if (points.length < 2 || points[0]!.x > right || points.at(-1)!.x < left) continue;
      let lo = 0, hi = points.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid]!.x < left) lo = mid + 1; else hi = mid; }
      const start = Math.max(0, lo - 1);
      for (let i = start; i < points.length - 1 && points[i]!.x <= right; i += 1) {
        const a = points[i]!, b = points[i + 1]!;
        if (b.x < left) continue;
        const sa = graph2DWorldToScreen(input.viewport, input.size, a);
        const sb = graph2DWorldToScreen(input.viewport, input.size, b);
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const projection = dx * dx + dy * dy > 0 ? Math.max(0, Math.min(1,
          ((input.screen.x - sa.x) * dx + (input.screen.y - sa.y) * dy) / (dx * dx + dy * dy))) : 0;
        const px = sa.x + projection * dx, py = sa.y + projection * dy;
        if (Math.hypot(px - input.screen.x, py - input.screen.y) > radius + 2) continue;
        const at = a.x + projection * (b.x - a.x);
        consider(at);
        // Fixed bounded refinement of the actual curve near the sampled segment.
        let min = a.x, max = b.x;
        for (let step = 0; step < 8; step += 1) {
          const x1 = min + (max - min) / 3, x2 = max - (max - min) / 3;
          const d1 = evaluate(x1)?.distancePx ?? Number.POSITIVE_INFINITY;
          const d2 = evaluate(x2)?.distancePx ?? Number.POSITIVE_INFINITY;
          if (d1 <= d2) max = x2; else min = x1;
        }
        consider((min + max) / 2);
      }
    }
    if (best.distancePx <= radius) candidates.push({ ...best, objectId: object.id, order });
  });
  if (!candidates.length) return { selection: empty, distancePx: Number.POSITIVE_INFINITY };
  candidates.sort((a, b) => a.distancePx - b.distancePx || a.order - b.order);
  const overlapping = candidates.filter((entry) => entry.distancePx <= candidates[0]!.distancePx + 3);
  let winner = overlapping[0]!;
  if (input.previous?.objectId && input.previous.probe && overlapping.length > 1) {
    const previousScreen = graph2DWorldToScreen(input.viewport, input.size, input.previous.probe);
    if (Math.hypot(previousScreen.x - input.screen.x, previousScreen.y - input.screen.y) <= radius) {
      const previousIndex = overlapping.findIndex((entry) => entry.objectId === input.previous!.objectId &&
        (entry.rowId !== undefined ? entry.rowId === input.previous!.probe?.rowId :
          entry.parameter === undefined && input.previous!.probe?.parameter === undefined ||
          entry.parameter !== undefined && input.previous!.probe?.parameter !== undefined &&
          Math.abs(entry.parameter - input.previous!.probe!.parameter!) <=
            (() => { const found = input.document.source.objects.find((object) => object.id === entry.objectId)!;
              const domain = found.kind === "piecewise" ? { min: found.pieces[0]!.domain.min, max: found.pieces.at(-1)!.domain.max } : found.domain;
              return (domain.max - domain.min) / 128; })()));
      if (previousIndex >= 0) winner = overlapping[(previousIndex + 1) % overlapping.length]!;
    }
  }
  return { selection: { objectId: winner.objectId, probe: { objectId: winner.objectId,
    x: winner.x, y: winner.y, ...(winner.parameter === undefined ? {} : { parameter: winner.parameter }),
    ...(winner.rowId === undefined ? {} : { rowId: winner.rowId }) } },
    distancePx: winner.distancePx };
};

/** A stable mathematical probe for list and keyboard selection. */
export const selectionForGraph2DObject = (
  document: Graph2DDocument, series: readonly Graph2DPickSeries[], objectId: string, preferredX?: number,
): Graph2DSelection => {
  const object = document.source.objects.find((entry) => entry.id === objectId);
  if (!object) return empty;
  const artifact = series.find((entry) => entry.objectId === objectId)?.artifact;
  const segments = artifact?.segments.filter((entry) => entry.points.length > 0) ?? [];
  if (!segments.length) return { objectId, probe: null };
  const target = Number.isFinite(preferredX) ? preferredX! : (document.display.viewport.xMin + document.display.viewport.xMax) / 2;
  if (object.kind === "parametric" || object.kind === "polar") {
    const points = segments.flatMap((segment) => segment.points).filter((point) => point.parameter !== undefined);
    const nearest = points.reduce<Graph2DSamplePoint | null>((best, point) => !best ||
      Math.abs(point.x - target) < Math.abs(best.x - target) ? point : best, null);
    if (!nearest || nearest.parameter === undefined) return { objectId, probe: null };
    const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
    const exact = object.kind === "parametric" ? evaluateGraph2DParametric(object, variables, nearest.parameter) :
      evaluateGraph2DPolar(object, variables, nearest.parameter);
    return { objectId, probe: exact ? { objectId, x: exact.x, y: exact.y, parameter: nearest.parameter } : null };
  }
  if (object.kind === "point-series") {
    const point = segments.flatMap((segment) => segment.points).reduce<Graph2DSamplePoint | null>((best, candidate) =>
      !best || Math.abs(candidate.x - target) < Math.abs(best.x - target) ? candidate : best, null);
    return { objectId, probe: point?.rowId ? { objectId, x: point.x, y: point.y, rowId: point.rowId } : null };
  }
  if (object.kind === "implicit" || object.kind === "inequality") {
    const point = segments.flatMap((segment) => segment.points).reduce<Graph2DSamplePoint | null>((best, candidate) =>
      !best || Math.abs(candidate.x - target) < Math.abs(best.x - target) ? candidate : best, null);
    return { objectId, probe: point ? { objectId, x: point.x, y: point.y } : null };
  }
  const included = (candidate: Graph2DSamplePoint) => object.kind === "piecewise" ?
    evaluateGraph2DPiecewise(object, Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value])), candidate.x) !== null :
    (candidate.x > object.domain.min || object.domain.includeMin) &&
    (candidate.x < object.domain.max || object.domain.includeMax);
  let point: Graph2DSamplePoint | null = null;
  for (const segment of segments) {
    point = segment.points.find(included) ?? null;
    if (point) break;
  }
  if (!point) return { objectId, probe: null };
  let distance = Math.abs(point.x - target);
  for (const segment of segments) {
    const points = segment.points;
    let lo = 0, hi = points.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid]!.x < target) lo = mid + 1; else hi = mid; }
    for (const index of [Math.max(0, lo - 1), Math.min(points.length - 1, lo)]) {
      const candidate = points[index]!;
      if (included(candidate) && Math.abs(candidate.x - target) < distance) { point = candidate; distance = Math.abs(candidate.x - target); }
    }
  }
  const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
  if (object.kind === "piecewise") {
    const exact = evaluateGraph2DPiecewise(object, variables, point.x);
    return { objectId, probe: exact ? { objectId, x: exact.x, y: exact.y } : null };
  }
  const exact = evaluateGraph2DExpression(object.expression.ast, { ...variables, x: point.x });
  return { objectId, probe: { objectId, x: point.x, y: exact.ok ? exact.value : point.y } };
};
