import { inspectGraph2DFieldReference, parseScientificSceneManifest,
  previewGraph2DScientificSlice, previewGraph2DScientificVolumeLine,
  structuralHash,
  type Graph2DScientificDatasetOrigin, type Graph2DScientificDatasetPreview,
  type ScientificFieldDocument } from "@math3d/core";
import { cacheVerifiedScientificFieldResult } from "./verifiedScientificFieldCache";

export type ScientificFieldLineSelection =
  | Readonly<{ kind: "grid2d"; varyingAxis: 0 | 1; fixedIndex: number }>
  | Readonly<{ kind: "plane3d"; normalAxis: 0 | 1 | 2; planeFixedIndex: number;
      varyingAxis: 0 | 1 | 2; fixedIndex: number }>;

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewGraphSlice" | "previewGraphVolumeLine" | "closeGraphDataset">;

export function scientificFieldLineSelectionMatchesSlice(
  selection: ScientificFieldLineSelection, slice: Graph2DScientificDatasetOrigin["slice"]): boolean {
  if (!slice || slice.varyingAxis !== selection.varyingAxis || slice.fixedIndex !== selection.fixedIndex)
    return false;
  if (selection.kind === "grid2d") return !("plane" in slice);
  return "plane" in slice && !!slice.plane && slice.plane.normalAxis === selection.normalAxis &&
    slice.plane.fixedIndex === selection.planeFixedIndex;
}

/** A saved field never supplies Graph rows without reopening and verifying the original bundle. */
export async function reverifyScientificFieldLine(document: ScientificFieldDocument,
  selection: ScientificFieldLineSelection,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<Graph2DScientificDatasetPreview> {
  const reference = document.source.reference;
  if (reference.semanticType !== "scalar-field" || reference.component !== "scalar" ||
      reference.shape.length !== (selection.kind === "grid2d" ? 2 : 3))
    throw new TypeError("Choose a saved scalar field with the requested dimensionality.");
  if (!bridge?.openGraphDatasetReference || !bridge.closeGraphDataset ||
      (selection.kind === "grid2d" ? !bridge.previewGraphSlice : !bridge.previewGraphVolumeLine))
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
    const fresh = selection.kind === "grid2d" ?
      previewGraph2DScientificSlice(opened.source.manifestJson, opened.source.fingerprint,
        await bridge.previewGraphSlice({ fingerprint: opened.source.fingerprint,
          datasetId: reference.datasetId, component: "scalar",
          varyingAxis: selection.varyingAxis, fixedIndex: selection.fixedIndex })) :
      previewGraph2DScientificVolumeLine(opened.source.manifestJson, opened.source.fingerprint,
        await bridge.previewGraphVolumeLine({ fingerprint: opened.source.fingerprint,
          datasetId: reference.datasetId, normalAxis: selection.normalAxis,
          planeFixedIndex: selection.planeFixedIndex,
          varyingAxis: selection.varyingAxis, fixedIndex: selection.fixedIndex }));
    if (fresh.origin.resourceSha256 !== reference.resourceSha256 ||
        !scientificFieldLineSelectionMatchesSlice(selection, fresh.origin.slice))
      throw new TypeError("Saved field line source or selection changed.");
    return cacheVerifiedScientificFieldResult(document,
      { kind: "scalar-graph-line/v1", selection },
      structuralHash({ origin: fresh.origin, rows: fresh.rows }), () => fresh);
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
