import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { scientificAxisCoordinate, scientificCoordinateIndex,
  scientificPointWithinBounds } from "./scientificDatasetCoordinates";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";
import { sampleVectorField3DSlice, vectorField3DVolumeProvenance,
  type VectorField3DSliceArtifact } from "./vectorField3DSlices";
import { sampleVectorField3DSparseSlice, verifyVectorField3DSparseSamples,
  vectorField3DSourceStencilPoints, type VectorField3DSparseSamples } from "./vectorField3DSparse";

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
  jacobian: readonly Vec3[] | null; jacobianUnits: readonly (readonly string[])[];
  localStructure: "rotation-dominated" | "strain-dominated" | "balanced" | null;
  magnitudeGradient: Vec3 | null; magnitudeLaplacian: number | null;
  magnitudeGradientUnit: string | null; magnitudeLaplacianUnit: string | null;
  verifiedSamples?: VectorField3DSliceArtifact["verifiedSamples"];
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
const secondDerivative = (coordinates: readonly number[], samples: readonly number[]): number | null => {
  if (coordinates.length !== 3) return null;
  return 2 * coordinates.reduce((sum, x, i) => {
    const other = coordinates.filter((_, j) => j !== i);
    return sum + samples[i]! / ((x - other[0]!) * (x - other[1]!));
  }, 0);
};

/** Local numerical divergence and curl; the caller must re-open a saved bundle for every request. */
type ScientificSource = Readonly<{ manifestJson: string; fingerprint: string;
  volumes: VectorField3DVolumes }>;
type SparseScientificSource = Readonly<{ manifestJson: string; fingerprint: string;
  samples: VectorField3DSparseSamples }>;
