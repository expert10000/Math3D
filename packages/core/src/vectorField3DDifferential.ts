import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { scientificAxisCoordinate, scientificCoordinateIndex,
  scientificPointWithinBounds } from "./scientificDatasetCoordinates";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";
import { sampleVectorField3DSlice, type VectorField3DSliceArtifact } from "./vectorField3DSlices";

type Vec3 = readonly [number, number, number];
export type VectorField3DDifferentialStencil = Readonly<{
  axis: "x" | "y" | "z"; coordinateUnit: string;
  method: "centered-three-point" | "one-sided-three-point" | "two-point";
  coordinates: readonly number[]; boundary: boolean;
}>;
export type VectorField3DDifferentialArtifact = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  sourceHash: string | null; position: Vec3; quality: "approximate";
  status: "ready" | "unavailable"; method: "bounded-finite-difference";
  divergence: number | null; curl: Vec3 | null;
  divergenceUnit: string; curlUnit: string | null;
  stencils: readonly VectorField3DDifferentialStencil[];
  evaluations: number; diagnostics: readonly string[];
}>;

const firstDerivative = (coordinates: readonly number[], samples: readonly number[], at: number): number => {
  if (coordinates.length === 2)
    return (samples[1]! - samples[0]!) / (coordinates[1]! - coordinates[0]!);
  let derivative = 0;
  for (let i = 0; i < 3; i++) {
    let weight = 0;
    for (let j = 0; j < 3; j++) {
      if (j === i) continue;
      let term = 1 / (coordinates[i]! - coordinates[j]!);
      for (let k = 0; k < 3; k++) if (k !== i && k !== j)
        term *= (at - coordinates[k]!) / (coordinates[i]! - coordinates[k]!);
      weight += term;
    }
    derivative += weight * samples[i]!;
  }
  return derivative;
};

/** Local numerical divergence and curl; the caller must re-open a saved bundle for every request. */
type ScientificSource = Readonly<{ manifestJson: string; fingerprint: string;
  volumes: VectorField3DVolumes }>;
