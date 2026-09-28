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

export const projectMobileGraphLines = (series: readonly Graph2DSampledSeries[], viewport: Graph2DViewport,
  size: Graph2DScreenSize, selectedId?: string | null): MobileGraphLine[] => series.flatMap((item) => item.artifact.segments.flatMap((segment) =>
    segment.points.slice(1).flatMap((point, index) => {
      const clipped = clipMobileGraphLine(graph2DWorldToScreen(viewport, size, segment.points[index]!),
        graph2DWorldToScreen(viewport, size, point), size);
      return clipped ? [{ ...clipped, color: item.style.color, width: item.style.lineWidth + (item.objectId === selectedId ? 1.5 : 0) }] : [];
    })));

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
