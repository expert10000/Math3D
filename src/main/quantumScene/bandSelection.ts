import type { ImportedQuantumScene } from "./importer";

export type BandSampleRequest = { fingerprint: string; objectId: string; sampleIndex: number };
export type BandSample = {
  objectId: string; bandIndex: number; bandId: string; bandLabel: string;
  sampleIndex: number; sampleId: string; coordinateDatasetId: string; energyDatasetId: string;
  k: [number, number, number]; kUnit: string; energy: number; energyUnit: string;
  bulkGap: number; runId: string; resultSha256: string; fingerprint: string;
};

/** Resolve an exact sample from the verified binary datasets, never rendered float32 geometry. */
export function inspectVerifiedBandSample(imported: ImportedQuantumScene, request: BandSampleRequest): BandSample {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      typeof request.fingerprint !== "string" || typeof request.objectId !== "string" ||
      !Number.isSafeInteger(request.sampleIndex)) throw new TypeError("Invalid band sample request");
  const { source, arrays } = imported;
  const bands = source.bands;
  if (!bands) throw new Error("This verified scene has no supplied bands");
  const bandIndex = bands.objects.indexOf(request.objectId);
  if (bandIndex < 0 || !imported.mappedObjectIds.includes(request.objectId))
    throw new Error("Selected band is not mapped in this scene");
  const coordinates = arrays.get(bands.coordinates)!;
  const energyDatasetId = bands.energies[bandIndex];
  const energies = arrays.get(energyDatasetId)!;
  const sampleIndex = request.sampleIndex;
  if (sampleIndex < 0 || sampleIndex >= energies.length || 3 * sampleIndex + 2 >= coordinates.length)
    throw new RangeError("Band sample is outside the verified dataset");
  const kUnit = source.datasets.find(dataset => dataset.id === bands.coordinates)!.unit;
  return { objectId: request.objectId, bandIndex,
    bandId: `${request.objectId}:${energyDatasetId}`, bandLabel: bands.labels[bandIndex],
    sampleIndex, sampleId: `${request.objectId}:sample:${sampleIndex}`,
    coordinateDatasetId: bands.coordinates, energyDatasetId,
    k: [coordinates[3 * sampleIndex], coordinates[3 * sampleIndex + 1], coordinates[3 * sampleIndex + 2]],
    kUnit, energy: energies[sampleIndex], energyUnit: bands.energyUnit,
    bulkGap: bands.bulkGap, runId: source.provenance.runId,
    resultSha256: source.provenance.resultSha256, fingerprint: request.fingerprint };
}
