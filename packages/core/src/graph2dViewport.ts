import type { DocumentFieldAuthority } from "./documentIdentity";
import type { Graph2DDisplay } from "./graph2dDocument";

export type Graph2DViewport = Graph2DDisplay["viewport"];
export type Graph2DScreenSize = Readonly<{ width: number; height: number }>;
export type Graph2DScreenPoint = Readonly<{ x: number; y: number }>;
export type Graph2DWorldBounds = Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number }>;
export const GRAPH2D_MIN_SPAN = 1e-9;
export const GRAPH2D_MAX_SPAN = 1e12;
export const GRAPH2D_DEFAULT_VIEWPORT: Graph2DViewport = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, aspect: "equal" });
export type Graph2DAxisScale = "linear" | "log10";
export const graph2DAxisCoordinate = (value: number, scale?: Graph2DAxisScale): number => scale === "log10" ? value > 0 ? Math.log10(value) : NaN : value;
export const graph2DAxisValue = (value: number, scale?: Graph2DAxisScale): number => scale === "log10" ? 10 ** value : value;
export const graph2DHasLogScale = (viewport: Graph2DViewport) => viewport.xScale === "log10" || viewport.yScale === "log10";
const coordinates = (viewport: Graph2DViewport) => ({ ...viewport,
  xMin: graph2DAxisCoordinate(viewport.xMin, viewport.xScale), xMax: graph2DAxisCoordinate(viewport.xMax, viewport.xScale),
  yMin: graph2DAxisCoordinate(viewport.yMin, viewport.yScale), yMax: graph2DAxisCoordinate(viewport.yMax, viewport.yScale) });
const values = (viewport: Graph2DViewport): Graph2DViewport => ({ ...viewport,
  xMin: graph2DAxisValue(viewport.xMin, viewport.xScale), xMax: graph2DAxisValue(viewport.xMax, viewport.xScale),
  yMin: graph2DAxisValue(viewport.yMin, viewport.yScale), yMax: graph2DAxisValue(viewport.yMax, viewport.yScale) });

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validSize = (size: Graph2DScreenSize): boolean => finite(size.width) && finite(size.height) &&
  size.width > 0 && size.height > 0 && size.width <= 16384 && size.height <= 16384;
export const isGraph2DViewport = (viewport: unknown): viewport is Graph2DViewport => {
  if (!viewport || typeof viewport !== "object" || Array.isArray(viewport) ||
      !["aspect", "xMax", "xMin", "yMax", "yMin"].every(key => key in viewport) ||
      Object.keys(viewport).some(key => !["aspect", "xMax", "xMin", "yMax", "yMin", "xScale", "yScale", "continuation"].includes(key))) return false;
  const candidate = viewport as Graph2DViewport;
  if ((candidate.xScale !== undefined && !["linear", "log10"].includes(candidate.xScale)) ||
    (candidate.yScale !== undefined && !["linear", "log10"].includes(candidate.yScale)) ||
    (candidate.continuation !== undefined && typeof candidate.continuation !== "boolean") ||
    (graph2DHasLogScale(candidate) && candidate.aspect !== "free")) return false;
  for (const axis of ["x", "y"] as const) if (candidate[`${axis}Scale`] === "log10" &&
    (candidate[`${axis}Min`] < 1e-100 || candidate[`${axis}Max`] > 1e100 ||
      Math.log10(candidate[`${axis}Max`]) - Math.log10(candidate[`${axis}Min`]) < 1e-8)) return false;
  const c = coordinates(candidate);
  return finite(candidate.xMin) && finite(candidate.xMax) && finite(candidate.yMin) && finite(candidate.yMax) &&
    candidate.xMin < candidate.xMax && candidate.yMin < candidate.yMax &&
    c.xMax - c.xMin >= GRAPH2D_MIN_SPAN && c.xMax - c.xMin <= GRAPH2D_MAX_SPAN &&
    c.yMax - c.yMin >= GRAPH2D_MIN_SPAN && c.yMax - c.yMin <= GRAPH2D_MAX_SPAN &&
    ["free", "equal"].includes(candidate.aspect);
};
/* Kept as a named internal alias for transform validation. */
const validViewport = (viewport: Graph2DViewport): boolean => isGraph2DViewport(viewport);
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
  return { ...viewport, xMin, xMax, yMin, yMax };
};

export const graph2DWorldToScreen = (viewport: Graph2DViewport, size: Graph2DScreenSize, point: Graph2DScreenPoint): Graph2DScreenPoint => {
  if (!finite(point.x) || !finite(point.y)) throw new TypeError("Graph2D world point must be finite.");
  const effective = coordinates(resolveGraph2DViewport(viewport, size));
  return { x: (graph2DAxisCoordinate(point.x, viewport.xScale) - effective.xMin) / (effective.xMax - effective.xMin) * size.width,
    y: (effective.yMax - graph2DAxisCoordinate(point.y, viewport.yScale)) / (effective.yMax - effective.yMin) * size.height };
};

