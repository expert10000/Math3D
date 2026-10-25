import { createHash } from "node:crypto";
import { readScientificSceneBundle, readScientificSceneBundleMetadata, readScientificSceneChunks,
  readScientificSceneTiles, readScientificSceneOverview,
  type ScientificSceneBundleMetadata, type VerifiedScientificSceneBundle } from "./bundle";
const { scientificTileLayout, scientificTileSampleLocation } = require("../../shared/scientificSceneManifest.js") as {
  scientificTileLayout: (shape: readonly number[], tileShape: readonly number[]) =>
    { index: number; start: [number, number, number]; size: [number, number, number];
      offsetBytes: number; bytes: number }[];
  scientificTileSampleLocation: (shape: readonly number[], tileShape: readonly number[],
    indices: readonly number[], tiles: ReturnType<typeof scientificTileLayout>) =>
      { tileIndex: number; offsetBytes: number };
};

export type ScientificGraphDatasetSource = {
  manifestJson: string;
  fingerprint: string;
  datasets: ({ datasetId: string; component: string; values: number[]; shape?: never } |
    { datasetId: string; component: string; shape: [number, number] | [number, number, number]; values?: never })[];
};

export type ScientificGraphSlice = { fingerprint: string; datasetId: string; component: string; varyingAxis: 0 | 1;
  fixedIndex: number; shape: [number, number]; resourceSha256: string; sliceSha256: string; values: number[] };

export type ScientificGraphVolumeLine = { fingerprint: string; datasetId: string; component: string;
  shape: [number, number, number]; normalAxis: 0 | 1 | 2; planeFixedIndex: number;
  varyingAxis: 0 | 1 | 2; fixedIndex: number;
  resourceSha256: string; sliceSha256: string; values: number[] };

export type ScientificGraphPlane = { fingerprint: string; datasetId: string; component: string;
  sourceShape: number[]; normalAxis: 0 | 1 | 2 | null; fixedIndex: number | null;
  planeAxes: [number, number]; shape: [number, number]; resourceSha256: string; planeSha256: string; values: number[] };

export type ScientificGraphVolume = { fingerprint: string; datasetId: string; component: string;
  sourceShape: [number, number, number]; sampleShape: [number, number, number];
  sampleLimit?: number; verifiedChunks?: number[]; verifiedTiles?: number[];
  verifiedOverview?: string;
  resourceSha256: string; sampleSha256: string; values: number[] };

export type ScientificVectorSelection = { kind: "slice" | "stencil-slice"; normalAxis: 0 | 1 | 2; fixedIndex: number } |
  { kind: "probe"; indices: [number, number, number] };
export type ScientificVectorSamples = { fingerprint: string; datasetId: string;
  sourceShape: [number, number, number]; selection: ScientificVectorSelection;
  components: { name: string; resourceSha256: string; sampleSha256: string;
    verifiedChunks?: number[]; verifiedTiles?: number[]; values: number[] }[] };

const boundedPositions = (size: number) => Array.from({ length: Math.min(size, 32) }, (_, index) =>
  size === 1 ? 0 : Math.round(index * (size - 1) / (Math.min(size, 32) - 1)));

const tiledValues = async (metadata: ScientificSceneBundleMetadata, resourceId: string,
  shape: [number, number, number], points: readonly [number, number, number][]) => {
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (!resource?.tileShape || !resource.tileSha256) throw new Error("Tiled scientific resource is missing.");
  const layout = scientificTileLayout(shape, resource.tileShape);
  const locations = points.map(point => scientificTileSampleLocation(shape, resource.tileShape!, point, layout));
  const verifiedTiles = [...new Set(locations.map(item => item.tileIndex))].sort((a, b) => a - b);
  const tiles = await readScientificSceneTiles(metadata, resourceId, verifiedTiles);
  const values = locations.map(item => tiles.get(item.tileIndex)!.readDoubleLE(item.offsetBytes));
  return { resource, verifiedTiles, values };
};

