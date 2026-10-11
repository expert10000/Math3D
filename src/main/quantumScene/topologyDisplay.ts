import type { ImportedQuantumScene } from "./importer";
import type { QuantumScene } from "./index";

export type ScalarDisplay = {
  quantityId: string; objectId: string; minimum: number; maximum: number; unit: string;
  /** Signed, seven-step display palette. One entry per mapped source triangle. */
  faceBins: number[];
};
export type VectorGlyph = { sampleIndex: number; origin: [number, number, number]; direction: [number, number, number] };
export type VectorDisplay = {
  objectId: string; count: number; positionUnit: string; vectorUnit: string;
  glyphs: VectorGlyph[]; zeroCount: number;
};

const MAX_GLYPHS = 128;
const vector3 = (array: Float64Array, index: number): [number, number, number] =>
  [array[3 * index], array[3 * index + 1], array[3 * index + 2]];

/** Deterministic, endpoint-preserving source indices. No interpolated samples. */
export function glyphSampleIndices(count: number, limit = MAX_GLYPHS): number[] {
  if (count <= 0 || limit <= 0) return [];
  const shown = Math.min(count, limit);
  return Array.from({ length: shown }, (_, ordinal) => shown === 1 ? 0 :
    Math.round(ordinal * (count - 1) / (shown - 1)));
}

export function buildTopologyDisplay(scene: QuantumScene, arrays: Map<string, Float64Array>,
  mappedObjectIds: readonly string[], mappedTriangleCounts: Record<string, number>):
  { scalars: ScalarDisplay[]; vectors: VectorDisplay[] } {
  const mapped = new Set(mappedObjectIds);
  const scalars: ScalarDisplay[] = [];
  for (const quantity of scene.topology?.quantities ?? []) {
    const object = scene.objects.find(candidate => candidate.id === quantity.object);
    if (!object || object.kind !== "mesh" || !mapped.has(object.id) ||
        scalars.some(item => item.objectId === object.id)) continue;
    const values = arrays.get(quantity.dataset)!;
    const indices = arrays.get(object.indices!)!;
    // Topology meshes retain their source triangle order (band LOD only applies to band objects).
    if (mappedTriangleCounts[object.id] !== indices.length / 3) continue;
    let minimum = Infinity, maximum = -Infinity;
    for (const value of values) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
    const faceBins: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const mean = (values[indices[i]] + values[indices[i + 1]] + values[indices[i + 2]]) / 3;
      // Preserve sign even when the negative and positive source ranges are
      // very asymmetric (QWZ is a real example). Zero alone uses the neutral bin.
      faceBins.push(mean === 0 ? 3 : mean < 0 ?
        3 - Math.max(1, Math.min(3, Math.ceil(3 * mean / minimum))) :
        3 + Math.max(1, Math.min(3, Math.ceil(3 * mean / maximum))));
    }
    scalars.push({ quantityId: quantity.id, objectId: object.id, minimum, maximum,
      unit: scene.datasets.find(dataset => dataset.id === quantity.dataset)!.unit, faceBins });
  }
  const vectors: VectorDisplay[] = [];
  for (const object of scene.objects) {
    if (object.kind !== "vectors" || !mapped.has(object.id)) continue;
    const positions = arrays.get(object.positions)!, values = arrays.get(object.values!)!;
    const count = positions.length / 3;
    let zeroCount = 0;
    for (let i = 0; i < count; i++) if (Math.hypot(...vector3(values, i)) === 0) zeroCount++;
    const glyphs = glyphSampleIndices(count).flatMap(sampleIndex => {
      const value = vector3(values, sampleIndex);
      const length = Math.hypot(...value);
      return length === 0 ? [] : [{ sampleIndex, origin: vector3(positions, sampleIndex),
        direction: value.map(component => component / length) as [number, number, number] }];
    });
    vectors.push({ objectId: object.id, count,
      positionUnit: scene.datasets.find(dataset => dataset.id === object.positions)!.unit,
      vectorUnit: scene.datasets.find(dataset => dataset.id === object.values)!.unit, glyphs, zeroCount });
  }
  return { scalars, vectors };
}

