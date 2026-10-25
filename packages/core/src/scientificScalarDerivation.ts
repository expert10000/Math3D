import { sha256Checksum } from "./documentIdentity";
import { inspectGraph2DFieldReference } from "./graph2dFieldReference";
import { verifyGraph2DScientificPlane, verifyGraph2DScientificVolume,
  type Graph2DScientificPlane, type Graph2DScientificVolume } from "./graph2dScientificDataset";
import { normalizeScientificFieldDocument, type ScientificFieldDocument,
  type ScientificScalarDerivation } from "./scientificFieldDocument";

type Operation = ScientificScalarDerivation["operation"];
export type ScientificScalarCalculation = Readonly<{
  values: readonly number[]; boundarySamples: number; evaluated: number;
  method: "bounded-quadratic-stencil";
}>;
export type ScientificScalarDerivedPlane = Readonly<{
  plane: Graph2DScientificPlane; sourceChecksum: string; resultChecksum: string;
  label: string; unit: string; boundarySamples: number; method: "bounded-quadratic-stencil";
}>;
export type ScientificScalarDerivedVolume = Readonly<{
  volume: Graph2DScientificVolume; sourceChecksum: string; resultChecksum: string;
  label: string; unit: string; boundarySamples: number; method: "bounded-quadratic-stencil";
}>;

const firstDerivative = (coordinates: readonly number[], values: readonly number[], at: number) => {
  if (coordinates.length === 2) return (values[1] - values[0]) / (coordinates[1] - coordinates[0]);
  let result = 0;
  for (let i = 0; i < 3; i++) {
    let weight = 0;
    for (let j = 0; j < 3; j++) {
      if (j === i) continue;
      let term = 1 / (coordinates[i] - coordinates[j]);
      for (let k = 0; k < 3; k++) if (k !== i && k !== j)
        term *= (at - coordinates[k]) / (coordinates[i] - coordinates[k]);
      weight += term;
    }
    result += weight * values[i];
  }
  return result;
};
const secondDerivative = (coordinates: readonly number[], values: readonly number[]) =>
  2 * coordinates.reduce((sum, coordinate, i) => {
    const other = coordinates.filter((_, j) => j !== i);
    return sum + values[i] / ((coordinate - other[0]) * (coordinate - other[1]));
  }, 0);

/** Operates only on already bounded regular-grid samples; coordinates are physical, not array indices. */
export function calculateScientificScalarDerivative(values: readonly number[],
  coordinates: readonly (readonly number[])[], operation: Operation): ScientificScalarCalculation {
  const rank = coordinates.length, shape = coordinates.map(axis => axis.length);
  const count = shape.reduce((total, size) => total * size, 1);
  if ((rank !== 2 && rank !== 3) || count !== values.length ||
      count > (rank === 2 ? 256 ** 2 : 32 ** 3) ||
      shape.some(size => size < (operation === "laplacian" ? 3 : 2)) ||
      operation === "gradient-z" && rank !== 3 ||
      coordinates.some(axis => axis.some((value, index) => !Number.isFinite(value) ||
        index > 0 && !(value > axis[index - 1]))) ||
      values.some(value => !Number.isFinite(value)))
    throw new TypeError("Derived scalar field needs finite values on a bounded, increasing 2D or 3D lattice.");
  const strides = shape.map((_, axis) => shape.slice(axis + 1).reduce((product, size) => product * size, 1));
  const output = new Array<number>(count);
  let boundarySamples = 0;
  for (let offset = 0; offset < count; offset++) {
    const indices = shape.map((size, axis) => Math.floor(offset / strides[axis]) % size);
    if (indices.some((index, axis) => index === 0 || index === shape[axis] - 1)) boundarySamples++;
    const derivative = (axis: number, second: boolean) => {
      const index = indices[axis], size = shape[axis];
      const first = size === 2 ? 0 : Math.min(Math.max(0, index - 1), size - 3);
      const sampleIndices = size === 2 ? [0, 1] : [first, first + 1, first + 2];
      const positions = sampleIndices.map(i => coordinates[axis][i]);
      const samples = sampleIndices.map(i => values[offset + (i - index) * strides[axis]]);
      return second ? secondDerivative(positions, samples) :
        firstDerivative(positions, samples, coordinates[axis][index]);
    };
    const value = operation === "laplacian" ?
      coordinates.reduce((sum, _, axis) => sum + derivative(axis, true), 0) :
      operation === "gradient-magnitude" ?
        Math.hypot(...coordinates.map((_, axis) => derivative(axis, false))) :
        derivative({ "gradient-x": 0, "gradient-y": 1, "gradient-z": 2 }[operation], false);
    if (!Number.isFinite(value)) throw new TypeError("Derived scalar result is non-finite at this precision.");
    output[offset] = value;
  }
  return { values: output, boundarySamples, evaluated: count, method: "bounded-quadratic-stencil" };
}

