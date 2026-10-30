import { parseVectorField3DDocument, structuralHash,
  type Graph2DLinkedCombinedRegionOrigin, type Graph2DLinkedRegionOrigin,
  type Graph2DLinkedVectorRegionOrigin,
  type Graph2DPointRow, type VectorField3DOverlayRegion } from "@math3d/core";
import { seriesForCombinedRegion, validateCombinedRegionGraphGroup } from
  "./linkedCombinedRegionGraphs";
import { validateVectorDerivedRegionGraphGroup, vectorDerivedRegionSeries } from
  "./linkedVectorDerivedRegionGraphs";
import type { CombinedRegionSeries } from "./combinedFieldInspection";

export type LinkedRegionGraphFocus = Readonly<{
  pairId: string;
  documentId: string;
  sourceHash: string;
  recipeHash: string;
  region: VectorField3DOverlayRegion;
  profileAxis: 0 | 1;
  columns: readonly [number, number];
  xBounds: readonly [number, number];
  xUnit: string;
  vectorUnit: string;
  overlayUnit: string;
  vectorGaps: number;
  overlayGaps: number;
  combined?: readonly Readonly<{ series: CombinedRegionSeries | "divergence" | "curl-magnitude";
    unit: string; gaps: number; values: readonly (number | null)[] }>[];
}>;

type Selection = Readonly<{ kind: "point"; x: number }> |
  Readonly<{ kind: "interval"; min: number; max: number }>;

function snapRegionColumns(rows: readonly Graph2DPointRow[],
  bounds: readonly [number, number], selection: Selection) {
  const [min, max] = bounds;
  if (rows.length !== 17 || rows.some((row, index) =>
      !Number.isFinite(row.x) ||
      Math.abs(row.x - (min + (max - min) * index / 16)) > 1e-9))
    throw new TypeError("The linked region physical columns changed.");
  let first: number, last: number;
  if (selection.kind === "point") {
    if (!Number.isFinite(selection.x) || selection.x < min || selection.x > max)
      throw new RangeError("The selected graph point is outside the linked region.");
    first = last = rows.reduce((best, row, index) =>
      Math.abs(row.x - selection.x) < Math.abs(rows[best]!.x - selection.x) ? index : best, 0);
  } else {
    if (!Number.isFinite(selection.min) || !Number.isFinite(selection.max) ||
        selection.min < min || selection.max > max || selection.min > selection.max)
      throw new RangeError("Choose an increasing interval inside the linked region.");
    first = rows.findIndex(row => row.x >= selection.min - 1e-12);
    last = rows.reduce((found, row, index) =>
      row.x <= selection.max + 1e-12 ? index : found, -1);
    if (first < 0 || last < first)
      throw new RangeError("The interval contains no saved physical columns.");
  }
  const xBounds: readonly [number, number] = [first === 0 ? min :
    (rows[first - 1]!.x + rows[first]!.x) / 2,
    last === 16 ? max : (rows[last]!.x + rows[last + 1]!.x) / 2];
  return { columns: [first, last] as const, xBounds };
}

