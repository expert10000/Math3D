import { evaluateGraph2DExpression, sha256Checksum, verifyVectorField3DSparseSamples,
  verifyVectorField3DVolumes, type Graph2DFieldReference,
  type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DLinkedLineProfile,
  type VectorField3DOverlayRegion,
  type VectorField3DComplexOverlay,
  type VectorField3DSliceArtifact, type VectorField3DSparseSamples,
  type VectorField3DVolumes } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume } from "./linkedFieldProbe";

export type ScalarSliceOverlay = Readonly<{ values: readonly (number | null)[];
  min: number; max: number; covered: number; title: string; unit: string;
  source: string; sampleSha256: string; opacity: number;
  mode?: "scalar" | "complex-magnitude" | "complex-phase";
  verifiedComponents?: readonly Readonly<{ name: string; sampleSha256: string }>[] }>;
export type SliceOverlayArrow = Readonly<{ firstIndex: number; secondIndex: number;
  firstComponent: number; secondComponent: number; normalComponent: number }>;
export type VectorSliceOverlayPlane = Readonly<{
  shape: readonly [number, number]; sourceStructuralHash: string;
  components: readonly [readonly number[], readonly number[], readonly number[]];
  units: readonly [string, string, string] }>;
export type LinkedOverlayLineProfile = Readonly<{
  rows: readonly Readonly<{ coordinate: number; vector: number | null;
    scalar: number | null }>[];
  coordinateUnit: string; vectorUnit: string; scalarUnit: string;
  vectorChannel: VectorField3DLinkedLineProfile["vectorChannel"];
  scalarSampleSha256: string; vectorSourceHash: string }>;
export type OverlayRegionSummary = Readonly<{
  sampleCount: number; vectorCount: number; scalarCount: number; alignedCount: number;
  vector: Readonly<{ mean: number; min: number; max: number }> | null;
  scalar: Readonly<{ mean: number; min: number; max: number }> | null;
  scalarOutsideAreaPercent: number; vectorOutsideAreaPercent: number;
  vectorUnit: string; scalarUnit: string;
  scalarSampleSha256: string; vectorSourceHash: string }>;

