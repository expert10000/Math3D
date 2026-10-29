import { canonicalJsonStringify, graph2DPointDomain,
  inspectGraph2DFieldReference, parseVectorField3DDocument,
  serializeVectorField3DDocument, structuralHash,
  validGraph2DLinkedOverlayOrigin, type Graph2DFieldReference,
  type Graph2DLinkedCombinedRegionOrigin, type Graph2DLinkedOverlayOrigin,
  type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DOverlayRegion } from "@math3d/core";
import type { CombinedRegionInspection, CombinedRegionSeries } from
  "./combinedFieldInspection";
import type { LinkedOverlayGraphSeries } from "./linkedOverlayGraphPair";
import { verifiedDivergenceRegionProfile, type DivergenceSourceBridge } from
  "./derivedCombinedRegionProfile";

export type CombinedRegionGraphSeries = LinkedOverlayGraphSeries<Graph2DLinkedCombinedRegionOrigin>;
export type CombinedRegionGraphGroup = readonly [CombinedRegionGraphSeries,
  CombinedRegionGraphSeries, CombinedRegionGraphSeries, CombinedRegionGraphSeries] |
  readonly [CombinedRegionGraphSeries, CombinedRegionGraphSeries, CombinedRegionGraphSeries,
    CombinedRegionGraphSeries, CombinedRegionGraphSeries];
type Digest = Readonly<{ name: string; sampleSha256: string }>;
type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference"> & DivergenceSourceBridge;
export type CombinedGraphSourceStatus = "current" | "missing" | "changed" | "error";
export const combinedRegionSeries: readonly CombinedRegionSeries[] = ["vector", "scalar",
  "complex-magnitude", "complex-phase"];
export const combinedDivergenceRegionSeries = [...combinedRegionSeries, "divergence"] as const;
export const isCombinedRegionKind = (kind: string): kind is Graph2DLinkedCombinedRegionOrigin["kind"] =>
  kind === "vector-scalar-complex-linked-region/v2" ||
  kind === "vector-scalar-complex-divergence-linked-region/v3";
export const isCombinedRegionOrigin = (origin: Graph2DLinkedOverlayOrigin | undefined):
  origin is Graph2DLinkedCombinedRegionOrigin => !!origin && isCombinedRegionKind(origin.kind);
export const seriesForCombinedRegion = (kind: string): readonly string[] =>
  kind === "vector-scalar-complex-divergence-linked-region/v3" ?
    combinedDivergenceRegionSeries : combinedRegionSeries;

/** Four plots share physical columns, while each field retains its own gaps and unit. */
export function linkedCombinedRegionGraphs(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, inspection: CombinedRegionInspection,
  vectorSamples: readonly Digest[], scalarSampleSha256: string,
  realSampleSha256: string, imaginarySampleSha256: string): CombinedRegionGraphGroup {
  const scalar = document.workspace?.scalarOverlay;
  const complex = document.workspace?.complexOverlay;
  if (!scalar?.visible || !complex?.visible || !region.visible ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !== canonicalJsonStringify(region) ||
      inspection.summary.sampleCount !== 289 ||
      vectorSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
      [...vectorSamples.map(item => item.sampleSha256), scalarSampleSha256,
        realSampleSha256, imaginarySampleSha256].some(hash => !/^[a-f0-9]{64}$/.test(hash)))
    throw new TypeError("All three verified sources are needed for the combined Graphs profile.");
  const firstAxis = [0, 1, 2].filter(axis => axis !== region.normalAxis)[0]!;
  const pairId = structuralHash({ algorithm: "independent-column-mean-17x17/v2",
    vector: document.source.field, scalar: scalar.reference,
    complex: [complex.real, complex.imaginary], region, vectorSamples,
    scalarSampleSha256, realSampleSha256, imaginarySampleSha256 });
  const common = { kind: "vector-scalar-complex-linked-region/v2" as const,
    pairId, vectorDocumentJson: serializeVectorField3DDocument(document), region,
    xName: document.source.axes[firstAxis]!.label,
    xUnit: document.source.axes[firstAxis]!.unit,
    vectorSourceHash: document.identity.structuralHash, vectorSamples,
    scalarReference: scalar.reference, realReference: complex.real,
    imaginaryReference: complex.imaginary, scalarSampleSha256,
    realSampleSha256, imaginarySampleSha256 };
  const units: Record<CombinedRegionSeries, string> = { vector: inspection.summary.vectorUnit,
    scalar: inspection.summary.scalarUnit, "complex-magnitude": inspection.summary.complexUnit,
    "complex-phase": "rad" };
  const labels: Record<CombinedRegionSeries, string> = {
    vector: "Vector speed region mean", scalar: `${scalar.title} region mean`,
    "complex-magnitude": `${complex.title} magnitude region mean`,
    "complex-phase": `${complex.title} phase region mean` };
  return combinedRegionSeries.map(series => {
    const rows = inspection.profiles[series];
    if (rows.length !== 17 || rows.some((row, index) =>
      !Number.isFinite(row.x) || row.x !== inspection.profiles.vector[index]?.x ||
      row.y !== null && !Number.isFinite(row.y)))
      throw new TypeError("Combined region profile columns are misaligned.");
    return { label: labels[series], rows, domain: graph2DPointDomain(rows),
      origin: { ...common, series, yUnit: units[series],
        rowsSha256: structuralHash(rows) } };
  }) as unknown as CombinedRegionGraphGroup;
}