const checksum = (values: readonly number[]) => {
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return sha256Checksum(bytes).slice(7);
};
const checkedDocument = (document: ScientificFieldDocument, manifestJson: string) => {
  const normalized = normalizeScientificFieldDocument(document);
  if (!normalized.ok || !normalized.value.source.derivation)
    throw new TypeError("A valid derived scalar-field document is required.");
  const checked = normalized.value;
  if (inspectGraph2DFieldReference(checked.source.reference, manifestJson) !== "current")
    throw new TypeError("Saved scalar source component, axes, shape or checksum changed.");
  return checked;
};
export function scientificScalarDerivationLabel(document: ScientificFieldDocument): string {
  const operation = document.source.derivation?.operation;
  const quantity = document.source.quantity.name;
  return operation === "laplacian" ? `Laplacian ${quantity}` :
    operation === "gradient-magnitude" ? `Gradient magnitude ${quantity}` :
      operation ? `Gradient ${document.source.reference.axes[
        { "gradient-x": 0, "gradient-y": 1, "gradient-z": 2 }[operation]].name} of ${quantity}` : quantity;
}
export function scientificScalarDerivationUnit(document: ScientificFieldDocument): string {
  const operation = document.source.derivation?.operation;
  const unit = document.source.quantity.unit;
  if (!operation) return unit;
  const axis = operation === "gradient-magnitude" || operation === "laplacian" ? 0 :
    { "gradient-x": 0, "gradient-y": 1, "gradient-z": 2 }[operation];
  const axisUnit = document.source.reference.axes[axis].unit;
  if (unit === "1" && axisUnit === "1") return "1";
  return operation === "laplacian" ? `(${unit})/${axisUnit}²` : `(${unit})/${axisUnit}`;
}

/** Recheck manifest, resource and plane bytes before deriving a 2D result. */
export function deriveVerifiedScientificScalarPlane(document: ScientificFieldDocument,
  manifestJson: string, fingerprint: string, plane: Graph2DScientificPlane): ScientificScalarDerivedPlane {
  const checked = checkedDocument(document, manifestJson);
  const reference = checked.source.reference;
  if (reference.shape.length !== 2 || plane.component !== reference.component ||
      plane.datasetId !== reference.datasetId || plane.resourceSha256 !== reference.resourceSha256)
    throw new TypeError("Derived plane does not match the saved scalar source.");
  const verified = verifyGraph2DScientificPlane(manifestJson, fingerprint, plane);
  const coordinates = verified.planeAxes.map(axis => Array.from({ length: reference.shape[axis] }, (_, i) =>
    reference.axes[axis].origin + i * reference.axes[axis].spacing));
  const result = calculateScientificScalarDerivative(verified.values, coordinates,
    checked.source.derivation!.operation);
  const resultChecksum = checksum(result.values);
  return { plane: { ...verified, values: result.values, planeSha256: resultChecksum },
    sourceChecksum: verified.planeSha256, resultChecksum,
    label: scientificScalarDerivationLabel(checked), unit: scientificScalarDerivationUnit(checked),
    boundarySamples: result.boundarySamples, method: result.method };
}

/** Recheck the complete 3D bounded transfer before deriving an overview on its physical sample lattice. */
export function deriveVerifiedScientificScalarVolume(document: ScientificFieldDocument,
  manifestJson: string, fingerprint: string, volume: Graph2DScientificVolume): ScientificScalarDerivedVolume {
  const checked = checkedDocument(document, manifestJson);
  const reference = checked.source.reference;
  if (reference.shape.length !== 3 || volume.component !== reference.component ||
      volume.datasetId !== reference.datasetId || volume.resourceSha256 !== reference.resourceSha256)
    throw new TypeError("Derived volume does not match the saved scalar source.");
  const verified = verifyGraph2DScientificVolume(manifestJson, fingerprint, volume);
  const coordinates = verified.sampleShape.map((size, axis) => Array.from({ length: size }, (_, i) =>
    reference.axes[axis].origin + reference.axes[axis].spacing *
      (size === 1 ? 0 : Math.round(i * (reference.shape[axis] - 1) / (size - 1)))));
  const result = calculateScientificScalarDerivative(verified.values, coordinates,
    checked.source.derivation!.operation);
  const resultChecksum = checksum(result.values);
  return { volume: { ...verified, values: result.values, sampleSha256: resultChecksum },
    sourceChecksum: verified.sampleSha256, resultChecksum,
    label: scientificScalarDerivationLabel(checked), unit: scientificScalarDerivationUnit(checked),
    boundarySamples: result.boundarySamples, method: result.method };
}
