import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { scientificAxisCoordinate, scientificCoordinateIndex,
  scientificPointWithinBounds } from "./scientificDatasetCoordinates";
import { createScientificDatasetLink, createScientificDerivedView } from "./scientificDatasetLink";
import { parseScientificSceneManifest } from "./scientificSceneManifest";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import { verifyVectorField3DVolumes, type VectorField3DVolumes } from "./vectorField3DScientific";

export type VectorField3DSliceArtifact = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  normalAxis: 0 | 1 | 2; fixedCoordinate: number; fixedUnit: string;
  planeAxes: readonly [number, number]; coordinates: readonly [readonly number[], readonly number[]];
  shape: readonly [number, number]; values: readonly (number | null)[];
  channel: "magnitude" | "p" | "q" | "r" | "divergence" | "curl-magnitude" |
    "curl-x" | "curl-y" | "curl-z" | "grad-speed-x" | "grad-speed-y" |
    "grad-speed-z" | "grad-speed-magnitude" | "laplacian-speed";
  unit: string; min: number; max: number;
  stencilGrid?: "source";
  method?: "bounded-finite-difference"; boundarySamples?: number;
  evaluated: number; rejected: number; sourceHash?: string;
  verifiedSamples?: readonly Readonly<{ name: string; sampleSha256: string;
    verifiedChunks?: number; totalChunks?: number; verifiedTiles?: number; totalTiles?: number }>[];
}>;
export type VectorField3DProbeArtifact = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  position: readonly [number, number, number]; vector: readonly [number, number, number];
  magnitude: number; coordinateUnits: readonly [string, string, string];
  componentUnits: readonly [string, string, string]; sourceHash?: string; viewHash?: string;
  verifiedSamples?: readonly Readonly<{ name: string; sampleSha256: string;
    verifiedChunks?: number; totalChunks?: number; verifiedTiles?: number; totalTiles?: number }>[];
}>;

const checkedDocument = (document: VectorField3DDocument) => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};
const sourceSamples = (count: number) => {
  const size = Math.min(count, 32);
  return Array.from({ length: size }, (_, index) =>
    size === 1 ? 0 : Math.round(index * (count - 1) / (size - 1)));
};

export const vectorField3DVolumeProvenance = (manifestJson: string, volumes: VectorField3DVolumes):
  NonNullable<VectorField3DSliceArtifact["verifiedSamples"]> => {
  const parsed = parseScientificSceneManifest(manifestJson);
  if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
  const dataset = parsed.value.datasets.find(item => item.id === volumes[0].datasetId);
  return volumes.map(volume => {
    const resourceId = dataset?.components?.find(item => item.name === volume.component)?.resource;
    const resource = parsed.value.resources.find(item => item.id === resourceId);
    return { name: volume.component, sampleSha256: volume.sampleSha256,
      ...(volume.verifiedChunks ? { verifiedChunks: volume.verifiedChunks.length,
        totalChunks: resource?.chunkSha256?.length ?? 0 } : {}),
      ...(volume.verifiedTiles ? { verifiedTiles: volume.verifiedTiles.length,
        totalTiles: resource?.tileSha256?.length ?? 0 } : {}) };
  });
};

/** Only coordinates represented by the bounded transfer lattice are offered for verified bundles. */
export function vectorField3DSliceCoordinates(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2): readonly number[] {
  const checked = checkedDocument(document), axis = checked.source.axes[normalAxis];
  if (checked.source.field.kind === "expressions")
    return Array.from({ length: 25 }, (_, index) => axis.min + (axis.max - axis.min) * index / 24);
  const field = checked.source.field, gridAxis = field.references[0].axes[normalAxis]!;
  return sourceSamples(field.references[0].shape[normalAxis]!).map(index =>
    scientificAxisCoordinate({ ...gridAxis, count: field.references[0].shape[normalAxis]! }, index));
}

