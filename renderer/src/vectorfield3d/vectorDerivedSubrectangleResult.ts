import { canonicalJsonStringify, createVectorDerivedSubrectangleResult,
  parseVectorField3DDocument,
  type AnalysisResultEnvelope, type Graph2DDocument,
  type Graph2DLinkedVectorRegionOrigin, type Graph2DPointRow,
  type Graph2DPointSeriesObject, type VectorField3DDocument,
  type VectorField3DOverlayRegion } from "@math3d/core";
import { pointTableStore } from "../graph2d/pointTableStore";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile,
  type DivergenceSourceBridge } from "./derivedCombinedRegionProfile";
import { checkVectorDerivedRegionGraphSeries, isVectorDerivedRegionOrigin,
  validateVectorDerivedRegionGraphGroup, vectorDerivedRegionSeries,
  type VectorDerivedRegionVerificationSession } from "./linkedVectorDerivedRegionGraphs";
import { linkedVectorDerivedRegionIntersectionFocus } from "./linkedRegionGraphFocus";
import { summarizeVectorDerivedSubrectangle } from "./vectorDerivedSubrectangle";

type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference"> & DivergenceSourceBridge;
type SourceStatus = "missing" | "changed" | "error";
export class VectorSubrectangleSourceError extends TypeError {
  readonly status: SourceStatus;
  constructor(status: SourceStatus, message: string) {
    super(message);
    this.status = status;
  }
}

/** One publication path is reused when the Project checks saved results on reopen. */
export async function verifiedVectorSubrectangleResult(field: VectorField3DDocument,
  graphs: readonly Graph2DDocument[], region: VectorField3DOverlayRegion,
  bounds: readonly [readonly [number, number], readonly [number, number]],
  ids: Readonly<{ columnPairId: string; rowPairId: string }>,
  bridge: Bridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<AnalysisResultEnvelope> {
  const findGroup = (graph: Graph2DDocument, pairId: string, axis: 0 | 1) => {
    const members = vectorDerivedRegionSeries.map(series =>
      graph.source.objects.find((object): object is Graph2DPointSeriesObject =>
        object.kind === "point-series" &&
        isVectorDerivedRegionOrigin(object.linkedOrigin) &&
        object.linkedOrigin.pairId === pairId && object.linkedOrigin.series === series));
    if (members.some(member => !member?.linkedOrigin)) return null;
    const origins = members.map(member =>
      member!.linkedOrigin as Graph2DLinkedVectorRegionOrigin);
    if (origins.some(origin => (origin.profileAxis ?? 0) !== axis ||
        origin.vectorSourceHash !== field.identity.structuralHash ||
        parseVectorField3DDocument(origin.vectorDocumentJson).identity.id !==
          field.identity.id ||
        canonicalJsonStringify(origin.region) !== canonicalJsonStringify(region)))
      return null;
    const rows = members.map(member => pointTableStore.resolve(member!.table));
    if (!rows.every((table): table is readonly Graph2DPointRow[] => table !== null))
      return null;
    validateVectorDerivedRegionGraphGroup(origins, rows);
    return { origins, rows };
  };
  let column: ReturnType<typeof findGroup> = null;
  let row: ReturnType<typeof findGroup> = null;
  for (const graph of graphs) {
    column = findGroup(graph, ids.columnPairId, 0);
    row = findGroup(graph, ids.rowPairId, 1);
    if (column && row) break;
  }
  if (!column || !row)
    throw new VectorSubrectangleSourceError("changed",
      "All six saved vector column and row profiles are required.");
  const focus = linkedVectorDerivedRegionIntersectionFocus(column.origins,
    column.rows, row.origins, row.rows,
    bounds.map(([min, max]) => ({ kind: "interval" as const, min, max })) as [
      { kind: "interval"; min: number; max: number },
      { kind: "interval"; min: number; max: number }]);
  if (canonicalJsonStringify(focus.intersection?.bounds) !==
      canonicalJsonStringify(bounds))
    throw new VectorSubrectangleSourceError("changed",
      "Saved physical intervals no longer identify the same profile cells.");
  const session: VectorDerivedRegionVerificationSession = {};
  for (const origin of [...column.origins, ...row.origins]) {
    const status = await checkVectorDerivedRegionGraphSeries(origin, bridge, session);
    if (status !== "current")
      throw new VectorSubrectangleSourceError(status,
        `Saved ${origin.series} profile source ${status}.`);
  }
  const speed = await verifiedVectorRegionProfile(field, region, bridge);
  const derived = await verifiedCombinedDerivedRegionProfiles(field, region, bridge);
  if (canonicalJsonStringify(column.origins[0]!.vectorSamples) !==
        canonicalJsonStringify(speed.samples) ||
      canonicalJsonStringify(column.origins[0]!.derivedSamples) !==
        canonicalJsonStringify(derived.samples))
    throw new VectorSubrectangleSourceError("changed",
      "Verified vector transfers differ from the saved profiles.");
  const summary = summarizeVectorDerivedSubrectangle(region, bounds, speed, derived);
  return createVectorDerivedSubrectangleResult(field, region, bounds, summary, {
    columnPairId: ids.columnPairId, rowPairId: ids.rowPairId,
    columnRowsSha256: column.origins.map(origin => origin.rowsSha256) as
      [string, string, string],
    rowRowsSha256: row.origins.map(origin => origin.rowsSha256) as
      [string, string, string] }, speed.samples, derived.samples);
}
