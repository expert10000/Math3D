import { readScientificSceneBundle } from "./bundle";

export type ScientificGraphDatasetSource = {
  manifestJson: string;
  fingerprint: string;
  datasets: { datasetId: string; values: number[] }[];
};

/** Only verified, bounded 1D scalar resources cross to the Graph import preview. */
export async function openScientificGraphDatasets(directory: string): Promise<ScientificGraphDatasetSource> {
  const bundle = await readScientificSceneBundle(directory);
  const datasets = bundle.manifest.datasets.flatMap(dataset => {
    const coordinate = bundle.manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
    if (dataset.semanticType !== "scalar-field" || dataset.imaginary || dataset.shape.length !== 1 ||
        dataset.shape[0] < 2 || dataset.shape[0] > 256 || coordinate?.axes.length !== 1) return [];
    const buffer = bundle.resources.get(dataset.real);
    if (!buffer || buffer.length !== dataset.shape[0] * 8) throw new Error("Verified scientific dataset bytes are missing.");
    return [{ datasetId: dataset.id, values: Array.from({ length: dataset.shape[0] }, (_, index) => buffer.readDoubleLE(index * 8)) }];
  });
  if (!datasets.length) throw new TypeError("Scientific scene has no supported 1D scalar dataset with 2–256 samples.");
  return { manifestJson: bundle.manifestJson, fingerprint: bundle.fingerprint, datasets };
}
