import { applyGraph2DAuthoring, canonicalJsonStringify, createGraph2DDocument,
  type AnalysisResultEnvelope, type Graph2DAuthoringAction,
  type Graph2DDocument, type Graph2DLinkedCombinedRegionOrigin,
  type Graph2DPointRow, type Graph2DPointSeriesObject,
  type VectorField3DDocument, type VectorField3DOverlayRegion } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import { linkedCombinedRegionGraphsWithCurl,
  linkedCombinedRegionGraphsWithCurlRows, validateCombinedRegionGraphGroup,
  type CombinedRegionGraphGroup } from "./linkedCombinedRegionGraphs";
import { verifiedCombinedDerivedRegionProfiles } from "./derivedCombinedRegionProfile";
import { linkedCombinedRegionIntersectionFocus,
  type LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import { inspectCombinedSubrectangle } from "./combinedSubrectangleResult";
import type { CombinedRegionInspection } from "./combinedFieldInspection";

type Digest = Readonly<{ name: string; sampleSha256: string }>;
type Bounds = VectorField3DOverlayRegion["bounds"];
type Group = Readonly<{ objects: readonly Graph2DPointSeriesObject[];
  origins: readonly Graph2DLinkedCombinedRegionOrigin[];
  rows: readonly (readonly Graph2DPointRow[])[] }>;

/** Prepare both profile groups and the result before committing either to Project. */
export async function prepareCombinedSubrectanglePublication(
  field: VectorField3DDocument, graph: Graph2DDocument,
  region: VectorField3DOverlayRegion, bounds: Bounds,
  inspection: CombinedRegionInspection, vectorSamples: readonly Digest[],
  scalarSampleSha256: string, realSampleSha256: string,
  imaginarySampleSha256: string,
  bridge: NonNullable<typeof window.scientificScenes>): Promise<Readonly<{
    actions: readonly Graph2DAuthoringAction[];
    result: AnalysisResultEnvelope;
    focus: LinkedRegionGraphFocus;
    selectionObjectId: string;
  }>> {
  if (!field.workspace?.scalarOverlay?.visible ||
      !field.workspace.complexOverlay?.visible || !region.visible ||
      canonicalJsonStringify(field.workspace.overlayRegion) !==
        canonicalJsonStringify(region))
    throw new TypeError("Select a visible vector, scalar and complex rectangle first.");
  const derived = await verifiedCombinedDerivedRegionProfiles(field, region, bridge);
  const args = [field, region, inspection, vectorSamples, scalarSampleSha256,
    realSampleSha256, imaginarySampleSha256,
    { ...derived.divergence, samples: derived.samples },
    derived.curlMagnitude] as const;
  const column = linkedCombinedRegionGraphsWithCurl(...args);
  const row = linkedCombinedRegionGraphsWithCurlRows(...args);
  const actions: Graph2DAuthoringAction[] = [];
  let candidate = graph;
  const collect = (expected: CombinedRegionGraphGroup): Group => {
    const pairId = expected[0]!.origin.pairId;
    const objects = candidate.source.objects.filter((object): object is
      Graph2DPointSeriesObject => object.kind === "point-series" &&
      object.linkedOrigin?.pairId === pairId);
    if (objects.length !== expected.length)
      throw new TypeError("A saved profile group is incomplete or duplicated.");
    const ordered = expected.map(series => objects.find(object =>
      object.linkedOrigin?.series === series.origin.series));
    if (ordered.some(object => !object?.linkedOrigin))
      throw new TypeError("A saved profile group is missing a field.");
    const origins = ordered.map(object => object!.linkedOrigin as
      Graph2DLinkedCombinedRegionOrigin);
    const rows = ordered.map(object => pointTableStore.resolve(object!.table));
    if (rows.some(item => !item))
      throw new TypeError("A saved profile point table is unavailable.");
    validateCombinedRegionGraphGroup(origins, rows as Graph2DPointRow[][]);
    return { objects: ordered as Graph2DPointSeriesObject[], origins,
      rows: rows as Graph2DPointRow[][] };
  };
  const ensure = (group: CombinedRegionGraphGroup): Group => {
    const pairId = group[0]!.origin.pairId;
    if (!candidate.source.objects.some(object => object.kind === "point-series" &&
        object.linkedOrigin?.pairId === pairId)) {
      const drafts = group.map((series, index) => ({ label: series.label,
        table: pointTableStore.publish(series.rows), mode: "line" as const,
        domain: series.domain, linkedOrigin: series.origin,
        style: { color: ["#fde047", "#38bdf8", "#fb7185", "#a78bfa",
          "#34d399", "#f97316"][index]!, lineWidth: 2,
          lineStyle: "solid" as const, visible: true } }));
      const action = { type: "create-point-series-group" as const, drafts };
      candidate = createGraph2DDocument({
        ...applyGraph2DAuthoring(candidate, action),
        stableKey: [graph.identity.id, pairId] });
      actions.push(action);
    }
    return collect(group);
  };
  const columns = ensure(column);
  const rows = ensure(row);
  const focus = linkedCombinedRegionIntersectionFocus(columns.origins,
    columns.rows, rows.origins, rows.rows,
    bounds.map(([min, max]) => ({ kind: "interval" as const, min, max })) as [
      { kind: "interval"; min: number; max: number },
      { kind: "interval"; min: number; max: number }]);
  const intersection = focus.intersection!;
  const checked = await inspectCombinedSubrectangle(field, [candidate], region,
    intersection.bounds, { columnPairId: intersection.columnPairId,
      rowPairId: intersection.rowPairId }, bridge);
  if (!checked.result)
    throw new TypeError("Combined subrectangle statistics are unavailable.");
  return { actions, result: checked.result, focus,
    selectionObjectId: columns.objects[0]!.id };
}
