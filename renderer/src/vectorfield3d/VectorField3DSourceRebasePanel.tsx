import { useState } from "react";
import { createGraph2DFieldReference, reviseVectorField3DDocument,
  verifyVectorField3DVolumes, type Math3DProject, type VectorField3DDocument,
  type VerifiedVectorFieldTransfer } from "@math3d/core";

/** The user explicitly chooses replacement bytes before any saved recipe pins move. */
export function VectorField3DSourceRebasePanel({ document, project, onRebase }: {
  document: VectorField3DDocument;
  project: Math3DProject | null | undefined;
  onRebase?: (replacement: VectorField3DDocument,
    transfer: VerifiedVectorFieldTransfer) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saved = project?.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === document.identity.id)?.checkpoint;
  if (saved?.format !== "math3d.vector-field3d-document" ||
      saved.source.field.kind !== "scientific-bundle" ||
      !project?.workspace.derivedFields?.some(field =>
        field.input.documentId === saved.identity.id) || !onRebase) return null;
  const rebase = async () => {
    setError(""); setMessage(""); setBusy(true);
    let fingerprint: string | null = null;
    try {
      const bridge = window.scientificScenes;
      if (!bridge?.chooseGraphDatasetRelink || !bridge.openGraphDatasetReference ||
          !bridge.previewVectorVolume ||
          !bridge.closeGraphDataset)
        throw new TypeError("Desktop scientific source picker is unavailable.");
      const chosen = await bridge.chooseGraphDatasetRelink();
      if (!chosen.ok) {
        if (!chosen.canceled) throw new TypeError(chosen.error);
        return;
      }
      fingerprint = chosen.source.fingerprint;
      const opened = await bridge.openGraphDatasetReference({ locator: chosen.source.locator,
        sceneFingerprint: chosen.source.fingerprint });
      if (!opened.ok) throw new TypeError(`Replacement ${opened.status}: ${opened.error}`);
      if (saved.source.field.kind !== "scientific-bundle") throw new TypeError("Saved source changed.");
      const refs = saved.source.field.references;
      const references = refs.map(ref => createGraph2DFieldReference(
        chosen.source.manifestJson, chosen.source.fingerprint, chosen.source.locator,
        ref.datasetId, ref.component)) as unknown as typeof refs;
      if (refs.every((ref, index) => ref.resourceSha256 === references[index]!.resourceSha256))
        throw new TypeError("Replacement must contain different verified source bytes.");
      const replacement = reviseVectorField3DDocument(saved, { ...saved.source,
        field: { ...saved.source.field, references } });
      const volumes = await bridge.previewVectorVolume({ fingerprint,
        datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const transfer = { manifestJson: chosen.source.manifestJson, fingerprint, volumes };
      verifyVectorField3DVolumes(replacement, transfer.manifestJson,
        transfer.fingerprint, transfer.volumes);
      onRebase(replacement, transfer);
      setMessage("Rebased the saved source and derived recipes. Refresh the Graph row explicitly.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); }
  };
  return <section aria-label="Derived source rebase" data-testid="gf26-source-rebase">
    <h5>Replacement source</h5>
    <p>Choose a verified bundle with the same physical grid and units. This advances the
      saved source and recipe generations; Graph values stay withheld until refresh.</p>
    <button type="button" disabled={busy} onClick={() => void rebase()}>
      Choose replacement and rebase recipes</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
