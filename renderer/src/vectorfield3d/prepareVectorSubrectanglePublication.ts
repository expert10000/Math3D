import { applyGraph2DAuthoring, canonicalJsonStringify, createGraph2DDocument,
  type AnalysisResultEnvelope, type Graph2DAuthoringAction, type Graph2DDocument,
  type Graph2DLinkedVectorRegionOrigin, type Graph2DPointRow,
  type Graph2DPointSeriesObject, type VectorField3DDocument,
  type VectorField3DOverlayRegion } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import { verifiedCombinedDerivedRegionProfiles,
  verifiedVectorRegionProfile } from "./derivedCombinedRegionProfile";
import { linkedVectorDerivedRegionGraphs, validateVectorDerivedRegionGraphGroup,
  vectorDerivedRegionSeries, type VectorDerivedRegionGraphGroup } from
  "./linkedVectorDerivedRegionGraphs";
import { linkedVectorDerivedRegionIntersectionFocus,
  type LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import { verifiedVectorSubrectangleResult } from "./vectorDerivedSubrectangleResult";

type Bounds = VectorField3DOverlayRegion["bounds"];
type Group = Readonly<{ objects: readonly Graph2DPointSeriesObject[];
  origins: readonly Graph2DLinkedVectorRegionOrigin[];
  rows: readonly (readonly Graph2DPointRow[])[] }>;

/** Prepare six verified vector profiles and their compact Project result. */
export async function prepareVectorSubrectanglePublication(
  field: VectorField3DDocument, graph: Graph2DDocument,
  region: VectorField3DOverlayRegion, bounds: Bounds,
  bridge: NonNullable<typeof window.scientificScenes>): Promise<Readonly<{
    actions: readonly Graph2DAuthoringAction[];
    result: AnalysisResultEnvelope;
    focus: LinkedRegionGraphFocus;
    selectionObjectId: string;
  }>> {
  if (!region.visible || canonicalJsonStringify(field.workspace?.overlayRegion) !==
      canonicalJsonStringify(region) || field.workspace?.scalarOverlay?.visible ||
      field.workspace?.complexOverlay?.visible)
    throw new TypeError("Select a visible vector-only rectangle first.");
  const [speed, derived] = await Promise.all([
    verifiedVectorRegionProfile(field, region, bridge),
    verifiedCombinedDerivedRegionProfiles(field, region, bridge)]);
  const column = linkedVectorDerivedRegionGraphs(field, region, speed, derived);
  const row = linkedVectorDerivedRegionGraphs(field, region, speed, derived, 1);
  const actions: Graph2DAuthoringAction[] = [];
  let candidate = graph;
  const collect = (expected: VectorDerivedRegionGraphGroup): Group => {
    const pairId = expected[0]!.origin.pairId;
    const objects = candidate.source.objects.filter((object): object is
      Graph2DPointSeriesObject => object.kind === "point-series" &&
      object.linkedOrigin?.pairId === pairId);
    if (objects.length !== 3)
      throw new TypeError("A saved vector profile group is incomplete or duplicated.");
    const ordered = vectorDerivedRegionSeries.map(series => objects.find(object =>
      object.linkedOrigin?.series === series));
    if (ordered.some(object => !object?.linkedOrigin))
      throw new TypeError("A saved vector profile group is missing a field.");
    const origins = ordered.map(object => object!.linkedOrigin as
      Graph2DLinkedVectorRegionOrigin);
    const rows = ordered.map(object => pointTableStore.resolve(object!.table));
    if (rows.some(item => !item))
      throw new TypeError("A saved vector profile point table is unavailable.");
    validateVectorDerivedRegionGraphGroup(origins, rows as Graph2DPointRow[][]);
    return { objects: ordered as Graph2DPointSeriesObject[], origins,
      rows: rows as Graph2DPointRow[][] };
  };
  const ensure = (group: VectorDerivedRegionGraphGroup): Group => {
    const pairId = group[0]!.origin.pairId;
    if (!candidate.source.objects.some(object => object.kind === "point-series" &&
        object.linkedOrigin?.pairId === pairId)) {
      const drafts = group.map((series, index) => ({ label: series.label,
        table: pointTableStore.publish(series.rows), mode: "line" as const,
        domain: series.domain, linkedOrigin: series.origin,
        style: { color: ["#fde047", "#38bdf8", "#fb7185"][index]!,
          lineWidth: 2, lineStyle: "solid" as const, visible: true } }));
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
  const focus = linkedVectorDerivedRegionIntersectionFocus(columns.origins,
    columns.rows, rows.origins, rows.rows,
    bounds.map(([min, max]) => ({ kind: "interval" as const, min, max })) as [
      { kind: "interval"; min: number; max: number },
      { kind: "interval"; min: number; max: number }]);
  const intersection = focus.intersection!;
  const result = await verifiedVectorSubrectangleResult(field, [candidate], region,
    intersection.bounds, { columnPairId: intersection.columnPairId,
      rowPairId: intersection.rowPairId }, bridge);
  return { actions, result, focus, selectionObjectId: columns.objects[0]!.id };
}
