import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CanonicalJsonValue } from "@math3d/core";
import type { CameraSyncState } from "../components/SurfaceViewer";
import type { AdditionalProjectSession } from "../projects/additionalProjectSession";
import { SurfaceFormulaControls } from "../projects/SurfaceFormulaControls";
import { DocumentWorkspaceHost } from "./DocumentWorkspaceHost";
import { DocumentViewport } from "./DocumentViewport";
import { surfaceDocumentBinding } from "./surfaceDocumentBinding";
import { documentPresentationKey, readDocumentPresentation, saveDocumentPresentation } from "./documentPresentation";

export function SavedDocumentWorkbench({ session, workspaceVersion, projectId, projectTitle, documentTitle, related, onOpenRelated, onChange, onClose, onOpenProject, children }:
  { session: AdditionalProjectSession; workspaceVersion: number; projectId?: string; projectTitle?: string; documentTitle?: string;
    related?: ReturnType<typeof import("./relatedDocuments").relatedDocuments>; onOpenRelated?: (id: string, module: import("@math3d/core").KernelWorkspaceModule) => void;
    onChange: () => void; onClose: () => void; onOpenProject: () => void; children?: React.ReactNode }) {
  const uiKey = documentPresentationKey(projectId ?? "project", session.original.expected.id);
  const [version, setVersion] = useState(0), [draft, setDraft] = useState(() => session.sourceDraft ?? JSON.stringify(session.document().source, null, 2));
  const [error, setError] = useState<string | null>(null), [presentation, setPresentation] = useState(session.presentation);
  const [wireframe, setWireframe] = useState(session.wireframe), [probe, setProbe] = useState(false), [probeResult, setProbeResult] = useState<unknown>(null);
  const document = session.document(), history = session.history();
  useEffect(() => {
    if (!projectId || session.presentationLoaded) return;
    const ui = readDocumentPresentation(localStorage.getItem(uiKey));
    session.presentation = ui.presentation; session.wireframe = ui.wireframe; session.camera = ui.camera; session.presentationLoaded = true;
    setPresentation(ui.presentation); setWireframe(ui.wireframe); setVersion(value => value + 1);
  }, [session, projectId, uiKey]);
  const prepared = useMemo(() => {
    try { return { view: session.view(), binding: document.format === "math3d.surface-document" ? surfaceDocumentBinding(document) : null, error: null }; }
    catch (failure) { return { view: null, binding: null, error: (failure as Error).message }; }
  }, [session, document, workspaceVersion]);
  const rememberCamera = useCallback((camera: CameraSyncState) => { session.camera = camera; }, [session]);
  useEffect(() => {
    const save = () => session.presentationLoaded && saveDocumentPresentation(uiKey, { presentation: session.presentation, wireframe: session.wireframe, camera: session.camera });
    save(); window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  }, [session, uiKey, presentation, wireframe]);
  const updateDraft = (text: string) => { session.sourceDraft = text; setDraft(text); };
  const changed = () => { setVersion(value => value + 1); };
  const action = (fn: () => void) => {
    try { fn(); updateDraft(JSON.stringify(session.document().source, null, 2)); setError(null); changed(); onChange(); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <DocumentWorkspaceHost documentId={document.identity.id} sourceHash={document.identity.structuralHash} module={session.original.module}
    toolbar={<>
      <button data-testid="document-project-open" onClick={onOpenProject}>Project overview</button>
      <strong data-testid="document-breadcrumb">{projectTitle ?? "Project"} → {session.original.module === "surface" ? "Surface" : session.original.module} → {documentTitle ?? ("metadata" in document ? document.metadata.title : session.original.module)}</strong>
      <span data-testid="project-source-revision">Revision {document.identity.revision}</span>
      <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={() => action(() => session.undo())}>Undo document</button>
      <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={() => action(() => session.redo())}>Redo document</button>
      {prepared.binding && <label>View <select data-testid="document-view-choice" value={presentation} onChange={event => { session.presentation = event.target.value as typeof presentation; setPresentation(session.presentation); setProbe(false); setProbeResult(null); changed(); }}><option value="surface">Surface</option><option value="sampled">Sampled</option></select></label>}
      <button data-testid="project-source-back-to-module" onClick={onClose}>{session.original.module === "surface" ? "Back to normal Surfaces" : "Back to module"}</button>
    </>}
    viewport={prepared.view ? <DocumentViewport view={prepared.view} binding={prepared.binding} presentation={presentation} camera={session.camera} cameraToken={version}
      rememberCamera={rememberCamera} wireframe={wireframe} probe={probe} onProbe={setProbeResult} /> : <div role="alert">Saved dependency unavailable: {prepared.error}</div>}
    source={<>
      <h2>Source / Object</h2>
      {document.format === "math3d.surface-document" && <SurfaceFormulaControls key={`${document.identity.revision}:${document.identity.structuralHash}`} document={document} onApply={source => action(() => session.commit(source as unknown as CanonicalJsonValue))} />}
      <details data-testid="project-source-json" style={{ padding: 10 }}><summary>Edit source definition · Advanced JSON</summary>
        <textarea aria-label="Saved source definition" data-testid="project-source-definition" value={draft} onChange={event => updateDraft(event.target.value)} rows={12} style={{ width: "100%", boxSizing: "border-box", font: "12px Consolas, monospace" }} />
        <button data-testid="project-source-apply" onClick={() => action(() => session.commit(JSON.parse(draft)))}>Apply source</button>
      </details>
      {error && <div role="alert" style={{ padding: 10 }}>{error}</div>}
    </>}
    tools={<div style={{ padding: 10 }}><h2>Tools</h2>{prepared.binding && presentation === "surface" ? <label><input data-testid="document-surface-probe" type="checkbox" checked={probe} onChange={event => { setProbe(event.target.checked); changed(); }} /> Surface probe and normal</label> : <p>Sampled presentation. Parameter probes require the native Surface view; Mesh vertex selection belongs to a saved Mesh.</p>}</div>}
    inspector={<><h2>Inspector</h2><div style={{ padding: 10 }} data-testid="document-generation">{document.identity.id} · r{document.identity.revision}<br />{document.identity.structuralHash}</div>
      {!!related?.length && <nav data-testid="document-related" aria-label="Related documents" style={{ padding: 10 }}>{related.map(item => <button key={item.id} onClick={() => onOpenRelated?.(item.id, item.module)}>{item.label}</button>)}</nav>}
      {prepared.view && <div data-testid="project-source-measurement" style={{ padding: 10 }}>{prepared.view.qualification} · {prepared.view.sampleCount} sampled points · bounds {JSON.stringify(prepared.view.bounds)}</div>}
      {children}
    </>}
    display={<div style={{ padding: 10 }}><h2>Display</h2><label><input data-testid="document-wireframe" type="checkbox" checked={wireframe} onChange={event => { session.wireframe = event.target.checked; setWireframe(event.target.checked); changed(); }} /> Wireframe</label><p>{prepared.binding && presentation === "surface" ? "Native Surface · captured Graph profile and variables" : "Sampled view · same owning document"}</p></div>}
    results={<div style={{ padding: 10 }}><h2>Results</h2>{probeResult ? <pre data-testid="document-probe-result" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(probeResult, null, 2)}</pre> : <p>Enable the Surface probe in Tools, then pick a point. Saved Mesh studies are available in Inspector.</p>}</div>} />;
}
