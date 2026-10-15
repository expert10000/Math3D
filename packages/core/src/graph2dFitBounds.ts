import type { Graph2DConstructionArtifact } from "./graph2dConstructionResolution";
import type { Graph2DSampledSeries } from "./graph2dSceneSampling";
import type { Graph2DWorldBounds } from "./graph2dViewport";

type MutableBounds = { xMin: number; xMax: number; yMin: number; yMax: number };
const empty = (): MutableBounds => ({ xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
const include = (bounds: MutableBounds, x: number, y: number) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  bounds.xMin = Math.min(bounds.xMin, x); bounds.xMax = Math.max(bounds.xMax, x);
  bounds.yMin = Math.min(bounds.yMin, y); bounds.yMax = Math.max(bounds.yMax, y);
};
const result = (bounds: MutableBounds): Graph2DWorldBounds | null => Number.isFinite(bounds.xMin) ? bounds : null;

/** Fit authored samples, excluding hidden curves and unbounded tangent/normal lines. */
export function graph2DSceneFitBounds(series: readonly Graph2DSampledSeries[], constructions: Graph2DConstructionArtifact | null,
  mode: "selection" | "all", selectedObjectId: string | null): Graph2DWorldBounds | null {
  if (mode === "selection" && !selectedObjectId) return null;
  const bounds = empty();
  const visible = new Set(series.filter(item => item.style.visible).map(item => item.objectId));
  for (const item of series) {
    if (!item.style.visible || mode === "selection" && item.objectId !== selectedObjectId) continue;
    for (const segment of item.artifact.segments) for (const point of segment.points) include(bounds, point.x, point.y);
  }
  if (mode === "all") for (const item of constructions?.objects ?? []) {
    if (item.state !== "ready" || !item.style.visible || !visible.has(item.sourceObjectId)) continue;
    if (item.circle) {
      include(bounds, item.circle.center.x - item.circle.radius, item.circle.center.y - item.circle.radius);
      include(bounds, item.circle.center.x + item.circle.radius, item.circle.center.y + item.circle.radius);
    } else if (!item.direction && item.point) include(bounds, item.point.x, item.point.y);
  }
  return result(bounds);
}

export function graph2DConstructionFitBounds(artifact: Graph2DConstructionArtifact | null,
  constructionId: string): Graph2DWorldBounds | null {
  const item = artifact?.objects.find(entry => entry.id === constructionId);
  if (!item || item.state !== "ready" || !item.style.visible) return null;
  const bounds = empty();
  if (item.circle) {
    include(bounds, item.circle.center.x - item.circle.radius, item.circle.center.y - item.circle.radius);
    include(bounds, item.circle.center.x + item.circle.radius, item.circle.center.y + item.circle.radius);
  } else if (item.point) {
    include(bounds, item.point.x - 1, item.point.y - 1);
    include(bounds, item.point.x + 1, item.point.y + 1);
  }
  return result(bounds);
}
