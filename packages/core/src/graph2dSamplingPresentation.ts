import { structuralHash, type DocumentIdentity } from "./documentIdentity";
import type { Graph2DSceneSamplingRequest, Graph2DSampledSeries } from "./graph2dSceneSampling";

/** Presentation-only continuity. A viewport change does not change mathematical ownership. */
export const graph2DSamplingPresentationContext = (request: Graph2DSceneSamplingRequest, previewBase?: DocumentIdentity) =>
  structuralHash({ owner: previewBase ?? request.document.identity, styles: request.document.display.objects,
    sampling: request.document.display.sampling, scales: { x: request.viewport.xScale ?? "linear", y: request.viewport.yScale ?? "linear", continuation: request.viewport.continuation ?? false }, pointTables: request.pointTables ?? {} });

export const graph2DSeriesHasGeometry = (item: Graph2DSampledSeries) => item.artifact.segments.some(segment => segment.points.length > 0) ||
  ("fills" in item.artifact && Array.isArray(item.artifact.fills) && item.artifact.fills.length > 0) ||
  ("endpoints" in item.artifact && Array.isArray(item.artifact.endpoints) && item.artifact.endpoints.length > 0);

/** Never bridge a new source or pretend retained samples are current. Only deadline starvation can retain an empty settled object. */
export const presentGraph2DSampling = (context: string, key: string,
  current: { context: string; key: string; series: readonly Graph2DSampledSeries[]; error?: string } | null,
  previous: { context: string; series: readonly Graph2DSampledSeries[] } | null) => {
  const retained = previous?.context === context ? previous.series : [];
  if (current?.context !== context || current.key !== key) return { series: retained, ready: false, settled: false, retained: retained.length > 0, error: undefined };
  if (current.error) return { series: retained, ready: false, settled: true, retained: retained.length > 0, error: current.error };
  let reused = false;
  const series = current.series.map(item => {
    const old = retained.find(previous => previous.objectId === item.objectId);
    if (!graph2DSeriesHasGeometry(item) && item.artifact.diagnostics.some(diagnostic => diagnostic.code === "deadline") && old && graph2DSeriesHasGeometry(old)) {
      reused = true; return old;
    }
    return item;
  });
  return { series, ready: !reused, settled: true, retained: reused, error: undefined };
};