/** A new saved format keeps the original four-plot Project format readable. */
export function linkedCombinedRegionGraphsWithDivergence(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, inspection: CombinedRegionInspection,
  vectorSamples: readonly Digest[], scalarSampleSha256: string,
  realSampleSha256: string, imaginarySampleSha256: string,
  derived: Readonly<{ rows: readonly Graph2DPointRow[]; unit: string;
    samples: readonly Digest[] }>): CombinedRegionGraphGroup {
  const original = linkedCombinedRegionGraphs(document, region, inspection, vectorSamples,
    scalarSampleSha256, realSampleSha256, imaginarySampleSha256);
  if (derived.rows.length !== 17 || !derived.unit ||
      derived.samples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
      derived.samples.some(item => !/^[a-f0-9]{64}$/.test(item.sampleSha256)) ||
      derived.rows.some((row, index) => row.x !== original[0].rows[index]?.x ||
        row.y !== null && !Number.isFinite(row.y)))
    throw new TypeError("Divergence does not align with the verified physical rectangle.");
  const pairId = structuralHash({ v: 3, prior: original[0].origin.pairId,
    derivedSamples: derived.samples, derivedRows: derived.rows });
  const four = original.map(item => ({ ...item, origin: {
    ...item.origin, kind: "vector-scalar-complex-divergence-linked-region/v3" as const,
    pairId, derivedSamples: derived.samples } }));
  const fifth: CombinedRegionGraphSeries = { label: "Vector divergence region mean",
    rows: derived.rows, domain: graph2DPointDomain(derived.rows),
    origin: { ...four[0]!.origin, series: "divergence", yUnit: derived.unit,
      rowsSha256: structuralHash(derived.rows) } };
  return [...four, fifth] as unknown as CombinedRegionGraphGroup;
}

/** Check a single plot's pinned source. Other plots can remain visible on failure. */
export async function checkCombinedRegionGraphSeries(origin: Graph2DLinkedCombinedRegionOrigin,
  bridge: Bridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<CombinedGraphSourceStatus> {
  if (!validGraph2DLinkedOverlayOrigin(origin) ||
      !isCombinedRegionKind(origin.kind) ||
      !bridge?.checkGraphDatasetReference) return "error";
  const document = parseVectorField3DDocument(origin.vectorDocumentJson);
  if (document.identity.structuralHash !== origin.vectorSourceHash) return "changed";
  const references: readonly Graph2DFieldReference[] = origin.series === "vector" ||
    origin.series === "divergence" ?
    document.source.field.kind === "scientific-bundle" ?
      document.source.field.references : [] :
    origin.series === "scalar" ? [origin.scalarReference] :
      [origin.realReference, origin.imaginaryReference];
  const groups = new Map<string, Graph2DFieldReference[]>();
  for (const reference of references) {
    const key = `${reference.locator.kind}:${reference.locator.value}:${reference.sceneFingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), reference]);
  }
  for (const refs of groups.values()) {
    const first = refs[0]!;
    try {
      const checked = await bridge.checkGraphDatasetReference({ locator: first.locator,
        sceneFingerprint: first.sceneFingerprint, verifyResources: true });
      if (!checked.ok) return checked.status === "missing" ? "missing" : "changed";
      if (refs.some(ref => inspectGraph2DFieldReference(ref,
        checked.source.manifestJson) !== "current")) return "changed";
    } catch { return "error"; }
  }
  if (origin.kind === "vector-scalar-complex-divergence-linked-region/v3" &&
      origin.series === "divergence") {
    try {
      const fresh = await verifiedDivergenceRegionProfile(document, origin.region, bridge);
      if (fresh.unit !== origin.yUnit || structuralHash(fresh.rows) !== origin.rowsSha256 ||
          canonicalJsonStringify(fresh.samples) !==
            canonicalJsonStringify(origin.derivedSamples)) return "changed";
    } catch { return "error"; }
  }
  return "current";
}

/** Protect group membership and saved rows without requiring all fields to verify. */
export function validateCombinedRegionGraphGroup(origins: readonly Graph2DLinkedCombinedRegionOrigin[],
  rows: readonly (readonly Graph2DPointRow[])[]): void {
  const expected = seriesForCombinedRegion(origins[0]?.kind ?? "");
  if (origins.length !== expected.length || rows.length !== expected.length ||
      expected.some((series, index) => origins[index]?.series !== series) ||
      origins.some(origin => !validGraph2DLinkedOverlayOrigin(origin) ||
        !isCombinedRegionKind(origin.kind) || origin.kind !== origins[0]!.kind ||
        origin.pairId !== origins[0]!.pairId ||
        canonicalJsonStringify({ ...origin, series: "", yUnit: "", rowsSha256: "" }) !==
          canonicalJsonStringify({ ...origins[0]!, series: "", yUnit: "", rowsSha256: "" })) ||
      rows.some((table, index) => table.length !== 17 ||
        structuralHash(table) !== origins[index]!.rowsSha256 ||
        table.some((row, column) => row.x !== rows[0]![column]?.x)))
    throw new TypeError("Saved combined region plots are incomplete or misaligned.");
}
