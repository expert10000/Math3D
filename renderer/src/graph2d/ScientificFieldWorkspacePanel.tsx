import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { inspectGraph2DFieldReference, parseScientificSceneManifest, reviseScientificFieldDocument,
  verifyGraph2DScientificPlane, verifyGraph2DScientificVolume,
  type Graph2DScientificPlane, type Graph2DScientificVolume, type ScientificCoordinateSystem,
  type Graph2DScientificDatasetPreview, type ScientificFieldDocument, type ScientificFieldDisplay } from "@math3d/core";
import { ScientificFieldPlane } from "./ScientificFieldPlane";
import { ScientificFieldVolume } from "./ScientificFieldVolume";
import { reverifyScientificFieldLine } from "./reverifyScientificFieldLine";

export function ScientificFieldWorkspacePanel({ initialDocument, onSaveDocument, onAddGraphLine,
  isGraphLineImported, onClose, onVerificationStatus }: {
  initialDocument: ScientificFieldDocument;
  onSaveDocument?: (document: ScientificFieldDocument) => void;
  onAddGraphLine?: (preview: Graph2DScientificDatasetPreview) => void;
  isGraphLineImported?: (varyingAxis: 0 | 1, fixedIndex: number) => boolean;
  onClose: () => void;
  onVerificationStatus?: (status: "current" | "changed" | "missing") => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [plane, setPlane] = useState<Graph2DScientificPlane | null>(null);
  const [volume, setVolume] = useState<Graph2DScientificVolume | null>(null);
  const [coordinate, setCoordinate] = useState<ScientificCoordinateSystem | null>(null);
  const [normalAxis, setNormalAxis] = useState<0 | 1 | 2>(initialDocument.source.display.normalAxis ?? 2);
  const [fixedIndex, setFixedIndex] = useState(initialDocument.source.display.fixedIndex ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Not verified on this opening");
  const [varyingAxis, setVaryingAxis] = useState<0 | 1>(initialDocument.source.reference.shape[0]! >= 2 ? 0 : 1);
  const [lineFixedIndex, setLineFixedIndex] = useState(Math.floor(initialDocument.source.reference.shape[1]! / 2));
  const [linePreview, setLinePreview] = useState<Graph2DScientificDatasetPreview | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const [lineStatus, setLineStatus] = useState("Choose a row or column, then preview its Graph line.");
  const epochRef = useRef(0);
  const lineEpochRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const verify = async (current: ScientificFieldDocument, persist = false) => {
    const epoch = ++epochRef.current;
    lineEpochRef.current++; setLinePreview(null); setLineBusy(false);
    setPlane(null); setVolume(null); setCoordinate(null); setError(""); setBusy(true);
    setStatus("Reverifying source before drawing…");
    let fingerprint: string | null = null;
    try {
      const bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewGraphPlane || !bridge.previewGraphVolume)
        throw new Error("Scientific field viewing requires the desktop source verifier.");
      const reference = current.source.reference;
      const opened = await bridge.openGraphDatasetReference({ locator: reference.locator,
        sceneFingerprint: reference.sceneFingerprint });
      if (!opened.ok) throw new Error("Saved source " + opened.status + ": " + opened.error);
      fingerprint = opened.source.fingerprint;
      if (inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current")
        throw new Error("Saved field component, axes, shape or checksum changed.");
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      if (!parsed.ok) throw new Error(parsed.errors.join(" "));
      const dataset = parsed.value.datasets.find(item => item.id === reference.datasetId);
      const axes = parsed.value.coordinates.find(item => item.id === dataset?.coordinateSystem);
      if (!dataset || !axes || dataset.quantity.name !== current.source.quantity.name ||
          dataset.quantity.unit !== current.source.quantity.unit)
        throw new Error("Saved field quantity or coordinate metadata changed.");
      if (current.source.display.view === "plane") {
        const fresh = await bridge.previewGraphPlane({ fingerprint, datasetId: reference.datasetId,
          component: reference.component, normalAxis: current.source.display.normalAxis,
          fixedIndex: current.source.display.fixedIndex });
        const checked = verifyGraph2DScientificPlane(opened.source.manifestJson, fingerprint, fresh);
        if (epochRef.current === epoch) setPlane(checked);
      } else {
        const fresh = await bridge.previewGraphVolume({ fingerprint, datasetId: reference.datasetId,
          component: reference.component });
        const checked = verifyGraph2DScientificVolume(opened.source.manifestJson, fingerprint, fresh);
        if (epochRef.current === epoch) setVolume(checked);
      }
      if (epochRef.current === epoch) {
        setCoordinate(axes); setDocument(current); setStatus("Source verified for this view");
        onVerificationStatus?.("current");
        if (persist) onSaveDocument?.(current);
      }
    } catch (cause) {
      if (epochRef.current === epoch) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message); setStatus("Field withheld: source unavailable or changed");
        onVerificationStatus?.(/missing|not found|ENOENT/i.test(message) ? "missing" : "changed");
      }
    } finally {
      if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (epochRef.current === epoch) setBusy(false);
    }
  };
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    void verify(initialDocument);
    return () => { epochRef.current++; lineEpochRef.current++; previous?.focus(); };
  }, []);
  const apply = (display: ScientificFieldDisplay) => {
    try { void verify(reviseScientificFieldDocument(document, { ...document.source, display }), true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const selectLine = (axis: 0 | 1, index: number) => {
    lineEpochRef.current++; setLinePreview(null); setLineBusy(false);
    setVaryingAxis(axis); setLineFixedIndex(index);
    setLineStatus("Selection changed. Preview the line again.");
  };
  const runLine = async (add: boolean) => {
    if (add && (!linePreview || isGraphLineImported?.(varyingAxis, lineFixedIndex))) {
      setError("Preview an unimported line before adding it to Graphs.");
      return;
    }
    const epoch = ++lineEpochRef.current;
    let sourceVerified = false;
    setLineBusy(true); setError("");
    if (!add) setLinePreview(null);
    setLineStatus(add ? "Reverifying source before adding to Graphs…" : "Reverifying source before preview…");
    try {
      const fresh = await reverifyScientificFieldLine(document, varyingAxis, lineFixedIndex);
      sourceVerified = true;
      if (lineEpochRef.current !== epoch) return;
      if (add) {
        if (fresh.origin.sceneFingerprint !== linePreview!.origin.sceneFingerprint ||
            fresh.origin.resourceSha256 !== linePreview!.origin.resourceSha256 ||
            fresh.origin.slice?.fixedIndex !== linePreview!.origin.slice?.fixedIndex ||
            fresh.origin.slice?.varyingAxis !== linePreview!.origin.slice?.varyingAxis ||
            fresh.rows.some((row, index) => row.x !== linePreview!.rows[index]?.x || row.y !== linePreview!.rows[index]?.y))
          throw new Error("The source changed since preview. Preview the line again before adding it.");
        onAddGraphLine?.(fresh);
        setLinePreview(null);
        setLineStatus(`${fresh.rows.length} verified samples added to Graphs. Select another row or column to continue.`);
      } else {
        setLinePreview(fresh);
        setLineStatus(`${fresh.rows.length} verified samples ready to add to Graphs.`);
      }
      onVerificationStatus?.("current");
    } catch (cause) {
      if (lineEpochRef.current === epoch) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setLinePreview(null); setError(message);
        if (sourceVerified) setLineStatus("Line not added. Preview it again before retrying.");
        else {
          setPlane(null); setVolume(null); setCoordinate(null);
          setLineStatus("Line withheld: source unavailable or changed");
          onVerificationStatus?.(/missing|not found|ENOENT/i.test(message) ? "missing" : "changed");
        }
      }
    } finally { if (lineEpochRef.current === epoch) setLineBusy(false); }
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
  const reference = document.source.reference;
  const label = document.source.quantity.name + " " + reference.component;
  const canExtractLine = reference.semanticType === "scalar-field" && reference.component === "scalar" &&
    reference.shape.length === 2 && (reference.shape[0]! >= 2 || reference.shape[1]! >= 2);
  const fixedAxis = (1 - varyingAxis) as 0 | 1;
  const lineImported = isGraphLineImported?.(varyingAxis, lineFixedIndex) ?? false;
  const linePoints = linePreview?.rows;
  const linePath = linePoints?.length ? (() => {
    const ys = linePoints.map(row => row.y!), min = Math.min(...ys), max = Math.max(...ys);
    const spread = max - min;
    return linePoints.map((row, index) => `${index ? "L" : "M"}${24 + index * 432 / (linePoints.length - 1)},${
      spread ? 130 - (row.y! - min) * 104 / spread : 78}`).join(" ");
  })() : "";
  return createPortal(<div className="vector-field3d-backdrop vector-field2d-backdrop" onPointerDown={event => {
    event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Scientific field workspace"
      onKeyDown={onDialogKey} onPointerDown={event => event.stopPropagation()}
      className="graph2d-scientific-import vector-field3d-editor vector-field2d-editor"
      data-testid="scientific-field-workspace">
      <h3>Scientific field · {document.metadata.title}</h3>
      <p>Project document · {reference.datasetId} · {reference.component} · {reference.shape.join(" × ")} grid.</p>
      <p>Axes: {reference.axes.map(axis => axis.name + " (" + axis.unit + ")").join(" / ")}.
        Quantity: {document.source.quantity.name} ({document.source.quantity.unit}).</p>
      {reference.shape.length === 3 && <div className="vector-field3d-controls" role="group" aria-label="Plane selection">
        <label>Plane normal axis <select value={normalAxis} onChange={event => {
          const axis = Number(event.target.value) as 0 | 1 | 2;
          setNormalAxis(axis); setFixedIndex(Math.floor(reference.shape[axis]! / 2)); }}>
          {[0, 1, 2].map(axis => <option key={axis} value={axis}>{reference.axes[axis]!.name}</option>)}</select></label>
        <label>Plane fixed index <select value={fixedIndex} onChange={event => setFixedIndex(Number(event.target.value))}>
          {Array.from({ length: reference.shape[normalAxis]! }, (_, index) => <option key={index} value={index}>
            {index} · {reference.axes[normalAxis]!.origin + index * reference.axes[normalAxis]!.spacing} {reference.axes[normalAxis]!.unit}
          </option>)}</select></label>
        <button type="button" disabled={busy} onClick={() => apply({ ...document.source.display,
          view: "plane", normalAxis, fixedIndex })}>View verified plane</button>
        <button type="button" disabled={busy} onClick={() => apply({ ...document.source.display,
          view: "volume", normalAxis, fixedIndex })}>View verified volume</button>
      </div>}
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      {plane && coordinate && <ScientificFieldPlane plane={plane} coordinate={coordinate} label={label}
        unit={document.source.quantity.unit} transfer={document.source.display.transfer}
        onApplyTransfer={transfer => apply({ ...document.source.display, transfer })} />}
      {volume && coordinate && <ScientificFieldVolume volume={volume} coordinate={coordinate} label={label}
        unit={document.source.quantity.unit} transfer={document.source.display.transfer}
        onApplyTransfer={transfer => apply({ ...document.source.display, transfer })} />}
      {reference.semanticType === "scalar-field" && reference.shape.length === 3 &&
        <p>Graph row and column extraction is available for saved 2D scalar grids. This 3D field can still show verified planes.</p>}
      {canExtractLine && <section aria-label="Field to Graph line" data-testid="scientific-field-line">
        <h4>Send a row or column to Graphs</h4>
        <label>Line direction <select value={varyingAxis} onChange={event => {
          const axis = Number(event.target.value) as 0 | 1;
          selectLine(axis, Math.floor(reference.shape[1 - axis]! / 2)); }}>
          {reference.shape[0]! >= 2 && <option value={0}>Column · vary {reference.axes[0]!.name}</option>}
          {reference.shape[1]! >= 2 && <option value={1}>Row · vary {reference.axes[1]!.name}</option>}
        </select></label>
        <label>Fixed {reference.axes[fixedAxis]!.name} <select value={lineFixedIndex}
          onChange={event => selectLine(varyingAxis, Number(event.target.value))}>
          {Array.from({ length: reference.shape[fixedAxis]! }, (_, index) => <option key={index} value={index}>
            {index} · {reference.axes[fixedAxis]!.origin + index * reference.axes[fixedAxis]!.spacing} {reference.axes[fixedAxis]!.unit}
          </option>)}</select></label>
        <p>Graph x: {reference.axes[varyingAxis]!.name} ({reference.axes[varyingAxis]!.unit});
          y: {document.source.quantity.name} ({document.source.quantity.unit}).</p>
        <div className="vector-field2d-actions">
          <button type="button" disabled={busy || lineBusy} onClick={() => void runLine(false)}>Preview Graph line</button>
          <button type="button" disabled={busy || lineBusy || !linePreview || lineImported || !onAddGraphLine}
            onClick={() => void runLine(true)}>Add line to Graphs</button>
        </div>
        <p role="status">{lineImported ? "This row or column is already in Graphs." : lineStatus}</p>
        {linePreview && <figure aria-label={`Preview Graph line ${linePreview.label}`}>
          <svg viewBox="0 0 480 156" role="img" aria-label="Verified Graph line preview"
            style={{ width: "100%", maxWidth: 480, height: 156, background: "#f8fbff", border: "1px solid #cbd5e1" }}>
            <path d="M24 130H456 M24 26V130" fill="none" stroke="#94a3b8" />
            <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" />
          </svg>
          <figcaption>{linePreview.rows.length} samples · {linePreview.label} ·
            first ({linePreview.rows[0]?.x}, {linePreview.rows[0]?.y}) ·
            last ({linePreview.rows.at(-1)?.x}, {linePreview.rows.at(-1)?.y})</figcaption>
          <small>Scene {linePreview.origin.sceneFingerprint} · resource {linePreview.origin.resourceSha256}</small>
        </figure>}
      </section>}
      <div className="vector-field2d-actions">
        <button type="button" disabled={busy} onClick={() => void verify(document)}>Reverify field</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>, globalThis.document.body);
}
