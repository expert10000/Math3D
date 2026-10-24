import { inspectGraph2DFieldReference, parseScientificSceneManifest, previewGraph2DScientificSlice,
  type Graph2DScientificDatasetPreview, type ScientificFieldDocument } from "@math3d/core";

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphSlice" | "closeGraphDataset">;

/** A saved field never supplies pixels or Graph rows without reopening the original bundle. */
export async function reverifyScientificFieldLine(document: ScientificFieldDocument,
  varyingAxis: 0 | 1, fixedIndex: number,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<Graph2DScientificDatasetPreview> {
  const reference = document.source.reference;
  if (reference.semanticType !== "scalar-field" || reference.component !== "scalar" || reference.shape.length !== 2)
    throw new TypeError("Choose a saved two-dimensional scalar field for a Graph line.");
  if (!bridge?.openGraphDatasetReference || !bridge.previewGraphSlice || !bridge.closeGraphDataset)
    throw new TypeError("Scientific line viewing requires the desktop source verifier.");
  const opened = await bridge.openGraphDatasetReference({ locator: reference.locator,
    sceneFingerprint: reference.sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Saved source ${opened.status}: ${opened.error}`);
  try {
    if (inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current")
      throw new TypeError("Saved field component, axes, shape or checksum changed.");
    const parsed = parseScientificSceneManifest(opened.source.manifestJson);
    if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
    const dataset = parsed.value.datasets.find(item => item.id === reference.datasetId);
    if (!dataset || dataset.quantity.name !== document.source.quantity.name ||
        dataset.quantity.unit !== document.source.quantity.unit)
      throw new TypeError("Saved field quantity metadata changed.");
    const line = await bridge.previewGraphSlice({ fingerprint: opened.source.fingerprint,
      datasetId: reference.datasetId, component: reference.component, varyingAxis, fixedIndex });
    const preview = previewGraph2DScientificSlice(opened.source.manifestJson, opened.source.fingerprint, line);
    if (preview.origin.resourceSha256 !== reference.resourceSha256 ||
        preview.origin.slice?.varyingAxis !== varyingAxis || preview.origin.slice.fixedIndex !== fixedIndex)
      throw new TypeError("Saved field line source or selection changed.");
    return preview;
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
