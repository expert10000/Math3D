import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { canonicalJsonStringify, createGraph2DFieldReference, inspectGraph2DFieldReference,
  reviewScientificComplexField3DRelink, reviseScientificFieldDocument,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DFieldLocator,
  type ScientificFieldDocument } from "@math3d/core";
import { ScientificComplexVolumeLinesPanel, type ScientificComplexVolumeLineSelection } from
  "./ScientificComplexVolumeLinesPanel";

type Verified = Readonly<{ manifestJson: string; fingerprint: string }>;
type Replacement = Readonly<{ manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator;
  datasets: readonly Readonly<{ datasetId: string; component: string;
    shape: readonly number[] }>[] }>;

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
  const [replacement, setReplacement] = useState<Readonly<{ source: Replacement; datasetId: string }> | null>(null);
  const [relinkError, setRelinkError] = useState("");
  const [relinkBusy, setRelinkBusy] = useState(false);
  const epoch = useRef(0);
  const active = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const paired = document.source.paired;
  const reference = document.source.reference;
  const replacementDatasets = replacement ? [...new Set(replacement.source.datasets.filter(item =>
    item.shape.length === 3 && item.component === "real" &&
    replacement.source.datasets.some(other => other.datasetId === item.datasetId &&
      other.component === "imaginary" && other.shape.length === 3)).map(item => item.datasetId))] : [];
  const candidate = (() => {
    if (!replacement) return null;
    try {
      return { real: createGraph2DFieldReference(replacement.source.manifestJson,
        replacement.source.fingerprint, replacement.source.locator, replacement.datasetId, "real"),
      imaginary: createGraph2DFieldReference(replacement.source.manifestJson,
        replacement.source.fingerprint, replacement.source.locator, replacement.datasetId, "imaginary") };
    } catch { return null; }
  })();
  const review = candidate ? reviewScientificComplexField3DRelink(document,
    candidate.real, candidate.imaginary) : null;
  const verify = async (currentDocument: ScientificFieldDocument = document) => {
    const current = ++epoch.current;
    setBusy(true); setVerified(null); setError("");
    if (active.current) { await window.scientificScenes?.closeGraphDataset(active.current);
      active.current = null; }
    try {
      if (!currentDocument.source.paired || !window.scientificScenes?.openGraphDatasetReference)
        throw new TypeError("A saved 3D complex field requires the desktop source verifier.");
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: currentDocument.source.reference.locator,
        sceneFingerprint: currentDocument.source.reference.sceneFingerprint });
      if (!opened.ok) throw new TypeError(`Saved source ${opened.status}: ${opened.error}`);
      if (current !== epoch.current) { await window.scientificScenes.closeGraphDataset(opened.source.fingerprint); return; }
      active.current = opened.source.fingerprint;
      if (inspectGraph2DFieldReference(currentDocument.source.reference, opened.source.manifestJson) !== "current" ||
          inspectGraph2DFieldReference(currentDocument.source.paired.imaginary, opened.source.manifestJson) !== "current")
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
    void verify(initialDocument);
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
  const chooseReplacement = async () => {
    if (!window.scientificScenes?.chooseGraphDatasetRelink || relinkBusy) return;
    setRelinkBusy(true); setRelinkError(""); setReplacement(null);
    try {
      const picked = await window.scientificScenes.chooseGraphDatasetRelink();
      if (!picked.ok) {
        if (!picked.canceled) setRelinkError(picked.error);
        return;
      }
      const ids = [...new Set(picked.source.datasets.filter(item => item.shape.length === 3 &&
        item.component === "real" && picked.source.datasets.some(other =>
          other.datasetId === item.datasetId && other.component === "imaginary" &&
          other.shape.length === 3)).map(item => item.datasetId))];
      if (!ids.length) throw new TypeError("Replacement has no complete 3D real/imaginary field.");
      setReplacement({ source: picked.source,
        datasetId: ids.includes(reference.datasetId) ? reference.datasetId : ids[0]! });
    } catch (cause) { setRelinkError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRelinkBusy(false); }
  };
  const acceptReplacement = async () => {
    if (!replacement || !candidate || !review?.eligible || !onSaveDocument ||
        !window.scientificScenes?.openGraphDatasetReference || relinkBusy) return;
    setRelinkBusy(true); setRelinkError(""); setVerified(null);
    try {
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: replacement.source.locator, sceneFingerprint: replacement.source.fingerprint });
      if (!opened.ok) throw new TypeError(`Replacement ${opened.status}: ${opened.error}`);
      let next: ScientificFieldDocument | null = null;
      try {
        const freshReal = createGraph2DFieldReference(opened.source.manifestJson,
          opened.source.fingerprint, opened.source.locator, replacement.datasetId, "real");
        const freshImaginary = createGraph2DFieldReference(opened.source.manifestJson,
          opened.source.fingerprint, opened.source.locator, replacement.datasetId, "imaginary");
        if (canonicalJsonStringify(freshReal) !== canonicalJsonStringify(candidate.real) ||
            canonicalJsonStringify(freshImaginary) !== canonicalJsonStringify(candidate.imaginary) ||
            !reviewScientificComplexField3DRelink(document, freshReal, freshImaginary).eligible)
          throw new TypeError("Replacement changed since review. Choose and review it again.");
        next = reviseScientificFieldDocument(document, { ...document.source,
          reference: { ...freshReal, id: reference.id }, paired: { imaginary: {
            ...freshImaginary, id: paired!.imaginary.id }, line: paired!.line } });
      } finally { await window.scientificScenes.closeGraphDataset(opened.source.fingerprint); }
      if (!next) throw new TypeError("Replacement document was not created.");
      onSaveDocument(next); setDocument(next); setReplacement(null);
      await verify(next);
    } catch (cause) {
      setRelinkError(cause instanceof Error ? cause.message : String(cause));
      setReplacement(null);
    } finally { setRelinkBusy(false); }
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
      <section aria-label="Relink 3D complex field" data-testid="scientific-complex-field3d-relink">
        <h4>Replacement bundle</h4>
        <p>Choose a moved .sscene bundle. Both component checksums, axes, shape and the saved line coordinates must match.</p>
        <button type="button" disabled={busy || relinkBusy}
          onClick={() => void chooseReplacement()}>Choose replacement bundle</button>
        {relinkError && <p role="alert">{relinkError}</p>}
        {replacement && <div role="group" aria-label="Review 3D complex replacement">
          <p>Verified candidate: {replacement.source.locator.value}</p>
          <label>Replacement complex dataset <select aria-label="Replacement complex dataset"
            value={replacement.datasetId} disabled={relinkBusy}
            onChange={event => setReplacement({ ...replacement, datasetId: event.target.value })}>
            {replacementDatasets.map(id => <option key={id} value={id}>{id}</option>)}
          </select></label>
          {review ? <>
            <p role="status">{review.eligible ? "Both components and saved coordinates match. Relink is ready." :
              "Replacement does not match both saved components and coordinates."}</p>
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              <table><thead><tr><th scope="col">Field</th><th scope="col">Saved</th>
                <th scope="col">Replacement</th><th scope="col">Result</th></tr></thead>
                <tbody>{review.differences.filter(entry => entry.required || !entry.matches).map(entry =>
                  <tr key={entry.field}><th scope="row">{entry.field}</th>
                    <td style={{ overflowWrap: "anywhere" }}>{entry.saved}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{entry.replacement}</td>
                    <td>{entry.matches ? "Matches" : entry.required ? "Mismatch" : "Changed"}</td>
                  </tr>)}</tbody>
              </table>
            </div>
          </> : <p role="alert">This bundle has no valid 3D complex pair.</p>}
          <div className="vector-field2d-actions">
            <button type="button" disabled={relinkBusy || !review?.eligible || !onSaveDocument}
              onClick={() => void acceptReplacement()}>Accept verified replacement</button>
            <button type="button" disabled={relinkBusy} onClick={() => setReplacement(null)}>Cancel replacement</button>
          </div>
        </div>}
      </section>
      <div className="vector-field2d-actions">
        <button type="button" disabled={busy || relinkBusy} onClick={() => void verify()}>Reverify field</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>, globalThis.document.body);
}