/** Uses at most 32×32 checked values. Every scientific preview starts with a fresh verified bundle transfer. */
export function sampleVectorField3DSlice(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2, fixedCoordinate: number,
  scientific?: Readonly<{ manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes }>):
  VectorField3DSliceArtifact {
  const checked = checkedDocument(document), field = checked.source.field;
  if (!Number.isSafeInteger(normalAxis) || normalAxis < 0 || normalAxis > 2 ||
      !Number.isFinite(fixedCoordinate) || fixedCoordinate < checked.source.axes[normalAxis].min ||
      fixedCoordinate > checked.source.axes[normalAxis].max)
    throw new RangeError("Slice coordinate is outside the field domain.");
  const planeAxes = [0, 1, 2].filter(axis => axis !== normalAxis) as [number, number];
  let coordinates: [number[], number[]], shape: [number, number], at: (i: number, j: number) =>
    [number, number, number] | null, sourceHash: string | undefined;
  let verifiedSamples: VectorField3DSliceArtifact["verifiedSamples"];
  if (field.kind === "scientific-bundle") {
    if (!scientific) throw new TypeError("Reverify all three scientific components before previewing a slice.");
    const volumes = verifyVectorField3DVolumes(checked, scientific.manifestJson,
      scientific.fingerprint, scientific.volumes);
    verifiedSamples = vectorField3DVolumeProvenance(scientific.manifestJson, volumes);
    const reference = field.references[0], gridAxis = reference.axes[normalAxis]!;
    const fixedIndex = scientificCoordinateIndex({ ...gridAxis, count: reference.shape[normalAxis]! },
      fixedCoordinate);
    const fixedSample = sourceSamples(reference.shape[normalAxis]!).indexOf(fixedIndex);
    if (fixedSample < 0) throw new RangeError("Choose a displayed physical coordinate from the bounded sample lattice.");
    const link = createScientificDatasetLink(field.references);
    createScientificDerivedView(link, { kind: "slice", normalAxis, fixedIndex,
      channel: checked.source.display.colorBy === "speed" ? "magnitude" :
        field.references[{ p: 0, q: 1, r: 2 }[checked.source.display.colorBy]!].component,
      maxSamples: 1024 });
    sourceHash = link.sourceHash;
    coordinates = planeAxes.map(axis => sourceSamples(reference.shape[axis]!).map(index =>
      scientificAxisCoordinate({ ...reference.axes[axis]!, count: reference.shape[axis]! }, index))) as
      [number[], number[]];
    shape = [coordinates[0].length, coordinates[1].length];
    at = (i, j) => {
      const indices = [0, 0, 0]; indices[normalAxis] = fixedSample;
      indices[planeAxes[0]] = i; indices[planeAxes[1]] = j;
      const offset = (indices[0]! * volumes[0].sampleShape[1] + indices[1]!) *
        volumes[0].sampleShape[2] + indices[2]!;
      const vector = volumes.map(volume => volume.values[offset]!) as [number, number, number];
      return vector.every(Number.isFinite) ? vector : null;
    };
  } else {
    coordinates = planeAxes.map(axis => Array.from({ length: 25 }, (_, index) => {
      const bounds = checked.source.axes[axis]!;
      return bounds.min + (bounds.max - bounds.min) * index / 24;
    })) as [number[], number[]];
    shape = [25, 25];
    at = (i, j) => {
      const point = [0, 0, 0]; point[normalAxis] = fixedCoordinate;
      point[planeAxes[0]] = coordinates[0][i]!; point[planeAxes[1]] = coordinates[1][j]!;
      const variables = { x: point[0], y: point[1], z: point[2] };
      const results = field.components.map(component => evaluateGraph2DExpression(component.ast, variables,
        { maxEvaluations: 256 }));
      return results.every(result => result.ok) ? results.map(result => result.ok ? result.value : NaN) as
        [number, number, number] : null;
    };
  }
  const channel = checked.source.display.colorBy === "speed" ? "magnitude" : checked.source.display.colorBy;
  const componentUnits = field.kind === "scientific-bundle" ? field.componentUnits :
    field.components.map(component => component.unit);
  if (channel === "magnitude" && new Set(componentUnits).size !== 1)
    throw new TypeError("Magnitude requires matching vector component units; choose a component color mode.");
  const unit = channel === "magnitude" ? componentUnits[0]! :
    componentUnits[{ p: 0, q: 1, r: 2 }[channel]]!;
  const values: (number | null)[] = [];
  for (let i = 0; i < shape[0]; i++) for (let j = 0; j < shape[1]; j++) {
    const vector = at(i, j);
    const value = vector ? channel === "magnitude" ? Math.hypot(...vector) :
      vector[{ p: 0, q: 1, r: 2 }[channel]]! : NaN;
    values.push(Number.isFinite(value) ? value : null);
  }
  const finite = values.filter((value): value is number => value !== null);
  return { source: { documentId: checked.identity.id, revision: checked.identity.revision,
    structuralHash: checked.identity.structuralHash }, normalAxis, fixedCoordinate,
    fixedUnit: checked.source.axes[normalAxis].unit, planeAxes, coordinates, shape, values,
    channel, unit, min: finite.length ? Math.min(...finite) : NaN,
    max: finite.length ? Math.max(...finite) : NaN,
    evaluated: values.length, rejected: values.length - finite.length, sourceHash,
    verifiedSamples };
}

