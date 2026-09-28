import { graph2DWorldToScreen, resolveGraph2DViewport, type Graph2DViewport,
  type Graph2DScreenSize, type Graph2DScreenPoint, type Graph2DSampledSeries } from "@math3d/core";

export type MobileGraphLine = { a: Graph2DScreenPoint; b: Graph2DScreenPoint; color: string; width: number };

/** Clip before creating native Views so poles/offscreen spans cannot create huge native layouts. */
export const clipMobileGraphLine = (a: Graph2DScreenPoint, b: Graph2DScreenPoint, size: Graph2DScreenSize) => {
  let min = 0, max = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (![a.x, a.y, b.x, b.y, dx, dy].every(Number.isFinite)) return null;
  for (const [p, q] of [[-dx, a.x], [dx, size.width - a.x], [-dy, a.y], [dy, size.height - a.y]]) {
    if (p === 0) { if (q! < 0) return null; continue; }
    const ratio = q! / p!;
    if (p! < 0) min = Math.max(min, ratio); else max = Math.min(max, ratio);
    if (min > max) return null;
  }
  return { a: { x: a.x + min * dx, y: a.y + min * dy }, b: { x: a.x + max * dx, y: a.y + max * dy } };
};

export const MOBILE_GRAPH_MAX_LINE_VIEWS = 4096;
export const projectMobileGraphLines = (series: readonly Graph2DSampledSeries[], viewport: Graph2DViewport,
  size: Graph2DScreenSize, selectedId?: string | null, requestedLimit = MOBILE_GRAPH_MAX_LINE_VIEWS): MobileGraphLine[] => {
  const limit = Math.max(0, Math.min(MOBILE_GRAPH_MAX_LINE_VIEWS, Math.floor(requestedLimit)));
  const lines: MobileGraphLine[] = [];
  if (!limit) return lines;
  for (const item of series) for (const segment of item.artifact.segments) {
    let phase = 0;
    for (let index = 1; index < segment.points.length; index++) {
      const a = graph2DWorldToScreen(viewport, size, segment.points[index - 1]!);
      const b = graph2DWorldToScreen(viewport, size, segment.points[index]!);
      const clipped = clipMobileGraphLine(a, b, size);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!Number.isFinite(length)) continue;
      const width = item.style.lineWidth + (item.objectId === selectedId ? 1.5 : 0);
      if (clipped) {
        if (item.style.lineStyle === "solid") lines.push({ ...clipped, color: item.style.color, width });
        else {
          const visible = Math.hypot(clipped.b.x - clipped.a.x, clipped.b.y - clipped.a.y);
          const offset = Math.hypot(clipped.a.x - a.x, clipped.a.y - a.y);
          const on = item.style.lineStyle === "dotted" ? 2 : 8, cycle = on + (item.style.lineStyle === "dotted" ? 5 : 6);
          for (let distance = 0; distance < visible && lines.length < limit;) {
            const position = ((phase + offset + distance) % cycle + cycle) % cycle;
            const span = Math.min(visible - distance, (position < on ? on : cycle) - position);
            if (span <= 1e-8) { distance += 1e-7; continue; }
            const at = (value: number) => ({ x: clipped.a.x + (clipped.b.x - clipped.a.x) * value / visible,
              y: clipped.a.y + (clipped.b.y - clipped.a.y) * value / visible });
            if (position < on) lines.push({ a: at(distance), b: at(distance + span), color: item.style.color, width });
            distance += span;
          }
        }
      }
      if (lines.length >= limit) return lines;
      phase += length;
    }
  }
  return lines;
};

export const mobileGraphTicks = (viewport: Graph2DViewport, size: Graph2DScreenSize) => {
  const effective = resolveGraph2DViewport(viewport, size);
  const ticks = (min: number, max: number) => {
    const raw = (max - min) / 5, base = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].find((value) => value * base >= raw)! * base;
    const output: number[] = [];
    for (let index = 0, start = Math.ceil(min / step) * step; index < 12; index += 1) {
      const value = start + index * step; if (value > max) break; output.push(value);
    }
    return output;
  };
  return { x: ticks(effective.xMin, effective.xMax), y: ticks(effective.yMin, effective.yMax) };
};
