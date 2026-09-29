import type { Graph2DDocument } from "./graph2dDocument";
import type { Graph2DSampledSeries } from "./graph2dSceneSampling";
import type { Graph2DRegionArtifact } from "./graph2dInequality";
import type { Graph2DPointSeriesArtifact } from "./graph2dPointSeries";
import type { Graph2DPiecewiseArtifact } from "./graph2dPiecewise";
import { graph2DWorldToScreen, resolveGraph2DViewport, type Graph2DScreenSize } from "./graph2dViewport";
import { projectGraph2DGrid, projectGraph2DPolarGrid } from "./graph2dGrid";
import { graph2DGridAppearance } from "./graph2dGridOptions";

export type Graph2DPublicationPrimitive =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: "solid" | "dashed" | "dotted"; dashOffset: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: string; opacity: number }
  | { kind: "circle"; x: number; y: number; radius: number; color: string; open: boolean }
  | { kind: "text"; x: number; y: number; text: string };

export const clipGraph2DPublicationLine = (a: { x: number; y: number }, b: { x: number; y: number }, size: Graph2DScreenSize) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (![a.x, a.y, b.x, b.y, dx, dy].every(Number.isFinite)) return null;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a.x], [dx, size.width - a.x], [-dy, a.y], [dy, size.height - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    if (p < 0) lo = Math.max(lo, q / p); else hi = Math.min(hi, q / p);
    if (lo > hi) return null;
  }
  return { x1: a.x + lo * dx, y1: a.y + lo * dy, x2: a.x + hi * dx, y2: a.y + hi * dy };
};