/** A single plane or point, in deterministic plane-axis order, from manifest-pinned resources. */
export async function previewScientificGraphVectorSamples(directory: string, fingerprint: string,
  datasetId: string, components: readonly [string, string, string], selection: ScientificVectorSelection):
  Promise<ScientificVectorSamples> {
  const metadata = await readScientificSceneBundleMetadata(directory);
  if (metadata.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  if (metadata.bundleSchema !== "scientific-scene-bundle/v2" &&
      metadata.bundleSchema !== "scientific-scene-bundle/v3")
    throw new TypeError("Sparse vector samples require a v2 or v3 bundle.");
  const dataset = metadata.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || new Set(components).size !== 3 ||
      components.some(name => !dataset.components?.some(part => part.name === name)))
    throw new TypeError("Choose one complete three-component vector dataset.");
  const sourceShape = [...dataset.shape] as [number, number, number];
  const lattice = sourceShape.map(boundedPositions);
  let points: [number, number, number][];
  if (selection.kind === "slice" || selection.kind === "stencil-slice") {
    const axis = selection.normalAxis;
    if (![0, 1, 2].includes(axis) || !Number.isSafeInteger(selection.fixedIndex) ||
        !lattice[axis]?.includes(selection.fixedIndex))
      throw new RangeError("Slice is outside the bounded sample lattice.");
    const plane = [0, 1, 2].filter(item => item !== axis);
    points = [];
    const index = lattice[axis]!.indexOf(selection.fixedIndex);
    const adjacent = selection.kind === "slice" ? [index] : lattice[axis]!.length === 1 ? [0] :
      lattice[axis]!.length === 2 ? [0, 1] : index === 0 ? [0, 1, 2] :
        index === lattice[axis]!.length - 1 ? [index - 2, index - 1, index] : [index - 1, index, index + 1];
    for (const layer of adjacent) for (const first of lattice[plane[0]!]!) for (const second of lattice[plane[1]!]!) {
      const point = [0, 0, 0] as [number, number, number];
      point[axis] = lattice[axis]![layer]!; point[plane[0]!] = first; point[plane[1]!] = second;
      points.push(point);
    }
  } else if (selection.kind === "probe") {
    if (!Array.isArray(selection.indices) || selection.indices.length !== 3 ||
        selection.indices.some((index, axis) => !Number.isSafeInteger(index) || !lattice[axis]?.includes(index)))
      throw new RangeError("Probe is outside the bounded sample lattice.");
    points = [[...selection.indices]];
  } else throw new TypeError("Invalid sparse vector selection.");
  const offsets = points.map(([x, y, z]) => ((x * sourceShape[1] + y) * sourceShape[2] + z) * 8);
  const transferred = await Promise.all(components.map(async name => {
    const resourceId = dataset.components!.find(part => part.name === name)!.resource;
    const resource = metadata.manifest.resources.find(item => item.id === resourceId);
    if (metadata.bundleSchema === "scientific-scene-bundle/v3") {
      const tiled = await tiledValues(metadata, resourceId, sourceShape, points);
      const bytes = Buffer.alloc(tiled.values.length * 8);
      tiled.values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
      return { name, resourceSha256: tiled.resource.sha256, verifiedTiles: tiled.verifiedTiles,
        sampleSha256: createHash("sha256").update(bytes).digest("hex"), values: tiled.values };
    }
    if (!resource?.chunkBytes || !resource.chunkSha256) throw new Error("Chunked vector resource is missing.");
    const verifiedChunks = [...new Set(offsets.map(offset => Math.floor(offset / resource.chunkBytes!)))].sort((a, b) => a - b);
    const chunks = await readScientificSceneChunks(metadata, resourceId, verifiedChunks);
    const values = offsets.map(offset => {
      const chunk = Math.floor(offset / resource.chunkBytes!);
      return chunks.get(chunk)!.readDoubleLE(offset - chunk * resource.chunkBytes!);
    });
    const bytes = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    return { name, resourceSha256: resource.sha256, verifiedChunks,
      sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
  }));
  return { fingerprint, datasetId, sourceShape, selection, components: transferred };
}

const volumeFromVerifiedBundle = (bundle: VerifiedScientificSceneBundle, datasetId: string,
  component: string, sampleLimit = 32): ScientificGraphVolume => {
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 2 || sampleLimit > 32)
    throw new TypeError("Scientific volume sample limit must be from 2 to 32 per axis.");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || dataset.shape.length !== 3 || coordinate?.axes.length !== 3 ||
      dataset.shape.some(size => size < 1 || size > 256))
    throw new TypeError("Choose a valid three-dimensional field.");
  const resourceId = dataset.semanticType === "vector-field" ? dataset.components?.find(part => part.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  const resource = bundle.manifest.resources.find(item => item.id === resourceId);
  const buffer = resourceId ? bundle.resources.get(resourceId) : undefined;
  const sourceShape = [...dataset.shape] as [number, number, number];
  if (!resource || !buffer || buffer.length !== sourceShape[0] * sourceShape[1] * sourceShape[2] * 8)
    throw new Error("Verified scientific volume bytes are missing.");
  const sampleShape = sourceShape.map(size => Math.min(size, sampleLimit)) as [number, number, number];
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(index * (sourceShape[axis] - 1) / (count - 1))));
  const values = new Array<number>(sampleShape[0] * sampleShape[1] * sampleShape[2]);
  const bytes = Buffer.alloc(values.length * 8);
  let next = 0;
  for (const first of positions[0]!) for (const second of positions[1]!) for (const third of positions[2]!) {
    const value = buffer.readDoubleLE(((first * sourceShape[1] + second) * sourceShape[2] + third) * 8);
    values[next] = value; bytes.writeDoubleLE(value, next * 8); next++;
  }
  return { fingerprint: bundle.fingerprint, datasetId, component, sourceShape, sampleShape,
    ...(sampleLimit === 32 ? {} : { sampleLimit }), resourceSha256: resource.sha256,
    sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
};

