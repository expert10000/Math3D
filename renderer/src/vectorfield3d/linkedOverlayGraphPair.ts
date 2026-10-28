import { graph2DPointDomain, serializeVectorField3DDocument, structuralHash,
  type Graph2DLinkedOverlayOrigin, type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DLinkedLineProfile } from "@math3d/core";
import type { LinkedOverlayLineProfile } from "./scientificSliceOverlay";

export type LinkedOverlayGraphSeries = Readonly<{
  label: string; rows: readonly Graph2DPointRow[];
  domain: ReturnType<typeof graph2DPointDomain>; origin: Graph2DLinkedOverlayOrigin;
}>;

export function linkedOverlayGraphPair(document: VectorField3DDocument,
  profile: VectorField3DLinkedLineProfile, line: LinkedOverlayLineProfile,
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
  scalarTitle: string): readonly [LinkedOverlayGraphSeries, LinkedOverlayGraphSeries] {
  const overlay = document.workspace?.scalarOverlay;
  if (!overlay || overlay.reference.semanticType !== "scalar-field" || !profile.visible ||
      line.scalarSampleSha256.length !== 64 ||
      (document.source.field.kind === "scientific-bundle" && vectorSamples.length !== 3))
    throw new TypeError("The linked line needs both verified source samples.");
  const pairId = structuralHash({ vector: document.source.field,
    scalar: overlay.reference, profile, vectorSamples,
    scalarSampleSha256: line.scalarSampleSha256 });
  const base = { kind: "vector-scalar-linked-line/v1" as const, pairId,
    vectorDocumentJson: serializeVectorField3DDocument(document),
    scalarReference: overlay.reference, profile, xName: document.source.axes[profile.varyingAxis].label,
    xUnit: line.coordinateUnit, vectorSourceHash: line.vectorSourceHash,
    vectorSamples, scalarSampleSha256: line.scalarSampleSha256 };
  const make = (series: "vector" | "scalar", unit: string, label: string): LinkedOverlayGraphSeries => {
    const rows = line.rows.map((row, index) => ({ id: `row_${index + 1}`,
      x: row.coordinate, y: row[series] }));
    return { label, rows, domain: graph2DPointDomain(rows), origin: {
      ...base, series, yUnit: unit, rowsSha256: structuralHash(rows) } };
  };
  return [make("vector", line.vectorUnit, `Vector ${line.vectorChannel}`),
    make("scalar", line.scalarUnit, scalarTitle)];
}
