import { canonicalJsonStringify, createGraph2DFieldReference, parseScientificSceneManifest,
  previewGraph2DScientificVolumeLine, type Graph2DScientificDatasetPreview,
  type VectorField3DDocument } from "@math3d/core";
import { scientificFieldLineSelectionMatchesSlice } from "../graph2d/reverifyScientificFieldLine";

export type VectorField3DGraphLineSelection = Readonly<{
  component: string; normalAxis: 0 | 1 | 2; planeFixedIndex: number;
  varyingAxis: 0 | 1 | 2; fixedIndex: number;
}>;

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphVectorVolumeLine" | "closeGraphDataset">;

export function vectorField3DGraphLineMatches(selection: VectorField3DGraphLineSelection,
  origin: Graph2DScientificDatasetPreview["origin"] | undefined): boolean {
  return origin?.component === selection.component && scientificFieldLineSelectionMatchesSlice({
    kind: "plane3d", normalAxis: selection.normalAxis, planeFixedIndex: selection.planeFixedIndex,
    varyingAxis: selection.varyingAxis, fixedIndex: selection.fixedIndex }, origin.slice);
}

/** Every preview and import reopens the saved source and verifies all three vector resources. */
export async function reverifyVectorField3DGraphLine(document: VectorField3DDocument,
  selection: VectorField3DGraphLineSelection,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<Graph2DScientificDatasetPreview> {
  const field = document.source.field;
  if (field.kind !== "scientific-bundle" || !field.references.some(ref => ref.component === selection.component))
    throw new TypeError("Choose a component of a saved scientific 3D vector field.");
  if (!bridge?.openGraphDatasetReference || !bridge.previewGraphVectorVolumeLine || !bridge.closeGraphDataset)
    throw new TypeError("3D vector line viewing requires the desktop source verifier.");
  const refs = field.references, first = refs[0];
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok) throw new Error(`Saved vector source ${opened.status}: ${opened.error}`);
  try {
    const manifest = parseScientificSceneManifest(opened.source.manifestJson);
    if (!manifest.ok) throw new TypeError(manifest.errors.join(" "));
    const dataset = manifest.value.datasets.find(item => item.id === first.datasetId);
    const selectedIndex = refs.findIndex(ref => ref.component === selection.component);
    if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
        dataset.components?.length !== 3 || dataset.quantity.unit !== field.componentUnits[selectedIndex])
      throw new TypeError("Saved vector components or units changed.");
    refs.forEach(saved => {
      const fresh = createGraph2DFieldReference(opened.source.manifestJson, opened.source.fingerprint,
        saved.locator, saved.datasetId, saved.component);
      if (canonicalJsonStringify(saved) !== canonicalJsonStringify(fresh))
        throw new TypeError(`Saved vector source changed for component ${saved.component}.`);
    });
    const line = await bridge.previewGraphVectorVolumeLine({ fingerprint: opened.source.fingerprint,
      datasetId: first.datasetId, components: refs.map(ref => ref.component) as [string, string, string],
      component: selection.component, normalAxis: selection.normalAxis,
      planeFixedIndex: selection.planeFixedIndex, varyingAxis: selection.varyingAxis,
      fixedIndex: selection.fixedIndex });
    const preview = previewGraph2DScientificVolumeLine(opened.source.manifestJson,
      opened.source.fingerprint, line);
    const selected = refs.find(ref => ref.component === selection.component)!;
    if (preview.origin.resourceSha256 !== selected.resourceSha256 ||
        !vectorField3DGraphLineMatches(selection, preview.origin))
      throw new TypeError("Saved vector line source or selection changed.");
    return { ...preview, origin: { ...preview.origin, locator: selected.locator } };
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
