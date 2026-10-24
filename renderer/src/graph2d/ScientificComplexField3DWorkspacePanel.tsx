import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { inspectGraph2DFieldReference, reviseScientificFieldDocument,
  type Graph2DAuthoringAction, type Graph2DDocument, type ScientificFieldDocument } from "@math3d/core";
import { ScientificComplexVolumeLinesPanel, type ScientificComplexVolumeLineSelection } from
  "./ScientificComplexVolumeLinesPanel";

type Verified = Readonly<{ manifestJson: string; fingerprint: string }>;

export function ScientificComplexField3DWorkspacePanel({ initialDocument, graphDocument,
  onSaveDocument, onAuthoringCommit, onClose, onVerificationStatus }: {
  initialDocument: ScientificFieldDocument; graphDocument: Graph2DDocument;
  onSaveDocument?: (document: ScientificFieldDocument) => void;
  onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
  onClose: () => void; onVerificationStatus?: (status: "current" | "changed" | "missing") => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  const [verified, setVerified] = useState<Verified | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const active = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const paired = document.source.paired;
  const reference = document.source.reference;
  const verify = async () => {
    const current = ++epoch.current;
    setBusy(true); setVerified(null); setError("");
    if (active.current) { await window.scientificScenes?.closeGraphDataset(active.current);
      active.current = null; }
    try {
      if (!paired || !window.scientificScenes?.openGraphDatasetReference)
        throw new TypeError("A saved 3D complex field requires the desktop source verifier.");
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: reference.locator, sceneFingerprint: reference.sceneFingerprint });
      if (!opened.ok) throw new TypeError(`Saved source ${opened.status}: ${opened.error}`);
      if (current !== epoch.current) { await window.scientificScenes.closeGraphDataset(opened.source.fingerprint); return; }
      active.current = opened.source.fingerprint;
      if (inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current" ||
          inspectGraph2DFieldReference(paired.imaginary, opened.source.manifestJson) !== "current")
        throw new TypeError("Saved real/imaginary components, axes, shape or checksums changed.");
      setVerified({ manifestJson: opened.source.manifestJson, fingerprint: opened.source.fingerprint });
      onVerificationStatus?.("current");
    } catch (cause) {
      if (current === epoch.current) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message); setVerified(null);
        onVerificationStatus?.(/missing|ENOENT|not found/i.test(message) ? "missing" : "changed");
      }
      if (active.current) { await window.scientificScenes?.closeGraphDataset(active.current);
        active.current = null; }
    } finally { if (current === epoch.current) setBusy(false); }
  };
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    void verify();
    return () => { epoch.current++;
      if (active.current) void window.scientificScenes?.closeGraphDataset(active.current);
      previous?.focus(); };
  }, []);
  const saveSelection = (line: ScientificComplexVolumeLineSelection) => {
    if (!paired) throw new TypeError("The saved complex pair is unavailable.");
    const next = reviseScientificFieldDocument(document, { ...document.source,
      paired: { ...paired, line }, display: { ...document.source.display,
        view: "plane", normalAxis: line.normalAxis, fixedIndex: line.planeFixedIndex } });
    setDocument(next); onSaveDocument?.(next);
  };
  const onDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled)") ?? []);
    if (event.shiftKey && globalThis.document.activeElement === focusable[0]) {
      event.preventDefault(); focusable.at(-1)?.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === focusable.at(-1)) {
      event.preventDefault(); focusable[0]?.focus();
    }
  };
  return createPortal(<div className="vector-field3d-backdrop vector-field2d-backdrop"
    onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="3D complex field workspace"
      className="graph2d-scientific-import vector-field3d-editor vector-field2d-editor"
      data-testid="scientific-complex-field3d-workspace" onPointerDown={event => event.stopPropagation()}
      onKeyDown={onDialogKey}>
      <h3>{document.metadata.title}</h3>
      <p>Project document · 3D complex field · real and imaginary · {reference.shape.join(" × ")} grid.</p>
      <p>Saved source: {reference.locator.value}</p>
      <p role="status">{busy ? "Reverifying both components…" : verified ?
        "Both source components verified on this opening." : "No verified field is ready."}</p>
      {error && <p role="alert">{error}</p>}
      {verified && paired && <ScientificComplexVolumeLinesPanel
        key={reference.sceneFingerprint} manifestJson={verified.manifestJson}
        fingerprint={verified.fingerprint} locator={reference.locator}
        datasetId={reference.datasetId} shape={reference.shape as [number, number, number]}
        axes={reference.axes as [typeof reference.axes[number], typeof reference.axes[number],
          typeof reference.axes[number]]}
        origin={reference.axes.map(axis => axis.origin) as [number, number, number]}
        spacing={reference.axes.map(axis => axis.spacing) as [number, number, number]}
        document={graphDocument} initialSelection={paired.line}
        onAuthoringCommit={onAuthoringCommit} onSaveWorkspace={saveSelection}
        onVerificationStatus={status => { if (status !== "current") { setVerified(null);
          setError(`Saved source ${status}. Reverify the field before previewing another line.`); }
          onVerificationStatus?.(status); }} />}
      <div className="vector-field2d-actions">
        <button type="button" disabled={busy} onClick={() => void verify()}>Reverify field</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>, globalThis.document.body);
}