/** One physical point shared by the 3D viewer and all orthogonal planes. No interpolation is implied. */
export function sampleVectorField3DProbe(document: VectorField3DDocument,
  position: readonly [number, number, number],
  scientific?: Readonly<{ manifestJson: string; fingerprint: string; volumes: VectorField3DVolumes }>):
  VectorField3DProbeArtifact {
  const checked = checkedDocument(document), field = checked.source.field;
  if (!scientificPointWithinBounds(position, checked.source.axes))
    throw new RangeError("Probe is outside the field domain.");
  let vector: [number, number, number], sourceHash: string | undefined, viewHash: string | undefined;
  let verifiedSamples: VectorField3DProbeArtifact["verifiedSamples"];
  if (field.kind === "scientific-bundle") {
    if (!scientific) throw new TypeError("Reverify all three scientific components before reading a probe.");
    const volumes = verifyVectorField3DVolumes(checked, scientific.manifestJson,
      scientific.fingerprint, scientific.volumes);
    verifiedSamples = vectorField3DVolumeProvenance(scientific.manifestJson, volumes);
    const reference = field.references[0], indices = position.map((coordinate, axis) =>
      scientificCoordinateIndex({ ...reference.axes[axis]!, count: reference.shape[axis]! }, coordinate));
    const sampled = indices.map((index, axis) => sourceSamples(reference.shape[axis]!).indexOf(index));
    if (sampled.some(index => index < 0))
      throw new RangeError("Choose a physical coordinate represented by the bounded sample lattice.");
    const link = createScientificDatasetLink(field.references);
    const view = createScientificDerivedView(link, { kind: "probe", indices,
      components: field.references.map(item => item.component) });
    sourceHash = link.sourceHash; viewHash = view.viewHash;
    const offset = (sampled[0]! * volumes[0].sampleShape[1] + sampled[1]!) *
      volumes[0].sampleShape[2] + sampled[2]!;
    vector = volumes.map(volume => volume.values[offset]!) as [number, number, number];
  } else {
    const variables = { x: position[0], y: position[1], z: position[2] };
    const results = field.components.map(component => evaluateGraph2DExpression(component.ast,
      variables, { maxEvaluations: 256 }));
    if (results.some(result => !result.ok))
      throw new TypeError("The analytic field is undefined at this probe.");
    vector = results.map(result => result.ok ? result.value : NaN) as [number, number, number];
  }
  const magnitude = Math.hypot(...vector);
  if (!Number.isFinite(magnitude)) throw new TypeError("The field is non-finite at this probe.");
  const componentUnits = field.kind === "scientific-bundle" ? field.componentUnits :
    field.components.map(component => component.unit) as [string, string, string];
  if (new Set(componentUnits).size !== 1)
    throw new TypeError("Probe magnitude requires matching component units.");
  return { source: { documentId: checked.identity.id, revision: checked.identity.revision,
    structuralHash: checked.identity.structuralHash }, position: [...position] as [number, number, number],
    vector, magnitude, coordinateUnits: checked.source.axes.map(axis => axis.unit) as
      [string, string, string], componentUnits, sourceHash, viewHash, verifiedSamples };
}
