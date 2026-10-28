import { graph2DPointDomain, serializeVectorField3DDocument, sha256Checksum, structuralHash,
  type Graph2DLinkedOverlayOrigin, type Graph2DLinkedLineOrigin,
  type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DLinkedLineProfile } from "@math3d/core";
import type { LinkedOverlayLineProfile } from "./scientificSliceOverlay";

export type LinkedOverlayGraphSeries<Origin extends Graph2DLinkedOverlayOrigin = Graph2DLinkedOverlayOrigin> = Readonly<{
  label: string; rows: readonly Graph2DPointRow[];
  domain: ReturnType<typeof graph2DPointDomain>; origin: Origin;
}>;

/** A null at a phase branch cut prevents Graphs from drawing a false vertical jump. */
export function linkedOverlayGraphRows(line: LinkedOverlayLineProfile,
  series: "vector" | "scalar", phase = false): readonly Graph2DPointRow[] {
  let previous: number | null = null;
  return line.rows.map((row, index) => {
    const value = row[series];
    const gap = phase && series === "scalar" && value !== null && previous !== null &&
      Math.abs(value - previous) > Math.PI;
    if (series === "scalar") previous = value;
    return { id: `row_${index + 1}`, x: row.coordinate, y: gap ? null : value };
  });
}

export function linkedOverlayGraphPair(document: VectorField3DDocument,
  profile: VectorField3DLinkedLineProfile, line: LinkedOverlayLineProfile,
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
  fieldTitle: string): readonly [LinkedOverlayGraphSeries<Graph2DLinkedLineOrigin>,
    LinkedOverlayGraphSeries<Graph2DLinkedLineOrigin>] {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = !scalar && document.workspace?.complexOverlay?.visible ?
    { ...document.workspace.complexOverlay,
      mode: document.workspace.complexOverlay.mode === "phase-contours" ?
        "phase" as const : document.workspace.complexOverlay.mode } : null;
  if ((!scalar && !complex) || !profile.visible ||
      line.scalarSampleSha256.length !== 64 ||
      (document.source.field.kind === "scientific-bundle" && vectorSamples.length !== 3))
    throw new TypeError("The linked line needs both verified source samples.");
  const base = {
    vectorDocumentJson: serializeVectorField3DDocument(document),
    profile, xName: document.source.axes[profile.varyingAxis].label,
    xUnit: line.coordinateUnit, vectorSourceHash: line.vectorSourceHash,
    vectorSamples, scalarSampleSha256: line.scalarSampleSha256 };
  const make = (series: "vector" | "scalar", unit: string, label: string,
    origin: Omit<Graph2DLinkedLineOrigin, "series" | "yUnit" | "rowsSha256">):
    LinkedOverlayGraphSeries<Graph2DLinkedLineOrigin> => {
    const rows = linkedOverlayGraphRows(line, series, series === "scalar" &&
      complex?.mode === "phase");
    return { label, rows, domain: graph2DPointDomain(rows), origin: {
      ...origin, series: series === "scalar" && complex ? "complex" : series,
      yUnit: unit, rowsSha256: structuralHash(rows) } as Graph2DLinkedLineOrigin };
  };
  if (complex) {
    const samples = line.complexSamples;
    if (!samples || !/^[a-f0-9]{64}$/.test(samples.real) ||
        !/^[a-f0-9]{64}$/.test(samples.imaginary) ||
        sha256Checksum(new TextEncoder().encode(`${samples.real}:${samples.imaginary}`)).slice(7) !==
          line.scalarSampleSha256 ||
        line.scalarUnit !== (complex.mode === "phase" ? "rad" : complex.unit))
      throw new TypeError("The linked complex line needs both verified component samples.");
    const pairId = structuralHash({ vector: document.source.field, real: complex.real,
      imaginary: complex.imaginary, mode: complex.mode, profile, vectorSamples,
      realSampleSha256: samples.real, imaginarySampleSha256: samples.imaginary });
    const origin = { ...base, kind: "vector-complex-linked-line/v1" as const, pairId,
      realReference: complex.real, imaginaryReference: complex.imaginary, mode: complex.mode,
      realSampleSha256: samples.real, imaginarySampleSha256: samples.imaginary };
    return [make("vector", line.vectorUnit, `Vector ${line.vectorChannel}`, origin),
      make("scalar", line.scalarUnit, fieldTitle, origin)];
  }
  if (!scalar || scalar.reference.semanticType !== "scalar-field" || line.complexSamples)
    throw new TypeError("The linked scalar line needs a verified scalar source.");
  const pairId = structuralHash({ vector: document.source.field,
    scalar: scalar.reference, profile, vectorSamples,
    scalarSampleSha256: line.scalarSampleSha256 });
  const origin = { ...base, kind: "vector-scalar-linked-line/v1" as const, pairId,
    scalarReference: scalar.reference };
  return [make("vector", line.vectorUnit, `Vector ${line.vectorChannel}`, origin),
    make("scalar", line.scalarUnit, fieldTitle, origin)];
}
