import { graph2DWorldToScreen, type Graph2DRegionArtifact, type Graph2DPointSeriesArtifact,
  type Graph2DSampledSeries, type Graph2DViewport, type Graph2DScreenSize } from "@math3d/core";
import { mobileGraphFillRect, type MobileGraphRect } from "./mobileGraphOverlays";

export const mobileGraphAdvancedGeometry = (series: readonly Graph2DSampledSeries[], viewport: Graph2DViewport, size: Graph2DScreenSize) => {
  const fills: MobileGraphRect[] = [], points: { x: number; y: number; color: string; rowId?: string; open?: boolean }[] = [];
  const boundaries: Graph2DSampledSeries[] = [];
  let fillsSeen = 0, pointsSeen = 0;
  for (const item of series) {
    if ("kind" in item.artifact && item.artifact.kind === "inequality-region") {
      const artifact = item.artifact as Graph2DRegionArtifact;
      for (const fill of artifact.fills) {
        const rect = mobileGraphFillRect(viewport, size, fill, item.style.color);
        if (rect) { fillsSeen++; if (fills.length < 256) fills.push(rect); }
      }
      for (const boundary of artifact.boundaries) boundaries.push({ ...item, style: { ...item.style, lineStyle: boundary.strict ? "dashed" : "solid" }, artifact: { ...artifact, segments: boundary.segments } });
    } else {
      boundaries.push(item);
      for (const segment of item.artifact.segments) for (const [point, open] of [[segment.points[0], segment.openStart], [segment.points.at(-1), segment.openEnd]] as const) {
        if (!point || !open) continue;
        const pixel = graph2DWorldToScreen(viewport, size, point);
        if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
          pointsSeen++; if (points.length < 128) points.push({ ...pixel, color: item.style.color, open: true });
        }
      }
      if ("kind" in item.artifact && item.artifact.kind === "point-series") {
        for (const point of (item.artifact as Graph2DPointSeriesArtifact).points) {
          const pixel = graph2DWorldToScreen(viewport, size, point);
          if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
            pointsSeen++; if (points.length < 128) points.push({ ...pixel, color: item.style.color, rowId: point.rowId });
          }
        }
      }
    }
  }
  return { fills, points, boundaries, truncated: fillsSeen > fills.length || pointsSeen > points.length };
};
