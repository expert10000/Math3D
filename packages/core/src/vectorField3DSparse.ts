import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import { createGraph2DFieldReference } from "./graph2dFieldReference";
import { parseScientificSceneManifest, scientificTileLayout,
  scientificTileSampleLocation } from "./scientificSceneManifest";
import { scientificAxisCoordinate, scientificCoordinateIndex, scientificPointWithinBounds } from "./scientificDatasetCoordinates";
import { createScientificDatasetLink, createScientificDerivedView } from "./scientificDatasetLink";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import type { VectorField3DSliceArtifact, VectorField3DProbeArtifact } from "./vectorField3DSlices";

export type VectorField3DSparseSelection = Readonly<{ kind: "slice" | "stencil-slice" | "source-stencil-slice"; normalAxis: 0 | 1 | 2;
  fixedIndex: number } | { kind: "probe" | "source-stencil-probe";
    indices: readonly [number, number, number] }>;
export type VectorField3DSparseSamples = Readonly<{ fingerprint: string; datasetId: string;
  sourceShape: readonly [number, number, number]; selection: VectorField3DSparseSelection;
  components: readonly Readonly<{ name: string; resourceSha256: string; sampleSha256: string;
    verifiedChunks?: readonly number[]; verifiedTiles?: readonly number[];
    values: readonly number[] }>[] }>;

const lattice = (size: number) => Array.from({ length: Math.min(size, 32) }, (_, index) =>
  size === 1 ? 0 : Math.round(index * (size - 1) / (Math.min(size, 32) - 1)));

/** Deterministic source-grid neighbors for every bounded output cell, in transfer order. */
export function vectorField3DSourceStencilPoints(shape: readonly [number, number, number],
  normalAxis: 0 | 1 | 2, fixedIndex: number): readonly (readonly [number, number, number])[] {
  if (![0, 1, 2].includes(normalAxis) || !lattice(shape[normalAxis]).includes(fixedIndex) ||
    shape.some(size => !Number.isSafeInteger(size) || size < 2 || size > 256))
    throw new RangeError("Source stencil slice is outside the bounded output lattice.");
  const plane = [0, 1, 2].filter(axis => axis !== normalAxis);
  const unique = new Map<string, [number, number, number]>();
  const add = (point: [number, number, number]) => unique.set(point.join(","), point);
  for (const first of lattice(shape[plane[0]!]!)) for (const second of lattice(shape[plane[1]!]!)) {
    const center = [0, 0, 0] as [number, number, number];
    center[normalAxis] = fixedIndex; center[plane[0]!] = first; center[plane[1]!] = second;
    add(center);
    for (const axis of [0, 1, 2] as const) {
      const index = center[axis], size = shape[axis];
      const neighbors = size === 2 ? [0, 1] : index === 0 ? [0, 1, 2] :
        index === size - 1 ? [size - 3, size - 2, size - 1] : [index - 1, index, index + 1];
      for (const neighbor of neighbors) { const point = [...center] as [number, number, number];
        point[axis] = neighbor; add(point); }
    }
  }
  return [...unique.values()];
}

/** Center plus the immediate source-grid neighbors needed for three-axis calculus. */
export function vectorField3DSourceProbeStencilPoints(shape: readonly [number, number, number],
  indices: readonly [number, number, number]): readonly (readonly [number, number, number])[] {
  if (shape.some((size, axis) => !Number.isSafeInteger(size) || size < 2 || size > 256 ||
      !lattice(size).includes(indices[axis])))
    throw new RangeError("Source stencil probe is outside the bounded sample lattice.");
  const center = [...indices] as [number, number, number];
  const unique = new Map<string, [number, number, number]>([[center.join(","), center]]);
  for (const axis of [0, 1, 2] as const) {
    const at = indices[axis], size = shape[axis];
    const neighbors = size === 2 ? [0, 1] : at === 0 ? [0, 1, 2] :
      at === size - 1 ? [size - 3, size - 2, size - 1] : [at - 1, at, at + 1];
    for (const index of neighbors) {
      const point = [...center] as [number, number, number]; point[axis] = index;
      unique.set(point.join(","), point);
    }
  }
  return [...unique.values()];
}

