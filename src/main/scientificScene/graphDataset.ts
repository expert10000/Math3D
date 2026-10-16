import { createHash } from "node:crypto";
import { readScientificSceneBundle } from "./bundle";

export type ScientificGraphDatasetSource = {
  manifestJson: string;
  fingerprint: string;
  datasets: ({ datasetId: string; component: string; values: number[]; shape?: never } |
    { datasetId: string; component: "scalar"; shape: [number, number]; values?: never })[];
};

export type ScientificGraphSlice = { fingerprint: string; datasetId: string; varyingAxis: 0 | 1;
  fixedIndex: number; shape: [number, number]; resourceSha256: string; sliceSha256: string; values: number[] };

/** Reverify the complete bundle immediately before extracting a single last-axis-fastest line. */
export async function previewScientificGraphSlice(directory: string, fingerprint: string, datasetId: string,
  varyingAxis: 0 | 1, fixedIndex: number): Promise<ScientificGraphSlice> {
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source fingerprint changed");
  const dataset = bundle.manifest.datasets.find(item => item.id === datasetId);
  const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!dataset || dataset.semanticType !== "scalar-field" || dataset.shape.length !== 2 ||
      coordinate?.axes.length !== 2 || !dataset.real ||
      dataset.shape.some(size => size < 1 || size > 256) ||
      (varyingAxis !== 0 && varyingAxis !== 1) || dataset.shape[varyingAxis]! < 2 ||
      !Number.isInteger(fixedIndex) || fixedIndex < 0 || fixedIndex >= dataset.shape[1 - varyingAxis]!)
    throw new TypeError("Choose a valid line from a two-dimensional scalar grid.");
  const resource = bundle.manifest.resources.find(item => item.id === dataset.real);
  const buffer = bundle.resources.get(dataset.real);
  if (!resource || !buffer || buffer.length !== dataset.shape[0]! * dataset.shape[1]! * 8)
    throw new Error("Verified scientific grid bytes are missing.");
  const values = Array.from({ length: dataset.shape[varyingAxis]! }, (_, index) =>
    buffer.readDoubleLE((varyingAxis === 0 ? index * dataset.shape[1]! + fixedIndex :
      fixedIndex * dataset.shape[1]! + index) * 8));
  const line = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => line.writeDoubleLE(value, index * 8));
  return { fingerprint, datasetId, varyingAxis, fixedIndex, shape: [dataset.shape[0]!, dataset.shape[1]!],
    resourceSha256: resource.sha256, sliceSha256: createHash("sha256").update(line).digest("hex"), values };
}

/** Return bounded 1D components and 2D descriptors; full grids stay in main. */
export async function openScientificGraphDatasets(directory: string): Promise<ScientificGraphDatasetSource> {
  const bundle = await readScientificSceneBundle(directory);
  const datasets = bundle.manifest.datasets.flatMap<ScientificGraphDatasetSource["datasets"][number]>(dataset => {
    const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
    if (dataset.semanticType === "scalar-field" && dataset.shape.length === 2 &&
        dataset.shape.every(size => size >= 1 && size <= 256) && coordinate?.axes.length === 2 &&
        dataset.shape.some(size => size >= 2))
      return [{ datasetId: dataset.id, component: "scalar" as const,
        shape: [dataset.shape[0]!, dataset.shape[1]!] as [number, number] }];
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
  if (!datasets.length) throw new TypeError("Scientific scene has no supported 1D component or 2D scalar grid for Graphs.");
  return { manifestJson: bundle.manifestJson, fingerprint: bundle.fingerprint, datasets };
}