/** Summarize aligned physical samples on a fixed 17×17 lattice inside a saved rectangle. */
export function sampleOverlayRegion(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, recipe: VectorField3DOverlayRegion,
  plane: VectorSliceOverlayPlane, reference: Graph2DFieldReference,
  volume: Graph2DScientificVolume, scalarUnit: string,
  complex?: Readonly<{ imaginaryReference: Graph2DFieldReference;
    imaginaryVolume: Graph2DScientificVolume; mode: "magnitude" | "phase" }>): OverlayRegionSummary {
  if (recipe.normalAxis !== slice.normalAxis ||
      Math.abs(recipe.fixedCoordinate - slice.fixedCoordinate) > 1e-9 ||
      plane.sourceStructuralHash !== document.identity.structuralHash ||
      plane.shape[0] !== slice.shape[0] || plane.shape[1] !== slice.shape[1])
    throw new TypeError("Selected region is on a different verified vector plane.");
  if (reference.semanticType !== (complex ? "complex-scalar-field" : "scalar-field") ||
      reference.shape.length !== 3 ||
      volume.datasetId !== reference.datasetId || volume.component !== reference.component ||
      volume.fingerprint !== reference.sceneFingerprint ||
      volume.resourceSha256 !== reference.resourceSha256 ||
      reference.axes.some((axis, index) => axis.name !== document.source.axes[index]!.label ||
        axis.unit !== document.source.axes[index]!.unit))
    throw new TypeError("Selected region scalar source or coordinate units changed.");
  if (complex && (complex.imaginaryReference.semanticType !== "complex-scalar-field" ||
      complex.imaginaryReference.component !== "imaginary" ||
      reference.component !== "real" ||
      complex.imaginaryReference.sceneFingerprint !== reference.sceneFingerprint ||
      complex.imaginaryReference.datasetId !== reference.datasetId ||
      complex.imaginaryVolume.datasetId !== complex.imaginaryReference.datasetId ||
      complex.imaginaryVolume.component !== complex.imaginaryReference.component ||
      complex.imaginaryVolume.fingerprint !== complex.imaginaryReference.sceneFingerprint ||
      complex.imaginaryVolume.resourceSha256 !== complex.imaginaryReference.resourceSha256 ||
      complex.imaginaryReference.axes.some((axis, index) =>
        axis.name !== reference.axes[index]!.name || axis.unit !== reference.axes[index]!.unit)))
    throw new TypeError("Selected region imaginary source changed.");
  const [first, second] = slice.planeAxes;
  for (let local = 0; local < 2; local++) {
    const [low, high] = recipe.bounds[local]!;
    if (!Number.isFinite(low) || !Number.isFinite(high) || !(high > low))
      throw new RangeError("Selected region needs finite, ordered physical bounds.");
  }
  const channelIndex = { p: 0, q: 1, r: 2 } as const;
  const componentIndex = recipe.vectorChannel === "speed" ? null : channelIndex[recipe.vectorChannel];
  if (componentIndex === null && plane.units.some(unit => unit !== plane.units[0]))
    throw new TypeError("Vector component units differ; speed cannot be combined.");
  const scalarAxes = reference.axes.map((axis, index) => ({ name: axis.name,
    unit: axis.unit, origin: axis.origin, spacing: axis.spacing,
    count: reference.shape[index]! }));
  const boundsWidth = recipe.bounds.map(([low, high]) => high - low);
  const vectorOverlap = recipe.bounds.map(([low, high], local) => {
    const coordinates = slice.coordinates[local]!;
    return Math.max(0, Math.min(high, coordinates.at(-1)!) -
      Math.max(low, coordinates[0]!));
  });
  const vectorOutsideAreaPercent = 100 * (1 -
    vectorOverlap[0]! * vectorOverlap[1]! / (boundsWidth[0]! * boundsWidth[1]!));
  const overlap = recipe.bounds.map(([low, high], local) => {
    const axis = reference.axes[slice.planeAxes[local]!]!;
    const end = axis.origin + axis.spacing * (reference.shape[slice.planeAxes[local]!]! - 1);
    return Math.max(0, Math.min(high, Math.max(axis.origin, end)) -
      Math.max(low, Math.min(axis.origin, end)));
  });
  const scalarNormal = reference.axes[slice.normalAxis]!;
  const scalarNormalEnd = scalarNormal.origin + scalarNormal.spacing *
    (reference.shape[slice.normalAxis]! - 1);
  const normalInside = slice.fixedCoordinate >= Math.min(scalarNormal.origin, scalarNormalEnd) - 1e-9 &&
    slice.fixedCoordinate <= Math.max(scalarNormal.origin, scalarNormalEnd) + 1e-9;
  const scalarOutsideAreaPercent = normalInside ? 100 * (1 -
    overlap[0]! * overlap[1]! / (boundsWidth[0]! * boundsWidth[1]!)) : 100;
  const interpolate = (component: readonly number[], firstValue: number,
    secondValue: number): number | null => {
    const indices = [firstValue, secondValue].map((value, local) => {
      const coords = slice.coordinates[local]!;
      const upper = coords.findIndex(coordinate => coordinate >= value - 1e-9);
      const hi = upper < 0 ? coords.length - 1 : upper;
      const lo = Math.max(0, hi - 1);
      const fraction = hi === lo ? 0 : Math.max(0, Math.min(1,
        (value - coords[lo]!) / (coords[hi]! - coords[lo]!)));
      return { lo, hi, fraction };
    });
    const a = indices[0]!, b = indices[1]!;
    const at = (i: number, j: number) => component[i * slice.shape[1] + j];
    const corners = [at(a.lo, b.lo), at(a.hi, b.lo), at(a.lo, b.hi), at(a.hi, b.hi)];
    return corners.every(value => Number.isFinite(value)) ?
      (corners[0]! * (1 - a.fraction) + corners[1]! * a.fraction) * (1 - b.fraction) +
      (corners[2]! * (1 - a.fraction) + corners[3]! * a.fraction) * b.fraction : null;
  };
  const vectors: number[] = [], scalars: number[] = [];
  let vectorCount = 0, scalarCount = 0;
  for (let i = 0; i < 17; i++) for (let j = 0; j < 17; j++) {
    const firstValue = recipe.bounds[0][0] + boundsWidth[0]! * i / 16;
    const secondValue = recipe.bounds[1][0] + boundsWidth[1]! * j / 16;
    const point = [0, 0, 0] as [number, number, number];
    point[slice.normalAxis] = slice.fixedCoordinate;
    point[first] = firstValue; point[second] = secondValue;
    const vectorInside = [firstValue, secondValue].every((value, local) =>
      value >= slice.coordinates[local]![0]! - 1e-9 &&
      value <= slice.coordinates[local]!.at(-1)! + 1e-9);
    const components = vectorInside ? plane.components.map(component =>
      interpolate(component, firstValue, secondValue)) : [null, null, null];
    const vector = componentIndex === null ? components.every(value => value !== null) ?
      Math.hypot(...components as number[]) : null : components[componentIndex];
    const inside = linkedFieldPointStatus(point, scalarAxes,
      document.source.axes.map(axis => axis.unit)) === "inside";
    const realValue = inside ? sampleLinkedFieldVolume(volume, scalarAxes, point) : null;
    const imaginaryValue = inside && complex ?
      sampleLinkedFieldVolume(complex.imaginaryVolume, scalarAxes, point) : null;
    const magnitude = realValue !== null && imaginaryValue !== null ?
      Math.hypot(realValue, imaginaryValue) : null;
    const scalar = complex ? magnitude === null ? null : complex.mode === "phase" ?
      magnitude > 1e-12 ? Math.atan2(imaginaryValue!, realValue!) : null : magnitude : realValue;
    const vectorValid = vector !== null && Number.isFinite(vector);
    const scalarValid = scalar !== null && Number.isFinite(scalar);
    if (vectorValid) vectorCount++;
    if (scalarValid) scalarCount++;
    if (vectorValid && scalarValid) { vectors.push(vector!); scalars.push(scalar!); }
  }
  const stats = (values: number[]) => values.length ? {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values), max: Math.max(...values) } : null;
  return { sampleCount: 289, vectorCount, scalarCount,
    alignedCount: vectors.length, vector: stats(vectors), scalar: stats(scalars),
    scalarOutsideAreaPercent, vectorOutsideAreaPercent,
    vectorUnit: componentIndex === null ? plane.units[0] :
      plane.units[componentIndex], scalarUnit,
    scalarSampleSha256: complex ? sha256Checksum(new TextEncoder().encode(
      `${volume.sampleSha256}:${complex.imaginaryVolume.sampleSha256}`)).slice(7) :
      volume.sampleSha256,
    vectorSourceHash: slice.sourceHash ?? document.identity.structuralHash };
}

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

