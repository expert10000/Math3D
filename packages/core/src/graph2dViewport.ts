import type { DocumentFieldAuthority } from "./documentIdentity";
import type { Graph2DDisplay } from "./graph2dDocument";

export type Graph2DViewport = Graph2DDisplay["viewport"];
export type Graph2DScreenSize = Readonly<{ width: number; height: number }>;
export type Graph2DScreenPoint = Readonly<{ x: number; y: number }>;
export type Graph2DWorldBounds = Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>;
export const GRAPH2D_MIN_SPAN = 1e-9;
export const GRAPH2D_MAX_SPAN = 1e12;
export const GRAPH2D_DEFAULT_VIEWPORT: Graph2DViewport = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, aspect: "equal" });

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validSize = (size: Graph2DScreenSize): boolean => finite(size.width) && finite(size.height) &&
  size.width > 0 && size.height > 0 && size.width <= 16384 && size.height <= 16384;
const validViewport = (viewport: Graph2DViewport): boolean => finite(viewport.xMin) && finite(viewport.xMax) &&
  finite(viewport.yMin) && finite(viewport.yMax) && viewport.xMin < viewport.xMax && viewport.yMin < viewport.yMax &&
  ["free", "equal"].includes(viewport.aspect);
const checked = (viewport: Graph2DViewport, size: Graph2DScreenSize): void => {
  if (!validViewport(viewport) || !validSize(size)) throw new TypeError("Invalid Graph2D viewport or screen size.");
};
const boundedSpan = (span: number): number => Math.min(GRAPH2D_MAX_SPAN, Math.max(GRAPH2D_MIN_SPAN, span));
const around = (center: number, span: number): readonly [number, number] => [center - span / 2, center + span / 2];

/** Expand the narrower axis; never crop mathematical content for equal aspect. */
export const resolveGraph2DViewport = (viewport: Graph2DViewport, size: Graph2DScreenSize): Graph2DViewport => {
  checked(viewport, size);
  if (viewport.aspect === "free") return { ...viewport };
  const xSpan = viewport.xMax - viewport.xMin;
  const ySpan = viewport.yMax - viewport.yMin;
  const unitsPerPixel = Math.max(xSpan / size.width, ySpan / size.height);
  const [xMin, xMax] = around((viewport.xMin + viewport.xMax) / 2, unitsPerPixel * size.width);
  const [yMin, yMax] = around((viewport.yMin + viewport.yMax) / 2, unitsPerPixel * size.height);
  return { xMin, xMax, yMin, yMax, aspect: viewport.aspect };
};

export const graph2DWorldToScreen = (viewport: Graph2DViewport, size: Graph2DScreenSize, point: Graph2DScreenPoint): Graph2DScreenPoint => {
  if (!finite(point.x) || !finite(point.y)) throw new TypeError("Graph2D world point must be finite.");
  const effective = resolveGraph2DViewport(viewport, size);
  return { x: (point.x - effective.xMin) / (effective.xMax - effective.xMin) * size.width,
    y: (effective.yMax - point.y) / (effective.yMax - effective.yMin) * size.height };
};

export const graph2DScreenToWorld = (viewport: Graph2DViewport, size: Graph2DScreenSize, point: Graph2DScreenPoint): Graph2DScreenPoint => {
  if (!finite(point.x) || !finite(point.y)) throw new TypeError("Graph2D screen point must be finite.");
  const effective = resolveGraph2DViewport(viewport, size);
  return { x: effective.xMin + point.x / size.width * (effective.xMax - effective.xMin),
    y: effective.yMax - point.y / size.height * (effective.yMax - effective.yMin) };
};

export const panGraph2DViewport = (viewport: Graph2DViewport, size: Graph2DScreenSize, delta: Graph2DScreenPoint): Graph2DViewport => {
  if (!finite(delta.x) || !finite(delta.y)) throw new TypeError("Graph2D pan delta must be finite.");
  const effective = resolveGraph2DViewport(viewport, size);
  const dx = delta.x / size.width * (effective.xMax - effective.xMin);
  const dy = delta.y / size.height * (effective.yMax - effective.yMin);
  return { ...effective, xMin: effective.xMin - dx, xMax: effective.xMax - dx,
    yMin: effective.yMin + dy, yMax: effective.yMax + dy };
};