const volumeFromTiledBundle = async (metadata: ScientificSceneBundleMetadata, datasetId: string,
  component: string, sampleLimit: number): Promise<ScientificGraphVolume> => {
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 2 || sampleLimit > 32)
    throw new TypeError("Scientific volume sample limit must be from 2 to 32 per axis.");
  const dataset = metadata.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = metadata.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || dataset.shape.length !== 3 || coordinate?.axes.length !== 3 ||
      dataset.shape.some(size => size < 1 || size > 256))
    throw new TypeError("Choose a valid three-dimensional field.");
  const resourceId = dataset.semanticType === "vector-field" ?
    dataset.components?.find(part => part.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  if (!resourceId) throw new TypeError("Choose a valid volume component.");
  const sourceShape = [...dataset.shape] as [number, number, number];
  const sampleShape = sourceShape.map(size => Math.min(size, sampleLimit)) as [number, number, number];
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (sampleLimit === 8 && resource?.overview) {
    const bytes = await readScientificSceneOverview(metadata, resourceId);
    const values = Array.from({ length: bytes.length / 8 }, (_, index) => bytes.readDoubleLE(index * 8));
    return { fingerprint: metadata.fingerprint, datasetId, component, sourceShape, sampleShape,
      sampleLimit, verifiedOverview: resource.overview.sha256, resourceSha256: resource.sha256,
      sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
  }
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(index * (sourceShape[axis] - 1) / (count - 1))));
  const points: [number, number, number][] = [];
  for (const x of positions[0]!) for (const y of positions[1]!) for (const z of positions[2]!)
    points.push([x, y, z]);
  const { resource: tiledResource, verifiedTiles, values } = await tiledValues(metadata, resourceId, sourceShape, points);
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return { fingerprint: metadata.fingerprint, datasetId, component, sourceShape, sampleShape,
    ...(sampleLimit === 32 ? {} : { sampleLimit }), verifiedTiles, resourceSha256: tiledResource.sha256,
    sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
};