function analyzeAt(document: VectorField3DDocument, position: Vec3,
  scientific?: ScientificSource | SparseScientificSource, verifiedVolumes?: VectorField3DVolumes,
  sparseLookup?: ReadonlyMap<string, Vec3>):
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
  let verifiedSamples: VectorField3DSliceArtifact["verifiedSamples"];
  const unavailable = (message: string): VectorField3DDifferentialArtifact => ({
    source: identity, sourceHash, position: [...position] as [number, number, number],
    quality: "approximate", status: "unavailable", method: "bounded-finite-difference",
    divergence: null, curl: null, divergenceUnit: `1/${source.timeUnit}`, curlUnit: null,
    jacobian: null, jacobianUnits: [], localStructure: null,
    magnitudeGradient: null, magnitudeLaplacian: null,
    magnitudeGradientUnit: null, magnitudeLaplacianUnit: null,
    stencils, evaluations, diagnostics: [...diagnostics, message], verifiedSamples,
  });
  let lattice: readonly (readonly number[])[] | null = null;
  let sourceIndicesByAxis: readonly (readonly number[])[] | null = null;
  let volumeValues: VectorField3DVolumes | null = null;
  let selectedIndices: readonly number[] | null = null;
  if (field.kind === "scientific-bundle") {
    if (!scientific) throw new TypeError("Reverify all three scientific components before derived analysis.");
    volumeValues = verifiedVolumes ?? ("volumes" in scientific ? verifyVectorField3DVolumes(checked,
      scientific.manifestJson, scientific.fingerprint, scientific.volumes) : null);
    if (volumeValues && !verifiedVolumes)
      verifiedSamples = vectorField3DVolumeProvenance(scientific.manifestJson, volumeValues);
    const reference = field.references[0];
    const sourceGrid = "samples" in scientific &&
      scientific.samples.selection.kind === "source-stencil-slice";
    sourceIndicesByAxis = source.axes.map((_, axis) => {
      const sourceSize = reference.shape[axis]!, sampleSize = volumeValues?.[0].sampleShape[axis] ??
        (sourceGrid ? sourceSize : Math.min(sourceSize, 32));
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
    if (sparseLookup) return sparseLookup.get(indices!.join(",")) ?? null;
    const volumes = volumeValues!;
    const offset = (indices![0]! * volumes[0].sampleShape[1] + indices![1]!) *
      volumes[0].sampleShape[2] + indices![2]!;
    const vector = volumes.map(volume => volume.values[offset]!) as [number, number, number];
    return vector.every(Number.isFinite) ? vector : null;
  };
  const jacobian = Array.from({ length: 3 }, () => [0, 0, 0]);
  const scalarGradient = [0, 0, 0], scalarSecond = [0, 0, 0];
  let scalarSecondAvailable = true, centerMagnitude: number | null = null;
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
      if (Math.abs(coordinates[item]! - at) < 1e-10) centerMagnitude = Math.hypot(...vector);
      vectors.push(vector);
    }
    const magnitudes = vectors.map(vector => Math.hypot(...vector));
    scalarGradient[axis] = firstDerivative(coordinates, magnitudes, at);
    const second = secondDerivative(coordinates, magnitudes);
    if (second === null || !Number.isFinite(second)) scalarSecondAvailable = false;
    else scalarSecond[axis] = second;
    for (const component of [0, 1, 2] as const) {
      const derivative = firstDerivative(coordinates, vectors.map(vector => vector[component]), at);
      if (!Number.isFinite(derivative))
        return unavailable(`${bounds.label} derivative is non-finite at this precision.`);
      jacobian[component]![axis] = derivative;
    }
  }
  const divergence = jacobian[0]![0]! + jacobian[1]![1]! + jacobian[2]![2]!;
  const uniformUnits = new Set(source.axes.map(axis => axis.unit)).size === 1;
  const componentUnits = field.kind === "scientific-bundle" ? field.componentUnits :
    field.components.map(component => component.unit);
  const uniformComponents = new Set(componentUnits).size === 1;
  const scalarUnitsAvailable = uniformUnits && uniformComponents;
  const scalarSmoothCandidate = centerMagnitude !== null &&
    centerMagnitude > source.solver.absoluteTolerance;
  const magnitudeGradient = scalarUnitsAvailable && scalarSmoothCandidate &&
    scalarGradient.every(Number.isFinite) ? scalarGradient as unknown as Vec3 : null;
  const magnitudeLaplacian = magnitudeGradient && scalarSecondAvailable ?
    scalarSecond.reduce((sum, value) => sum + value, 0) : null;
  const jacobianUnits = componentUnits.map(unit => source.axes.map(axis =>
    `(${unit})/${axis.unit}`));
  let localStructure: VectorField3DDifferentialArtifact["localStructure"] = null;
  if (scalarUnitsAvailable) {
    let rotationNorm2 = 0, strainNorm2 = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const symmetric = (jacobian[i]![j]! + jacobian[j]![i]!) / 2;
      const skew = (jacobian[i]![j]! - jacobian[j]![i]!) / 2;
      strainNorm2 += symmetric * symmetric; rotationNorm2 += skew * skew;
    }
    localStructure = rotationNorm2 > 1.1 * strainNorm2 ? "rotation-dominated" :
      strainNorm2 > 1.1 * rotationNorm2 ? "strain-dominated" : "balanced";
  }
  const curl = uniformUnits ? [jacobian[2]![1]! - jacobian[1]![2]!,
    jacobian[0]![2]! - jacobian[2]![0]!, jacobian[1]![0]! - jacobian[0]![1]!] as
    [number, number, number] : null;
  if (!uniformUnits) diagnostics.push("Curl requires matching physical coordinate units on x, y and z.");
  if (!scalarUnitsAvailable) diagnostics.push("Scalar magnitude calculus and Jacobian norm classification require matching coordinate and component units.");
  if (scalarUnitsAvailable && !scalarSmoothCandidate)
    diagnostics.push("|F| is zero or near zero; its differentiability is not assumed at this point.");
  if (scalarUnitsAvailable && !scalarSecondAvailable)
    diagnostics.push("Laplacian |F| requires at least three samples on each axis.");
  diagnostics.push("Jacobian norm classification compares local rotation and strain; it is not an equilibrium or stability proof.");
  diagnostics.push("Local finite differences are approximate; they do not certify smoothness or global behavior.");
  return { source: identity, sourceHash, position: [...position] as [number, number, number],
    quality: "approximate", status: "ready", method: "bounded-finite-difference",
    divergence, curl, divergenceUnit: `1/${source.timeUnit}`,
    curlUnit: uniformUnits ? `1/${source.timeUnit}` : null,
    jacobian: jacobian.map(row => row as unknown as Vec3), jacobianUnits, localStructure,
    magnitudeGradient, magnitudeLaplacian,
    magnitudeGradientUnit: scalarUnitsAvailable ? `(${componentUnits[0]})/${source.axes[0].unit}` : null,
    magnitudeLaplacianUnit: scalarUnitsAvailable ? `(${componentUnits[0]})/${source.axes[0].unit}²` : null,
    stencils, evaluations, diagnostics, verifiedSamples };
}

export function analyzeVectorField3DDifferential(document: VectorField3DDocument, position: Vec3,
  scientific?: ScientificSource): VectorField3DDifferentialArtifact {
  return analyzeAt(document, position, scientific);
}

export type VectorField3DDerivedChannel = "divergence" | "curl-magnitude" |
  "curl-x" | "curl-y" | "curl-z" | "grad-speed-x" | "grad-speed-y" |
  "grad-speed-z" | "grad-speed-magnitude" | "laplacian-speed";