/** Resample both checked complex components at the vector slice's physical coordinates. */
export function sampleComplexSliceOverlay(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, recipe: VectorField3DComplexOverlay,
  realVolume: Graph2DScientificVolume,
  imaginaryVolume: Graph2DScientificVolume): ScalarSliceOverlay {
  const real = recipe.real, imaginary = recipe.imaginary;
  if (real.semanticType !== "complex-scalar-field" ||
      imaginary.semanticType !== "complex-scalar-field" ||
      real.shape.length !== 3 || imaginary.shape.length !== 3 ||
      real.component !== "real" || imaginary.component !== "imaginary" ||
      real.datasetId !== imaginary.datasetId ||
      real.sceneFingerprint !== imaginary.sceneFingerprint ||
      [real, imaginary].some((reference, index) => {
        const volume = index === 0 ? realVolume : imaginaryVolume;
        return volume.datasetId !== reference.datasetId ||
          volume.component !== reference.component ||
          volume.fingerprint !== reference.sceneFingerprint ||
          volume.resourceSha256 !== reference.resourceSha256 ||
          reference.axes.some((axis, axisIndex) => axis.name !== document.source.axes[axisIndex]!.label ||
            axis.unit !== document.source.axes[axisIndex]!.unit);
      })) throw new TypeError("Complex overlay components, axes or coordinate units changed.");
  const axes = real.axes.map((axis, index) => ({ name: axis.name, unit: axis.unit,
    origin: axis.origin, spacing: axis.spacing, count: real.shape[index]! }));
  const [first, second] = slice.planeAxes;
  const values = slice.coordinates[0].flatMap(firstValue => slice.coordinates[1].map(secondValue => {
    const point = [0, 0, 0] as [number, number, number];
    point[slice.normalAxis] = slice.fixedCoordinate;
    point[first] = firstValue; point[second] = secondValue;
    if (linkedFieldPointStatus(point, axes,
      document.source.axes.map(axis => axis.unit)) !== "inside") return null;
    const a = sampleLinkedFieldVolume(realVolume, axes, point);
    const b = sampleLinkedFieldVolume(imaginaryVolume, axes, point);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const magnitude = Math.hypot(a, b);
    return recipe.mode === "phase" ? magnitude > 1e-12 ? Math.atan2(b, a) : null : magnitude;
  }));
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) throw new RangeError("The selected slice has no complex values in its domain.");
  const components = [{ name: "real", sampleSha256: realVolume.sampleSha256 },
    { name: "imaginary", sampleSha256: imaginaryVolume.sampleSha256 }];
  return { values, min: recipe.mode === "phase" ? -Math.PI : Math.min(...finite),
    max: recipe.mode === "phase" ? Math.PI : Math.max(...finite),
    covered: finite.length, title: `${recipe.title} ${recipe.mode}`,
    unit: recipe.mode === "phase" ? "rad" : recipe.unit,
    source: `${real.sceneId} / ${real.datasetId}`,
    sampleSha256: sha256Checksum(new TextEncoder().encode(
      `${realVolume.sampleSha256}:${imaginaryVolume.sampleSha256}`)).slice(7),
    opacity: recipe.opacity, mode: recipe.mode === "phase" ?
      "complex-phase" : "complex-magnitude", verifiedComponents: components };
}

