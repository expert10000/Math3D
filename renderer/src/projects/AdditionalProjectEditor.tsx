import React, { useState } from "react";
import { GeometryViewer } from "../components/GeometryViewer";
import type { AdditionalProjectSession } from "./additionalProjectSession";

export const AdditionalProjectEditor = ({ session, onChange, onClose }: { session: AdditionalProjectSession; onChange: () => void; onClose: () => void }) => {
  const [version, setVersion] = useState(0), [draft, setDraft] = useState(() => JSON.stringify(session.document().source, null, 2)), [error, setError] = useState<string | null>(null);
  const document = session.document(), history = session.history();
  let view: ReturnType<typeof session.view> | null = null, viewError: string | null = null;
  try { view = session.view(); } catch (failure) { viewError = (failure as Error).message; }
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
      <div style={{ flex: 1, minHeight: 200, position: "relative" }}><GeometryViewer key={version} scene={view.scene} meshOverrides={view.meshes} /></div></>}
  </section>;
};
