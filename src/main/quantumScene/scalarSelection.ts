import type { ImportedQuantumScene } from "./importer";

export type ScalarSampleRequest = { fingerprint: string; objectId: string; sampleIndex: number };
export type ScalarSample = {
  objectId: string; objectLabel: string; sampleIndex: number; sampleId: string;
  position: [number, number, number]; coordinateAxes: [string, string, string];
  coordinateUnits: [string, string, string]; positionDatasetId: string;
  value: number; valueUnit: string; valueDatasetId: string;
  runId: string; resultSha256: string; fingerprint: string;
};

/** Read one scalar from the reverified source arrays, not a rendered point. */
export function inspectVerifiedScalarSample(imported: ImportedQuantumScene, request: ScalarSampleRequest): ScalarSample {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      typeof request.fingerprint !== "string" || typeof request.objectId !== "string" ||
      !Number.isSafeInteger(request.sampleIndex)) throw new TypeError("Invalid scalar sample request");
  const { source, arrays } = imported;
  const object = source.objects.find(item => item.id === request.objectId);
  if (!object || !object.scalars || !imported.mappedObjectIds.includes(object.id))
    throw new Error("Selected scalar object is not mapped in this scene");
  const positions = arrays.get(object.positions);
  const values = arrays.get(object.scalars);
  const valueDataset = source.datasets.find(item => item.id === object.scalars);
  if (!positions || !values || !valueDataset || valueDataset.components !== 1)
    throw new Error("Selected object has no scalar dataset");
  const index = request.sampleIndex;
  if (index < 0 || index >= values.length || index * 3 + 2 >= positions.length)
    throw new RangeError("Scalar sample is outside the verified dataset");
  return { objectId: object.id, objectLabel: object.label, sampleIndex: index,
    sampleId: `${object.id}:sample:${index}`,
    position: [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]],
    coordinateAxes: source.coordinates.axes, coordinateUnits: source.coordinates.units,
    positionDatasetId: object.positions, value: values[index], valueUnit: valueDataset.unit,
    valueDatasetId: object.scalars, runId: source.provenance.runId,
    resultSha256: source.provenance.resultSha256, fingerprint: request.fingerprint };
}
