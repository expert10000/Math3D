import React, { useMemo, useState } from "react";
import { GeometryViewer } from "../components/GeometryViewer";
import type { AdditionalProjectSession } from "./additionalProjectSession";

export const AdditionalProjectEditor = ({ session, onChange, onClose }: { session: AdditionalProjectSession; onChange: () => void; onClose: () => void }) => {
  const [version, setVersion] = useState(0), [draft, setDraft] = useState(() => JSON.stringify(session.document().source, null, 2)), [error, setError] = useState<string | null>(null);
  const document = session.document(), history = session.history();
  const { view, viewError } = useMemo(() => {
    try { return { view: session.view(), viewError: null }; }
    catch (failure) { return { view: null, viewError: (failure as Error).message }; }
  }, [session, document.identity.revision, document.identity.structuralHash]);
  const cameraFitCommand = useMemo(() => {
    if (!view?.bounds) return null;
    const { min, max } = view.bounds;
    return { token: version + 1, center: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
      radius: Math.max(0.01, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2) };
  }, [view, version]);
  const action = (fn: () => void) => { try { fn(); setDraft(JSON.stringify(session.document().source, null, 2)); setError(null); setVersion((v) => v + 1); onChange(); } catch (failure) { setError((failure as Error).message); } };
  return <section data-testid="project-source-editor" data-document-id={document.identity.id} style={{ position: "fixed", inset: "96px 0 0", zIndex: 2450, background: "#f8fafc", color: "#0f172a", display: "flex", flexDirection: "column", font: "13px system-ui", overflow: "auto" }}>
    <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <strong>{("metadata" in document ? document.metadata.title : session.original.module)} · saved source</strong>
      <span data-testid="project-source-revision">Revision {document.identity.revision}</span>
      <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={() => action(() => session.undo())}>Undo document</button>
      <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={() => action(() => session.redo())}>Redo document</button>
      <button onClick={onClose}>Back to module</button>
      <span>Projects → Save project keeps edits.</span>
    </div>
    <details style={{ padding: "0 10px 10px" }}><summary>Edit source definition</summary>
      <textarea aria-label="Saved source definition" data-testid="project-source-definition" value={draft} onChange={(event) => setDraft(event.target.value)} rows={12} style={{ width: "100%", boxSizing: "border-box", font: "12px Consolas, monospace" }} />
      <button data-testid="project-source-apply" onClick={() => action(() => session.commit(JSON.parse(draft)))}>Apply source</button>
    </details>
    {error && <div role="alert" style={{ padding: 10 }}>{error}</div>}
    {viewError && <div role="alert" style={{ padding: 10 }}>Saved dependency unavailable: {viewError}</div>}
    {view && <><div data-testid="project-source-measurement" style={{ padding: "0 10px 8px", overflowWrap: "anywhere" }}>{view.qualification} · {view.sampleCount} sampled points · bounds {JSON.stringify(view.bounds)}</div>
      <div style={{ flex: 1, minHeight: 200, position: "relative" }}><GeometryViewer key={version} scene={view.scene} meshOverrides={view.meshes} cameraFitCommand={cameraFitCommand} /></div></>}
  </section>;
};