/** Factor above 1 zooms in; the world coordinate under anchor stays fixed. */
export const zoomGraph2DViewport = (
  viewport: Graph2DViewport, size: Graph2DScreenSize, anchor: Graph2DScreenPoint, factor: number,
): Graph2DViewport => {
  if (!finite(factor) || factor <= 0) throw new TypeError("Graph2D zoom factor must be positive and finite.");
  const effective = resolveGraph2DViewport(viewport, size);
  const world = graph2DScreenToWorld(effective, size, anchor);
  const oldXSpan = effective.xMax - effective.xMin;
  const oldYSpan = effective.yMax - effective.yMin;
  const scale = Math.min(Math.min(GRAPH2D_MAX_SPAN / oldXSpan, GRAPH2D_MAX_SPAN / oldYSpan),
    Math.max(Math.max(GRAPH2D_MIN_SPAN / oldXSpan, GRAPH2D_MIN_SPAN / oldYSpan), 1 / factor));
  const xSpan = oldXSpan * scale;
  const ySpan = oldYSpan * scale;
  const xFraction = anchor.x / size.width;
  const yFraction = anchor.y / size.height;
  return { aspect: effective.aspect,
    xMin: world.x - xFraction * xSpan, xMax: world.x + (1 - xFraction) * xSpan,
    yMin: world.y - (1 - yFraction) * ySpan, yMax: world.y + yFraction * ySpan };
};

export const fitGraph2DViewport = (
  bounds: Graph2DWorldBounds, size: Graph2DScreenSize, aspect: Graph2DViewport["aspect"] = "equal", padding = 0.08,
): Graph2DViewport => {
  if (!validSize(size) || ![bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every(finite) ||
      bounds.xMin > bounds.xMax || bounds.yMin > bounds.yMax || !finite(padding) || padding < 0 || padding > 0.45)
    throw new TypeError("Invalid Graph2D fit bounds or padding.");
  const xCenter = (bounds.xMin + bounds.xMax) / 2;
  const yCenter = (bounds.yMin + bounds.yMax) / 2;
  const xSpan = boundedSpan(Math.max(bounds.xMax - bounds.xMin, GRAPH2D_MIN_SPAN * 100) / (1 - 2 * padding));
  const ySpan = boundedSpan(Math.max(bounds.yMax - bounds.yMin, GRAPH2D_MIN_SPAN * 100) / (1 - 2 * padding));
  const [xMin, xMax] = around(xCenter, xSpan);
  const [yMin, yMax] = around(yCenter, ySpan);
  return resolveGraph2DViewport({ xMin, xMax, yMin, yMax, aspect }, size);
};

export type Graph2DViewportCommand =
  | Readonly<{ type: "graph2d.viewport.pan"; delta: Graph2DScreenPoint }>
  | Readonly<{ type: "graph2d.viewport.zoom"; anchor: Graph2DScreenPoint; factor: number }>
  | Readonly<{ type: "graph2d.viewport.fit"; bounds: Graph2DWorldBounds; padding?: number }>
  | Readonly<{ type: "graph2d.viewport.reset" }>;
export const classifyGraph2DViewportCommand = (phase: "preview" | "commit"): DocumentFieldAuthority =>
  phase === "preview" ? "transient-display" : "persistent-display";
export const applyGraph2DViewportCommand = (
  viewport: Graph2DViewport, size: Graph2DScreenSize, command: Graph2DViewportCommand,
): Graph2DViewport => {
  switch (command.type) {
    case "graph2d.viewport.pan": return panGraph2DViewport(viewport, size, command.delta);
    case "graph2d.viewport.zoom": return zoomGraph2DViewport(viewport, size, command.anchor, command.factor);
    case "graph2d.viewport.fit": return fitGraph2DViewport(command.bounds, size, viewport.aspect, command.padding);
    case "graph2d.viewport.reset": return { ...GRAPH2D_DEFAULT_VIEWPORT };
  }
};
