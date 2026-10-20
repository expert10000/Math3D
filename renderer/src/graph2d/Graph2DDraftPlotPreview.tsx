import { applyGraph2DAuthoring, graph2DPointDomain, sampleGraph2DPointSeries, sampleGraph2DScene,
  type Graph2DAuthoringAction, type Graph2DDisplay, type Graph2DDocument, type Graph2DPointRow,
  type Graph2DSamplingArtifact, type Graph2DContourArtifact } from "@math3d/core";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";

const size = { width: 720, height: 320 };
type Preview = Readonly<{ display: Graph2DDisplay; series: readonly Graph2DPlotSeries[]; warning: string | null;
  diagnostics: Readonly<{ expression: string; contour: string | null; components: string;
    sampling: string; errorEstimate: string; viewport: string; performance: string }> }>;
const format = (value: number) => Number(value.toPrecision(4)).toString();

const padded = (min: number, max: number): readonly [number, number] => {
  const span = max - min;
  const pad = span > 0 ? span * .1 : Math.max(1, Math.abs(min) * .1);
  return [min - pad, max + pad];
};

function previewBounds(artifact: Graph2DSamplingArtifact) {
  const points = artifact.segments.flatMap(segment => segment.points);
  if ("points" in artifact && Array.isArray(artifact.points)) points.push(...artifact.points);
  if ("fills" in artifact && Array.isArray(artifact.fills))
    for (const fill of artifact.fills) points.push({ x: fill.xMin, y: fill.yMin }, { x: fill.xMax, y: fill.yMax });
  if ("fieldSegments" in artifact && Array.isArray(artifact.fieldSegments))
    for (const segment of artifact.fieldSegments) points.push(...segment.points);
  return points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

/** Render a draft with the same bounded sampler and plot as the workspace, without committing it. */
export function buildGraph2DDraftPlotPreview(document: Graph2DDocument,
  action: Graph2DAuthoringAction | null, pointRows?: readonly Graph2DPointRow[],
  pointStyle?: Graph2DDisplay["objects"][number]): Preview {
  const started = performance.now();
  let series: readonly Graph2DPlotSeries[];
  let object: Graph2DDocument["source"]["objects"][number] | null = null;
  if (pointRows && pointStyle) {
    const objectId = "draft-point-series";
    const pointObject = { id: objectId, kind: "point-series" as const, label: "Preview",
      table: { id: "draft-table", checksum: "draft", rowCount: pointRows.length,
        encoding: "math3d.graph2d-point-table.v1" as const }, mode: action?.type === "edit-point-series" ||
        action?.type === "create-point-series" ? action.draft.mode : "points" as const,
      missing: "gap" as const, domain: graph2DPointDomain(pointRows) };
    object = pointObject;
    series = [{ objectId, style: { ...pointStyle, objectId },
      artifact: sampleGraph2DPointSeries(pointObject, pointRows, Math.max(32, pointRows.length)) }];
  } else {
    if (!action) throw new Error("A graph draft is required for preview.");
    const scene = applyGraph2DAuthoring(document, action);
    const objectId = scene.selection.objectId;
    object = scene.source.objects.find(entry => entry.id === objectId) ?? null;
    if (!object) throw new Error("The draft graph could not be selected for preview.");
    const horizontal = "domain" in object && object.kind !== "polar" && object.kind !== "parametric" ?
      padded(object.domain.min, object.domain.max) : [-10, 10] as const;
    const vertical = "yDomain" in object ? padded(object.yDomain.min, object.yDomain.max) :
      object.kind === "time-ode" ? padded(object.stateDomain.min, object.stateDomain.max) : [-10, 10] as const;
    const viewport = { xMin: horizontal[0], xMax: horizontal[1], yMin: vertical[0], yMax: vertical[1],
      aspect: "free" as const };
    const isolated = { ...document, ...scene,
      display: { ...scene.display, viewport, objects: scene.display.objects.map(style =>
        ({ ...style, visible: style.objectId === objectId })),
        sampling: { maxSamples: 2400, maxDepth: 8, tolerancePx: 2 } } };
    series = sampleGraph2DScene({ document: isolated, viewport, ...size, interaction: true, timeBudgetMs: 120 })
      .filter(item => item.objectId === objectId);
  }
  const artifact = series[0]?.artifact;
  const points = artifact ? previewBounds(artifact) : [];
  const fixedDomains = object && ("yDomain" in object || object.kind === "time-ode");
  const fallbackX = object && "domain" in object && object.kind !== "polar" && object.kind !== "parametric" ?
    padded(object.domain.min, object.domain.max) : [-10, 10] as const;
  const fallbackY = object && "yDomain" in object ? padded(object.yDomain.min, object.yDomain.max) :
    object?.kind === "time-ode" ? padded(object.stateDomain.min, object.stateDomain.max) : [-10, 10] as const;
  const x = points.length && !fixedDomains ? padded(Math.min(...points.map(point => point.x)),
    Math.max(...points.map(point => point.x))) : fallbackX;
  const y = points.length && !fixedDomains ? padded(Math.min(...points.map(point => point.y)),
    Math.max(...points.map(point => point.y))) : fallbackY;
  const display: Graph2DDisplay = { ...document.display,
    axes: { ...document.display.axes, grid: true, labels: true },
    viewport: { xMin: x[0], xMax: x[1], yMin: y[0], yMax: y[1],
      aspect: object?.kind === "polar" || object?.kind === "parametric" ? "equal" : "free" },
    objects: series.map(item => item.style) };
  const warning = points.length ? null : "No visible graph in this preview range.";
  const contour = artifact && "kind" in artifact && artifact.kind === "implicit-contour" ?
    artifact as Graph2DContourArtifact : null;
  const contourStatus = contour && object && "domain" in object && "yDomain" in object ? (() => {
    const tolerance = Math.max(object.domain.max - object.domain.min,
      object.yDomain.max - object.yDomain.min) * 1e-7;
    const onBoundary = (point: { x: number; y: number }) =>
      Math.abs(point.x - object.domain.min) <= tolerance || Math.abs(point.x - object.domain.max) <= tolerance ||
      Math.abs(point.y - object.yDomain.min) <= tolerance || Math.abs(point.y - object.yDomain.max) <= tolerance;
    let closed = 0, clipped = 0;
    for (const segment of contour.segments) {
      const first = segment.points[0], last = segment.points.at(-1);
      if (!first || !last) continue;
      if (Math.hypot(first.x - last.x, first.y - last.y) <= tolerance) closed += 1;
      else if (onBoundary(first) || onBoundary(last)) clipped += 1;
    }
    return `${closed} closed · ${contour.segments.length - closed - clipped} open · ${clipped} clipped` +
      (contour.unresolvedCells ? ` · ${contour.unresolvedCells} uncertain cells` : "");
  })() : null;
  const invalid = artifact?.diagnostics.find(item => item.code === "invalid-sample")?.count ?? 0;
  const diagnostics = {
    expression: !artifact ? "Unavailable" : !artifact.converged ? "Incomplete" :
      !points.length && invalid > 0 ? "Domain error in sampled range" :
        !points.length ? "No visible result" : invalid > 0 ? `Valid with ${invalid} undefined samples` : "Valid",
    contour: contourStatus,
    components: artifact ? `${artifact.segments.length} sampled ${contour ? "branches" : "paths"}` : "Unavailable",
    sampling: artifact ? `${artifact.samplesEvaluated} evaluations` +
      (contour ? ` · ${contour.refinedCells} refined cells` : "") : "Unavailable",
    errorEstimate: contour && contour.resolutionPx > 0 ?
      `Cell resolution ≤ ${format(contour.resolutionPx)} px; numerical error unbounded` : "Not estimated",
    viewport: `x: ${format(x[0])} to ${format(x[1])} · y: ${format(y[0])} to ${format(y[1])}`,
    performance: `${Math.max(0.1, Number((performance.now() - started).toFixed(1)))} ms`,
  };
  return { display, series, warning, diagnostics };
}

export function Graph2DDraftPlotPreview({ preview }: { preview: Preview }) {
  const diagnostics = preview.diagnostics;
  return <>
    <div className="graph2d-draft-plot-preview" aria-label="Plotted graph preview">
      <Graph2DPlot display={preview.display} size={size} series={preview.series} />
      {preview.warning && <p role="status">{preview.warning}</p>}
    </div>
    <section className="graph2d-draft-preview-diagnostics" aria-label="Preview diagnostics">
      <h4>Preview Inspector</h4>
      <dl><dt>Expression</dt><dd>{diagnostics.expression}</dd>
        {diagnostics.contour !== null && <><dt>Contour</dt><dd>{diagnostics.contour}</dd></>}
        <dt>Components</dt><dd>{diagnostics.components}</dd>
        <dt>Sampling</dt><dd>{diagnostics.sampling}</dd>
        <dt>Error estimate</dt><dd>{diagnostics.errorEstimate}</dd>
        <dt>Viewport</dt><dd>{diagnostics.viewport}</dd>
        <dt>Performance</dt><dd>{diagnostics.performance}</dd></dl>
    </section>
  </>;
}