export const graph2DScreenToWorld = (viewport: Graph2DViewport, size: Graph2DScreenSize, point: Graph2DScreenPoint): Graph2DScreenPoint => {
  if (!finite(point.x) || !finite(point.y)) throw new TypeError("Graph2D screen point must be finite.");
  const effective = coordinates(resolveGraph2DViewport(viewport, size));
  return { x: graph2DAxisValue(effective.xMin + point.x / size.width * (effective.xMax - effective.xMin), viewport.xScale),
    y: graph2DAxisValue(effective.yMax - point.y / size.height * (effective.yMax - effective.yMin), viewport.yScale) };
};

export const panGraph2DViewport = (viewport: Graph2DViewport, size: Graph2DScreenSize, delta: Graph2DScreenPoint): Graph2DViewport => {
  if (!finite(delta.x) || !finite(delta.y)) throw new TypeError("Graph2D pan delta must be finite.");
  const effective = coordinates(resolveGraph2DViewport(viewport, size));
  const dx = delta.x / size.width * (effective.xMax - effective.xMin);
  const dy = delta.y / size.height * (effective.yMax - effective.yMin);
  const result = values({ ...effective, xMin: effective.xMin - dx, xMax: effective.xMax - dx,
    yMin: effective.yMin + dy, yMax: effective.yMax + dy });
  return isGraph2DViewport(result) ? result : viewport;
};

/** Factor above 1 zooms in; the world coordinate under anchor stays fixed. */
export const zoomGraph2DViewport = (
  viewport: Graph2DViewport, size: Graph2DScreenSize, anchor: Graph2DScreenPoint, factor: number,
): Graph2DViewport => {
  if (!finite(factor) || factor <= 0) throw new TypeError("Graph2D zoom factor must be positive and finite.");
  const resolved = resolveGraph2DViewport(viewport, size), effective = coordinates(resolved);
  const point = graph2DScreenToWorld(resolved, size, anchor);
  const world = { x: graph2DAxisCoordinate(point.x, viewport.xScale), y: graph2DAxisCoordinate(point.y, viewport.yScale) };
  const oldXSpan = effective.xMax - effective.xMin;
  const oldYSpan = effective.yMax - effective.yMin;
  const scale = Math.min(Math.min(GRAPH2D_MAX_SPAN / oldXSpan, GRAPH2D_MAX_SPAN / oldYSpan),
    Math.max(Math.max(GRAPH2D_MIN_SPAN / oldXSpan, GRAPH2D_MIN_SPAN / oldYSpan), 1 / factor));
  const xSpan = oldXSpan * scale;
  const ySpan = oldYSpan * scale;
  const xFraction = anchor.x / size.width;
  const yFraction = anchor.y / size.height;
  const result = values({ ...effective,
    xMin: world.x - xFraction * xSpan, xMax: world.x + (1 - xFraction) * xSpan,
    yMin: world.y - (1 - yFraction) * ySpan, yMax: world.y + yFraction * ySpan });
  return isGraph2DViewport(result) ? result : viewport;
};

export const fitGraph2DViewport = (
  bounds: Graph2DWorldBounds, size: Graph2DScreenSize, aspect: Graph2DViewport["aspect"] = "equal", padding = 0.08,
  policies: Pick<Graph2DViewport, "xScale" | "yScale" | "continuation"> = {},
): Graph2DViewport => {
  if (!validSize(size) || ![bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every(finite) ||
      bounds.xMin > bounds.xMax || bounds.yMin > bounds.yMax || !finite(padding) || padding < 0 || padding > 0.45)
    throw new TypeError("Invalid Graph2D fit bounds or padding.");
  const policy = Object.fromEntries(["xScale", "yScale", "continuation"].filter(key => key in policies).map(key => [key, policies[key as keyof typeof policies]])) as typeof policies;
  const b = coordinates({ ...bounds, ...policy, aspect });
  if (![b.xMin, b.xMax, b.yMin, b.yMax].every(finite)) throw new TypeError("Logarithmic fit needs positive coordinates; choose a positive-domain object or linear axes.");
  const xCenter = (b.xMin + b.xMax) / 2;
  const yCenter = (b.yMin + b.yMax) / 2;
  const xSpan = boundedSpan(Math.max(b.xMax - b.xMin, 1e-6) / (1 - 2 * padding));
  const ySpan = boundedSpan(Math.max(b.yMax - b.yMin, 1e-6) / (1 - 2 * padding));
  const [xMin, xMax] = around(xCenter, xSpan);
  const [yMin, yMax] = around(yCenter, ySpan);
  return resolveGraph2DViewport(values({ xMin, xMax, yMin, yMax, aspect, ...policy }), size);
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
    case "graph2d.viewport.fit": return fitGraph2DViewport(command.bounds, size, viewport.aspect, command.padding, viewport);
    case "graph2d.viewport.reset": return { ...GRAPH2D_DEFAULT_VIEWPORT };
  }
};
