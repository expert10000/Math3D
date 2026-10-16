import { readScientificSceneBundle } from "./bundle";

export type ScientificGraphDatasetSource = {
  manifestJson: string;
  fingerprint: string;
  datasets: { datasetId: string; component: string; values: number[] }[];
};

/** Only verified, bounded 1D components cross to the Graph import preview. */
export async function openScientificGraphDatasets(directory: string): Promise<ScientificGraphDatasetSource> {
  const bundle = await readScientificSceneBundle(directory);
  const datasets = bundle.manifest.datasets.flatMap(dataset => {
    const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
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
  if (!datasets.length) throw new TypeError("Scientific scene has no supported 1D scalar, complex or vector dataset with 2–256 samples.");
  return { manifestJson: bundle.manifestJson, fingerprint: bundle.fingerprint, datasets };
}
