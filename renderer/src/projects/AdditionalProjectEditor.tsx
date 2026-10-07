import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { GeometryViewer } from "../components/GeometryViewer";
import type { AdditionalProjectSession } from "./additionalProjectSession";
import { SurfaceFormulaControls } from "./SurfaceFormulaControls";
import "./additionalProjectEditor.css";

export const AdditionalProjectEditor = ({ session, documentTitle, onChange, onClose, children }: { session: AdditionalProjectSession; documentTitle?: string; onChange: () => void; onClose: () => void; children?: React.ReactNode }) => {
  const editorRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const header = editor?.parentElement?.querySelector<HTMLElement>(":scope > header");
    if (!editor || !header) return;
    // Navigation can wrap onto several rows; keep every header action accessible.
    const position = () => { editor.style.top = `${Math.max(0, header.getBoundingClientRect().bottom)}px`; };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(header);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
    };
  }, []);
  const [version, setVersion] = useState(0), [draft, setDraft] = useState(() => session.sourceDraft ?? JSON.stringify(session.document().source, null, 2)), [error, setError] = useState<string | null>(null);
  const updateDraft = (text: string) => { session.sourceDraft = text; setDraft(text); };
  const document = session.document(), history = session.history();
  const { view, viewError } = (() => {
    try { return { view: session.view(), viewError: null }; }
    catch (failure) { return { view: null, viewError: (failure as Error).message }; }
  })();
  const cameraFitCommand = useMemo(() => {
    if (!view?.bounds) return null;
    const { min, max } = view.bounds;
    return { token: version + 1, center: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
      radius: Math.max(0.01, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2) };
  }, [view, version]);
  const action = (fn: () => void) => { try { fn(); updateDraft(JSON.stringify(session.document().source, null, 2)); setError(null); setVersion((v) => v + 1); onChange(); } catch (failure) { setError((failure as Error).message); } };
  return <section ref={editorRef} className="project-source-editor" data-testid="project-source-editor" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} data-document-module={session.original.module}>
    <div className="project-source-toolbar">
      <strong>{documentTitle ?? ("metadata" in document ? document.metadata.title : session.original.module)} · Project {session.original.module === "surface" ? "Surface" : session.original.module}</strong>
      <span data-testid="project-source-revision">Revision {document.identity.revision}</span>
      <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={() => action(() => session.undo())}>Undo document</button>
      <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={() => action(() => session.redo())}>Redo document</button>
      <button data-testid="project-source-back-to-module" title="Open the module workspace; retain this saved document and its source draft in Project" onClick={onClose}>{session.original.module === "surface" ? "Surfaces workspace" : "Back to module"}</button>
      <span>Projects → Save project keeps edits.</span>
    </div>
    <div className="project-source-workspace">
      <div className="project-source-view" data-testid="project-source-view">
        {view && <GeometryViewer key={version} scene={view.scene} meshOverrides={view.meshes} cameraFitCommand={cameraFitCommand} />}
        {viewError && <div role="alert" style={{ padding: 10 }}>Saved dependency unavailable: {viewError}</div>}
      </div>
      <aside className="project-source-inspector" data-testid="project-source-inspector" aria-label="Document inspector">
        <h2>Inspector</h2>
        {document.format === "math3d.surface-document" && <SurfaceFormulaControls key={`${document.identity.revision}:${document.identity.structuralHash}`} document={document} onApply={source => {
          session.commit(source as unknown as import("@math3d/core").CanonicalJsonValue);
          updateDraft(JSON.stringify(session.document().source, null, 2)); setError(null); setVersion(v => v + 1); onChange();
        }} />}
        <details data-testid="project-source-json" style={{ padding: "0 10px 10px" }}><summary>Edit source definition · Advanced JSON</summary>
          <textarea aria-label="Saved source definition" data-testid="project-source-definition" value={draft} onChange={(event) => updateDraft(event.target.value)} rows={12} style={{ width: "100%", boxSizing: "border-box", font: "12px Consolas, monospace" }} />
          <button data-testid="project-source-apply" onClick={() => action(() => session.commit(JSON.parse(draft)))}>Apply source</button>
        </details>
        {error && <div role="alert" style={{ padding: 10 }}>{error}</div>}
        {children}
        {view && <div data-testid="project-source-measurement" style={{ padding: "0 10px 8px", overflowWrap: "anywhere" }}>{view.qualification} · {view.sampleCount} sampled points · bounds {JSON.stringify(view.bounds)}</div>}
      </aside>
    </div>
  </section>;
};
