import { sampleVectorField3DDerivedSlice, scientificCoordinateIndex,
  type Graph2DPointRow,
  type VectorField3DDocument, type VectorField3DOverlayRegion,
  type VectorField3DSliceArtifact } from "@math3d/core";

export type DivergenceSourceBridge = Partial<Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewVectorSamples" | "previewVectorVolume" |
  "closeGraphDataset">>;

/** Reduce a verified divergence slice on the same 17 × 17 physical rectangle. */
export function divergenceRegionProfile(region: VectorField3DOverlayRegion,
  derived: VectorField3DSliceArtifact): Readonly<{ rows: readonly Graph2DPointRow[];
    unit: string; count: number; gaps: number; mean: number | null;
    min: number | null; max: number | null }> {
  if (derived.channel !== "divergence" || derived.normalAxis !== region.normalAxis ||
      Math.abs(derived.fixedCoordinate - region.fixedCoordinate) > 1e-9 ||
      derived.shape[0] < 2 || derived.shape[1] < 2)
    throw new TypeError("Divergence must use the verified source slice and physical plane.");
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

export async function verifiedDivergenceRegionProfile(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion,
  bridge: DivergenceSourceBridge | undefined = typeof window === "undefined" ? undefined :
    window.scientificScenes): Promise<ReturnType<typeof divergenceRegionProfile> &
    Readonly<{ samples: readonly Readonly<{ name: string; sampleSha256: string }>[] }>> {
  if (document.source.field.kind === "expressions") return {
    ...divergenceRegionProfile(region, sampleVectorField3DDerivedSlice(document,
      region.normalAxis, region.fixedCoordinate, "divergence")), samples: [] };
  if (!bridge?.openGraphDatasetReference || !bridge.previewVectorSamples ||
      !bridge.previewVectorVolume || !bridge.closeGraphDataset)
    throw new TypeError("Verified scientific source services are unavailable.");
  const refs = document.source.field.references;
  const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
    sceneFingerprint: refs[0].sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Divergence source ${opened.status}: ${opened.error}`);
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
    const derived = sampleVectorField3DDerivedSlice(document, region.normalAxis,
      region.fixedCoordinate, "divergence", scientific ?? sparse!);
    const samples = scientific ? scientific.volumes.map(part => ({ name: part.component,
      sampleSha256: part.sampleSha256 })) : sparse!.samples.components.map(part => ({
        name: part.name, sampleSha256: part.sampleSha256 }));
    return { ...divergenceRegionProfile(region, derived), samples };
  } finally { await bridge.closeGraphDataset(fingerprint); }
}