function analyzeAt(document: VectorField3DDocument, position: Vec3,
  scientific?: ScientificSource, verifiedVolumes?: VectorField3DVolumes):
  VectorField3DDifferentialArtifact {
  const normalized = normalizeVectorField3DDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const checked = normalized.value, source = checked.source, field = source.field;
  if (!scientificPointWithinBounds(position, source.axes))
    throw new RangeError("Analysis point is outside the field domain.");
  const identity = { documentId: checked.identity.id, revision: checked.identity.revision,
    structuralHash: checked.identity.structuralHash };
  const diagnostics: string[] = [], stencils: VectorField3DDifferentialStencil[] = [];
  const sourceHash = field.kind === "scientific-bundle" ?
    createScientificDatasetLink(field.references).sourceHash : null;
  let evaluations = 0;
  const unavailable = (message: string): VectorField3DDifferentialArtifact => ({
    source: identity, sourceHash, position: [...position] as [number, number, number],
    quality: "approximate", status: "unavailable", method: "bounded-finite-difference",
    divergence: null, curl: null, divergenceUnit: `1/${source.timeUnit}`, curlUnit: null,
    stencils, evaluations, diagnostics: [...diagnostics, message],
  });
  let lattice: readonly (readonly number[])[] | null = null;
  let sourceIndicesByAxis: readonly (readonly number[])[] | null = null;
  let volumeValues: VectorField3DVolumes | null = null;
  let selectedIndices: readonly number[] | null = null;
  if (field.kind === "scientific-bundle") {
    if (!scientific) throw new TypeError("Reverify all three scientific components before derived analysis.");
    volumeValues = verifiedVolumes ?? verifyVectorField3DVolumes(checked, scientific.manifestJson,
      scientific.fingerprint, scientific.volumes);
    const reference = field.references[0];
    sourceIndicesByAxis = source.axes.map((_, axis) => {
      const sourceSize = reference.shape[axis]!, sampleSize = volumeValues![0].sampleShape[axis]!;
      return Array.from({ length: sampleSize }, (_, sampleIndex) => sampleSize === 1 ? 0 :
        Math.round(sampleIndex * (sourceSize - 1) / (sampleSize - 1)));
    });
    lattice = sourceIndicesByAxis.map((indices, axis) => indices.map(sourceIndex =>
      scientificAxisCoordinate({ ...reference.axes[axis]!, count: reference.shape[axis]! }, sourceIndex)));
    selectedIndices = position.map((coordinate, axis) => {
      const sourceIndex = scientificCoordinateIndex({ ...reference.axes[axis]!,
        count: reference.shape[axis]! }, coordinate);
      return sourceIndicesByAxis![axis]!.indexOf(sourceIndex);
    });
    if (selectedIndices.some(index => index < 0))
      throw new RangeError("Choose an analysis point on the verified sample lattice.");
  }
  const sample = (point: Vec3, indices?: readonly number[]): Vec3 | null => {
    evaluations++;
    if (field.kind === "expressions") {
      const variables = { x: point[0], y: point[1], z: point[2] };
      const values = field.components.map(component =>
        evaluateGraph2DExpression(component.ast, variables, { maxEvaluations: 256 }));
      return values.every(value => value.ok) ? values.map(value => value.ok ? value.value : NaN) as
        [number, number, number] : null;
    }
    const volumes = volumeValues!;
    const offset = (indices![0]! * volumes[0].sampleShape[1] + indices![1]!) *
      volumes[0].sampleShape[2] + indices![2]!;
    const vector = volumes.map(volume => volume.values[offset]!) as [number, number, number];
    return vector.every(Number.isFinite) ? vector : null;
  };
  const jacobian = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const axis of [0, 1, 2] as const) {
    const bounds = source.axes[axis], at = position[axis];
    let coordinates: number[], indices: number[] | null = null;
    let method: VectorField3DDifferentialStencil["method"];
    if (lattice) {
      const values = lattice[axis]!, index = selectedIndices![axis]!;
      if (values.length < 2) return unavailable(`${bounds.label} has fewer than two verified samples.`);
      indices = values.length === 2 ? [0, 1] : index === 0 ? [0, 1, 2] :
        index === values.length - 1 ? [values.length - 3, values.length - 2, values.length - 1] :
          [index - 1, index, index + 1];
      coordinates = indices.map(item => values[item]!);
      method = values.length === 2 ? "two-point" : index === 0 || index === values.length - 1 ?
        "one-sided-three-point" : "centered-three-point";
    } else {
      const span = bounds.max - bounds.min, step = span / 1000;
      if (!Number.isFinite(step) || step <= 0) return unavailable(`${bounds.label} has no usable step.`);
      if (at - step >= bounds.min && at + step <= bounds.max) {
        coordinates = [at - step, at, at + step]; method = "centered-three-point";
      } else if (at + 2 * step <= bounds.max) {
        coordinates = [at, at + step, at + 2 * step]; method = "one-sided-three-point";
      } else {
        coordinates = [at - 2 * step, at - step, at]; method = "one-sided-three-point";
      }
    }
    const separation = Math.min(...coordinates.slice(1).map((value, index) =>
      value - coordinates[index]!));
    if (!(separation > Number.EPSILON * 8 * Math.max(1, ...coordinates.map(Math.abs))))
      return unavailable(`${bounds.label} stencil coordinates are indistinguishable at this precision.`);
    const boundary = method !== "centered-three-point";
    stencils.push({ axis: bounds.role, coordinateUnit: bounds.unit, method, coordinates, boundary });
    if (boundary) diagnostics.push(`${bounds.label}: ${method} near the domain boundary; accuracy is reduced.`);
    const vectors: Vec3[] = [];
    for (let item = 0; item < coordinates.length; item++) {
      const neighbor = [...position] as [number, number, number]; neighbor[axis] = coordinates[item]!;
      const sampleIndices = indices && selectedIndices ? [...selectedIndices] : undefined;
      if (sampleIndices && indices) sampleIndices[axis] = indices[item]!;
      const vector = sample(neighbor, sampleIndices);
      if (!vector) return unavailable(`${bounds.label} derivative is undefined on its ${method} stencil.`);
      vectors.push(vector);
    }
    for (const component of [0, 1, 2] as const) {
      const derivative = firstDerivative(coordinates, vectors.map(vector => vector[component]), at);
      if (!Number.isFinite(derivative))
        return unavailable(`${bounds.label} derivative is non-finite at this precision.`);
      jacobian[component]![axis] = derivative;
    }
  }
  const divergence = jacobian[0]![0]! + jacobian[1]![1]! + jacobian[2]![2]!;
  const uniformUnits = new Set(source.axes.map(axis => axis.unit)).size === 1;
  const curl = uniformUnits ? [jacobian[2]![1]! - jacobian[1]![2]!,
    jacobian[0]![2]! - jacobian[2]![0]!, jacobian[1]![0]! - jacobian[0]![1]!] as
    [number, number, number] : null;
  if (!uniformUnits) diagnostics.push("Curl requires matching physical coordinate units on x, y and z.");
  diagnostics.push("Local finite differences are approximate; they do not certify smoothness or global behavior.");
  return { source: identity, sourceHash, position: [...position] as [number, number, number],
    quality: "approximate", status: "ready", method: "bounded-finite-difference",
    divergence, curl, divergenceUnit: `1/${source.timeUnit}`,
    curlUnit: uniformUnits ? `1/${source.timeUnit}` : null,
    stencils, evaluations, diagnostics };
}

