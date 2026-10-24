import { createHash } from "node:crypto";
import { readScientificSceneBundle, type VerifiedScientificSceneBundle } from "./bundle";

export type ScientificGraphDatasetSource = {
  manifestJson: string;
  fingerprint: string;
  datasets: ({ datasetId: string; component: string; values: number[]; shape?: never } |
    { datasetId: string; component: string; shape: [number, number] | [number, number, number]; values?: never })[];
};

export type ScientificGraphSlice = { fingerprint: string; datasetId: string; component: string; varyingAxis: 0 | 1;
  fixedIndex: number; shape: [number, number]; resourceSha256: string; sliceSha256: string; values: number[] };

export type ScientificGraphPlane = { fingerprint: string; datasetId: string; component: string;
  sourceShape: number[]; normalAxis: 0 | 1 | 2 | null; fixedIndex: number | null;
  planeAxes: [number, number]; shape: [number, number]; resourceSha256: string; planeSha256: string; values: number[] };

export type ScientificGraphVolume = { fingerprint: string; datasetId: string; component: string;
  sourceShape: [number, number, number]; sampleShape: [number, number, number];
  resourceSha256: string; sampleSha256: string; values: number[] };

const volumeFromVerifiedBundle = (bundle: VerifiedScientificSceneBundle, datasetId: string,
  component: string): ScientificGraphVolume => {
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
  const sampleShape = sourceShape.map(size => Math.min(size, 32)) as [number, number, number];
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(index * (sourceShape[axis] - 1) / (count - 1))));
  const values = new Array<number>(sampleShape[0] * sampleShape[1] * sampleShape[2]);
  const bytes = Buffer.alloc(values.length * 8);
  let next = 0;
  for (const first of positions[0]!) for (const second of positions[1]!) for (const third of positions[2]!) {
    const value = buffer.readDoubleLE(((first * sourceShape[1] + second) * sourceShape[2] + third) * 8);
    values[next] = value; bytes.writeDoubleLE(value, next * 8); next++;
  }
  return { fingerprint: bundle.fingerprint, datasetId, component, sourceShape, sampleShape, resourceSha256: resource.sha256,
    sampleSha256: createHash("sha256").update(bytes).digest("hex"), values };
};

/** A bounded sample lattice covering the entire verified 3D domain for an orbitable overview. */
export async function previewScientificGraphVolume(directory: string, fingerprint: string, datasetId: string,
  component: string): Promise<ScientificGraphVolume> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  return volumeFromVerifiedBundle(bundle, datasetId, component);
}

/** All three components come from one manifest/resource verification pass. */
export async function previewScientificGraphVectorVolume(directory: string, fingerprint: string, datasetId: string,
  components: readonly [string, string, string]): Promise<[ScientificGraphVolume, ScientificGraphVolume, ScientificGraphVolume]> {
  if (new Set(components).size !== 3) throw new TypeError("Choose three distinct vector components.");
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
      dataset.components?.length !== 3 || components.some(name => !dataset.components?.some(part => part.name === name)))
    throw new TypeError("Choose one complete three-component vector dataset.");
  return components.map(component => volumeFromVerifiedBundle(bundle, datasetId, component)) as
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

/** Return bounded 1D components and 2D descriptors; full grids stay in main. */
export async function openScientificGraphDatasets(directory: string): Promise<ScientificGraphDatasetSource> {
  const bundle = await readScientificSceneBundle(directory);
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
