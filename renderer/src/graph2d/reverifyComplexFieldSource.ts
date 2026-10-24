import { reviewGraph2DComplexPair, verifyGraph2DComplexPairBundle,
  type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";

/** Reopen the original bundle and compare both fresh component slices with the saved Graph lines. */
export async function reverifyComplexFieldSource(document: Graph2DDocument,
  realObjectId: string, imaginaryObjectId: string,
  tables: import("@math3d/core").Graph2DPointTableStore = pointTableStore,
  bridge: Pick<NonNullable<typeof window.scientificScenes>,
    "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphComplexVolumeLines" | "closeGraphDataset"> | undefined =
    typeof window === "undefined" ? undefined : window.scientificScenes): Promise<void> {
  const review = reviewGraph2DComplexPair(document, realObjectId, imaginaryObjectId,
    { sampleCount: 257, closure: "auto" }, tables);
  const scientific = review.target.provenance.graphSource?.scientificSource;
  if (!scientific) return;
  if (!scientific.locator)
    throw new TypeError("The imported grid has no saved bundle location. Reimport the real and imaginary lines from the source before mapping.");
  if (!bridge?.openGraphDatasetReference || !bridge.closeGraphDataset ||
      (scientific.plane ? !bridge.previewGraphComplexVolumeLines : !bridge.previewGraphSlice))
    throw new TypeError("Scientific bundle reverification is unavailable on this device.");
  const opened = await bridge.openGraphDatasetReference({ locator: scientific.locator,
    sceneFingerprint: scientific.sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Scientific bundle ${opened.status}: ${opened.error}`);
  try {
    if (scientific.plane) {
      const lines = await bridge.previewGraphComplexVolumeLines({ fingerprint: opened.source.fingerprint,
        datasetId: scientific.datasetId, normalAxis: scientific.plane.normalAxis,
        planeFixedIndex: scientific.plane.fixedIndex, varyingAxis: scientific.varyingAxis,
        fixedIndex: scientific.fixedIndex });
      verifyGraph2DComplexPairBundle(document, realObjectId, imaginaryObjectId, tables,
        opened.source.manifestJson, opened.source.fingerprint, lines);
    } else {
      const request = { fingerprint: opened.source.fingerprint, datasetId: scientific.datasetId,
        varyingAxis: scientific.varyingAxis as 0 | 1, fixedIndex: scientific.fixedIndex };
      const real = await bridge.previewGraphSlice({ ...request, component: "real" });
      const imaginary = await bridge.previewGraphSlice({ ...request, component: "imaginary" });
      verifyGraph2DComplexPairBundle(document, realObjectId, imaginaryObjectId, tables,
        opened.source.manifestJson, opened.source.fingerprint, [real, imaginary]);
    }
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
