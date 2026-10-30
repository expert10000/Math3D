import { sampleVectorField3DDerivedSlice, sampleVectorField3DSlice,
  sampleVectorField3DSparseSlice, scientificCoordinateIndex,
  type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DOverlayRegion,
  type VectorField3DSliceArtifact } from "@math3d/core";
import { sampleSliceOverlayVectorPlane } from "./scientificSliceOverlay";
import { sampleVerifiedVectorRegion } from "./combinedFieldInspection";

export type DivergenceSourceBridge = Partial<Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewVectorSamples" | "previewVectorVolume" |
  "closeGraphDataset">>;
export type CombinedDerivedChannel = "divergence" | "curl-magnitude";
type Digest = Readonly<{ name: string; sampleSha256: string }>;

/** Reduce a verified derived slice on the same 17 × 17 physical rectangle. */
export function derivedRegionProfile(region: VectorField3DOverlayRegion,
  derived: VectorField3DSliceArtifact,
  channel: CombinedDerivedChannel): Readonly<{ rows: readonly Graph2DPointRow[];
    unit: string; count: number; gaps: number; mean: number | null;
    min: number | null; max: number | null }> {
  if (derived.channel !== channel || derived.normalAxis !== region.normalAxis ||
      Math.abs(derived.fixedCoordinate - region.fixedCoordinate) > 1e-9 ||
      derived.shape[0] < 2 || derived.shape[1] < 2)
    throw new TypeError("Derived region must use the verified source slice and physical plane.");
  const sample = (x: number, y: number): number | null => {
    const positions = [x, y].map((value, axis) => {
      const coords = derived.coordinates[axis]!;
      if (value < coords[0]! - 1e-9 || value > coords.at(-1)! + 1e-9) return null;
      let hi = coords.findIndex(coordinate => coordinate >= value - 1e-9);
      if (hi < 0) hi = coords.length - 1;
      const lo = Math.max(0, hi - 1);
      return { lo, hi, t: hi === lo ? 0 : Math.max(0, Math.min(1,
        (value - coords[lo]!) / (coords[hi]! - coords[lo]!))) };
    });
    if (positions.some(position => position === null)) return null;
    const [a, b] = positions as NonNullable<typeof positions[number]>[];
    const at = (i: number, j: number) => derived.values[i * derived.shape[1] + j];
    const corners = [at(a!.lo, b!.lo), at(a!.hi, b!.lo),
      at(a!.lo, b!.hi), at(a!.hi, b!.hi)];
    if (!corners.every(value => value !== null && Number.isFinite(value))) return null;
    return (corners[0]! * (1 - a!.t) + corners[1]! * a!.t) * (1 - b!.t) +
      (corners[2]! * (1 - a!.t) + corners[3]! * a!.t) * b!.t;
  };
  const rows: Graph2DPointRow[] = [];
  const allValues: number[] = [];
  let count = 0;
  for (let i = 0; i < 17; i++) {
    const x = region.bounds[0][0] + (region.bounds[0][1] - region.bounds[0][0]) * i / 16;
    const values: number[] = [];
    for (let j = 0; j < 17; j++) {
      const y = region.bounds[1][0] + (region.bounds[1][1] - region.bounds[1][0]) * j / 16;
      const value = sample(x, y);
      if (value !== null) { values.push(value); allValues.push(value); count++; }
    }
    rows.push({ id: `row_${i + 1}`, x,
      y: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null });
  }
  return { rows, unit: derived.unit, count, gaps: 289 - count,
    mean: count ? allValues.reduce((sum, value) => sum + value, 0) / count : null,
    min: count ? Math.min(...allValues) : null,
    max: count ? Math.max(...allValues) : null };
}

export const divergenceRegionProfile = (region: VectorField3DOverlayRegion,
  derived: VectorField3DSliceArtifact) => derivedRegionProfile(region, derived, "divergence");
export const curlMagnitudeRegionProfile = (region: VectorField3DOverlayRegion,
  derived: VectorField3DSliceArtifact) => derivedRegionProfile(region, derived, "curl-magnitude");
export type CombinedDerivedProfile = ReturnType<typeof derivedRegionProfile>;

