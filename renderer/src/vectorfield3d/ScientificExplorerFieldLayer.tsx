import { useEffect, useState } from "react";
import { createScientificDatasetLink, deriveVerifiedScientificScalarVolume,
  inspectGraph2DFieldReference, parseScientificSceneManifest,
  scientificScalarDerivationLabel, scientificScalarDerivationUnit,
  verifyGraph2DScientificVolume,
  type Graph2DScientificVolume, type ScientificCoordinateSystem,
  type ScientificFieldDocument, type ScientificFieldTransfer } from "@math3d/core";
import { ScientificFieldVolume } from "../graph2d/ScientificFieldVolume";

type VerifiedLayer = Readonly<{ coordinate: ScientificCoordinateSystem;
  volumes: readonly Graph2DScientificVolume[]; label: string; unit: string }>;

/** Render only fresh, independently verified transfers in the shared Explorer viewer. */
export function ScientificExplorerFieldLayer({ document, onOpenDetails }: {
  document: ScientificFieldDocument; onOpenDetails: () => void;
}) {
  const [layer, setLayer] = useState<VerifiedLayer | null>(null);
  const [status, setStatus] = useState("Verifying source before drawing…");
  const [transfer, setTransfer] = useState<ScientificFieldTransfer>(document.source.display.transfer);
  useEffect(() => {
    let active = true;
    let fingerprint: string | null = null;
    setLayer(null); setStatus("Verifying source before drawing…");
    setTransfer(document.source.display.transfer);
    const verify = async () => {
      try {
        const bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference || !bridge.previewGraphVolume)
          throw new Error("Scientific field viewing requires the desktop source verifier.");
        const references = document.source.paired ?
          [document.source.reference, document.source.paired.imaginary] : [document.source.reference];
        createScientificDatasetLink(references);
        const opened = await bridge.openGraphDatasetReference({
          locator: references[0]!.locator, sceneFingerprint: references[0]!.sceneFingerprint });
        if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        if (references.some(reference => inspectGraph2DFieldReference(reference,
          opened.source.manifestJson) !== "current"))
          throw new Error("Saved field components, axes, shape or checksums changed.");
        const parsed = parseScientificSceneManifest(opened.source.manifestJson);
        if (!parsed.ok) throw new Error(parsed.errors.join(" "));
        const dataset = parsed.value.datasets.find(item => item.id === references[0]!.datasetId);
        const coordinate = parsed.value.coordinates.find(item => item.id === dataset?.coordinateSystem);
        if (!dataset || !coordinate || dataset.quantity.name !== document.source.quantity.name ||
            dataset.quantity.unit !== document.source.quantity.unit)
          throw new Error("Saved field quantity or coordinate metadata changed.");
        const volumes: Graph2DScientificVolume[] = [];
        for (const reference of references) {
          const fresh = await bridge.previewGraphVolume({ fingerprint: opened.source.fingerprint,
            datasetId: reference.datasetId, component: reference.component });
          const checked = verifyGraph2DScientificVolume(opened.source.manifestJson,
            opened.source.fingerprint, fresh);
          volumes.push(document.source.derivation ? deriveVerifiedScientificScalarVolume(document,
            opened.source.manifestJson, opened.source.fingerprint, checked).volume : checked);
        }
        if (active) {
          setLayer({ coordinate, volumes,
            label: document.source.derivation ? scientificScalarDerivationLabel(document) :
              document.source.quantity.name,
            unit: document.source.derivation ? scientificScalarDerivationUnit(document) :
              document.source.quantity.unit });
          setStatus(`Verified ${volumes.length} bounded ${volumes.length === 1 ? "component" : "components"}`);
        }
      } catch (error) {
        if (active) { setLayer(null); setStatus(`Field withheld: ${error instanceof Error ?
          error.message : String(error)}`); }
      } finally {
        if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      }
    };
    void verify();
    return () => { active = false; };
  }, [document.identity.id, document.identity.structuralHash]);
  return <section className="scientific-explorer-field-layer" aria-label={`${document.source.paired ?
    "Complex" : "Scalar"} field layer`} data-testid="scientific-explorer-field-layer">
    <header><h4>{document.metadata.title}</h4>
      <button type="button" onClick={onOpenDetails}>Open field controls</button></header>
    <p role="status">{status}</p>
    {layer && <div className="scientific-explorer-field-volumes">{layer.volumes.map(volume =>
      <ScientificFieldVolume key={`${volume.component}:${volume.sampleSha256}`} volume={volume}
        coordinate={layer.coordinate} label={`${layer.label} ${volume.component}`}
        unit={layer.unit} transfer={transfer} onApplyTransfer={setTransfer} />)}</div>}
  </section>;
}