export function analyzeVectorField3DDifferential(document: VectorField3DDocument, position: Vec3,
  scientific?: ScientificSource): VectorField3DDifferentialArtifact {
  return analyzeAt(document, position, scientific);
}

export type VectorField3DDerivedChannel = "divergence" | "curl-magnitude";
/** A bounded derived map; one complete bundle verification precedes all cell calculations. */
export function sampleVectorField3DDerivedSlice(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2, fixedCoordinate: number, channel: VectorField3DDerivedChannel,
  scientific?: ScientificSource): VectorField3DSliceArtifact {
  if (channel !== "divergence" && channel !== "curl-magnitude")
    throw new TypeError("Unsupported derived field channel.");
  if (channel === "curl-magnitude" && new Set(document.source.axes.map(axis => axis.unit)).size !== 1)
    throw new TypeError("Curl requires matching physical coordinate units on x, y and z.");
  const base = sampleVectorField3DSlice(document, normalAxis, fixedCoordinate, scientific);
  const verified = scientific ? verifyVectorField3DVolumes(document, scientific.manifestJson,
    scientific.fingerprint, scientific.volumes) : undefined;
  const values: (number | null)[] = [];
  let boundarySamples = 0;
  for (let i = 0; i < base.shape[0]; i++) for (let j = 0; j < base.shape[1]; j++) {
    const position = [0, 0, 0] as [number, number, number];
    position[normalAxis] = fixedCoordinate;
    position[base.planeAxes[0]] = base.coordinates[0][i]!;
    position[base.planeAxes[1]] = base.coordinates[1][j]!;
    const result = analyzeAt(document, position, scientific, verified);
    if (result.stencils.some(stencil => stencil.boundary)) boundarySamples++;
    const value = result.status !== "ready" ? null : channel === "divergence" ?
      result.divergence : result.curl ? Math.hypot(...result.curl) : null;
    values.push(value !== null && Number.isFinite(value) ? value : null);
  }
  const finite = values.filter((value): value is number => value !== null);
  return { ...base, channel, unit: `1/${document.source.timeUnit}`, values,
    min: finite.length ? Math.min(...finite) : NaN,
    max: finite.length ? Math.max(...finite) : NaN,
    evaluated: values.length, rejected: values.length - finite.length,
    method: "bounded-finite-difference", boundarySamples };
}
