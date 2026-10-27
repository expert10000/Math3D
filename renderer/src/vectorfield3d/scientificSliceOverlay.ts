import { evaluateGraph2DExpression, verifyVectorField3DSparseSamples,
  verifyVectorField3DVolumes, type Graph2DFieldReference,
  type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DSliceArtifact, type VectorField3DSparseSamples,
  type VectorField3DVolumes } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume } from "./linkedFieldProbe";

export type ScalarSliceOverlay = Readonly<{ values: readonly (number | null)[];
  min: number; max: number; covered: number; title: string; unit: string;
  source: string; sampleSha256: string; opacity: number }>;
export type SliceOverlayArrow = Readonly<{ firstIndex: number; secondIndex: number;
  firstComponent: number; secondComponent: number; normalComponent: number }>;

/** Resample a checked scalar transfer at the vector slice's physical coordinates. */
export function sampleScalarSliceOverlay(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, reference: Graph2DFieldReference,
  volume: Graph2DScientificVolume, title: string, unit: string,
  opacity: number): ScalarSliceOverlay {
  if (reference.semanticType !== "scalar-field" || reference.shape.length !== 3 ||
      volume.datasetId !== reference.datasetId || volume.component !== reference.component ||
      volume.fingerprint !== reference.sceneFingerprint ||
      volume.resourceSha256 !== reference.resourceSha256)
    throw new TypeError("Scalar overlay source changed or is not a 3D scalar field.");
  if (reference.axes.some((axis, index) => axis.name !== document.source.axes[index]!.label))
    throw new TypeError("Scalar overlay coordinate axes do not match the vector field.");
  if (reference.axes.some((axis, index) => axis.unit !== document.source.axes[index]!.unit))
    throw new TypeError("Scalar overlay coordinate units do not match the vector field.");
  const axes = reference.axes.map((axis, index) => ({ name: axis.name, unit: axis.unit,
    origin: axis.origin, spacing: axis.spacing, count: reference.shape[index]! }));
  const [first, second] = slice.planeAxes;
  const values = slice.coordinates[0].flatMap(firstValue => slice.coordinates[1].map(secondValue => {
    const point = [0, 0, 0] as [number, number, number];
    point[slice.normalAxis] = slice.fixedCoordinate;
    point[first] = firstValue; point[second] = secondValue;
    return linkedFieldPointStatus(point, axes, document.source.axes.map(axis => axis.unit)) === "inside" ?
      sampleLinkedFieldVolume(volume, axes, point) : null;
  }));
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) throw new RangeError("The selected slice is outside the scalar field domain.");
  return { values, min: Math.min(...finite), max: Math.max(...finite), covered: finite.length,
    title, unit, source: `${reference.sceneId} / ${reference.datasetId}`,
    sampleSha256: volume.sampleSha256, opacity };
}

type CheckedVectorSource = Readonly<{ manifestJson: string; fingerprint: string;
  samples?: VectorField3DSparseSamples; volumes?: VectorField3DVolumes }>;

/** Project vectors from the same checked physical plane as the displayed slice. */
export function sampleSliceOverlayArrows(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, scientific?: CheckedVectorSource): readonly SliceOverlayArrow[] {
  const field = document.source.field;
  const [first, second] = slice.planeAxes;
  let vectorAt: (i: number, j: number) => readonly number[];
  if (field.kind === "expressions") {
    vectorAt = (i, j) => {
      const point = [0, 0, 0]; point[slice.normalAxis] = slice.fixedCoordinate;
      point[first] = slice.coordinates[0][i]!; point[second] = slice.coordinates[1][j]!;
      return field.components.map(component => {
        const result = evaluateGraph2DExpression(component.ast,
          { x: point[0]!, y: point[1]!, z: point[2]! }, { maxEvaluations: 256 });
        return result.ok ? result.value : NaN;
      });
    };
  } else if (scientific?.samples) {
    const checked = verifyVectorField3DSparseSamples(document, scientific.manifestJson,
      scientific.fingerprint, scientific.samples);
    if (checked.selection.kind !== "slice" || checked.selection.normalAxis !== slice.normalAxis ||
        field.references[0].axes[slice.normalAxis]!.origin +
          field.references[0].axes[slice.normalAxis]!.spacing * checked.selection.fixedIndex !==
          slice.fixedCoordinate)
      throw new TypeError("Verified arrow samples belong to a different slice.");
    vectorAt = (i, j) => checked.components.map(component =>
      component.values[i * slice.shape[1] + j]!);
  } else if (scientific?.volumes) {
    const checked = verifyVectorField3DVolumes(document, scientific.manifestJson,
      scientific.fingerprint, scientific.volumes);
    const shape = checked[0].sampleShape, sourceShape = checked[0].sourceShape;
    const sampled = (axis: number, sample: number) => Math.round(sample *
      (sourceShape[axis]! - 1) / (shape[axis]! - 1));
    const fixed = Math.round((slice.fixedCoordinate - field.references[0].axes[slice.normalAxis]!.origin) /
      field.references[0].axes[slice.normalAxis]!.spacing);
    const fixedSample = Array.from({ length: shape[slice.normalAxis]! }, (_, index) => index)
      .find(index => sampled(slice.normalAxis, index) === fixed);
    if (fixedSample === undefined) throw new TypeError("Verified arrow volume misses the selected plane.");
    vectorAt = (i, j) => {
      const point = [0, 0, 0]; point[slice.normalAxis] = fixedSample;
      point[first] = i; point[second] = j;
      const offset = (point[0]! * shape[1] + point[1]!) * shape[2] + point[2]!;
      return checked.map(component => component.values[offset]!);
    };
  } else throw new TypeError("Scientific overlay arrows require verified vector samples.");
  const firstStep = Math.max(1, Math.ceil(slice.shape[0] / 12));
  const secondStep = Math.max(1, Math.ceil(slice.shape[1] / 12));
  const arrows: SliceOverlayArrow[] = [];
  for (let i = 0; i < slice.shape[0]; i += firstStep) for (let j = 0; j < slice.shape[1]; j += secondStep) {
    const vector = vectorAt(i, j);
    if (!vector.every(Number.isFinite)) continue;
    if (Math.hypot(...vector) <= 1e-12) continue;
    arrows.push({ firstIndex: i, secondIndex: j,
      firstComponent: vector[first]!, secondComponent: vector[second]!,
      normalComponent: vector[slice.normalAxis]! });
  }
  return arrows;
}