type CheckedVectorSource = Readonly<{ manifestJson: string; fingerprint: string;
  samples?: VectorField3DSparseSamples; volumes?: VectorField3DVolumes }>;

/** Keep the checked vector plane for glyphs and linked physical line profiles. */
export function sampleSliceOverlayVectorPlane(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, scientific?: CheckedVectorSource): VectorSliceOverlayPlane {
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
        Math.abs(field.references[0].axes[slice.normalAxis]!.origin +
          field.references[0].axes[slice.normalAxis]!.spacing * checked.selection.fixedIndex -
          slice.fixedCoordinate) > 1e-9)
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
  const components = [[], [], []] as [number[], number[], number[]];
  for (let i = 0; i < slice.shape[0]; i++) for (let j = 0; j < slice.shape[1]; j++) {
    const vector = vectorAt(i, j), offset = i * slice.shape[1] + j;
    for (let component = 0; component < 3; component++)
      components[component]![offset] = vector[component]!;
  }
  return { shape: slice.shape, sourceStructuralHash: document.identity.structuralHash,
    components, units: field.kind === "expressions" ?
      field.components.map(component => component.unit) as [string, string, string] :
      field.componentUnits };
}

export function sliceOverlayArrowsFromPlane(slice: VectorField3DSliceArtifact,
  plane: VectorSliceOverlayPlane): readonly SliceOverlayArrow[] {
  const [first, second] = slice.planeAxes;
  if (plane.shape[0] !== slice.shape[0] || plane.shape[1] !== slice.shape[1])
    throw new TypeError("Vector plane does not match the slice lattice.");
  const firstStep = Math.max(1, Math.ceil(slice.shape[0] / 12));
  const secondStep = Math.max(1, Math.ceil(slice.shape[1] / 12));
  const arrows: SliceOverlayArrow[] = [];
  for (let i = 0; i < slice.shape[0]; i += firstStep) for (let j = 0; j < slice.shape[1]; j += secondStep) {
    const offset = i * slice.shape[1] + j;
    const vector = plane.components.map(component => component[offset]!);
    if (!vector.every(Number.isFinite)) continue;
    if (Math.hypot(...vector) <= 1e-12) continue;
    arrows.push({ firstIndex: i, secondIndex: j,
      firstComponent: vector[first]!, secondComponent: vector[second]!,
      normalComponent: vector[slice.normalAxis]! });
  }
  return arrows;
}

