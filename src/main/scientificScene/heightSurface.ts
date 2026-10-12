import { readScientificSceneBundle, type VerifiedScientificSceneBundle } from "./bundle";

export type ScientificHeightSurface = {
  manifest: VerifiedScientificSceneBundle["manifest"];
  fingerprint: string;
  datasetId: string;
  /** Small, bounded display copy. The verified source bytes stay in Electron. */
  values: number[];
};

const MAX_HEIGHT_SAMPLES = 4096;

function verifiedHeightField(bundle: VerifiedScientificSceneBundle) {
  const { manifest, resources, fingerprint } = bundle;
  const view = manifest.views.find(candidate => candidate.renderer === "height-surface" && candidate.operation === "identity");
  const dataset = manifest.datasets.find(candidate => candidate.id === view?.dataset);
  const coordinate = manifest.coordinates.find(candidate => candidate.id === dataset?.coordinateSystem);
  if (!view || !dataset || !coordinate || dataset.semanticType !== "scalar-field" ||
      dataset.shape.length !== 2 || coordinate.axes.length !== 2 || dataset.imaginary)
    throw new TypeError("Scientific scene has no supported two-dimensional scalar height surface");
  const buffer = resources.get(dataset.real);
  if (!buffer) throw new TypeError("Verified scientific scalar data unavailable");
  if (buffer.length / 8 > MAX_HEIGHT_SAMPLES)
    throw new RangeError("Scientific height surface exceeds the bounded display sample limit");
  return { manifest, fingerprint, dataset, coordinate, buffer };
}

export function adaptVerifiedHeightSurface(bundle: VerifiedScientificSceneBundle): ScientificHeightSurface {
  const { manifest, fingerprint, dataset, buffer } = verifiedHeightField(bundle);
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
  const { manifest, dataset, coordinate, buffer } = verifiedHeightField(bundle);
  if (dataset.id !== datasetId || sampleIndex >= buffer.length / 8)
    throw new RangeError("Scientific sample is outside the verified dataset");
  const [, ny] = dataset.shape;
  const x = Math.floor(sampleIndex / ny), y = sampleIndex % ny;
  return { fingerprint, sceneId: manifest.sceneId, datasetId, sampleIndex,
    grid: [x, y] as [number, number],
    coordinates: [coordinate.origin[0] + x * coordinate.spacing[0],
      coordinate.origin[1] + y * coordinate.spacing[1]] as [number, number],
    coordinateUnits: coordinate.axes.map(axis => axis.unit) as [string, string],
    sampleId: `${manifest.sceneId}:${datasetId}:${sampleIndex}`,
    value: buffer.readDoubleLE(sampleIndex * 8), valueUnit: dataset.quantity.unit };
}
