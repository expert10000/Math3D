import { graph2DWorldToScreen, type Graph2DViewport, type Graph2DScreenSize } from "@math3d/core";
import type { MobileGraphAnalysis } from "../models/mobileGraphAnalysis";
export type MobileGraphRect = { left: number; top: number; width: number; height: number; color: string };
export const mobileGraphFillRect = (viewport: Graph2DViewport, size: Graph2DScreenSize,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, color: string): MobileGraphRect | null => {
  if (![bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every(Number.isFinite)) return null;
  const a = graph2DWorldToScreen(viewport, size, { x: bounds.xMin, y: bounds.yMax });
  const b = graph2DWorldToScreen(viewport, size, { x: bounds.xMax, y: bounds.yMin });
  const left = Math.max(0, Math.min(a.x, b.x)), right = Math.min(size.width, Math.max(a.x, b.x));
  const top = Math.max(0, Math.min(a.y, b.y)), bottom = Math.min(size.height, Math.max(a.y, b.y));
  return [left, right, top, bottom].every(Number.isFinite) && left < right && top < bottom ? { left, top, width: right - left, height: bottom - top, color } : null;
};
/** Reviewed bounded midpoint strips; gaps come directly from the shared integral artifact. */
export const mobileGraphAreaRects = (analysis: MobileGraphAnalysis, viewport: Graph2DViewport, size: Graph2DScreenSize): MobileGraphRect[] =>
  (analysis.areaSegments ?? []).slice(0, 256).flatMap((segment) => {
    const [a, , mid, , b] = segment.points;
    if (!a || !mid || !b) return [];
    const rect = mobileGraphFillRect(viewport, size, { xMin: a.x, xMax: b.x, yMin: Math.min(0, mid.y), yMax: Math.max(0, mid.y) }, "#bfdbfe");
    return rect ? [rect] : [];
  });
