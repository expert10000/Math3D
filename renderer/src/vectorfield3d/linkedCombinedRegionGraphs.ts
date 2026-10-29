import { canonicalJsonStringify, graph2DPointDomain,
  inspectGraph2DFieldReference, parseVectorField3DDocument,
  serializeVectorField3DDocument, structuralHash,
  validGraph2DLinkedOverlayOrigin, type Graph2DFieldReference,
  type Graph2DLinkedCombinedRegionOrigin, type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DOverlayRegion } from "@math3d/core";
import type { CombinedRegionInspection, CombinedRegionSeries } from
  "./combinedFieldInspection";
import type { LinkedOverlayGraphSeries } from "./linkedOverlayGraphPair";

export type CombinedRegionGraphSeries = LinkedOverlayGraphSeries<Graph2DLinkedCombinedRegionOrigin>;
export type CombinedRegionGraphGroup = readonly [CombinedRegionGraphSeries,
  CombinedRegionGraphSeries, CombinedRegionGraphSeries, CombinedRegionGraphSeries];
type Digest = Readonly<{ name: string; sampleSha256: string }>;
type Bridge = Pick<NonNullable<typeof window.scientificScenes>, "checkGraphDatasetReference">;
export type CombinedGraphSourceStatus = "current" | "missing" | "changed" | "error";
export const combinedRegionSeries: readonly CombinedRegionSeries[] = ["vector", "scalar",
  "complex-magnitude", "complex-phase"];

/** Four plots share physical columns, while each field retains its own gaps and unit. */
export function linkedCombinedRegionGraphs(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, inspection: CombinedRegionInspection,
  vectorSamples: readonly Digest[], scalarSampleSha256: string,
  realSampleSha256: string, imaginarySampleSha256: string,
  profileAxis: 0 | 1 = 0): CombinedRegionGraphGroup {
  const scalar = document.workspace?.scalarOverlay;
  const complex = document.workspace?.complexOverlay;
  if (!scalar?.visible || !complex?.visible || !region.visible ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !== canonicalJsonStringify(region) ||
      inspection.summary.sampleCount !== 289 ||
      vectorSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
      [...vectorSamples.map(item => item.sampleSha256), scalarSampleSha256,
        realSampleSha256, imaginarySampleSha256].some(hash => !/^[a-f0-9]{64}$/.test(hash)))
    throw new TypeError("All three verified sources are needed for the combined Graphs profile.");
  const varyingAxis = [0, 1, 2].filter(axis => axis !== region.normalAxis)[profileAxis]!;
  const pairId = structuralHash({ algorithm: profileAxis === 1 ?
    "independent-row-mean-17x17/v2" : "independent-column-mean-17x17/v2",
    ...(profileAxis === 1 ? { profileAxis } : {}),
    vector: document.source.field, scalar: scalar.reference,
    complex: [complex.real, complex.imaginary], region, vectorSamples,
    scalarSampleSha256, realSampleSha256, imaginarySampleSha256 });
  const common = { kind: "vector-scalar-complex-linked-region/v2" as const,
    pairId, vectorDocumentJson: serializeVectorField3DDocument(document), region,
    ...(profileAxis === 1 ? { profileAxis: 1 as const } : {}),
    xName: document.source.axes[varyingAxis]!.label,
    xUnit: document.source.axes[varyingAxis]!.unit,
    vectorSourceHash: document.identity.structuralHash, vectorSamples,
    scalarReference: scalar.reference, realReference: complex.real,
    imaginaryReference: complex.imaginary, scalarSampleSha256,
    realSampleSha256, imaginarySampleSha256 };
  const units: Record<CombinedRegionSeries, string> = { vector: inspection.summary.vectorUnit,
    scalar: inspection.summary.scalarUnit, "complex-magnitude": inspection.summary.complexUnit,
    "complex-phase": "rad" };
  const labels: Record<CombinedRegionSeries, string> = {
    vector: `Vector speed region ${profileAxis === 1 ? "row " : ""}mean`,
    scalar: `${scalar.title} region ${profileAxis === 1 ? "row " : ""}mean`,
    "complex-magnitude": `${complex.title} magnitude region ${profileAxis === 1 ? "row " : ""}mean`,
    "complex-phase": `${complex.title} phase region ${profileAxis === 1 ? "row " : ""}mean` };
  return combinedRegionSeries.map(series => {
    const selectedProfiles = profileAxis === 1 ? inspection.rowProfiles : inspection.profiles;
    const rows = selectedProfiles[series];
    if (rows.length !== 17 || rows.some((row, index) =>
      !Number.isFinite(row.x) || row.x !== selectedProfiles.vector[index]?.x ||
      row.y !== null && !Number.isFinite(row.y)))
      throw new TypeError("Combined region profile positions are misaligned.");
    return { label: labels[series], rows, domain: graph2DPointDomain(rows),
      origin: { ...common, series, yUnit: units[series],
        rowsSha256: structuralHash(rows) } };
  }) as unknown as CombinedRegionGraphGroup;
}

/** Check a single plot's pinned source. Other plots can remain visible on failure. */
export async function checkCombinedRegionGraphSeries(origin: Graph2DLinkedCombinedRegionOrigin,
  bridge: Bridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<CombinedGraphSourceStatus> {
  if (!validGraph2DLinkedOverlayOrigin(origin) ||
      origin.kind !== "vector-scalar-complex-linked-region/v2" ||
      !bridge?.checkGraphDatasetReference) return "error";
  const document = parseVectorField3DDocument(origin.vectorDocumentJson);
  if (document.identity.structuralHash !== origin.vectorSourceHash) return "changed";
  const references: readonly Graph2DFieldReference[] = origin.series === "vector" ?
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
  return "current";
}

/** Protect group membership and saved rows without requiring all fields to verify. */
export function validateCombinedRegionGraphGroup(origins: readonly Graph2DLinkedCombinedRegionOrigin[],
  rows: readonly (readonly Graph2DPointRow[])[]): void {
  if (origins.length !== 4 || rows.length !== 4 ||
      combinedRegionSeries.some((series, index) => origins[index]?.series !== series) ||
      origins.some(origin => !validGraph2DLinkedOverlayOrigin(origin) ||
        origin.kind !== "vector-scalar-complex-linked-region/v2" ||
        origin.pairId !== origins[0]!.pairId ||
        canonicalJsonStringify({ ...origin, series: "", yUnit: "", rowsSha256: "" }) !==
          canonicalJsonStringify({ ...origins[0]!, series: "", yUnit: "", rowsSha256: "" })) ||
      rows.some((table, index) => table.length !== 17 ||
        structuralHash(table) !== origins[index]!.rowsSha256 ||
        table.some((row, column) => row.x !== rows[0]![column]?.x)))
    throw new TypeError("Saved combined region plots are incomplete or misaligned.");
}