export const vectorField3DSparseProvenance = (manifestJson: string, samples: VectorField3DSparseSamples) => {
  const parsed = parseScientificSceneManifest(manifestJson);
  if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
  const dataset = parsed.value.datasets.find(item => item.id === samples.datasetId);
  return samples.components.map(component => {
    const resourceId = dataset?.components?.find(item => item.name === component.name)?.resource;
    const resource = parsed.value.resources.find(item => item.id === resourceId);
    return { name: component.name, sampleSha256: component.sampleSha256,
      ...(component.verifiedChunks ? { verifiedChunks: component.verifiedChunks.length,
        totalChunks: resource?.chunkSha256?.length ?? 0 } : {}),
      ...(component.verifiedTiles ? { verifiedTiles: component.verifiedTiles.length,
        totalTiles: resource?.tileSha256?.length ?? 0 } : {}) };
  });
};

/** The host supplies values, while this checks saved source identity, coordinates, sample digest and chunk coverage. */
export function verifyVectorField3DSparseSamples(document: VectorField3DDocument, manifestJson: string,
  fingerprint: string, samples: VectorField3DSparseSamples): VectorField3DSparseSamples {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "scientific-bundle" || samples.fingerprint !== fingerprint ||
      sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
    throw new TypeError("Scientific source fingerprint changed.");
  const parsed = parseScientificSceneManifest(manifestJson);
  if (!parsed.ok || !["scientific-scene/v2", "scientific-scene/v3"].includes(parsed.value.schema))
    throw new TypeError("Sparse samples require a v2 or v3 manifest.");
  const manifest = parsed.value;
  const dataset = manifest.datasets.find(item => item.id === field.references[0].datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || samples.datasetId !== dataset.id ||
      samples.sourceShape.length !== 3 || samples.sourceShape.some((size, axis) => size !== dataset.shape[axis]) ||
      samples.components.length !== 3)
    throw new TypeError("Sparse samples do not match the saved vector dataset.");
  const positions = dataset.shape.map(lattice);
  let points: number[][];
  const selection = samples.selection;
  if (selection.kind === "slice" || selection.kind === "stencil-slice" ||
      selection.kind === "source-stencil-slice") {
    if (![0, 1, 2].includes(selection.normalAxis) || !Number.isSafeInteger(selection.fixedIndex) ||
        !positions[selection.normalAxis]?.includes(selection.fixedIndex))
      throw new TypeError("Slice index is outside the verified lattice.");
    if (selection.kind === "source-stencil-slice" && manifest.schema !== "scientific-scene/v3")
      throw new TypeError("Source-grid stencils require v3 tiles.");
    const axes = [0, 1, 2].filter(axis => axis !== selection.normalAxis);
    points = [];
    const index = positions[selection.normalAxis]!.indexOf(selection.fixedIndex);
    const layers = selection.kind === "slice" ? [index] : positions[selection.normalAxis]!.length === 1 ? [0] :
      positions[selection.normalAxis]!.length === 2 ? [0, 1] : index === 0 ? [0, 1, 2] :
        index === positions[selection.normalAxis]!.length - 1 ? [index - 2, index - 1, index] :
          [index - 1, index, index + 1];
    for (const layer of layers) for (const first of positions[axes[0]!]!) for (const second of positions[axes[1]!]!) {
      const point = [0, 0, 0]; point[selection.normalAxis] = positions[selection.normalAxis]![layer]!;
      point[axes[0]!] = first; point[axes[1]!] = second; points.push(point);
    }
    if (selection.kind === "source-stencil-slice")
      points = vectorField3DSourceStencilPoints(dataset.shape as [number, number, number],
        selection.normalAxis, selection.fixedIndex).map(point => [...point]);
  } else if (selection.kind === "probe" || selection.kind === "source-stencil-probe") {
    if (!Array.isArray(selection.indices) || selection.indices.length !== 3 ||
        selection.indices.some((index, axis) => !Number.isSafeInteger(index) || !positions[axis]?.includes(index)))
      throw new TypeError("Probe index is outside the verified lattice.");
    if (selection.kind === "source-stencil-probe" && manifest.schema !== "scientific-scene/v3")
      throw new TypeError("Source-grid probe stencils require v3 tiles.");
    points = selection.kind === "source-stencil-probe" ?
      vectorField3DSourceProbeStencilPoints(dataset.shape as [number, number, number],
        selection.indices).map(point => [...point]) : [[...selection.indices]];
  } else throw new TypeError("Invalid sparse sample selection.");
  const offsets = points.map(([x, y, z]) => ((x! * dataset.shape[1]! + y!) * dataset.shape[2]! + z!) * 8);
  field.references.forEach((saved, index) => {
    const fresh = createGraph2DFieldReference(manifestJson, fingerprint, saved.locator,
      saved.datasetId, saved.component);
    if (canonicalJsonStringify(saved) !== canonicalJsonStringify(fresh))
      throw new TypeError(`Scientific source changed for component ${saved.component}.`);
    const component = samples.components[index];
    const resourceId = dataset.components!.find(part => part.name === saved.component)?.resource;
    const resource = manifest.resources.find(item => item.id === resourceId);
    if (!component || component.name !== saved.component || component.resourceSha256 !== saved.resourceSha256 ||
        resource?.sha256 !== component.resourceSha256 ||
        !Array.isArray(component.values) || component.values.length !== points.length)
      throw new TypeError("Sparse vector component does not match the saved source.");
    if (manifest.schema === "scientific-scene/v2") {
      if (!resource.chunkBytes || !Array.isArray(component.verifiedChunks) ||
          component.verifiedTiles !== undefined)
        throw new TypeError("Sparse vector chunk coverage is missing.");
      const required = [...new Set(offsets.map(offset => Math.floor(offset / resource.chunkBytes!)))].sort((a, b) => a - b);
      if (canonicalJsonStringify(component.verifiedChunks) !== canonicalJsonStringify(required))
        throw new TypeError("Sparse vector chunk coverage changed.");
    } else {
      if (!resource.tileShape || !Array.isArray(component.verifiedTiles) ||
          component.verifiedChunks !== undefined)
        throw new TypeError("Sparse vector tile coverage is missing.");
      const layout = scientificTileLayout(dataset.shape, resource.tileShape);
      const required = [...new Set(points.map(point => scientificTileSampleLocation(dataset.shape,
        resource.tileShape!, point, layout).tileIndex))].sort((a, b) => a - b);
      if (canonicalJsonStringify(component.verifiedTiles) !== canonicalJsonStringify(required))
        throw new TypeError("Sparse vector tile coverage changed.");
    }
    const bytes = new Uint8Array(component.values.length * 8), view = new DataView(bytes.buffer);
    component.values.forEach((value, at) => {
      if (!Number.isFinite(value)) throw new TypeError("Sparse vector sample is non-finite.");
      view.setFloat64(at * 8, value, true);
    });
    if (sha256Checksum(bytes) !== `sha256:${component.sampleSha256}`)
      throw new TypeError("Sparse vector sample checksum changed.");
  });
  return samples;
}

