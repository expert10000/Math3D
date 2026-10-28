import { useEffect, useState } from "react";
import { createScientificDatasetLink, deriveVerifiedScientificScalarVolume,
  inspectGraph2DFieldReference, parseScientificSceneManifest,
  scientificScalarDerivationLabel, scientificScalarDerivationUnit,
  verifyGraph2DScientificVolume,
  type Graph2DScientificVolume, type ScientificCoordinateSystem,
  type ScientificFieldDocument, type ScientificFieldTransfer,
  type VectorField3DAxis, type VectorField3DOverlayRegion } from "@math3d/core";
import { ScientificFieldVolume } from "../graph2d/ScientificFieldVolume";
import { linkedFieldPointStatus, sampleLinkedFieldVolume,
  type LinkedExplorerProbe } from "./linkedFieldProbe";
import { sampleLinkedFieldRegion } from "./linkedFieldRegion";

type VerifiedLayer = Readonly<{ coordinate: ScientificCoordinateSystem;
  volumes: readonly Graph2DScientificVolume[]; label: string; unit: string }>;

/** Render only fresh, independently verified transfers in the shared Explorer viewer. */
export function ScientificExplorerFieldLayer({ document, onOpenDetails, linkedProbe,
  linkedRegion, vectorAxes, linkedVectorReady, linkedVectorStatus }: {
  document: ScientificFieldDocument; onOpenDetails: () => void;
  linkedProbe: LinkedExplorerProbe | null;
  linkedRegion: VectorField3DOverlayRegion | null;
  vectorAxes: readonly [VectorField3DAxis, VectorField3DAxis, VectorField3DAxis];
  linkedVectorReady: boolean; linkedVectorStatus: string;
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
  const axes = layer?.coordinate.axes.map((axis, index) => ({ name: axis.name,
    unit: axis.unit, origin: layer.coordinate.origin[index]!,
    spacing: layer.coordinate.spacing[index]!, count: layer.volumes[0]!.sourceShape[index]! })) ?? [];
  const probeState = linkedProbe && layer ? linkedFieldPointStatus(linkedProbe.point,
    axes, linkedProbe.units) : null;
  let regionSummary: ReturnType<typeof sampleLinkedFieldRegion> | null = null;
  let regionError = "";
  if (linkedRegion?.visible && layer && linkedVectorReady) {
    try { regionSummary = sampleLinkedFieldRegion(linkedRegion, vectorAxes,
      document, layer.volumes); }
    catch (cause) { regionError = cause instanceof Error ? cause.message : String(cause); }
  }
  return <section className="scientific-explorer-field-layer" aria-label={`${document.source.paired ?
    "Complex" : "Scalar"} field layer`} data-testid="scientific-explorer-field-layer">
    <header><h4>{document.metadata.title}</h4>
      <button type="button" onClick={onOpenDetails}>Open field controls</button></header>
    <p role="status">{status}</p>
    {linkedProbe && layer && <div role="status" data-testid="scientific-explorer-linked-probe">
      {probeState === "outside" ? <p>Linked point is outside this field domain. No value is shown.</p> :
        probeState === "incompatible-units" ? <p>Linked point uses incompatible coordinate units.
          Select a point in this field to compare values.</p> : <>
          <p>Linked point {linkedProbe.point.map((value, index) =>
            `${axes[index]!.name} = ${value} ${axes[index]!.unit}`).join(" · ")}.
            Trilinear interpolation on verified bounded samples.</p>
          <p>{layer.volumes.map(volume => `${volume.component} = ${sampleLinkedFieldVolume(volume,
            axes, linkedProbe.point).toPrecision(7)} ${layer.unit}`).join(" · ")}.</p>
          <small>Source {document.source.reference.sceneId} / {document.source.reference.datasetId}
            {" · "}verified samples {layer.volumes.map(volume =>
              `${volume.component}: ${volume.sampleSha256}`).join(" · ")}</small>
        </>}
    </div>}
    {linkedRegion && <section aria-label="Linked physical region"
      data-testid="scientific-explorer-linked-region">
      <h5>Linked physical region</h5>
      <p>{vectorAxes[linkedRegion.normalAxis].label} = {linkedRegion.fixedCoordinate}
        {" "}{vectorAxes[linkedRegion.normalAxis].unit};
        {" "}{([0, 1, 2] as const).filter(axis => axis !== linkedRegion.normalAxis)
          .map((axis, local) => `${vectorAxes[axis].label} ${linkedRegion.bounds[local]![0]}–${
            linkedRegion.bounds[local]![1]} ${vectorAxes[axis].unit}`).join(" · ")}.</p>
      {!linkedRegion.visible ? <p>Region display is hidden.</p> :
        regionSummary ? <div role="status" data-testid="scientific-explorer-linked-region-summary">
          <p>{regionSummary.alignedCount}/{regionSummary.sampleCount} physical positions covered;
            {" "}{regionSummary.outsideAreaPercent.toPrecision(5)}% of the rectangle lies outside this field domain.
            {" "}Gaps mark positions outside the field or without finite samples.</p>
          {regionSummary.components.map(component => <p key={component.name}>
            {component.name} ({regionSummary.unit}): {component.count}/{regionSummary.sampleCount}
            {" "}samples; {component.count ?
              `mean ${component.mean.toPrecision(6)}, min ${component.min.toPrecision(6)}, max ${component.max.toPrecision(6)}` :
              "no value in selected area"}.</p>)}
          <small>Source {regionSummary.source}; verified samples
            {" "}{regionSummary.components.map(component =>
              `${component.name}: ${component.sampleSha256}`).join(" · ")}.</small>
        </div> : <p role={regionError || status.startsWith("Field withheld") ||
          linkedVectorStatus.startsWith("Vector source withheld") ? "alert" : "status"}>
          Region withheld: {regionError || (!linkedVectorReady && linkedVectorStatus) || status}</p>}
    </section>}
    {layer && <div className="scientific-explorer-field-volumes">{layer.volumes.map(volume =>
      <ScientificFieldVolume key={`${volume.component}:${volume.sampleSha256}`} volume={volume}
        coordinate={layer.coordinate} label={`${layer.label} ${volume.component}`}
        unit={layer.unit} transfer={transfer} onApplyTransfer={setTransfer} />)}</div>}
  </section>;
}