/** Project vectors from the same checked physical plane as the displayed slice. */
export function sampleSliceOverlayArrows(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, scientific?: CheckedVectorSource): readonly SliceOverlayArrow[] {
  return sliceOverlayArrowsFromPlane(slice, sampleSliceOverlayVectorPlane(document, slice, scientific));
}

/** Sample both checked fields at one set of physical coordinates, with explicit gaps. */
export function sampleLinkedOverlayLineProfile(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, recipe: VectorField3DLinkedLineProfile,
  plane: VectorSliceOverlayPlane, scalarReference: Graph2DFieldReference,
  scalarVolume: Graph2DScientificVolume, scalarUnit: string,
  complex?: Readonly<{ imaginaryReference: Graph2DFieldReference;
    imaginaryVolume: Graph2DScientificVolume; mode: "magnitude" | "phase" }>): LinkedOverlayLineProfile {
  if (recipe.normalAxis !== slice.normalAxis ||
      Math.abs(recipe.point[slice.normalAxis] - slice.fixedCoordinate) > 1e-9)
    throw new RangeError("Linked line is on a different slice plane.");
  if (!slice.planeAxes.includes(recipe.varyingAxis) ||
      plane.sourceStructuralHash !== document.identity.structuralHash ||
      plane.shape[0] !== slice.shape[0] || plane.shape[1] !== slice.shape[1])
    throw new TypeError("Linked line vector plane does not match the current field.");
  if (scalarReference.semanticType !== (complex ? "complex-scalar-field" : "scalar-field") ||
      scalarReference.shape.length !== 3 ||
      scalarVolume.datasetId !== scalarReference.datasetId ||
      scalarVolume.component !== scalarReference.component ||
      scalarVolume.fingerprint !== scalarReference.sceneFingerprint ||
      scalarVolume.resourceSha256 !== scalarReference.resourceSha256)
    throw new TypeError("Linked line scalar source changed.");
  if (complex && (scalarReference.component !== "real" ||
      complex.imaginaryReference.semanticType !== "complex-scalar-field" ||
      complex.imaginaryReference.component !== "imaginary" ||
      complex.imaginaryReference.sceneFingerprint !== scalarReference.sceneFingerprint ||
      complex.imaginaryReference.datasetId !== scalarReference.datasetId ||
      complex.imaginaryReference.shape.length !== 3 ||
      complex.imaginaryReference.axes.length !== 3 ||
      complex.imaginaryReference.shape.some((size, index) => size !== scalarReference.shape[index]) ||
      complex.imaginaryReference.axes.some((axis, index) =>
        JSON.stringify(axis) !== JSON.stringify(scalarReference.axes[index])) ||
      complex.imaginaryVolume.datasetId !== complex.imaginaryReference.datasetId ||
      complex.imaginaryVolume.component !== complex.imaginaryReference.component ||
      complex.imaginaryVolume.fingerprint !== complex.imaginaryReference.sceneFingerprint ||
      complex.imaginaryVolume.resourceSha256 !== complex.imaginaryReference.resourceSha256))
    throw new TypeError("Linked line imaginary source changed.");
  if (scalarReference.axes.some((axis, index) =>
    axis.name !== document.source.axes[index]!.label ||
    axis.unit !== document.source.axes[index]!.unit))
    throw new TypeError("Linked line coordinate axes or units do not match.");
  const varying = slice.planeAxes.indexOf(recipe.varyingAxis);
  const fixed = 1 - varying;
  const fixedAxis = slice.planeAxes[fixed]!;
  const fixedCoordinates = slice.coordinates[fixed]!;
  const fixedValue = recipe.point[fixedAxis];
  const scalarAxes = scalarReference.axes.map((axis, index) => ({ name: axis.name,
    unit: axis.unit, origin: axis.origin, spacing: axis.spacing,
    count: scalarReference.shape[index]! }));
  const channelIndex = { p: 0, q: 1, r: 2 } as const;
  const componentIndex = recipe.vectorChannel === "speed" ? null : channelIndex[recipe.vectorChannel];
  if (componentIndex === null && plane.units.some(unit => unit !== plane.units[0]))
    throw new TypeError("Vector component units differ; speed cannot be combined.");
  const interpolate = (component: readonly number[], varyingIndex: number): number | null => {
    if (fixedValue < fixedCoordinates[0]! - 1e-9 ||
        fixedValue > fixedCoordinates.at(-1)! + 1e-9) return null;
    const upperRaw = fixedCoordinates.findIndex(value => value >= fixedValue - 1e-9);
    const upper = upperRaw < 0 ? fixedCoordinates.length - 1 : upperRaw;
    const lower = upper === 0 ? 0 : upper - 1;
    const fraction = upper === lower ? 0 : Math.max(0, Math.min(1,
      (fixedValue - fixedCoordinates[lower]!) /
      (fixedCoordinates[upper]! - fixedCoordinates[lower]!)));
    const at = (fixedIndex: number) => component[varying === 0 ?
      varyingIndex * slice.shape[1] + fixedIndex :
      fixedIndex * slice.shape[1] + varyingIndex];
    const a = at(lower), b = at(upper);
    return Number.isFinite(a) && Number.isFinite(b) ?
      a! * (1 - fraction) + b! * fraction : null;
  };
  const rows = slice.coordinates[varying].map((coordinate, index) => {
    const point = [...recipe.point] as [number, number, number];
    point[recipe.varyingAxis] = coordinate;
    const vectorComponents = plane.components.map(component => interpolate(component, index));
    const vector = componentIndex === null ? vectorComponents.every(value => value !== null) ?
      Math.hypot(...vectorComponents as number[]) : null : vectorComponents[componentIndex];
    const inside = linkedFieldPointStatus(point, scalarAxes,
      document.source.axes.map(axis => axis.unit)) === "inside";
    const real = inside ? sampleLinkedFieldVolume(scalarVolume, scalarAxes, point) : null;
    const imaginary = inside && complex ?
      sampleLinkedFieldVolume(complex.imaginaryVolume, scalarAxes, point) : null;
    const magnitude = real !== null && imaginary !== null ? Math.hypot(real, imaginary) : null;
    const scalar = complex ? magnitude === null ? null : complex.mode === "phase" ?
      magnitude > 1e-12 ? Math.atan2(imaginary!, real!) : null : magnitude : real;
    return { coordinate, vector: vector !== null && Number.isFinite(vector) ? vector : null,
      scalar: scalar !== null && Number.isFinite(scalar) ? scalar : null };
  });
  return { rows, coordinateUnit: document.source.axes[recipe.varyingAxis].unit,
    vectorUnit: componentIndex === null ? plane.units[0] : plane.units[componentIndex],
    scalarUnit, vectorChannel: recipe.vectorChannel,
    scalarSampleSha256: complex ? sha256Checksum(new TextEncoder().encode(
      `${scalarVolume.sampleSha256}:${complex.imaginaryVolume.sampleSha256}`)).slice(7) :
      scalarVolume.sampleSha256,
    vectorSourceHash: slice.sourceHash ?? document.identity.structuralHash };
}
