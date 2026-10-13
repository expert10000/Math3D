import { normalizeScientificSceneManifest, type ScientificSceneManifest } from "@math3d/core";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type OpenedScientificHeightSurface = {
  manifest: ScientificSceneManifest;
  fingerprint: string;
  datasetId: string;
  values: number[];
  sourceKind: "bundled" | "external";
};

/** Display-only adapter into the existing GeometryViewer/SurfaceViewer mesh path. */
export function buildScientificHeightMesh(opened: OpenedScientificHeightSurface): SurfaceMeshData & { id: string; color: number } {
  const checked = normalizeScientificSceneManifest(opened.manifest);
  if (!checked.ok || !/^[a-f0-9]{64}$/.test(opened.fingerprint)) throw new TypeError("Invalid scientific surface source");
  const manifest = checked.value;
  const view = manifest.views.find(item => item.renderer === "height-surface" && item.operation === "identity");
  const dataset = manifest.datasets.find(item => item.id === view?.dataset && item.id === opened.datasetId);
  const coordinate = manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  if (!view || !dataset || !coordinate || dataset.shape.length !== 2 || coordinate.axes.length !== 2 ||
      dataset.semanticType !== "scalar-field") throw new TypeError("Unsupported scientific height surface");
  const [nx, ny] = dataset.shape;
  if (opened.values.length !== nx * ny || opened.values.length > 4096 ||
      opened.values.some(value => !Number.isFinite(value))) throw new TypeError("Invalid bounded scientific surface samples");
  const positions = new Float32Array(opened.values.length * 3);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const sample = i * ny + j;
    positions[3 * sample] = coordinate.origin[0] + i * coordinate.spacing[0];
    positions[3 * sample + 1] = coordinate.origin[1] + j * coordinate.spacing[1];
    positions[3 * sample + 2] = opened.values[sample];
  }
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let next = 0;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
    const a = i * ny + j, b = (i + 1) * ny + j, c = a + 1, d = b + 1;
    indices.set([a, b, c, b, d, c], next);
    next += 6;
  }
  return { id: dataset.id, color: 0x4c9fc4, label: view.label, positions, indices,
    source: { kind: "scientificSceneField", sceneId: manifest.sceneId, datasetId: dataset.id,
      fingerprint: opened.fingerprint } };
}
