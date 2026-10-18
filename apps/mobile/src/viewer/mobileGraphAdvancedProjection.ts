import { graph2DWorldToScreen, graph2DScreenToWorld, type Graph2DRegionArtifact, type Graph2DPointSeriesArtifact,
  type Graph2DSampledSeries, type Graph2DTrajectoryArtifact, type Graph2DPhasePortraitArtifact,
  type Graph2DViewport, type Graph2DScreenSize } from "@math3d/core";
import { mobileGraphFillRect, type MobileGraphRect } from "./mobileGraphOverlays";

export const mobileGraphAdvancedGeometry = (series: readonly Graph2DSampledSeries[], viewport: Graph2DViewport, size: Graph2DScreenSize,
  limits = { fills: 256, markers: 128 }) => {
  const fillLimit = Math.max(0, Math.min(256, limits.fills)), markerLimit = Math.max(0, Math.min(128, limits.markers));
  const fills: MobileGraphRect[] = [], points: { x: number; y: number; color: string; rowId?: string; open?: boolean }[] = [];
  const boundaries: Graph2DSampledSeries[] = [];
  let fillsSeen = 0, pointsSeen = 0;
  for (const item of series) {
    if ("kind" in item.artifact && item.artifact.kind === "inequality-region") {
      const artifact = item.artifact as Graph2DRegionArtifact;
      for (const fill of artifact.fills) {
        const rect = mobileGraphFillRect(viewport, size, fill, item.style.color);
        if (rect) { fillsSeen++; if (fills.length < fillLimit) fills.push(rect); }
      }
      for (const boundary of artifact.boundaries) boundaries.push({ ...item, style: { ...item.style, lineStyle: boundary.strict ? "dashed" : "solid" }, artifact: { ...artifact, segments: boundary.segments } });
    } else {
      boundaries.push(item);
      if ("kind" in item.artifact && item.artifact.kind === "phase-portrait") {
        const phase = item.artifact as Graph2DPhasePortraitArtifact;
        const arrows = phase.fieldSegments.flatMap(segment => {
          const a = segment.points[0], b = segment.points[1];
          if (!a || !b) return [segment];
          const start = graph2DWorldToScreen(viewport, size, a), end = graph2DWorldToScreen(viewport, size, b);
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const heads = [-0.55, 0.55].map(offset => graph2DScreenToWorld(viewport, size, {
            x: end.x - 6 * Math.cos(angle + offset), y: end.y - 6 * Math.sin(angle + offset),
          }));
          return [segment, ...heads.map(head => ({ points: [head, b], openStart: false, openEnd: false }))];
        });
        boundaries.push({ ...item, style: { ...item.style, lineWidth: Math.min(1.5, item.style.lineWidth) },
          artifact: { ...phase, segments: arrows } });
        boundaries.push({ ...item, style: { ...item.style, color: "#ea580c", lineWidth: 1.8, lineStyle: "dashed" },
          artifact: { ...phase, segments: phase.nullclines.x } });
        boundaries.push({ ...item, style: { ...item.style, color: "#0891b2", lineWidth: 1.8, lineStyle: "dotted" },
          artifact: { ...phase, segments: phase.nullclines.y } });
        for (const orbit of phase.orbits) {
          const pixel = graph2DWorldToScreen(viewport, size, orbit.seed);
          if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
            pointsSeen++; if (points.length < markerLimit) points.push({ ...pixel, color: item.style.color });
          }
        }
        for (const equilibrium of phase.equilibria) {
          const pixel = graph2DWorldToScreen(viewport, size, equilibrium);
          if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
            pointsSeen++; if (points.length < markerLimit) points.push({ ...pixel, color: "#111827" });
          }
        }
      }
      if ("kind" in item.artifact && item.artifact.kind === "trajectory") {
        const seed = (item.artifact as Graph2DTrajectoryArtifact).seed;
        const pixel = graph2DWorldToScreen(viewport, size, seed);
        if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
          pointsSeen++; if (points.length < markerLimit) points.push({ ...pixel, color: item.style.color });
        }
      }
      for (const segment of item.artifact.segments) for (const [point, open] of [[segment.points[0], segment.openStart], [segment.points.at(-1), segment.openEnd]] as const) {
        if (!point || !open) continue;
        const pixel = graph2DWorldToScreen(viewport, size, point);
        if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
          pointsSeen++; if (points.length < markerLimit) points.push({ ...pixel, color: item.style.color, open: true });
        }
      }
      if ("kind" in item.artifact && item.artifact.kind === "point-series") {
        for (const point of (item.artifact as Graph2DPointSeriesArtifact).points) {
          const pixel = graph2DWorldToScreen(viewport, size, point);
          if (pixel.x >= 0 && pixel.x <= size.width && pixel.y >= 0 && pixel.y <= size.height) {
            pointsSeen++; if (points.length < markerLimit) points.push({ ...pixel, color: item.style.color, rowId: point.rowId });
          }
        }
      }
    }
  }
  return { fills, points, boundaries, truncated: fillsSeen > fills.length || pointsSeen > points.length };
};