async function verifiedDerivedRegionProfiles(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  channels: readonly CombinedDerivedChannel[],
  bridge: DivergenceSourceBridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<Readonly<{
      profiles: readonly CombinedDerivedProfile[]; samples: readonly Digest[] }>> {
  if (document.source.field.kind === "expressions") return {
    profiles: channels.map(channel => derivedRegionProfile(region,
      sampleVectorField3DDerivedSlice(document, region.normalAxis,
        region.fixedCoordinate, channel), channel)), samples: [] };
  if (!bridge?.openGraphDatasetReference || !bridge.previewVectorSamples ||
      !bridge.previewVectorVolume || !bridge.closeGraphDataset)
    throw new TypeError("Verified scientific source services are unavailable.");
  const refs = document.source.field.references;
  const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
    sceneFingerprint: refs[0].sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Derived region source ${opened.status}: ${opened.error}`);
  const fingerprint = opened.source.fingerprint;
  try {
    const manifestJson = opened.source.manifestJson;
    const schema = JSON.parse(manifestJson).schema as string;
    const scientific = schema === "scientific-scene/v1" ? {
      manifestJson, fingerprint, volumes: await bridge.previewVectorVolume({ fingerprint,
        datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] }) } : null;
    const sparse = !scientific ? { manifestJson, fingerprint,
      samples: await bridge.previewVectorSamples({ fingerprint,
        datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string],
        selection: { kind: schema === "scientific-scene/v3" ?
          "source-stencil-slice" as const : "stencil-slice" as const,
          normalAxis: region.normalAxis,
          fixedIndex: scientificCoordinateIndex({ ...refs[0].axes[region.normalAxis]!,
            count: refs[0].shape[region.normalAxis]! }, region.fixedCoordinate) } }) } : null;
    const samples = scientific ? scientific.volumes.map(part => ({ name: part.component,
      sampleSha256: part.sampleSha256 })) : sparse!.samples.components.map(part => ({
        name: part.name, sampleSha256: part.sampleSha256 }));
    return { profiles: channels.map(channel => derivedRegionProfile(region,
      sampleVectorField3DDerivedSlice(document, region.normalAxis,
        region.fixedCoordinate, channel, scientific ?? sparse!), channel)), samples };
  } finally { await bridge.closeGraphDataset(fingerprint); }
}

export async function verifiedDerivedRegionProfile(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, channel: CombinedDerivedChannel,
  bridge?: DivergenceSourceBridge): Promise<CombinedDerivedProfile & Readonly<{
    samples: readonly Digest[] }>> {
  const verified = await verifiedDerivedRegionProfiles(document, region, [channel], bridge);
  return { ...verified.profiles[0]!, samples: verified.samples };
}

export const verifiedDivergenceRegionProfile = (document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, bridge?: DivergenceSourceBridge) =>
  verifiedDerivedRegionProfile(document, region, "divergence", bridge);

export async function verifiedCombinedDerivedRegionProfiles(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  bridge?: DivergenceSourceBridge): Promise<Readonly<{
    divergence: CombinedDerivedProfile; curlMagnitude: CombinedDerivedProfile;
    samples: readonly Digest[] }>> {
  const verified = await verifiedDerivedRegionProfiles(document, region,
    ["divergence", "curl-magnitude"], bridge);
  return { divergence: verified.profiles[0]!, curlMagnitude: verified.profiles[1]!,
    samples: verified.samples };
}

/** Independently verify the speed plane used by a vector-only rectangle. */
export async function verifiedVectorRegionProfile(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  bridge: DivergenceSourceBridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes) {
  const speedRegion = { ...region, vectorChannel: "speed" as const };
  if (document.source.field.kind === "expressions") {
    const slice = sampleVectorField3DSlice(document, region.normalAxis, region.fixedCoordinate);
    return { ...sampleVerifiedVectorRegion(document, slice, speedRegion,
      sampleSliceOverlayVectorPlane(document, slice)), samples: [] as Digest[] };
  }
  if (!bridge?.openGraphDatasetReference || !bridge.previewVectorSamples ||
      !bridge.previewVectorVolume || !bridge.closeGraphDataset)
    throw new TypeError("Verified scientific source services are unavailable.");
  const refs = document.source.field.references;
  const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
    sceneFingerprint: refs[0].sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Vector region source ${opened.status}: ${opened.error}`);
  const fingerprint = opened.source.fingerprint;
  try {
    const manifestJson = opened.source.manifestJson;
    const schema = JSON.parse(manifestJson).schema as string;
    const components = refs.map(ref => ref.component) as [string, string, string];
    if (schema === "scientific-scene/v1") {
      const volumes = await bridge.previewVectorVolume({ fingerprint,
        datasetId: refs[0].datasetId, components });
      const scientific = { manifestJson, fingerprint, volumes };
      const slice = sampleVectorField3DSlice(document, region.normalAxis,
        region.fixedCoordinate, scientific);
      return { ...sampleVerifiedVectorRegion(document, slice, speedRegion,
        sampleSliceOverlayVectorPlane(document, slice, scientific)),
        samples: volumes.map(part => ({ name: part.component,
          sampleSha256: part.sampleSha256 })) };
    }
    const samples = await bridge.previewVectorSamples({ fingerprint,
      datasetId: refs[0].datasetId, components, selection: { kind: "slice",
        normalAxis: region.normalAxis,
        fixedIndex: scientificCoordinateIndex({ ...refs[0].axes[region.normalAxis]!,
          count: refs[0].shape[region.normalAxis]! }, region.fixedCoordinate) } });
    const scientific = { manifestJson, fingerprint, samples };
    const slice = sampleVectorField3DSparseSlice(document, region.normalAxis,
      region.fixedCoordinate, scientific);
    return { ...sampleVerifiedVectorRegion(document, slice, speedRegion,
      sampleSliceOverlayVectorPlane(document, slice, scientific)),
      samples: samples.components.map(part => ({ name: part.name,
        sampleSha256: part.sampleSha256 })) };
  } finally { await bridge.closeGraphDataset(fingerprint); }
}