/** Snap a Graphs selection to the exact saved 17-position physical lattice. */
export function linkedRegionGraphFocus(vector: Graph2DLinkedRegionOrigin |
  Graph2DLinkedCombinedRegionOrigin,
  overlay: Graph2DLinkedRegionOrigin | Graph2DLinkedCombinedRegionOrigin,
  vectorRows: readonly Graph2DPointRow[],
  overlayRows: readonly Graph2DPointRow[], selection: Selection): LinkedRegionGraphFocus {
  const profileAxis = vector.kind === "vector-scalar-complex-linked-region/v2" ?
    vector.profileAxis ?? 0 : 0;
  if (vector.series !== "vector" || vector.pairId !== overlay.pairId ||
      vector.kind !== overlay.kind || vectorRows.length !== 17 || overlayRows.length !== 17 ||
      structuralHash(vectorRows) !== vector.rowsSha256 ||
      structuralHash(overlayRows) !== overlay.rowsSha256 ||
      vectorRows.some((row, index) => row.x !== overlayRows[index]?.x))
    throw new TypeError("The linked region point tables or physical columns changed.");
  const { columns: [first, last], xBounds } = snapRegionColumns(vectorRows,
    vector.region.bounds[profileAxis], selection);
  const document = parseVectorField3DDocument(vector.vectorDocumentJson);
  return { pairId: vector.pairId, documentId: document.identity.id,
    sourceHash: document.identity.structuralHash,
    recipeHash: structuralHash({ scalarOverlay: document.workspace?.scalarOverlay ?? null,
      complexOverlay: document.workspace?.complexOverlay ?? null,
      sliceChannel: document.workspace?.sliceChannel ?? "component" }),
    region: vector.region, profileAxis, columns: [first, last], xBounds,
    xUnit: vector.xUnit, vectorUnit: vector.yUnit, overlayUnit: overlay.yUnit,
    vectorGaps: vectorRows.slice(first, last + 1).filter(row => row.y === null).length,
    overlayGaps: overlayRows.slice(first, last + 1).filter(row => row.y === null).length };
}

/** Three derived profiles share the vector rectangle's checked physical columns. */
export function linkedVectorDerivedRegionGraphFocus(
  origins: readonly Graph2DLinkedVectorRegionOrigin[],
  rows: readonly (readonly Graph2DPointRow[])[], selection: Selection):
  LinkedRegionGraphFocus {
  validateVectorDerivedRegionGraphGroup(origins, rows);
  const vector = origins[0]!;
  const { columns, xBounds } = snapRegionColumns(rows[0]!,
    vector.region.bounds[0], selection);
  const document = parseVectorField3DDocument(vector.vectorDocumentJson);
  return { pairId: vector.pairId, documentId: document.identity.id,
    sourceHash: document.identity.structuralHash,
    recipeHash: structuralHash({ scalarOverlay: document.workspace?.scalarOverlay ?? null,
      complexOverlay: document.workspace?.complexOverlay ?? null,
      sliceChannel: document.workspace?.sliceChannel ?? "component" }),
    region: vector.region, profileAxis: 0, columns, xBounds, xUnit: vector.xUnit,
    vectorUnit: vector.yUnit, overlayUnit: origins[1]!.yUnit,
    vectorGaps: rows[0]!.slice(columns[0], columns[1] + 1)
      .filter(row => row.y === null).length,
    overlayGaps: rows[1]!.slice(columns[0], columns[1] + 1)
      .filter(row => row.y === null).length,
    combined: vectorDerivedRegionSeries.map((series, index) => ({
      series, unit: origins[index]!.yUnit,
      gaps: rows[index]!.slice(columns[0], columns[1] + 1)
        .filter(row => row.y === null).length,
      values: rows[index]!.slice(columns[0], columns[1] + 1)
        .map(row => row.y) })) };
}

/** Combined selections use one checked physical lattice and keep each gap count separate. */
export function linkedCombinedRegionGraphFocus(
  origins: readonly Graph2DLinkedCombinedRegionOrigin[],
  rows: readonly (readonly Graph2DPointRow[])[], selection: Selection): LinkedRegionGraphFocus {
  validateCombinedRegionGraphGroup(origins, rows);
  const focus = linkedRegionGraphFocus(origins[0]!, origins[1]!, rows[0]!, rows[1]!, selection);
  return { ...focus, combined: seriesForCombinedRegion(origins[0]!.kind).map((series, index) => ({
    series: series as CombinedRegionSeries | "divergence" | "curl-magnitude",
    unit: origins[index]!.yUnit,
    gaps: rows[index]!.slice(focus.columns[0], focus.columns[1] + 1)
      .filter(row => row.y === null).length,
    values: rows[index]!.slice(focus.columns[0], focus.columns[1] + 1)
      .map(row => row.y) })) };
}
