import { useId } from "react";
import {
  resolveGraph2DViewport, graph2DHasLogScale, type Graph2DDisplay, type Graph2DSamplingArtifact,
  graph2DWorldToScreen, clipGraph2DLineOverlay, type Graph2DLineOverlay,
  type Graph2DProbe, type Graph2DScreenSize,
  type Graph2DIntervalAnalysis,
  type Graph2DIntegralAnalysis,
  type Graph2DIntersectionAnalysis,
  type Graph2DRegionArtifact,
  type Graph2DPointSeriesArtifact,
  type Graph2DPiecewiseArtifact,
  graph2DRegressionOverlaySeries, type Graph2DRegression,
} from "@math3d/core";
import { projectGraph2DGrid } from "./gridProjection";

const isPiecewise = (artifact: Graph2DSamplingArtifact): artifact is Graph2DPiecewiseArtifact =>
  "kind" in artifact && artifact.kind === "piecewise";

export type Graph2DPlotSeries = Readonly<{
  objectId: string;
  artifact: Graph2DSamplingArtifact;
  style: Graph2DDisplay["objects"][number];
  continuation?: Graph2DSamplingArtifact;
}>;
type Props = { display: Graph2DDisplay; size: Graph2DScreenSize; series: readonly Graph2DPlotSeries[]; regression?: Graph2DRegression | null;
  selectedProbe?: Graph2DProbe | null; hoverProbe?: Graph2DProbe | null;
  overlays?: readonly Graph2DLineOverlay[]; intervals?: Graph2DIntervalAnalysis | null;
  area?: Graph2DIntegralAnalysis | null; intersections?: Graph2DIntersectionAnalysis | null };