/** A bounded derived map; one complete bundle verification precedes all cell calculations. */
export function sampleVectorField3DDerivedSlice(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2, fixedCoordinate: number, channel: VectorField3DDerivedChannel,
  scientific?: ScientificSource | SparseScientificSource): VectorField3DSliceArtifact {
  if (!["divergence", "curl-magnitude", "curl-x", "curl-y", "curl-z",
      "grad-speed-x", "grad-speed-y", "grad-speed-z", "grad-speed-magnitude",
      "laplacian-speed"].includes(channel))
    throw new TypeError("Unsupported derived field channel.");
  if (channel !== "divergence" && new Set(document.source.axes.map(axis => axis.unit)).size !== 1)
    throw new TypeError("Curl and scalar magnitude calculus require matching physical coordinate units on x, y and z.");
  const sparse = scientific && "samples" in scientific ? scientific : undefined;
  const full = scientific && "volumes" in scientific ? scientific : undefined;
  const base = sparse ? sampleVectorField3DSparseSlice(document, normalAxis, fixedCoordinate, sparse) :
    sampleVectorField3DSlice(document, normalAxis, fixedCoordinate, full);
  const verified = full ? verifyVectorField3DVolumes(document, full.manifestJson,
    full.fingerprint, full.volumes) : undefined;
  const sparseLookup = new Map<string, Vec3>();
  if (sparse) {
    const samples = verifyVectorField3DSparseSamples(document, sparse.manifestJson,
      sparse.fingerprint, sparse.samples);
    if ((samples.selection.kind !== "stencil-slice" &&
        samples.selection.kind !== "source-stencil-slice") ||
        samples.selection.normalAxis !== normalAxis)
      throw new TypeError("Derived slice requires a verified neighboring-plane stencil.");
    if (samples.selection.kind === "source-stencil-slice") {
      vectorField3DSourceStencilPoints(samples.sourceShape, normalAxis,
        samples.selection.fixedIndex).forEach((point, index) =>
        sparseLookup.set(point.join(","), samples.components.map(component =>
          component.values[index]!) as [number, number, number]));
    } else {
    const shape = samples.sourceShape, lattice = shape.map(size => Array.from({ length: Math.min(size, 32) },
      (_, index) => size === 1 ? 0 : Math.round(index * (size - 1) / (Math.min(size, 32) - 1))));
    const index = lattice[normalAxis]!.indexOf(samples.selection.fixedIndex);
    const layers = lattice[normalAxis]!.length === 1 ? [0] : lattice[normalAxis]!.length === 2 ? [0, 1] :
      index === 0 ? [0, 1, 2] : index === lattice[normalAxis]!.length - 1 ?
        [index - 2, index - 1, index] : [index - 1, index, index + 1];
    const plane = [0, 1, 2].filter(axis => axis !== normalAxis);
    let offset = 0;
    for (const layer of layers) for (let a = 0; a < lattice[plane[0]!]!.length; a++)
      for (let b = 0; b < lattice[plane[1]!]!.length; b++) {
        const point = [0, 0, 0]; point[normalAxis] = layer;
        point[plane[0]!] = a; point[plane[1]!] = b;
        sparseLookup.set(point.join(","), samples.components.map(component =>
          component.values[offset]!) as [number, number, number]);
        offset++;
      }
    }
  }
  const values: (number | null)[] = [];
  let boundarySamples = 0;
  for (let i = 0; i < base.shape[0]; i++) for (let j = 0; j < base.shape[1]; j++) {
    const position = [0, 0, 0] as [number, number, number];
    position[normalAxis] = fixedCoordinate;
    position[base.planeAxes[0]] = base.coordinates[0][i]!;
    position[base.planeAxes[1]] = base.coordinates[1][j]!;
    const result = analyzeAt(document, position, scientific, verified,
      sparse ? sparseLookup : undefined);
    if (result.stencils.some(stencil => stencil.boundary)) boundarySamples++;
    const curlComponent = { "curl-x": 0, "curl-y": 1, "curl-z": 2 } as const;
    const gradientComponent = { "grad-speed-x": 0, "grad-speed-y": 1,
      "grad-speed-z": 2 } as const;
    let value: number | null = null;
    if (result.status === "ready") {
      if (channel === "divergence") value = result.divergence;
      else if (channel === "laplacian-speed") value = result.magnitudeLaplacian;
      else if (channel === "grad-speed-magnitude") value = result.magnitudeGradient ?
        Math.hypot(...result.magnitudeGradient) : null;
      else if (channel in gradientComponent) value = result.magnitudeGradient ?
        result.magnitudeGradient[gradientComponent[channel as keyof typeof gradientComponent]] : null;
      else if (result.curl) value = channel === "curl-magnitude" ?
        Math.hypot(...result.curl) :
        channel === "curl-x" || channel === "curl-y" || channel === "curl-z" ?
          result.curl[curlComponent[channel]] : null;
    }
    values.push(value !== null && Number.isFinite(value) ? value : null);
  }
  const finite = values.filter((value): value is number => value !== null);
  const componentUnit = document.source.field.kind === "scientific-bundle" ?
    document.source.field.componentUnits[0] : document.source.field.components[0].unit;
  const unit = channel === "laplacian-speed" ?
    `(${componentUnit})/${document.source.axes[0].unit}²` : channel.startsWith("grad-speed") ?
      `(${componentUnit})/${document.source.axes[0].unit}` : `1/${document.source.timeUnit}`;
  return { ...base, channel, unit, values,
    ...(sparse?.samples.selection.kind === "source-stencil-slice" ? { stencilGrid: "source" as const } : {}),
    min: finite.length ? Math.min(...finite) : NaN,
    max: finite.length ? Math.max(...finite) : NaN,
    evaluated: values.length, rejected: values.length - finite.length,
    method: "bounded-finite-difference", boundarySamples };
}