export type TopologySampleRequest = { fingerprint: string; quantityId: string; sampleIndex: number };
export type VectorSampleRequest = { fingerprint: string; objectId: string; sampleIndex: number };
export type TopologySample = {
  quantityId: string; quantityLabel: string; kind: string; objectId: string; sampleIndex: number; sampleId: string;
  position: [number, number, number]; positionDatasetId: string; coordinateAxes: [string, string, string];
  coordinateUnits: [string, string, string]; value: number; valueUnit: string; valueDatasetId: string;
  convention: string; runId: string; resultSha256: string; fingerprint: string;
};
export type VectorSample = {
  objectId: string; objectLabel: string; sampleIndex: number; sampleId: string;
  position: [number, number, number]; positionDatasetId: string; positionUnit: string;
  value: [number, number, number]; valueDatasetId: string; valueUnit: string;
  quantityId: string | null; quantityKind: string | null; convention: string | null;
  runId: string; resultSha256: string; fingerprint: string;
};

function validRequest(request: unknown, key: "quantityId" | "objectId"):
  asserts request is { fingerprint: string; sampleIndex: number; quantityId: string; objectId: string } {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      typeof (request as Record<string, unknown>).fingerprint !== "string" ||
      typeof (request as Record<string, unknown>)[key] !== "string" ||
      !Number.isSafeInteger((request as Record<string, unknown>).sampleIndex))
    throw new TypeError("Invalid quantum scene sample request");
}

export function inspectVerifiedTopologySample(imported: ImportedQuantumScene, request: TopologySampleRequest): TopologySample {
  validRequest(request, "quantityId");
  const { source, arrays } = imported;
  const quantity = source.topology?.quantities.find(item => item.id === request.quantityId);
  const object = source.objects.find(item => item.id === quantity?.object);
  if (!quantity || !object || !imported.mappedObjectIds.includes(object.id) || object.kind !== "mesh")
    throw new Error("Selected topology quantity is not mapped in this scene");
  const positions = arrays.get(object.positions)!, values = arrays.get(quantity.dataset)!;
  if (request.sampleIndex < 0 || request.sampleIndex >= values.length)
    throw new RangeError("Topology sample is outside the verified dataset");
  return { quantityId: quantity.id, quantityLabel: quantity.label, kind: quantity.kind, objectId: object.id,
    sampleIndex: request.sampleIndex, sampleId: `${object.id}:sample:${request.sampleIndex}`,
    position: vector3(positions, request.sampleIndex), positionDatasetId: object.positions,
    coordinateAxes: source.coordinates.axes, coordinateUnits: source.coordinates.units,
    value: values[request.sampleIndex], valueUnit: source.datasets.find(item => item.id === quantity.dataset)!.unit,
    valueDatasetId: quantity.dataset, convention: quantity.convention,
    runId: source.provenance.runId, resultSha256: source.provenance.resultSha256, fingerprint: request.fingerprint };
}

export function inspectVerifiedVectorSample(imported: ImportedQuantumScene, request: VectorSampleRequest): VectorSample {
  validRequest(request, "objectId");
  const { source, arrays } = imported;
  const object = source.objects.find(item => item.id === request.objectId);
  if (!object || object.kind !== "vectors" || !imported.mappedObjectIds.includes(object.id))
    throw new Error("Selected vector object is not mapped in this scene");
  const positions = arrays.get(object.positions)!, values = arrays.get(object.values!)!;
  if (request.sampleIndex < 0 || 3 * request.sampleIndex + 2 >= values.length)
    throw new RangeError("Vector sample is outside the verified dataset");
  const quantity = source.topology?.quantities.find(item => item.object === object.id && item.dataset === object.values);
  return { objectId: object.id, objectLabel: object.label, sampleIndex: request.sampleIndex,
    sampleId: `${object.id}:sample:${request.sampleIndex}`,
    position: vector3(positions, request.sampleIndex), positionDatasetId: object.positions,
    positionUnit: source.datasets.find(item => item.id === object.positions)!.unit,
    value: vector3(values, request.sampleIndex), valueDatasetId: object.values!,
    valueUnit: source.datasets.find(item => item.id === object.values)!.unit,
    quantityId: quantity?.id ?? null, quantityKind: quantity?.kind ?? null, convention: quantity?.convention ?? null,
    runId: source.provenance.runId, resultSha256: source.provenance.resultSha256, fingerprint: request.fingerprint };
}