/** Same shared sample artifacts/transforms as live plots and gallery previews, clipped before serialization. */
export const projectGraph2DPublicationGeometry = (document: Graph2DDocument, series: readonly Graph2DSampledSeries[], size: Graph2DScreenSize) => {
  const viewport = document.display.viewport, bounds = resolveGraph2DViewport(viewport, size);
  const screen = (point: { x: number; y: number }) => graph2DWorldToScreen(viewport, size, point);
  const primitives: Graph2DPublicationPrimitive[] = [];
  let omitted = 0;
  const push = (primitive: Graph2DPublicationPrimitive) => { if (primitives.length < 16384) primitives.push(primitive); else omitted++; };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string, width = 1, dash: "solid" | "dashed" | "dotted" = "solid", distance = 0) => {
    const clipped = clipGraph2DPublicationLine(a, b, size);
    if (clipped) push({ kind: "line", ...clipped, color, width, dash, dashOffset: (distance + Math.hypot(clipped.x1 - a.x, clipped.y1 - a.y)) % (dash === "dotted" ? 6 : 13) });
  };
  const tick = (min: number, max: number) => {
    const raw = (max - min) / 8, base = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].find((n) => n * base >= raw)! * base;
    return Array.from({ length: 12 }, (_, i) => (Math.ceil(min / step) + i) * step).filter((n) => n <= max);
  };
  const options = document.display.axes.gridOptions, appearance = graph2DGridAppearance(options);
  const grid = projectGraph2DGrid(viewport, size, options);
  const warnings = document.display.axes.grid && document.display.axes.gridMode !== "polar" ? [...(grid.warnings ?? [])] : [];
  const origin = screen({ x: 0, y: 0 }), xs = grid.verticalMajor.map(t => t.value), ys = grid.horizontalMajor.map(t => t.value);
  if (document.display.axes.grid && document.display.axes.gridMode === "polar" && options) {
    const polar = projectGraph2DPolarGrid(viewport, size, options); warnings.push(...polar.warnings);
    for (const [rings, rays, color] of [[polar.minorRings, polar.minorRays, appearance.minorColor], [polar.majorRings, polar.majorRays, appearance.majorColor]] as const) {
      for (const r of rings) for (let i = 0; i < 128; i++) {
        const at = (angle: number) => ({ x: r.cx + r.rx * Math.cos(angle), y: r.cy + r.ry * Math.sin(angle) });
        line(at(i * Math.PI / 64), at((i + 1) * Math.PI / 64), color);
      }
      for (const ray of rays) line(ray.a, ray.b, color);
    }
  } else if (document.display.axes.grid && document.display.axes.gridMode === "polar") {
    const maxRadius = Math.max(...[bounds.xMin, bounds.xMax].flatMap((x) => [bounds.yMin, bounds.yMax].map((y) => Math.hypot(x, y))));
    const radii = tick(0, maxRadius).filter((r) => r > 0);
    for (const r of radii) for (let i = 0; i < 128; i++) {
      const at = (angle: number) => screen({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
      line(at(i * Math.PI / 64), at((i + 1) * Math.PI / 64), "#e2e8f0");
    }
    for (let i = 0; i < 12; i++) line(origin, screen({ x: maxRadius * Math.cos(i * Math.PI / 6), y: maxRadius * Math.sin(i * Math.PI / 6) }), "#e2e8f0");
  } else if (document.display.axes.grid) {
    if (options) {
      for (const x of grid.verticalMinor) line({ x, y: 0 }, { x, y: size.height }, appearance.minorColor, .55);
      for (const y of grid.horizontalMinor) line({ x: 0, y }, { x: size.width, y }, appearance.minorColor, .55);
    }
    if (!grid.verticalSuppressed) for (const x of xs) { const p = screen({ x, y: 0 }); line({ x: p.x, y: 0 }, { x: p.x, y: size.height }, appearance.majorColor); }
    if (!grid.horizontalSuppressed) for (const y of ys) { const p = screen({ x: 0, y }); line({ x: 0, y: p.y }, { x: size.width, y: p.y }, appearance.majorColor); }
  }
  if (document.display.axes.x && grid.xAxis !== null) line({ x: 0, y: grid.xAxis }, { x: size.width, y: grid.xAxis }, "#64748b", 1.5);
  if (document.display.axes.y && grid.yAxis !== null) line({ x: grid.yAxis, y: 0 }, { x: grid.yAxis, y: size.height }, "#64748b", 1.5);
  for (const item of series) {
    const artifact = item.artifact;
    if ("kind" in artifact && artifact.kind === "inequality-region") {
      for (const fill of (artifact as Graph2DRegionArtifact).fills) {
        const a = screen({ x: fill.xMin, y: fill.yMax }), b = screen({ x: fill.xMax, y: fill.yMin });
        const x = Math.max(0, a.x), y = Math.max(0, a.y), right = Math.min(size.width, b.x), bottom = Math.min(size.height, b.y);
        if (right > x && bottom > y) push({ kind: "rect", x, y, width: right - x, height: bottom - y, color: item.style.color, opacity: .18 });
      }
    }
  }
  for (const item of series) {
    const a = item.artifact, region = "kind" in a && a.kind === "inequality-region" ? a as Graph2DRegionArtifact : null;
    const groups = region ? region.boundaries.map((b) => ({ segments: b.segments, dash: b.strict ? "dashed" as const : item.style.lineStyle })) :
      [{ segments: "kind" in a && a.kind === "point-series" && (a as Graph2DPointSeriesArtifact).mode === "points" ? [] : a.segments, dash: item.style.lineStyle }];
    for (const group of groups) for (const segment of group.segments) {
      let distance = 0;
      for (let i = 1; i < segment.points.length; i++) {
        const start = screen(segment.points[i - 1]), end = screen(segment.points[i]);
        line(start, end, item.style.color, item.style.lineWidth, group.dash, distance);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (Number.isFinite(length)) distance = (distance + length) % (group.dash === "dotted" ? 6 : 13);
      }
    }
    const marker = (point: { x: number; y: number }, open: boolean, radius: number) => {
      const p = screen(point);
      if (p.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height) push({ kind: "circle", ...p, radius, color: item.style.color, open });
    };
    if ("kind" in a && a.kind === "point-series") for (const p of (a as Graph2DPointSeriesArtifact).points) marker(p, false, Math.max(2.5, item.style.lineWidth + 1.5));
    else if ("kind" in a && a.kind === "piecewise") for (const p of [...(a as Graph2DPiecewiseArtifact).endpoints].sort((x, y) => Number(y.open) - Number(x.open))) marker(p, p.open, Math.max(3.5, item.style.lineWidth + 2));
    else for (const segment of a.segments) {
      const first = segment.points[0], last = segment.points.at(-1);
      if (first && segment.openStart) marker(first, true, 3.5);
      if (last && segment.openEnd) marker(last, true, 3.5);
    }
  }
  if (document.display.axes.labels) {
    for (const x of xs) { const p = screen({ x, y: 0 }); push({ kind: "text", x: Math.min(size.width - 48, Math.max(3, p.x + 3)), y: size.height - 5, text: String(Number(x.toPrecision(5))) }); }
    for (const y of ys) { const p = screen({ x: 0, y }); push({ kind: "text", x: 4, y: Math.min(size.height - 18, Math.max(12, p.y - 3)), text: String(Number(y.toPrecision(5))) }); }
  }
  return { primitives, omitted, ...(warnings.length ? { warnings } : {}) };
};
