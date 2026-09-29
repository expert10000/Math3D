import { graph2DWorldToScreen, projectGraph2DGrid, projectGraph2DPolarGrid, graph2DGridAppearance, type Graph2DDocument, type Graph2DViewport,
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
  const grid = projectGraph2DGrid(viewport, size);
  return { x: grid.verticalMajor.map(t => t.value), y: grid.horizontalMajor.map(t => t.value) };
};

/** Display-only grid geometry, separately capped so it cannot consume the function-curve budget. */
export const projectMobileGraphGrid = (axes: Graph2DDocument["display"]["axes"], viewport: Graph2DViewport, size: Graph2DScreenSize) => {
  const grid = projectGraph2DGrid(viewport, size, axes.gridOptions), appearance = graph2DGridAppearance(axes.gridOptions);
  const lines: MobileGraphLine[] = [], warnings: string[] = [];
  let omitted = 0;
  const add = (a: Graph2DScreenPoint, b: Graph2DScreenPoint, color: string, width = 1) => {
    const clipped = clipMobileGraphLine(a, b, size);
    if (clipped) { if (lines.length < 512) lines.push({ ...clipped, color, width }); else omitted++; }
  };
  if (axes.grid && axes.gridMode === "polar") {
    const polar = projectGraph2DPolarGrid(viewport, size, axes.gridOptions); warnings.push(...polar.warnings, "Native polar rings are bounded polyline approximations.");
    for (const [rings, rays, color] of [[polar.majorRings, polar.majorRays, appearance.majorColor], [polar.minorRings, polar.minorRays, appearance.minorColor]] as const) {
      // Prioritise rays, then major rings; minor detail never removes the plotted curves.
      for (const ray of rays) add(ray.a, ray.b, color);
      for (const r of rings) for (let i = 0; i < 128; i++) {
        const at = (theta: number) => ({ x: r.cx + r.rx * Math.cos(theta), y: r.cy + r.ry * Math.sin(theta) });
        add(at(i * Math.PI / 64), at((i + 1) * Math.PI / 64), color);
      }
    }
  } else if (axes.grid) {
    warnings.push(...(grid.warnings ?? []));
    if (!grid.verticalSuppressed) for (const t of grid.verticalMajor) add({ x: t.pixel, y: 0 }, { x: t.pixel, y: size.height }, appearance.majorColor);
    if (!grid.horizontalSuppressed) for (const t of grid.horizontalMajor) add({ x: 0, y: t.pixel }, { x: size.width, y: t.pixel }, appearance.majorColor);
    if (axes.gridOptions) {
      for (const x of grid.verticalMinor) add({ x, y: 0 }, { x, y: size.height }, appearance.minorColor, .55);
      for (const y of grid.horizontalMinor) add({ x: 0, y }, { x: size.width, y }, appearance.minorColor, .55);
    }
  }
  if (omitted) warnings.push(`${omitted} grid segments omitted by the 512-native-line display budget.`);
  return { lines, warnings, x: grid.verticalMajor.map(t => t.value), y: grid.horizontalMajor.map(t => t.value) };
};
