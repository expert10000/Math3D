import { canonicalJsonStringify, createGraph2DFieldReference,
  parseScientificSceneManifest,
  parseVectorField3DDocument,
  scientificCoordinateIndex,
  type Graph2DDerivedFieldOrigin, type VectorField3DDerivedLine } from "@math3d/core";
import { cachedVerifiedVectorField3DDerivedLine } from "./verifiedDerivedResultCache";

type ScientificBridge = Pick<NonNullable<typeof window.scientificScenes>,
  "openGraphDatasetReference" | "previewVectorSamples" | "previewVectorVolume" | "closeGraphDataset">;

/** Reopen all three saved components and recompute the line from verified source samples. */
export async function reverifyVectorField3DDerivedLine(origin: Graph2DDerivedFieldOrigin,
  bridge: ScientificBridge | undefined = typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<VectorField3DDerivedLine> {
  const document = parseVectorField3DDocument(origin.sourceDocumentJson), field = document.source.field;
  if (field.kind !== "scientific-bundle" || !bridge?.openGraphDatasetReference ||
    !bridge.previewVectorSamples || !bridge.previewVectorVolume || !bridge.closeGraphDataset)
    throw new TypeError("Derived line requires a saved scientific source and desktop verifier.");
  const refs = field.references, first = refs[0];
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok) throw new Error(`Saved vector source ${opened.status}: ${opened.error}`);
  try {
    const manifest = parseScientificSceneManifest(opened.source.manifestJson);
    if (!manifest.ok) throw new TypeError(manifest.errors.join(" "));
    for (const saved of refs) {
      const fresh = createGraph2DFieldReference(opened.source.manifestJson,
        opened.source.fingerprint, saved.locator, saved.datasetId, saved.component);
      if (canonicalJsonStringify(saved) !== canonicalJsonStringify(fresh))
        throw new TypeError(`Saved vector source changed for component ${saved.component}.`);
    }
    const normalAxis = origin.normalAxis;
    const fixedIndex = scientificCoordinateIndex({ ...first.axes[normalAxis]!, count: first.shape[normalAxis]! },
      origin.fixedCoordinate);
    const scientific = manifest.value.schema === "scientific-scene/v1" ?
      { manifestJson: opened.source.manifestJson, fingerprint: opened.source.fingerprint,
        volumes: await bridge.previewVectorVolume({ fingerprint: opened.source.fingerprint,
          datasetId: first.datasetId, components: refs.map(ref => ref.component) as [string, string, string] }) } :
      { manifestJson: opened.source.manifestJson, fingerprint: opened.source.fingerprint,
        samples: await bridge.previewVectorSamples({ fingerprint: opened.source.fingerprint,
          datasetId: first.datasetId, components: refs.map(ref => ref.component) as [string, string, string],
          selection: { kind: manifest.value.schema === "scientific-scene/v3" &&
            origin.stencilGrid === "source" ?
            "source-stencil-slice" : "stencil-slice", normalAxis, fixedIndex } }) };
    const fresh = cachedVerifiedVectorField3DDerivedLine(document, normalAxis,
      origin.fixedCoordinate, origin.operation, origin.varyingAxis,
      origin.profileFixedCoordinate, scientific);
    if (canonicalJsonStringify(fresh.origin) !== canonicalJsonStringify(origin))
      throw new TypeError("Derived line source, selection, or verified sample hashes changed.");
    return fresh;
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
