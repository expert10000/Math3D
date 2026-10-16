import {
  graph2DHasLogScale, graph2DWorldToScreen, resolveGraph2DViewport,
  type Graph2DScreenPoint, type Graph2DScreenSize, type Graph2DViewport,
} from "./graph2dViewport";

export type Graph2DConstructionVector = Readonly<{
  start: Graph2DScreenPoint;
  tip: Graph2DScreenPoint;
  left: Graph2DScreenPoint;
  right: Graph2DScreenPoint;
  label: Graph2DScreenPoint;
}>;

/** A fixed-length display arrow for a world-space derivative direction, not its magnitude. */
export function projectGraph2DConstructionVector(
  viewport: Graph2DViewport, size: Graph2DScreenSize,
  anchor: Graph2DScreenPoint, direction: Graph2DScreenPoint,
): Graph2DConstructionVector | null {
  if (graph2DHasLogScale(viewport) || ![anchor.x, anchor.y, direction.x, direction.y].every(Number.isFinite)) return null;
  const speed = Math.hypot(direction.x, direction.y);
  if (!Number.isFinite(speed) || speed <= 1e-12) return null;
  const bounds = resolveGraph2DViewport(viewport, size);
  const x = direction.x / speed * size.width / (bounds.xMax - bounds.xMin);
  const y = -direction.y / speed * size.height / (bounds.yMax - bounds.yMin);
  const projectedLength = Math.hypot(x, y);
  if (!Number.isFinite(projectedLength) || projectedLength <= 1e-12) return null;
  const unit = { x: x / projectedLength, y: y / projectedLength };
  const screen = graph2DWorldToScreen(viewport, size, anchor);
  const at = (forward: number, side = 0): Graph2DScreenPoint => ({
    x: screen.x + forward * unit.x - side * unit.y,
    y: screen.y + forward * unit.y + side * unit.x,
  });
  const result = {
    start: at(9), tip: at(33), left: at(24, 5), right: at(24, -5), label: at(43),
  };
  if (Object.values(result).some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height)) return null;
  return result;
}
