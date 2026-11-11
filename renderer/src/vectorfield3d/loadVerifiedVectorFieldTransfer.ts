import { verifyVectorField3DVolumes, type VectorField3DDocument,
  type VerifiedVectorFieldTransfer } from "@math3d/core";

export const SCIENTIFIC_FIELD_REVERIFY_EVENT = "math3d:field-sources-reverify";

/** Reopen pinned resources through the desktop verifier before using sampled values. */
export async function loadVerifiedVectorFieldTransfer(source: VectorField3DDocument,
  verifier?: Window["scientificScenes"]):
  Promise<VerifiedVectorFieldTransfer> {
  if (source.source.field.kind !== "scientific-bundle")
    throw new TypeError("A scientific vector bundle is required.");
  const bridge = verifier ?? (typeof window !== "undefined" ? window.scientificScenes : undefined);
  if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume ||
      !bridge.closeGraphDataset)
    throw new TypeError("Desktop scientific source verifier is unavailable.");
  const first = source.source.field.references[0];
  const opened = await bridge.openGraphDatasetReference({ locator: first.locator,
    sceneFingerprint: first.sceneFingerprint });
  if (!opened.ok) throw new TypeError(`Saved source ${opened.status}: ${opened.error}`);
  try {
    const transfer = { manifestJson: opened.source.manifestJson,
      fingerprint: opened.source.fingerprint,
      volumes: await bridge.previewVectorVolume({ fingerprint: opened.source.fingerprint,
        datasetId: first.datasetId,
        components: source.source.field.references.map(item => item.component) as
          [string, string, string] }) };
    verifyVectorField3DVolumes(source, transfer.manifestJson, transfer.fingerprint,
      transfer.volumes);
    return transfer;
  } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
}