/** Resolve sparse display positions to only the chunks touched by those positions. */
const volumeFromChunkedBundle = async (metadata: ScientificSceneBundleMetadata, datasetId: string,
  component: string, sampleLimit: number): Promise<ScientificGraphVolume> => {
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 2 || sampleLimit > 32)
    throw new TypeError("Scientific volume sample limit must be from 2 to 32 per axis.");
  const dataset = metadata.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = metadata.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || dataset.shape.length !== 3 || coordinate?.axes.length !== 3 ||
      dataset.shape.some(size => size < 1 || size > 256))
    throw new TypeError("Choose a valid three-dimensional field.");
  const resourceId = dataset.semanticType === "vector-field" ?
    dataset.components?.find(part => part.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (!resource?.chunkBytes || !resource.chunkSha256)
    throw new Error("Chunked scientific volume resource is missing.");
  const sourceShape = [...dataset.shape] as [number, number, number];
  const sampleShape = sourceShape.map(size => Math.min(size, sampleLimit)) as [number, number, number];
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(index * (sourceShape[axis] - 1) / (count - 1))));
  const offsets: number[] = [];
  for (const x of positions[0]!) for (const y of positions[1]!) for (const z of positions[2]!)
    offsets.push(((x * sourceShape[1] + y) * sourceShape[2] + z) * 8);
  const verifiedChunks = [...new Set(offsets.map(offset => Math.floor(offset / resource.chunkBytes!)))].sort((a, b) => a - b);
  const chunks = await readScientificSceneChunks(metadata, resource.id, verifiedChunks);
  const values = offsets.map(offset => {
    const chunkIndex = Math.floor(offset / resource.chunkBytes!);
    return chunks.get(chunkIndex)!.readDoubleLE(offset - chunkIndex * resource.chunkBytes!);
  });
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
  return { fingerprint: metadata.fingerprint, datasetId, component, sourceShape, sampleShape,
    ...(sampleLimit === 32 ? {} : { sampleLimit }), verifiedChunks,
    resourceSha256: resource.sha256, sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
};

/** A bounded sample lattice covering the 3D domain for an orbitable overview. */
export async function previewScientificGraphVolume(directory: string, fingerprint: string, datasetId: string,
  component: string): Promise<ScientificGraphVolume> {
  const metadata = await readScientificSceneBundleMetadata(directory);
  if (metadata.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  if (metadata.bundleSchema === "scientific-scene-bundle/v2")
    return volumeFromChunkedBundle(metadata, datasetId, component, 32);
  if (metadata.bundleSchema === "scientific-scene-bundle/v3")
    return volumeFromTiledBundle(metadata, datasetId, component, 32);
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  return volumeFromVerifiedBundle(bundle, datasetId, component);
}

/** All three components share one pinned manifest; v2 checks only chunks touched by the view. */
export async function previewScientificGraphVectorVolume(directory: string, fingerprint: string, datasetId: string,
  components: readonly [string, string, string], sampleLimit = 32):
  Promise<[ScientificGraphVolume, ScientificGraphVolume, ScientificGraphVolume]> {
  if (new Set(components).size !== 3) throw new TypeError("Choose three distinct vector components.");
  const metadata = await readScientificSceneBundleMetadata(directory);
  if (metadata.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  if (metadata.bundleSchema === "scientific-scene-bundle/v2") {
    const dataset = metadata.manifest.datasets.find(item => item.id === datasetId);
    if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
        dataset.components?.length !== 3 || components.some(name =>
          !dataset.components?.some(part => part.name === name)))
      throw new TypeError("Choose one complete three-component vector dataset.");
    return Promise.all(components.map(component => volumeFromChunkedBundle(metadata,
      datasetId, component, sampleLimit))) as Promise<
        [ScientificGraphVolume, ScientificGraphVolume, ScientificGraphVolume]>;
  }
  if (metadata.bundleSchema === "scientific-scene-bundle/v3") {
    const dataset = metadata.manifest.datasets.find(item => item.id === datasetId);
    if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
        dataset.components?.length !== 3 || components.some(name =>
          !dataset.components?.some(part => part.name === name)))
      throw new TypeError("Choose one complete three-component vector dataset.");
    return Promise.all(components.map(component => volumeFromTiledBundle(metadata,
      datasetId, component, sampleLimit))) as Promise<
        [ScientificGraphVolume, ScientificGraphVolume, ScientificGraphVolume]>;
  }
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || components.some(name => !dataset.components?.some(part => part.name === name)))
    throw new TypeError("Choose one complete three-component vector dataset.");
  return components.map(component => volumeFromVerifiedBundle(bundle, datasetId, component, sampleLimit)) as
    [ScientificGraphVolume, ScientificGraphVolume, ScientificGraphVolume];
}

/** Reverify the bundle on every request, then transfer only one bounded 2D plane. */
export async function previewScientificGraphPlane(directory: string, fingerprint: string, datasetId: string,
  component: string, normalAxis: 0 | 1 | 2 | null, fixedIndex: number | null): Promise<ScientificGraphPlane> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  return planeFromVerifiedBundle(bundle, datasetId, component, normalAxis, fixedIndex);
}