export function sampleVectorField3DSparseSlice(document: VectorField3DDocument, normalAxis: 0 | 1 | 2,
  fixedCoordinate: number, scientific: Readonly<{ manifestJson: string; fingerprint: string;
    samples: VectorField3DSparseSamples }>): VectorField3DSliceArtifact {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "scientific-bundle") throw new TypeError("Expected a scientific vector field.");
  const samples = verifyVectorField3DSparseSamples(document, scientific.manifestJson,
    scientific.fingerprint, scientific.samples);
  const ref = field.references[0], fixedIndex = scientificCoordinateIndex({ ...ref.axes[normalAxis]!,
    count: ref.shape[normalAxis]! }, fixedCoordinate);
  if ((samples.selection.kind !== "slice" && samples.selection.kind !== "stencil-slice" &&
      samples.selection.kind !== "source-stencil-slice") ||
      samples.selection.normalAxis !== normalAxis ||
      samples.selection.fixedIndex !== fixedIndex) throw new TypeError("Sparse slice selection changed.");
  const planeAxes = [0, 1, 2].filter(axis => axis !== normalAxis) as [number, number];
  const coordinates = planeAxes.map(axis => lattice(ref.shape[axis]!).map(index =>
    scientificAxisCoordinate({ ...ref.axes[axis]!, count: ref.shape[axis]! }, index))) as [number[], number[]];
  const channel = checked.value.source.display.colorBy === "speed" ? "magnitude" : checked.value.source.display.colorBy;
  if (channel === "magnitude" && new Set(field.componentUnits).size !== 1)
    throw new TypeError("Magnitude requires matching vector component units.");
  const componentIndex = channel === "magnitude" ? 0 : { p: 0, q: 1, r: 2 }[channel];
  const link = createScientificDatasetLink(field.references);
  createScientificDerivedView(link, { kind: "slice", normalAxis, fixedIndex,
    channel: channel === "magnitude" ? channel : field.references[componentIndex].component, maxSamples: 1024 });
  const planeCount = coordinates[0].length * coordinates[1].length;
  const sampleIndex = lattice(ref.shape[normalAxis]!).indexOf(fixedIndex);
  const layers = samples.selection.kind === "slice" ? [sampleIndex] :
    lattice(ref.shape[normalAxis]!).length === 1 ? [0] :
      lattice(ref.shape[normalAxis]!).length === 2 ? [0, 1] : sampleIndex === 0 ? [0, 1, 2] :
        sampleIndex === lattice(ref.shape[normalAxis]!).length - 1 ?
          [sampleIndex - 2, sampleIndex - 1, sampleIndex] : [sampleIndex - 1, sampleIndex, sampleIndex + 1];
  const start = layers.indexOf(sampleIndex) * planeCount;
  const sourceOffsets = samples.selection.kind === "source-stencil-slice" ?
    new Map(vectorField3DSourceStencilPoints(ref.shape as readonly [number, number, number],
      normalAxis, fixedIndex)
      .map((point, index) => [point.join(","), index])) : null;
  const values = Array.from({ length: planeCount }, (_, offset) => {
    const firstIndex = Math.floor(offset / coordinates[1].length);
    const secondIndex = offset % coordinates[1].length;
    const point = [0, 0, 0]; point[normalAxis] = fixedIndex;
    point[planeAxes[0]] = lattice(ref.shape[planeAxes[0]]!)[firstIndex]!;
    point[planeAxes[1]] = lattice(ref.shape[planeAxes[1]]!)[secondIndex]!;
    const index = sourceOffsets ? sourceOffsets.get(point.join(","))! : start + offset;
    return channel === "magnitude" ?
      Math.hypot(...samples.components.map(component => component.values[index]!)) :
      samples.components[componentIndex]!.values[index]!;
  });
  if (values.some(value => !Number.isFinite(value))) throw new TypeError("Sparse slice is non-finite.");
  return { source: { documentId: checked.value.identity.id, revision: checked.value.identity.revision,
    structuralHash: checked.value.identity.structuralHash }, normalAxis, fixedCoordinate,
    fixedUnit: checked.value.source.axes[normalAxis].unit, planeAxes, coordinates,
    shape: [coordinates[0].length, coordinates[1].length], values, channel,
    unit: field.componentUnits[componentIndex]!, min: Math.min(...values), max: Math.max(...values),
    evaluated: values.length, rejected: 0, sourceHash: link.sourceHash,
    verifiedSamples: vectorField3DSparseProvenance(scientific.manifestJson, samples) };
}

