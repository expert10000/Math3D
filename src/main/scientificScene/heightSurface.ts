import { readScientificSceneBundle, type VerifiedScientificSceneBundle } from "./bundle";

export type ScientificHeightSurface = {
  manifest: VerifiedScientificSceneBundle["manifest"];
  fingerprint: string;
  datasetId: string;
  /** Small, bounded display copy. The verified source bytes stay in Electron. */
  values: number[];
};

export function adaptVerifiedHeightSurface(bundle: VerifiedScientificSceneBundle): ScientificHeightSurface {
  const { manifest, resources, fingerprint } = bundle;
  const view = manifest.views.find(candidate => candidate.renderer === "height-surface" && candidate.operation === "identity");
  const dataset = manifest.datasets.find(candidate => candidate.id === view?.dataset);
  const coordinate = manifest.coordinates.find(candidate => candidate.id === dataset?.coordinateSystem);
  if (!view || !dataset || !coordinate || dataset.semanticType !== "scalar-field" ||
      dataset.shape.length !== 2 || coordinate.axes.length !== 2 || dataset.imaginary)
    throw new TypeError("Scientific scene has no supported two-dimensional scalar height surface");
  const buffer = resources.get(dataset.real);
  if (!buffer) throw new TypeError("Verified scientific scalar data unavailable");
  const values = Array.from({ length: buffer.length / 8 }, (_, index) => buffer.readDoubleLE(index * 8));
  return { manifest, fingerprint, datasetId: dataset.id, values };
}

export async function openScientificHeightSurface(directory: string): Promise<ScientificHeightSurface> {
  return adaptVerifiedHeightSurface(await readScientificSceneBundle(directory));
}

export async function inspectScientificHeightSample(directory: string, fingerprint: string,
  datasetId: string, sampleIndex: number) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(sampleIndex) || sampleIndex < 0)
    throw new TypeError("Invalid scientific sample request");
  const bundle = await readScientificSceneBundle(directory);
  if (bundle.fingerprint !== fingerprint) throw new Error("Scientific source changed since it was opened");
  const surface = adaptVerifiedHeightSurface(bundle);
  if (surface.datasetId !== datasetId || sampleIndex >= surface.values.length)
    throw new RangeError("Scientific sample is outside the verified dataset");
  const dataset = surface.manifest.datasets.find(candidate => candidate.id === datasetId)!;
  const coordinate = surface.manifest.coordinates.find(candidate => candidate.id === dataset.coordinateSystem)!;
  const [nx, ny] = dataset.shape;
  const x = Math.floor(sampleIndex / ny), y = sampleIndex % ny;
  return { fingerprint, sceneId: surface.manifest.sceneId, datasetId, sampleIndex,
    grid: [x, y] as [number, number],
    coordinates: [coordinate.origin[0] + x * coordinate.spacing[0],
      coordinate.origin[1] + y * coordinate.spacing[1]] as [number, number],
    coordinateUnits: coordinate.axes.map(axis => axis.unit) as [string, string],
    value: surface.values[sampleIndex], valueUnit: dataset.quantity.unit };
}
