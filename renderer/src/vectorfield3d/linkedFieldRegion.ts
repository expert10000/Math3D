import { scientificScalarDerivationUnit, type Graph2DScientificVolume, type ScientificFieldDocument,
  type VectorField3DAxis, type VectorField3DOverlayRegion } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume } from "./linkedFieldProbe";

export type LinkedFieldRegionSummary = Readonly<{
  sampleCount: number; alignedCount: number; outsideAreaPercent: number;
  components: readonly Readonly<{ name: string; count: number;
    mean: number; min: number; max: number; sampleSha256: string }>[];
  source: string; unit: string }>;

/** Read one saved physical rectangle from already verified scalar or complex transfers. */
export function sampleLinkedFieldRegion(region: VectorField3DOverlayRegion,
  vectorAxes: readonly VectorField3DAxis[], document: ScientificFieldDocument,
  volumes: readonly Graph2DScientificVolume[]): LinkedFieldRegionSummary {
  const references = document.source.paired ?
    [document.source.reference, document.source.paired.imaginary] : [document.source.reference];
  const reference = references[0]!;
  if (reference.shape.length !== 3 || vectorAxes.length !== 3 ||
      reference.axes.some((axis, index) => axis.name !== vectorAxes[index]!.label ||
        axis.unit !== vectorAxes[index]!.unit))
    throw new TypeError("Region coordinate axes or units do not match this layer.");
  if (volumes.length !== references.length || references.some((source, index) =>
    volumes[index]?.component !== source.component ||
    volumes[index]?.datasetId !== source.datasetId ||
    volumes[index]?.fingerprint !== source.sceneFingerprint ||
    volumes[index]?.resourceSha256 !== source.resourceSha256))
    throw new TypeError("Region source components have not been freshly verified.");
  const axes = reference.axes.map((axis, index) => ({ name: axis.name, unit: axis.unit,
    origin: axis.origin, spacing: axis.spacing, count: reference.shape[index]! }));
  const planeAxes = ([0, 1, 2] as const).filter(axis => axis !== region.normalAxis);
  const span = region.bounds.map(([low, high]) => high - low);
  if (span.some(value => !Number.isFinite(value) || value <= 0))
    throw new RangeError("Region needs finite, ordered physical bounds.");
  const overlap = region.bounds.map(([low, high], local) => {
    const axis = axes[planeAxes[local]!]!;
    const end = axis.origin + axis.spacing * (axis.count - 1);
    return Math.max(0, Math.min(high, Math.max(axis.origin, end)) -
      Math.max(low, Math.min(axis.origin, end)));
  });
  const normal = axes[region.normalAxis]!;
  const normalEnd = normal.origin + normal.spacing * (normal.count - 1);
  const normalInside = region.fixedCoordinate >= Math.min(normal.origin, normalEnd) - 1e-9 &&
    region.fixedCoordinate <= Math.max(normal.origin, normalEnd) + 1e-9;
  const outsideAreaPercent = normalInside ? 100 * (1 -
    overlap[0]! * overlap[1]! / (span[0]! * span[1]!)) : 100;
  const values = volumes.map(() => [] as number[]);
  let alignedCount = 0;
  for (let i = 0; i < 17; i++) for (let j = 0; j < 17; j++) {
    const point = [0, 0, 0] as [number, number, number];
    point[region.normalAxis] = region.fixedCoordinate;
    point[planeAxes[0]!] = region.bounds[0][0] + span[0]! * i / 16;
    point[planeAxes[1]!] = region.bounds[1][0] + span[1]! * j / 16;
    if (linkedFieldPointStatus(point, axes, vectorAxes.map(axis => axis.unit)) !== "inside") continue;
    const sampled = volumes.map(volume => sampleLinkedFieldVolume(volume, axes, point));
    sampled.forEach((value, index) => { if (Number.isFinite(value)) values[index]!.push(value); });
    if (sampled.every(Number.isFinite)) alignedCount++;
  }
  return { sampleCount: 289, alignedCount, outsideAreaPercent,
    components: volumes.map((volume, index) => ({ name: volume.component,
      count: values[index]!.length,
      mean: values[index]!.length ? values[index]!.reduce((sum, value) => sum + value, 0) /
        values[index]!.length : NaN,
      min: values[index]!.length ? Math.min(...values[index]!) : NaN,
      max: values[index]!.length ? Math.max(...values[index]!) : NaN,
      sampleSha256: volume.sampleSha256 })),
    source: `${reference.sceneId} / ${reference.datasetId}`,
    unit: document.source.derivation ? scientificScalarDerivationUnit(document) :
      document.source.quantity.unit };
}
