import { useId } from "react";
import {
  resolveGraph2DViewport, type Graph2DDisplay, type Graph2DSamplingArtifact,
  graph2DWorldToScreen, clipGraph2DLineOverlay, type Graph2DLineOverlay,
  type Graph2DProbe, type Graph2DScreenSize,
  type Graph2DIntervalAnalysis,
  type Graph2DIntegralAnalysis,
} from "@math3d/core";
import { projectGraph2DGrid } from "./gridProjection";

export type Graph2DPlotSeries = Readonly<{
  objectId: string;
  artifact: Graph2DSamplingArtifact;
  style: Graph2DDisplay["objects"][number];
}>;
type Props = { display: Graph2DDisplay; size: Graph2DScreenSize; series: readonly Graph2DPlotSeries[];
  selectedProbe?: Graph2DProbe | null; hoverProbe?: Graph2DProbe | null;
  overlays?: readonly Graph2DLineOverlay[]; intervals?: Graph2DIntervalAnalysis | null;
  area?: Graph2DIntegralAnalysis | null };

export function Graph2DPlot({ display, size, series, selectedProbe, hoverProbe, overlays = [], intervals, area }: Props) {
  const clipId = useId();
  const grid = projectGraph2DGrid(display.viewport, size);
  const bounds = resolveGraph2DViewport(display.viewport, size);
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const marker = (probe: Graph2DProbe | null | undefined, kind: "selected" | "hover") => {
    if (!probe) return null;
    const screen = graph2DWorldToScreen(display.viewport, size, probe);
    if (screen.x < 0 || screen.x > size.width || screen.y < 0 || screen.y > size.height) return null;
    return <g className={"graph2d-probe-marker graph2d-probe-" + kind} aria-hidden="true" key={kind}>
      <circle cx={screen.x} cy={screen.y} r={kind === "selected" ? 7 : 5} />
      <circle cx={screen.x} cy={screen.y} r={2} />
    </g>;
  };
  const pathFor = (artifact: Graph2DSamplingArtifact): string => artifact.segments.map((segment) => {
    let path = "";
    let drawing = false;
    for (const point of segment.points) {
      const x = (point.x - bounds.xMin) / xSpan * size.width;
      const y = (bounds.yMax - point.y) / ySpan * size.height;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { drawing = false; continue; }
      path += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      drawing = true;
    }
    return path;
  }).join("");
  return (
    <svg data-testid="graph2d-plot" role="img" aria-label="Cartesian graph plot" className="graph2d-plot"
      viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
      <defs><clipPath id={clipId}><rect x="0" y="0" width={size.width} height={size.height} /></clipPath></defs>
      <rect x="0" y="0" width={size.width} height={size.height} className="graph2d-plot-background" />
      {display.axes.grid && <g className="graph2d-grid" aria-hidden="true">
        {grid.verticalMinor.map((pixel, index) => <line key={`vm-${index}`} className="graph2d-grid-minor" x1={pixel} x2={pixel} y1="0" y2={size.height} />)}
        {grid.horizontalMinor.map((pixel, index) => <line key={`hm-${index}`} className="graph2d-grid-minor" x1="0" x2={size.width} y1={pixel} y2={pixel} />)}
        {grid.verticalMajor.map((tick) => <line key={`v-${tick.value}`} className="graph2d-grid-major" x1={tick.pixel} x2={tick.pixel} y1="0" y2={size.height} />)}
        {grid.horizontalMajor.map((tick) => <line key={`h-${tick.value}`} className="graph2d-grid-major" x1="0" x2={size.width} y1={tick.pixel} y2={tick.pixel} />)}
      </g>}
      {display.axes.x && grid.xAxis !== null && <line className="graph2d-axis" x1="0" x2={size.width} y1={grid.xAxis} y2={grid.xAxis} />}
      {display.axes.y && grid.yAxis !== null && <line className="graph2d-axis" x1={grid.yAxis} x2={grid.yAxis} y1="0" y2={size.height} />}
      {display.axes.labels && <g className="graph2d-tick-labels" aria-hidden="true">
        {grid.verticalMajor.filter((tick) => tick.value !== 0).map((tick) => <text key={`xl-${tick.value}`} x={tick.pixel + 3} y={Math.min(size.height - 5, Math.max(14, grid.xAxis ?? size.height - 12))}>{tick.label}</text>)}
        {grid.horizontalMajor.filter((tick) => tick.value !== 0).map((tick) => <text key={`yl-${tick.value}`} x={Math.min(size.width - 32, Math.max(5, (grid.yAxis ?? 0) + 5))} y={tick.pixel - 3}>{tick.label}</text>)}
      </g>}
      <g clipPath={`url(#${clipId})`}>
        {area && <g data-testid="graph2d-area-overlay" data-result-id={area.resultId}
          className={`graph2d-area-overlay graph2d-area-${area.mode}`} aria-hidden="true">
          {area.fillSegments.map((segment) => <polygon key={segment.artifactId} data-area-artifact={segment.artifactId}
            points={segment.points.map((point) => `${(point.x - bounds.xMin) / xSpan * size.width},${(bounds.yMax - point.y) / ySpan * size.height}`).join(" ")} />)}
        </g>}
        {series.filter((item) => item.style.visible).map((item) => <path key={item.objectId} data-graph2d-path={item.objectId}
          d={pathFor(item.artifact)} fill="none" stroke={item.style.color} strokeWidth={item.style.lineWidth}
          strokeDasharray={item.style.lineStyle === "dashed" ? "8 5" : item.style.lineStyle === "dotted" ? "2 4" : undefined}
          strokeLinejoin="round" strokeLinecap="round" />)}
        {overlays.map((overlay) => {
          const segment = clipGraph2DLineOverlay(overlay, display.viewport, size);
          if (!segment) return null;
          const a = graph2DWorldToScreen(display.viewport, size, segment[0]);
          const b = graph2DWorldToScreen(display.viewport, size, segment[1]);
          return <line key={overlay.artifactId} data-graph2d-overlay={overlay.kind}
            className={"graph2d-differential-overlay graph2d-differential-" + overlay.kind}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </g>
      {intervals && <g data-testid="graph2d-interval-overlays" data-result-id={intervals.resultId} aria-hidden="true">
        {intervals.partitions.map((part) => {
          const x = (part.min - bounds.xMin) / xSpan * size.width;
          const width = (part.max - part.min) / xSpan * size.width;
          return <g key={part.intervalId} data-interval-id={part.intervalId}>
            <rect className={`graph2d-interval-trend graph2d-interval-${part.monotonicity}`}
              x={x} y={size.height - 14} width={width} height={5} />
            <rect className={`graph2d-interval-concavity graph2d-interval-${part.concavity}`}
              x={x} y={size.height - 7} width={width} height={5} />
          </g>;
        })}
      </g>}
      {marker(hoverProbe, "hover")}
      {marker(selectedProbe, "selected")}
    </svg>
  );
}
