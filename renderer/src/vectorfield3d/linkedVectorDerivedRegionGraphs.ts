import { canonicalJsonStringify, graph2DPointDomain,
  inspectGraph2DFieldReference, parseVectorField3DDocument,
  serializeVectorField3DDocument, structuralHash,
  validGraph2DLinkedOverlayOrigin, type Graph2DLinkedVectorRegionOrigin,
  type Graph2DPointRow, type VectorField3DDocument,
  type VectorField3DOverlayRegion } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile,
  type DivergenceSourceBridge } from "./derivedCombinedRegionProfile";
import type { LinkedOverlayGraphSeries } from "./linkedOverlayGraphPair";

type Speed = Awaited<ReturnType<typeof verifiedVectorRegionProfile>>;
type Derived = Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
type Bridge = Pick<NonNullable<typeof window.scientificScenes>,
  "checkGraphDatasetReference"> & DivergenceSourceBridge;
export type VectorDerivedRegionGraphSeries =
  LinkedOverlayGraphSeries<Graph2DLinkedVectorRegionOrigin>;
export type VectorDerivedRegionGraphGroup = readonly [VectorDerivedRegionGraphSeries,
  VectorDerivedRegionGraphSeries, VectorDerivedRegionGraphSeries];
export const vectorDerivedRegionSeries = ["vector", "divergence", "curl-magnitude"] as const;
export const isVectorDerivedRegionOrigin = (origin: { kind: string } | undefined):
  origin is Graph2DLinkedVectorRegionOrigin =>
  origin?.kind === "vector-derived-linked-region/v1";

export function linkedVectorDerivedRegionGraphs(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, speed: Speed, derived: Derived,
  profileAxis: 0 | 1 = 0):
  VectorDerivedRegionGraphGroup {
  if (!region.visible || region.vectorChannel !== "speed" ||
      canonicalJsonStringify(document.workspace?.overlayRegion) !== canonicalJsonStringify(region) ||
      speed.unit !== (document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits[0] : document.source.field.components[0].unit) ||
      derived.divergence.unit !== `1/${document.source.timeUnit}` ||
      derived.curlMagnitude.unit !== `1/${document.source.timeUnit}` ||
      new Set(document.source.axes.map(axis => axis.unit)).size !== 1 ||
      [speed.samples, derived.samples].some(samples => samples.length !==
        (document.source.field.kind === "scientific-bundle" ? 3 : 0) ||
        samples.some(item => !/^[a-f0-9]{64}$/.test(item.sampleSha256))))
    throw new TypeError("A vector-only region needs three verified aligned profiles.");
  const rows = profileAxis === 1 ? [speed.rowProfiles,
    derived.divergence.rowProfiles, derived.curlMagnitude.rowProfiles] :
    [speed.rows, derived.divergence.rows, derived.curlMagnitude.rows];
  if (rows.some(series => series.length !== 17 || series.some((row, index) =>
      row.x !== rows[0]![index]?.x || row.y !== null && !Number.isFinite(row.y))))
    throw new TypeError("Vector-derived region profiles are misaligned.");
  const firstAxis = ([0, 1, 2] as const).filter(axis => axis !== region.normalAxis)[profileAxis]!;
  const pairId = structuralHash({ algorithm: profileAxis === 1 ?
    "vector-derived-row-mean-17x17/v1" : "vector-derived-column-mean-17x17/v1",
    source: document.identity.structuralHash, region, vectorSamples: speed.samples,
    derivedSamples: derived.samples, rows });
  const common = { kind: "vector-derived-linked-region/v1" as const, pairId,
    ...(profileAxis === 1 ? { profileAxis: 1 as const } : {}),
    vectorDocumentJson: serializeVectorField3DDocument(document), region,
    xName: document.source.axes[firstAxis].label,
    xUnit: document.source.axes[firstAxis].unit,
    vectorSourceHash: document.identity.structuralHash,
    vectorSamples: speed.samples, derivedSamples: derived.samples };
  const labels = ["Vector speed region mean", "Vector divergence region mean",
    "Vector curl magnitude region mean"].map(label => profileAxis === 1 ?
      label.replace("region mean", "region row mean") : label);
  const units = [speed.unit, derived.divergence.unit, derived.curlMagnitude.unit];
  return vectorDerivedRegionSeries.map((series, index) => ({ label: labels[index]!,
    rows: rows[index]!, domain: graph2DPointDomain(rows[index]!),
    origin: { ...common, series, yUnit: units[index]!,
      rowsSha256: structuralHash(rows[index]!) } })) as unknown as
    VectorDerivedRegionGraphGroup;
}