export function sampleVectorField3DSparseProbe(document: VectorField3DDocument,
  position: readonly [number, number, number], scientific: Readonly<{ manifestJson: string;
    fingerprint: string; samples: VectorField3DSparseSamples }>): VectorField3DProbeArtifact {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  if (field.kind !== "scientific-bundle" || !scientificPointWithinBounds(position, checked.value.source.axes))
    throw new TypeError("Probe is outside the scientific field.");
  const samples = verifyVectorField3DSparseSamples(document, scientific.manifestJson,
    scientific.fingerprint, scientific.samples);
  const indices = position.map((coordinate, axis) => scientificCoordinateIndex({ ...field.references[0].axes[axis]!,
    count: field.references[0].shape[axis]! }, coordinate));
  if (samples.selection.kind !== "probe" || samples.selection.indices.some((index, axis) => index !== indices[axis]))
    throw new TypeError("Sparse probe selection changed.");
  if (new Set(field.componentUnits).size !== 1) throw new TypeError("Probe magnitude requires matching component units.");
  const vector = samples.components.map(component => component.values[0]!) as [number, number, number];
  const magnitude = Math.hypot(...vector);
  if (!Number.isFinite(magnitude)) throw new TypeError("Scientific vector magnitude is non-finite.");
  const link = createScientificDatasetLink(field.references);
  const view = createScientificDerivedView(link, { kind: "probe", indices,
    components: field.references.map(item => item.component) });
  return { source: { documentId: checked.value.identity.id, revision: checked.value.identity.revision,
    structuralHash: checked.value.identity.structuralHash }, position: [...position] as [number, number, number],
    vector, magnitude, coordinateUnits: checked.value.source.axes.map(axis => axis.unit) as
      [string, string, string], componentUnits: field.componentUnits, sourceHash: link.sourceHash,
    viewHash: view.viewHash, verifiedSamples: vectorField3DSparseProvenance(scientific.manifestJson, samples) };
}