export function Graph2DPlot({ display, size, series, regression, selectedProbe, hoverProbe, overlays = [], intervals, area, intersections }: Props) {
  if (graph2DHasLogScale(display.viewport)) { overlays = []; area = null; intervals = null; }
  const clipId = useId();
  const grid = projectGraph2DGrid(display.viewport, size);
  const bounds = resolveGraph2DViewport(display.viewport, size);
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const origin = graph2DWorldToScreen(display.viewport, size, { x: 0, y: 0 });
  const polarMaxRadius = Math.max(...[bounds.xMin, bounds.xMax].flatMap((x) =>
    [bounds.yMin, bounds.yMax].map((y) => Math.hypot(x, y))));
  const radialStep = grid.verticalMajor.length >= 2 ?
    Math.abs(grid.verticalMajor[1]!.value - grid.verticalMajor[0]!.value) : Math.max(xSpan, ySpan) / 8;
  const radialCount = Math.min(24, Math.ceil(polarMaxRadius / radialStep));
  const marker = (probe: Graph2DProbe | null | undefined, kind: "selected" | "hover") => {
    if (!probe) return null;
    const screen = graph2DWorldToScreen(display.viewport, size, probe);
    if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y) || screen.x < 0 || screen.x > size.width || screen.y < 0 || screen.y > size.height) return null;
    return <g className={"graph2d-probe-marker graph2d-probe-" + kind} aria-hidden="true" key={kind}>
      <circle cx={screen.x} cy={screen.y} r={kind === "selected" ? 7 : 5} />
      <circle cx={screen.x} cy={screen.y} r={2} />
    </g>;
  };
  const pathFor = (artifact: Graph2DSamplingArtifact): string => artifact.segments.map((segment) => {
    let path = "";
    let drawing = false;
    for (const point of segment.points) {
      const { x, y } = graph2DWorldToScreen(display.viewport, size, point);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { drawing = false; continue; }
      path += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      drawing = true;
    }
    return path;
  }).join("");
  const isRegion = (artifact: Graph2DSamplingArtifact): artifact is Graph2DRegionArtifact =>
    "kind" in artifact && artifact.kind === "inequality-region";
  const isPointSeries = (artifact: Graph2DSamplingArtifact): artifact is Graph2DPointSeriesArtifact =>
    "kind" in artifact && artifact.kind === "point-series";
  return (
    <svg data-testid="graph2d-plot" role="img" aria-label="Cartesian graph plot" className="graph2d-plot"
      viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
      <defs><clipPath id={clipId}><rect x="0" y="0" width={size.width} height={size.height} /></clipPath></defs>
      <rect x="0" y="0" width={size.width} height={size.height} className="graph2d-plot-background" />
      {display.axes.grid && (display.axes.gridMode ?? "cartesian") === "cartesian" &&
      <g className="graph2d-grid" aria-hidden="true">
        {grid.verticalMinor.map((pixel, index) => <line key={`vm-${index}`} className="graph2d-grid-minor" x1={pixel} x2={pixel} y1="0" y2={size.height} />)}
        {grid.horizontalMinor.map((pixel, index) => <line key={`hm-${index}`} className="graph2d-grid-minor" x1="0" x2={size.width} y1={pixel} y2={pixel} />)}
        {grid.verticalMajor.map((tick) => <line key={`v-${tick.value}`} className="graph2d-grid-major" x1={tick.pixel} x2={tick.pixel} y1="0" y2={size.height} />)}
        {grid.horizontalMajor.map((tick) => <line key={`h-${tick.value}`} className="graph2d-grid-major" x1="0" x2={size.width} y1={tick.pixel} y2={tick.pixel} />)}
      </g>}
      {display.axes.grid && display.axes.gridMode === "polar" &&
      <g data-testid="graph2d-polar-grid" className="graph2d-polar-grid" clipPath={`url(#${clipId})`} aria-hidden="true">
        {Array.from({ length: radialCount }, (_, index) => (index + 1) * radialStep).map((radius) =>
          <g key={`r-${radius}`}>
            <ellipse cx={origin.x} cy={origin.y} rx={radius / xSpan * size.width}
              ry={radius / ySpan * size.height} />
            {display.axes.labels && radius <= Math.max(Math.abs(bounds.xMin), Math.abs(bounds.xMax)) &&
              <text x={origin.x + radius / xSpan * size.width + 3} y={origin.y - 3}>{radius.toPrecision(3)}</text>}
          </g>)}
        {Array.from({ length: 12 }, (_, index) => index * Math.PI / 6).map((theta, index) => {
          const end = graph2DWorldToScreen(display.viewport, size,
            { x: polarMaxRadius * Math.cos(theta), y: polarMaxRadius * Math.sin(theta) });
          const labelRadius = Math.min(polarMaxRadius, Math.min(xSpan, ySpan) * 0.42);
          const label = graph2DWorldToScreen(display.viewport, size,
            { x: labelRadius * Math.cos(theta), y: labelRadius * Math.sin(theta) });
          return <g key={`theta-${index}`}>
            <line x1={origin.x} y1={origin.y} x2={end.x} y2={end.y} />
            {display.axes.labels && <text x={label.x + 3} y={label.y - 3}>{index * 30}°</text>}
          </g>;
        })}
      </g>}
      {display.axes.x && grid.xAxis !== null && <line className="graph2d-axis" x1="0" x2={size.width} y1={grid.xAxis} y2={grid.xAxis} />}
      {display.axes.y && grid.yAxis !== null && <line className="graph2d-axis" x1={grid.yAxis} x2={grid.yAxis} y1="0" y2={size.height} />}
      {display.axes.labels && <g className="graph2d-tick-labels" aria-hidden="true">
        {grid.verticalMajor.filter((tick) => tick.value !== 0).map((tick) => <text key={`xl-${tick.value}`} x={tick.pixel + 3} y={Math.min(size.height - 5, Math.max(14, grid.xAxis ?? size.height - 12))}>{tick.label}</text>)}
        {grid.horizontalMajor.filter((tick) => tick.value !== 0).map((tick) => <text key={`yl-${tick.value}`} x={Math.min(size.width - 32, Math.max(5, (grid.yAxis ?? 0) + 5))} y={tick.pixel - 3}>{tick.label}</text>)}
      </g>}
      <g clipPath={`url(#${clipId})`}>
        {regression && <g data-testid="graph2d-regression-overlay" aria-hidden="true">
          {regression.curve.slice(1).map((p, i) => {
            const a = regression.curve[i], corners = [{ x: a.x, y: a.meanLow }, { x: p.x, y: p.meanLow }, { x: p.x, y: p.meanHigh }, { x: a.x, y: a.meanHigh }].map(point => graph2DWorldToScreen(display.viewport, size, point));
            return corners.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ? <polygon key={i} points={corners.map(point => `${point.x},${point.y}`).join(" ")} fill="#7c3aed" fillOpacity={.12} /> : null;
          })}
          {graph2DRegressionOverlaySeries(regression).map(item => <path key={item.objectId} d={pathFor(item.artifact)} fill="none" stroke={item.style.color}
            strokeWidth={item.style.lineWidth} strokeDasharray={item.style.lineStyle === "solid" ? undefined : item.style.lineStyle === "dashed" ? "8 5" : "2 4"} />)}
        </g>}
        {display.viewport.continuation && series.filter(item => item.style.visible && item.continuation).map(item =>
          <path key={`continuation-${item.objectId}`} data-graph2d-continuation={item.objectId} d={pathFor(item.continuation!)}
            fill="none" stroke={item.style.color} strokeOpacity={0.35} strokeWidth={item.style.lineWidth} strokeDasharray="3 6" aria-hidden="true" />)}
        {series.filter((item) => item.style.visible && isRegion(item.artifact)).map((item) => {
          const region = item.artifact as Graph2DRegionArtifact;
          const d = region.fills.map((fill) => {
            const { x, y } = graph2DWorldToScreen(display.viewport, size, { x: fill.xMin, y: fill.yMax });
            const b = graph2DWorldToScreen(display.viewport, size, { x: fill.xMax, y: fill.yMin });
            const width = b.x - x, height = b.y - y;
            return `M${x.toFixed(2)},${y.toFixed(2)}h${width.toFixed(2)}v${height.toFixed(2)}h${(-width).toFixed(2)}Z`;
          }).join("");
          return <path key={`fill-${item.objectId}`} data-graph2d-region={item.objectId} data-region-state={region.state}
            d={d} fill={item.style.color} fillOpacity={0.18} stroke="none" />;
        })}
        {area && <g data-testid="graph2d-area-overlay" data-result-id={area.resultId}
          className={`graph2d-area-overlay graph2d-area-${area.mode}`} aria-hidden="true">
          {area.fillSegments.map((segment) => <polygon key={segment.artifactId} data-area-artifact={segment.artifactId}
            points={segment.points.map((point) => `${(point.x - bounds.xMin) / xSpan * size.width},${(bounds.yMax - point.y) / ySpan * size.height}`).join(" ")} />)}
        </g>}
        {series.filter((item) => item.style.visible).flatMap((item) => isRegion(item.artifact) ?
          item.artifact.boundaries.map((boundary, index) => <path key={`${item.objectId}-${index}`}
            data-graph2d-path={item.objectId} data-boundary-strict={boundary.strict}
            d={pathFor({ ...item.artifact, segments: boundary.segments })} fill="none"
            stroke={item.style.color} strokeWidth={item.style.lineWidth}
            strokeDasharray={boundary.strict ? "6 5" : item.style.lineStyle === "dashed" ? "8 5" :
              item.style.lineStyle === "dotted" ? "2 4" : undefined}
            strokeLinejoin="round" strokeLinecap="round" />) :
          [<path key={item.objectId} data-graph2d-path={item.objectId}
            d={isPointSeries(item.artifact) && item.artifact.mode === "points" ? "" : pathFor(item.artifact)}
            fill="none" stroke={item.style.color} strokeWidth={item.style.lineWidth}
            strokeDasharray={item.style.lineStyle === "dashed" ? "8 5" : item.style.lineStyle === "dotted" ? "2 4" : undefined}
            strokeLinejoin="round" strokeLinecap="round" />])}
        {series.filter((item) => item.style.visible && isPiecewise(item.artifact))
          .flatMap((item) => (item.artifact as Graph2DPiecewiseArtifact).endpoints.map((endpoint, index) => {
            const screen = graph2DWorldToScreen(display.viewport, size, endpoint);
            if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
            return <circle key={`${item.objectId}-endpoint-${index}`} className="graph2d-domain-endpoint"
              data-graph2d-endpoint={item.objectId} data-endpoint-open={endpoint.open}
              data-endpoint-side={endpoint.side} cx={screen.x} cy={screen.y}
              r={Math.max(3.5, item.style.lineWidth + 2)} fill={endpoint.open ? "var(--panel-bg, #fff)" : item.style.color}
              stroke={item.style.color} strokeWidth={Math.max(1.5, item.style.lineWidth)} />;
          }))}
        {series.filter((item) => item.style.visible && isPointSeries(item.artifact)).map((item) => {
          const artifact = item.artifact as Graph2DPointSeriesArtifact;
          return <g key={`markers-${item.objectId}`} data-graph2d-series-markers={item.objectId}>
            {artifact.points.filter((point) => point.x >= bounds.xMin && point.x <= bounds.xMax &&
              point.y >= bounds.yMin && point.y <= bounds.yMax).map((point) => {
              const screen = graph2DWorldToScreen(display.viewport, size, point);
              return <circle key={point.rowId} data-row-id={point.rowId} cx={screen.x} cy={screen.y}
                r={Math.max(2.5, item.style.lineWidth + 1.5)} fill={item.style.color} />;
            })}
          </g>;
        })}
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
      {intersections && <g data-testid="graph2d-intersection-overlays" data-result-id={intersections.resultId}
        className="graph2d-intersection-overlays" clipPath={`url(#${clipId})`} aria-hidden="true">
        {intersections.candidates.map((candidate) => {
          const point = graph2DWorldToScreen(display.viewport, size, candidate);
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
          return <circle key={candidate.candidateId} data-intersection-id={candidate.candidateId}
            cx={point.x} cy={point.y} r={5} />;
        })}
      </g>}
      {marker(hoverProbe, "hover")}
      {marker(selectedProbe, "selected")}
    </svg>
  );
}