/** Both 2D vector components must survive the same fresh bundle verification pass. */
export async function previewScientificGraphVectorPlane(directory: string, fingerprint: string, datasetId: string,
  components: readonly [string, string]): Promise<[ScientificGraphPlane, ScientificGraphPlane]> {
  if (new Set(components).size !== 2) throw new TypeError("Choose two distinct vector components.");
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 2 ||
      dataset.components?.length !== 2 || components.some(name => !dataset.components?.some(part => part.name === name)))
    throw new TypeError("Choose one complete two-component vector dataset.");
  return components.map(component => planeFromVerifiedBundle(bundle, datasetId, component, null, null)) as
    [ScientificGraphPlane, ScientificGraphPlane];
}

const planeFromVerifiedBundle = (bundle: VerifiedScientificSceneBundle, datasetId: string, component: string,
  normalAxis: 0 | 1 | 2 | null, fixedIndex: number | null): ScientificGraphPlane => {
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || !coordinate || ![2, 3].includes(dataset.shape.length) ||
      coordinate.axes.length !== dataset.shape.length || dataset.shape.some(size => size < 1 || size > 256) ||
      (dataset.shape.length === 2 ? normalAxis !== null || fixedIndex !== null :
        !Number.isInteger(normalAxis) || normalAxis! < 0 || normalAxis! > 2 ||
        !Number.isInteger(fixedIndex) || fixedIndex! < 0 || fixedIndex! >= dataset.shape[normalAxis!]!))
    throw new TypeError("Choose a valid plane from a two- or three-dimensional field.");
  const resourceId = dataset.semanticType === "vector-field" ? dataset.components?.find(part => part.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  const resource = bundle.manifest.resources.find(item => item.id === resourceId);
  const buffer = resourceId ? bundle.resources.get(resourceId) : undefined;
  const sourceShape = [...dataset.shape];
  const count = sourceShape.reduce((product, size) => product * size, 1);
  if (!resource || !buffer || buffer.length !== count * 8)
    throw new Error("Verified scientific field bytes are missing.");
  const planeAxes = (normalAxis === null ? [0, 1] : [0, 1, 2].filter(axis => axis !== normalAxis)) as [number, number];
  const shape: [number, number] = [sourceShape[planeAxes[0]]!, sourceShape[planeAxes[1]]!];
  const values = new Array<number>(shape[0] * shape[1]);
  const bytes = Buffer.alloc(values.length * 8);
  for (let row = 0; row < shape[0]; row++) for (let column = 0; column < shape[1]; column++) {
    const indices = sourceShape.map((_, axis) => axis === normalAxis ? fixedIndex! :
      axis === planeAxes[0] ? row : column);
    const offset = indices.reduce((flat, index, axis) => flat * sourceShape[axis]! + index, 0) * 8;
    const value = buffer.readDoubleLE(offset), position = row * shape[1] + column;
    values[position] = value;
    bytes.writeDoubleLE(value, position * 8);
  }
  return { fingerprint: bundle.fingerprint, datasetId, component, sourceShape, normalAxis, fixedIndex, planeAxes, shape,
    resourceSha256: resource.sha256, planeSha256: createHash("sha256").update(bytes).digest("hex"), values };
};

