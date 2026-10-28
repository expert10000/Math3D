import { graph2DPointDomain, serializeVectorField3DDocument, sha256Checksum,
  structuralHash, type Graph2DLinkedRegionOrigin, type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DOverlayRegion } from "@math3d/core";
import type { LinkedOverlayGraphSeries } from "./linkedOverlayGraphPair";
import type { OverlayRegionSummary } from "./scientificSliceOverlay";

type Digest = Readonly<{ name: string; sampleSha256: string }>;

/** Each column mean uses the same aligned 17×17 support for both series. */
export function linkedOverlayRegionGraphRows(summary: OverlayRegionSummary,
  series: "vector" | "scalar", phase = false): readonly Graph2DPointRow[] {
  let previous: number | null = null;
  return summary.profileRows.map((column, index) => {
    const value = column[series];
    const wrap = phase && series === "scalar" && value !== null && previous !== null &&
      Math.abs(value - previous) > Math.PI;
    previous = value;
    return { id: `row_${index + 1}`, x: column.coordinate,
      y: column.alignedCount ? wrap ? null : value : null };
  });
}

export function linkedOverlayRegionGraphPair(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, summary: OverlayRegionSummary,
  vectorSamples: readonly Digest[], overlaySamples: readonly Digest[],
  fieldTitle: string): readonly [LinkedOverlayGraphSeries<Graph2DLinkedRegionOrigin>,
    LinkedOverlayGraphSeries<Graph2DLinkedRegionOrigin>] {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = !scalar && document.workspace?.complexOverlay?.visible ?
    { ...document.workspace.complexOverlay,
      mode: document.workspace.complexOverlay.mode === "phase-contours" ?
        "phase" as const : document.workspace.complexOverlay.mode } : null;
  if ((!scalar && !complex) || !region.visible ||
      summary.profileRows.length !== 17 || summary.alignedCount < 1 ||
      summary.profileRows.some(row => row.alignedCount < 0 || row.alignedCount > 17) ||
      (document.source.field.kind === "scientific-bundle" ? vectorSamples.length !== 3 :
        vectorSamples.length !== 0) ||
      overlaySamples.length !== (complex ? 2 : 1) ||
      summary.scalarSampleSha256.length !== 64)
    throw new TypeError("The linked region needs both verified source samples.");
  const expectedScalarHash = complex ? sha256Checksum(new TextEncoder().encode(
    `${overlaySamples[0]!.sampleSha256}:${overlaySamples[1]!.sampleSha256}`)).slice(7) :
    overlaySamples[0]!.sampleSha256;
  if (summary.scalarSampleSha256 !== expectedScalarHash ||
      summary.scalarUnit !== (complex?.mode === "phase" ? "rad" :
        complex?.unit ?? scalar!.unit))
    throw new TypeError("Linked region overlay samples or units changed.");
  const planeAxes = [0, 1, 2].filter(axis => axis !== region.normalAxis);
  const firstAxis = document.source.axes[planeAxes[0]!]!;
  const pairId = structuralHash({ algorithm: "aligned-column-mean-17x17/v1",
    vector: document.source.field, overlay: complex ? [complex.real, complex.imaginary] :
      scalar!.reference, mode: complex?.mode ?? "scalar", region,
    vectorSamples, overlaySamples });
  const base = { vectorDocumentJson: serializeVectorField3DDocument(document),
    region, xName: firstAxis.label, xUnit: firstAxis.unit,
    vectorSourceHash: summary.vectorSourceHash, vectorSamples,
    scalarSampleSha256: summary.scalarSampleSha256, pairId };
  const make = (series: "vector" | "scalar", unit: string, label: string,
    origin: Omit<Graph2DLinkedRegionOrigin, "series" | "yUnit" | "rowsSha256">):
    LinkedOverlayGraphSeries<Graph2DLinkedRegionOrigin> => {
    const rows = linkedOverlayRegionGraphRows(summary, series,
      series === "scalar" && complex?.mode === "phase");
    return { label, rows, domain: graph2DPointDomain(rows), origin: {
      ...origin, series: series === "scalar" && complex ? "complex" : series,
      yUnit: unit, rowsSha256: structuralHash(rows) } as Graph2DLinkedRegionOrigin };
  };
  if (complex) {
    const origin = { ...base, kind: "vector-complex-linked-region/v1" as const,
      realReference: complex.real, imaginaryReference: complex.imaginary,
      mode: complex.mode, realSampleSha256: overlaySamples[0]!.sampleSha256,
      imaginarySampleSha256: overlaySamples[1]!.sampleSha256 };
    return [make("vector", summary.vectorUnit, `Vector ${region.vectorChannel} region mean`, origin),
      make("scalar", summary.scalarUnit, `${fieldTitle} region mean`, origin)];
  }
  const origin = { ...base, kind: "vector-scalar-linked-region/v1" as const,
    scalarReference: scalar!.reference };
  return [make("vector", summary.vectorUnit, `Vector ${region.vectorChannel} region mean`, origin),
    make("scalar", summary.scalarUnit, `${fieldTitle} region mean`, origin)];
}