export function validateVectorDerivedRegionGraphGroup(
  origins: readonly Graph2DLinkedVectorRegionOrigin[],
  rows: readonly (readonly Graph2DPointRow[])[]): void {
  if (origins.length !== 3 || rows.length !== 3 ||
      vectorDerivedRegionSeries.some((series, index) => origins[index]?.series !== series) ||
      origins.some(origin => !validGraph2DLinkedOverlayOrigin(origin) ||
        origin.kind !== "vector-derived-linked-region/v1" ||
        origin.pairId !== origins[0]!.pairId ||
        canonicalJsonStringify({ ...origin, series: "", yUnit: "", rowsSha256: "" }) !==
          canonicalJsonStringify({ ...origins[0]!, series: "", yUnit: "", rowsSha256: "" })) ||
      rows.some((series, index) => series.length !== 17 ||
        structuralHash(series) !== origins[index]!.rowsSha256 ||
        series.some((row, column) => row.x !== rows[0]![column]?.x)))
    throw new TypeError("Saved vector-derived profiles are incomplete or misaligned.");
}

export type VectorDerivedRegionVerificationSession = {
  source?: Promise<"current" | "missing" | "changed" | "error">;
  speed?: Promise<Speed>; derived?: Promise<Derived>;
};
export async function checkVectorDerivedRegionGraphSeries(
  origin: Graph2DLinkedVectorRegionOrigin,
  bridge: Bridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes,
  session: VectorDerivedRegionVerificationSession = {}):
  Promise<"current" | "missing" | "changed" | "error"> {
  if (!validGraph2DLinkedOverlayOrigin(origin) || !isVectorDerivedRegionOrigin(origin))
    return "error";
  const document = parseVectorField3DDocument(origin.vectorDocumentJson);
  if (document.identity.structuralHash !== origin.vectorSourceHash) return "changed";
  const firstAxis = ([0, 1, 2] as const).filter(axis =>
    axis !== origin.region.normalAxis)[origin.profileAxis ?? 0]!;
  if (origin.xName !== document.source.axes[firstAxis].label ||
      origin.xUnit !== document.source.axes[firstAxis].unit) return "changed";
  if (!session.source) session.source = (async () => {
    if (document.source.field.kind === "expressions") return "current" as const;
    if (!bridge?.checkGraphDatasetReference) return "error" as const;
    const refs = document.source.field.references, first = refs[0];
    try {
      const checked = await bridge.checkGraphDatasetReference({ locator: first.locator,
        sceneFingerprint: first.sceneFingerprint, verifyResources: true });
      if (!checked.ok) return checked.status === "missing" ? "missing" as const : "changed" as const;
      return refs.some(ref => inspectGraph2DFieldReference(ref,
        checked.source.manifestJson) !== "current") ? "changed" as const : "current" as const;
    } catch { return "error" as const; }
  })();
  const status = await session.source;
  if (status !== "current") return status;
  try {
    if (origin.series === "vector") {
      session.speed ??= verifiedVectorRegionProfile(document, origin.region, bridge);
      const fresh = await session.speed;
      return fresh.unit === origin.yUnit && structuralHash(origin.profileAxis === 1 ?
        fresh.rowProfiles : fresh.rows) === origin.rowsSha256 &&
        canonicalJsonStringify(fresh.samples) === canonicalJsonStringify(origin.vectorSamples) ?
        "current" : "changed";
    }
    session.derived ??= verifiedCombinedDerivedRegionProfiles(document, origin.region, bridge);
    const pair = await session.derived;
    const fresh = origin.series === "divergence" ? pair.divergence : pair.curlMagnitude;
    return fresh.unit === origin.yUnit && structuralHash(origin.profileAxis === 1 ?
      fresh.rowProfiles : fresh.rows) === origin.rowsSha256 &&
      canonicalJsonStringify(pair.samples) === canonicalJsonStringify(origin.derivedSamples) ?
      "current" : "changed";
  } catch { return "error"; }
}