/** Reverify the complete bundle immediately before extracting a single last-axis-fastest line. */
export async function previewScientificGraphSlice(directory: string, fingerprint: string, datasetId: string,
  varyingAxis: 0 | 1, fixedIndex: number, component = "scalar"): Promise<ScientificGraphSlice> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || dataset.shape.length !== 2 || coordinate?.axes.length !== 2 ||
      dataset.shape.some(size => size < 1 || size > 256) ||
      (varyingAxis !== 0 && varyingAxis !== 1) || dataset.shape[varyingAxis]! < 2 ||
      !Number.isInteger(fixedIndex) || fixedIndex < 0 || fixedIndex >= dataset.shape[1 - varyingAxis]!)
    throw new TypeError("Choose a valid line from a two-dimensional grid.");
  const resourceId = dataset.semanticType === "vector-field" ? dataset.components?.find(part => part.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  const resource = bundle.manifest.resources.find(item => item.id === resourceId);
  const buffer = resourceId ? bundle.resources.get(resourceId) : undefined;
  if (!resource || !buffer || buffer.length !== dataset.shape[0]! * dataset.shape[1]! * 8)
    throw new Error("Verified scientific grid bytes are missing.");
  const values = Array.from({ length: dataset.shape[varyingAxis]! }, (_, index) =>
    buffer.readDoubleLE((varyingAxis === 0 ? index * dataset.shape[1]! + fixedIndex :
      fixedIndex * dataset.shape[1]! + index) * 8));
  const line = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => line.writeDoubleLE(value, index * 8));
  return { fingerprint, datasetId, component, varyingAxis, fixedIndex, shape: [dataset.shape[0]!, dataset.shape[1]!],
    resourceSha256: resource.sha256, sliceSha256: createHash("sha256").update(line).digest("hex"), values };
}

/** Reverify the complete bundle and transfer only one bounded line through a 3D scalar plane. */
function volumeLineFromVerifiedBundle(bundle: VerifiedScientificSceneBundle, datasetId: string, component: string,
  normalAxis: 0 | 1 | 2, planeFixedIndex: number, varyingAxis: 0 | 1 | 2,
  fixedIndex: number): ScientificGraphVolumeLine {
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  const fixedAxis = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== varyingAxis);
  if (!dataset || dataset.shape.length !== 3 ||
      coordinate?.axes.length !== 3 || dataset.shape.some(size => size < 1 || size > 256) ||
      !([0, 1, 2] as number[]).includes(normalAxis) ||
      !([0, 1, 2] as number[]).includes(varyingAxis) || normalAxis === varyingAxis ||
      fixedAxis === undefined || dataset.shape[varyingAxis]! < 2 ||
      !Number.isSafeInteger(planeFixedIndex) || planeFixedIndex < 0 ||
      planeFixedIndex >= dataset.shape[normalAxis]! ||
      !Number.isSafeInteger(fixedIndex) || fixedIndex < 0 || fixedIndex >= dataset.shape[fixedAxis]!)
    throw new TypeError("Choose a valid line through a three-dimensional scalar plane.");
  const resourceId = dataset.semanticType === "scalar-field" && component === "scalar" ? dataset.real :
    dataset.semanticType === "vector-field" && dataset.components?.length === 3 ?
      dataset.components.find(item => item.name === component)?.resource :
      dataset.semanticType === "complex-scalar-field" && component === "real" ? dataset.real :
      dataset.semanticType === "complex-scalar-field" && component === "imaginary" ? dataset.imaginary : undefined;
  const resource = bundle.manifest.resources.find(item => item.id === resourceId);
  const buffer = resourceId ? bundle.resources.get(resourceId) : undefined;
  const shape = [...dataset.shape] as [number, number, number];
  if (!resource || !buffer || buffer.length !== shape[0] * shape[1] * shape[2] * 8)
    throw new Error("Verified scientific volume bytes are missing.");
  const values = Array.from({ length: shape[varyingAxis] }, (_, index) => {
    const axes = [0, 1, 2].map(axis => axis === normalAxis ? planeFixedIndex :
      axis === varyingAxis ? index : fixedIndex);
    const offset = ((axes[0]! * shape[1] + axes[1]!) * shape[2] + axes[2]!) * 8;
    return buffer.readDoubleLE(offset);
  });
  const line = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => line.writeDoubleLE(value, index * 8));
  return { fingerprint: bundle.fingerprint, datasetId, component, shape, normalAxis, planeFixedIndex,
    varyingAxis, fixedIndex, resourceSha256: resource.sha256,
    sliceSha256: createHash("sha256").update(line).digest("hex"), values };
}

export async function previewScientificGraphVolumeLine(directory: string, fingerprint: string, datasetId: string,
  normalAxis: 0 | 1 | 2, planeFixedIndex: number, varyingAxis: 0 | 1 | 2,
  fixedIndex: number): Promise<ScientificGraphVolumeLine> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  return volumeLineFromVerifiedBundle(bundle, datasetId, "scalar", normalAxis, planeFixedIndex, varyingAxis, fixedIndex);
}

