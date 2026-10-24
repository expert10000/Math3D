import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { inspectGraph2DVectorFieldReference, reviseVectorField2DDocument,
  verifyGraph2DScientificVectorPlane, parseScientificSceneManifest,
  type Graph2DScientificPlane, type ScientificCoordinateSystem,
  type VectorField2DDocument, type VectorField2DSource } from "@math3d/core";
import { ScientificFieldVectorPlane } from "./ScientificFieldVectorPlane";

export function VectorField2DPanel({ initialDocument, onSaveDocument, onClose }: {
  initialDocument: VectorField2DDocument;
  onSaveDocument?: (document: VectorField2DDocument) => void;
  onClose: () => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [planes, setPlanes] = useState<readonly [Graph2DScientificPlane, Graph2DScientificPlane] | null>(null);
  const [coordinate, setCoordinate] = useState<ScientificCoordinateSystem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Not verified on this opening");
  const [saveStatus, setSaveStatus] = useState("");
  const requestEpoch = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const verify = async (current: VectorField2DDocument) => {
    const epoch = ++requestEpoch.current;
    setPlanes(null); setCoordinate(null); setError(""); setBusy(true); setStatus("Verifying both components…");
    let activeFingerprint: string | null = null;
    try {
      const bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorPlane)
        throw new Error("2D scientific vector fields require the desktop source verifier.");
      const refs = current.source.reference.components;
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0]!.locator,
        sceneFingerprint: refs[0]!.sceneFingerprint });
      if (!opened.ok) throw new Error("Saved source " + opened.status + ": " + opened.error);
      activeFingerprint = opened.source.fingerprint;
      if (inspectGraph2DVectorFieldReference(current.source.reference, opened.source.manifestJson) !== "current")
        throw new Error("Saved vector components, axes, shape or checksums changed.");
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      if (!parsed.ok) throw new Error(parsed.errors.join(" "));
      const dataset = parsed.value.datasets.find(item => item.id === refs[0]!.datasetId);
      const axes = parsed.value.coordinates.find(item => item.id === dataset?.coordinateSystem);
      if (!dataset || !axes || dataset.quantity.name !== current.source.quantity.name ||
          dataset.quantity.unit !== current.source.quantity.unit)
        throw new Error("Saved vector quantity or coordinate metadata changed.");
      const components: [string, string] = [refs[0]!.component, refs[1]!.component];
      const fresh = await bridge.previewVectorPlane({ fingerprint: activeFingerprint,
        datasetId: refs[0]!.datasetId, components });
      const checked = verifyGraph2DScientificVectorPlane(opened.source.manifestJson, activeFingerprint, fresh);
      if (requestEpoch.current === epoch) {
        setPlanes(checked); setCoordinate(axes);
        setStatus("Both components verified for this preview");
      }
    } catch (cause) {
      if (requestEpoch.current === epoch) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("Arrows withheld: source unavailable or changed");
      }
    } finally {
      if (activeFingerprint) await window.scientificScenes?.closeGraphDataset(activeFingerprint);
      if (requestEpoch.current === epoch) setBusy(false);
    }
  };
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    void verify(initialDocument);
    return () => { requestEpoch.current++; previous?.focus(); };
  }, []);
  const updateDisplay = (display: VectorField2DSource["display"]) => {
    try {
      const next = reviseVectorField2DDocument(document, { ...document.source, display });
      setDocument(next); setSaveStatus(""); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const onDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled)") ?? []);
    if (!focusable.length) return;
    if (event.shiftKey && globalThis.document.activeElement === focusable[0]) {
      event.preventDefault(); focusable.at(-1)?.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === focusable.at(-1)) {
      event.preventDefault(); focusable[0]?.focus();
    }
  };
  const reference = document.source.reference, first = reference.components[0]!, second = reference.components[1]!;
  return createPortal(<div className="vector-field3d-backdrop vector-field2d-backdrop" onPointerDown={event => {
    event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="2D vector field workspace"
      onKeyDown={onDialogKey} onPointerDown={event => event.stopPropagation()}
      className="graph2d-scientific-import vector-field3d-editor vector-field2d-editor"
      data-testid="vector-field-2d-workspace">
      <h3>2D vector field · {document.metadata.title}</h3>
      <p>Project document · {first.datasetId} · {first.component} + {second.component} · {first.shape.join(" × ")} grid.</p>
      <p>Axes: {first.axes.map(axis => axis.name + " (" + axis.unit + ")").join(" / ")}.
        Quantity: {document.source.quantity.name} ({document.source.quantity.unit}).</p>
      <div className="vector-field3d-controls" role="group" aria-label="Arrow display controls">
        {([0, 1] as const).map(axis => <label key={axis}>Density along {first.axes[axis]!.name}
          <input type="number" min="1" max="64" step="1" aria-label={"Density " + first.axes[axis]!.name}
            value={document.source.display.density[axis]} onChange={event => {
              const density = [...document.source.display.density] as [number, number];
              density[axis] = Number(event.target.value);
              updateDisplay({ ...document.source.display, density });
            }} /></label>)}
        <label>Arrow limit <input type="number" min="1" max="512" step="1" aria-label="Arrow limit"
          value={document.source.display.maxGlyphs} onChange={event =>
            updateDisplay({ ...document.source.display, maxGlyphs: Number(event.target.value) })} /></label>
        <label>Magnitude scale <input type="number" min="0.1" max="4" step="0.1" aria-label="Magnitude scale"
          value={document.source.display.magnitudeScale} onChange={event =>
            updateDisplay({ ...document.source.display, magnitudeScale: Number(event.target.value) })} /></label>
      </div>
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      {planes && coordinate && <ScientificFieldVectorPlane planes={planes} coordinate={coordinate}
        label={document.source.quantity.name} unit={document.source.quantity.unit}
        display={document.source.display} />}
      <div className="vector-field2d-actions">
        <button type="button" disabled={busy} onClick={() => void verify(document)}>Reverify arrows</button>
        <button type="button" onClick={() => { onSaveDocument?.(document);
          setSaveStatus("Display settings saved in the Project workspace. Save the Project to retain them."); }}>
          Save view to Project</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {saveStatus && <p role="status">{saveStatus}</p>}
      <small>Values are loaded from the bundle for this session only. Reopening or refreshing verifies both components again.</small>
    </div>
  </div>, globalThis.document.body);
}