/** Reverify all three vector resources in one bundle read; transfer one selected component line. */
export async function previewScientificGraphVectorVolumeLine(directory: string, fingerprint: string, datasetId: string,
  components: readonly [string, string, string], component: string,
  normalAxis: 0 | 1 | 2, planeFixedIndex: number, varyingAxis: 0 | 1 | 2,
  fixedIndex: number): Promise<ScientificGraphVolumeLine> {
  if (new Set(components).size !== 3 || !components.includes(component))
    throw new TypeError("Choose one of three distinct vector components.");
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || components.some(name => !dataset.components?.some(part => part.name === name)))
    throw new TypeError("Choose one complete three-component vector dataset.");
  return volumeLineFromVerifiedBundle(bundle, datasetId, component, normalAxis, planeFixedIndex, varyingAxis, fixedIndex);
}

/** Both complex components are extracted from the same freshly verified 3D bundle. */
export async function previewScientificGraphComplexVolumeLines(directory: string, fingerprint: string, datasetId: string,
  normalAxis: 0 | 1 | 2, planeFixedIndex: number, varyingAxis: 0 | 1 | 2,
  fixedIndex: number): Promise<[ScientificGraphVolumeLine, ScientificGraphVolumeLine]> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "complex-scalar-field" || dataset.shape.length !== 3 ||
      !dataset.real || !dataset.imaginary || dataset.real === dataset.imaginary)
    throw new TypeError("Choose one complete three-dimensional complex field.");
  return ["real", "imaginary"].map(component => volumeLineFromVerifiedBundle(bundle, datasetId,
    component, normalAxis, planeFixedIndex, varyingAxis, fixedIndex)) as
    [ScientificGraphVolumeLine, ScientificGraphVolumeLine];
}

/** Return bounded 1D components and 2D descriptors; full grids stay in main. */
export async function openScientificGraphDatasets(directory: string): Promise<ScientificGraphDatasetSource> {
  const metadata = await readScientificSceneBundleMetadata(directory);
  const bundle: VerifiedScientificSceneBundle = metadata.bundleSchema !== "scientific-scene-bundle/v1" &&
    metadata.manifest.datasets.every(dataset => dataset.shape.length !== 1) ?
      { manifest: metadata.manifest, manifestJson: metadata.manifestJson,
        fingerprint: metadata.fingerprint, resources: new Map() } :
      await readScientificSceneBundle(directory);
  const datasets = bundle.manifest.datasets.flatMap<ScientificGraphDatasetSource["datasets"][number]>(dataset => {
    const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
    if ((dataset.shape.length === 2 || dataset.shape.length === 3) &&
        dataset.shape.every(size => size >= 1 && size <= 256) && coordinate?.axes.length === dataset.shape.length) {
      const parts = dataset.semanticType === "vector-field" ? dataset.components ?? [] :
        dataset.semanticType === "complex-scalar-field" ? [{ name: "real" }, { name: "imaginary" }] : [{ name: "scalar" }];
      return parts.map(part => ({ datasetId: dataset.id, component: part.name,
        shape: [...dataset.shape] as [number, number] | [number, number, number] }));
    }
    if (dataset.shape.length !== 1 ||
        dataset.shape[0] < 2 || dataset.shape[0] > 256 || coordinate?.axes.length !== 1) return [];
    const parts = dataset.semanticType === "vector-field" ? dataset.components ?? [] :
      [{ name: dataset.semanticType === "complex-scalar-field" ? "real" : "scalar", resource: dataset.real! },
        ...(dataset.imaginary ? [{ name: "imaginary", resource: dataset.imaginary }] : [])];
    return parts.map(part => {
      const buffer = bundle.resources.get(part.resource);
      if (!buffer || buffer.length !== dataset.shape[0] * 8) throw new Error("Verified scientific dataset bytes are missing.");
      return { datasetId: dataset.id, component: part.name,
        values: Array.from({ length: dataset.shape[0] }, (_, index) => buffer.readDoubleLE(index * 8)) };
    });
  });
  if (!datasets.length) throw new TypeError("Scientific scene has no supported 1D, 2D or 3D field for Graphs.");
  return { manifestJson: bundle.manifestJson, fingerprint: bundle.fingerprint, datasets };
}
