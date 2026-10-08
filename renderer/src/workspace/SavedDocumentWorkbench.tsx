import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CanonicalJsonValue } from "@math3d/core";
import type { CameraSyncState, ProbeInfo } from "../components/SurfaceViewer";
import type { PrincipalCurvatureScalars } from "../math/principalCurvature";
import { SurfaceDocumentInspector } from "../surfaceAnalysis/SurfaceDocumentInspector";
import { readSurfaceDocumentView, type SurfaceDocumentView } from "../surfaceAnalysis/surfaceDocumentView";
import type { AdditionalProjectSession } from "../projects/additionalProjectSession";
import { SurfaceFormulaControls } from "../projects/SurfaceFormulaControls";
import { DocumentWorkspaceHost } from "./DocumentWorkspaceHost";
import { SavedSurfaceToolbar } from "./SavedSurfaceToolbar";
import { DocumentViewport } from "./DocumentViewport";
import { surfaceDocumentBinding } from "./surfaceDocumentBinding";
import { documentPresentationKey, readDocumentPresentation, saveDocumentPresentation } from "./documentPresentation";

export function SavedDocumentWorkbench({ session, workspaceVersion, projectId, projectTitle, documentTitle, related, onOpenRelated, onChange, onClose, onOpenProject, moduleView, customView = false, onSelectView, children }:
  { session: AdditionalProjectSession; workspaceVersion: number; projectId?: string; projectTitle?: string; documentTitle?: string;
    related?: ReturnType<typeof import("./relatedDocuments").relatedDocuments>; onOpenRelated?: (id: string, module: import("@math3d/core").KernelWorkspaceModule) => void;
    onChange: () => void; onClose: () => void; onOpenProject: () => void; children?: React.ReactNode;
    moduleView?: { viewport: React.ReactNode; inspector: React.ReactNode; tools: React.ReactNode }; customView?: boolean; onSelectView?: (view: "surface" | "custom") => void }) {
  const uiKey = documentPresentationKey(projectId ?? "project", session.original.expected.id);
  const [version, setVersion] = useState(0), [draft, setDraft] = useState(() => session.sourceDraft ?? JSON.stringify(session.document().source, null, 2));
  const [error, setError] = useState<string | null>(null), [presentation, setPresentation] = useState(session.presentation);
  const [wireframe, setWireframe] = useState(session.wireframe), [probe, setProbe] = useState(false), [probeResult, setProbeResult] = useState<unknown>(null);
  const [surfaceView, setSurfaceView] = useState(session.surfaceView);
  const [probeInfo, setProbeInfo] = useState<{ hash: string; value: ProbeInfo } | null>(null);
  const [curvature, setCurvature] = useState<{ hash: string; value: PrincipalCurvatureScalars | null } | null>(null);
  const [probeUV, setProbeUV] = useState<{ hash: string; uv: { u: number; v: number } } | null>(null), [probeToken, setProbeToken] = useState(0), [resetToken, setResetToken] = useState(0);
  // Kernel queries return fresh immutable clones. Keep one snapshot per source
  // change, so panel/probe updates cannot rebuild the viewer and publish again.
  const document = useMemo(() => session.document(), [session, version, workspaceVersion]), history = session.history();
  useEffect(() => {
    if (!projectId || session.presentationLoaded) return;
    const ui = readDocumentPresentation(localStorage.getItem(uiKey));
    session.presentation = ui.presentation; session.wireframe = ui.wireframe; session.camera = ui.camera; session.surfaceView = ui.surfaceView; session.presentationLoaded = true;
    setPresentation(ui.presentation); setWireframe(ui.wireframe); setSurfaceView(ui.surfaceView); setVersion(value => value + 1);
  }, [session, projectId, uiKey]);
  const prepared = useMemo(() => {
    try { return { view: session.view(), binding: document.format === "math3d.surface-document" ? surfaceDocumentBinding(document) : null, error: null }; }
    catch (failure) { return { view: null, binding: null, error: (failure as Error).message }; }
  }, [session, document, workspaceVersion]);
  const rememberCamera = useCallback((camera: CameraSyncState) => { session.camera = camera; }, [session]);
  const handleProbe = useCallback((value: ProbeInfo) => { setProbeInfo({ hash: document.identity.structuralHash, value }); setProbeResult(value); }, [document.identity.structuralHash]);
  const handleCurvature = useCallback((value: PrincipalCurvatureScalars | null) => { setCurvature({ hash: document.identity.structuralHash, value }); }, [document.identity.structuralHash]);
  useEffect(() => {
    const save = () => session.presentationLoaded && saveDocumentPresentation(uiKey, { presentation: session.presentation, wireframe: session.wireframe, camera: session.camera, surfaceView: session.surfaceView });
    save(); window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  }, [session, uiKey, presentation, wireframe, surfaceView]);
  useEffect(() => { setProbeInfo(null); setCurvature(null); setProbeResult(null); setProbeUV(null); }, [document.identity.structuralHash, presentation]);
  const updateDraft = (text: string) => { session.sourceDraft = text; setDraft(text); };
  const changed = () => { setVersion(value => value + 1); };
  const action = (fn: () => void) => {
    try { fn(); updateDraft(JSON.stringify(session.document().source, null, 2)); setError(null); changed(); onChange(); }
    catch (failure) { setError((failure as Error).message); }
  };
  const updateView = (value: Partial<SurfaceDocumentView>) => { session.surfaceView = readSurfaceDocumentView({ ...session.surfaceView, ...value }); setSurfaceView(session.surfaceView); };
  const updateWireframe = (value: boolean) => { session.wireframe = value; setWireframe(value); };
  // Selecting the document opens its module. A remembered custom rendering
  // choice only takes effect after the user explicitly selects Custom.
  const showModule = !!moduleView && !customView;
  const nativeInspector = document.format === "math3d.surface-document" && !!prepared.binding && (showModule || presentation === "surface");
  useEffect(() => { setSurfaceView(session.surfaceView); setWireframe(session.wireframe); }, [session, customView]);
  const visibleProbe = probeInfo?.hash === document.identity.structuralHash ? probeInfo.value : null;
  const visibleCurvature = curvature?.hash === document.identity.structuralHash ? curvature.value : null;
  const provenance = <><div style={{ padding: 10 }} data-testid="document-generation">{document.identity.id} · r{document.identity.revision}<br />{document.identity.structuralHash}</div>
    {!!related?.length && <nav data-testid="document-related" aria-label="Related documents" style={{ padding: 10 }}>{related.map(item => <button key={item.id} onClick={() => onOpenRelated?.(item.id, item.module)}>{item.label}</button>)}</nav>}</>;
  const measurement = prepared.view && <div data-testid="project-source-measurement" style={{ padding: 10 }}>{prepared.view.qualification} · {prepared.view.sampleCount} sampled points · bounds {JSON.stringify(prepared.view.bounds)}</div>;
  return <DocumentWorkspaceHost documentId={document.identity.id} sourceHash={document.identity.structuralHash} module={session.original.module}
    integratedInspector={!!nativeInspector}
    toolbar={moduleView ? <SavedSurfaceToolbar session={session} title={documentTitle} projectTitle={projectTitle} custom={customView} onSelectView={view => onSelectView?.(view)} onUndo={() => action(() => session.undo())} onRedo={() => action(() => session.redo())} onProject={onOpenProject} onClose={onClose} related={related} onOpenRelated={onOpenRelated} onPresentation={view => { session.presentation = view; setPresentation(view); setProbe(false); setProbeResult(null); changed(); }} error={error} /> : <>
      <button data-testid="document-project-open" onClick={onOpenProject}>Project overview</button>
      <strong data-testid="document-breadcrumb">{projectTitle ?? "Project"} → {session.original.module === "surface" ? "Surface" : session.original.module} → {documentTitle ?? ("metadata" in document ? document.metadata.title : session.original.module)}</strong>
      <span data-testid="project-source-revision">Revision {document.identity.revision}</span>
      <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={() => action(() => session.undo())}>Undo document</button>
      <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={() => action(() => session.redo())}>Redo document</button>
      {moduleView && <div className="document-view-switch" role="group" aria-label="Document view">
        <button data-testid="document-surface-view" aria-pressed={!customView} title="Use the Surfaces module viewer, tools and Inspector" onClick={() => onSelectView?.("surface")}>Surface</button>
        <button data-testid="document-custom-view" aria-pressed={customView} title="Use the custom viewer and document controls" onClick={() => onSelectView?.("custom")}>Custom</button>
      </div>}
      {prepared.binding && !showModule && <label>Custom rendering <select data-testid="document-view-choice" value={presentation} onChange={event => { session.presentation = event.target.value as typeof presentation; setPresentation(session.presentation); setProbe(false); setProbeResult(null); changed(); }}><option value="surface">Surface</option><option value="sampled">Sampled</option></select></label>}
      {moduleView && <button data-testid="project-source-back-to-surface" onClick={() => onSelectView?.("surface")}>Back to {documentTitle ?? "Surface"}</button>}
      <button data-testid="project-source-back-to-module" onClick={onClose}>{session.original.module === "surface" ? "Exit project view" : "Back to module"}</button>
    </>}
    viewport={showModule ? <div style={{ width: "100%", height: "100%" }} data-testid="document-viewport" data-view="surface" data-workbench="module" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash}>{moduleView!.viewport}</div> : prepared.view ? <DocumentViewport view={prepared.view} binding={prepared.binding} presentation={presentation} camera={session.camera} cameraToken={version}
      rememberCamera={rememberCamera} wireframe={wireframe} probe={probe} surfaceView={surfaceView} probeUV={probeUV?.hash === document.identity.structuralHash ? probeUV.uv : null} probeToken={probeToken} resetToken={resetToken}
      onProbe={handleProbe} onCurvature={handleCurvature} /> : <div role="alert">Saved dependency unavailable: {prepared.error}</div>}
    source={<>
      <h2>Source / Object</h2>
      {document.format === "math3d.surface-document" && <SurfaceFormulaControls key={`${document.identity.revision}:${document.identity.structuralHash}`} document={document} onApply={source => action(() => session.commit(source as unknown as CanonicalJsonValue))} />}
      <details data-testid="project-source-json" style={{ padding: 10 }}><summary>Edit source definition · Advanced JSON</summary>
        <textarea aria-label="Saved source definition" data-testid="project-source-definition" value={draft} onChange={event => updateDraft(event.target.value)} rows={12} style={{ width: "100%", boxSizing: "border-box", font: "12px Consolas, monospace" }} />
        <button data-testid="project-source-apply" onClick={() => action(() => session.commit(JSON.parse(draft)))}>Apply source</button>
      </details>
      {error && <div role="alert" style={{ padding: 10 }}>{error}</div>}
    </>}
    tools={showModule ? moduleView!.tools : <div style={{ padding: 10 }}><h2>Tools</h2>{prepared.binding && presentation === "surface" ? <label><input data-testid="document-surface-probe" type="checkbox" checked={probe} onChange={event => { setProbe(event.target.checked); changed(); }} /> Surface probe and normal</label> : <p>Sampled presentation. Parameter probes require the native Surface view; Mesh vertex selection belongs to a saved Mesh.</p>}</div>}
    inspector={showModule ? <div data-testid="document-module-inspector" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} style={{ padding: 10 }}>{moduleView!.inspector}{provenance}{measurement}{children}</div> : nativeInspector ? <SurfaceDocumentInspector document={document} title={documentTitle ?? "Saved Surface"} binding={prepared.binding!} view={surfaceView} onView={updateView}
      viewControls={{ lightPreset: surfaceView.lightPreset, onChangeLightPreset: value => updateView({ lightPreset: value }),
        materialRoughness: surfaceView.roughness, onSetMaterialRoughness: value => updateView({ roughness: value }),
        materialMetalness: surfaceView.metalness, onSetMaterialMetalness: value => updateView({ metalness: value }),
        materialOpacity: surfaceView.opacity, onSetMaterialOpacity: value => updateView({ opacity: value }), showWireframe: wireframe,
        onToggleWireframe: () => updateWireframe(!wireframe), wireframeTestId: "document-wireframe" }}
      probeEnabled={probe} onToggleProbe={() => setProbe(value => !value)} probeInfo={visibleProbe} curvature={visibleCurvature}
      onPickDomainUV={value => { setProbe(true); setProbeUV({ hash: document.identity.structuralHash, uv: value }); setProbeToken(token => token + 1); }} onResetCamera={() => setResetToken(token => token + 1)}
      provenance={provenance} measurement={measurement} history={history} onUndo={() => action(() => session.undo())} onRedo={() => action(() => session.redo())}>{children}</SurfaceDocumentInspector>
      : <><h2>Inspector</h2>{provenance}{measurement}{children}</>}
    display={<div style={{ padding: 10 }}><h2>Display</h2><label><input data-testid="document-wireframe" type="checkbox" checked={wireframe} onChange={event => updateWireframe(event.target.checked)} /> Wireframe</label><p>Sampled view · same owning document</p></div>}
    results={<div style={{ padding: 10 }}><h2>Results</h2>{probeResult ? <pre data-testid="document-probe-result" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(probeResult, null, 2)}</pre> : <p>Enable the Surface probe in Tools, then pick a point. Saved Mesh studies are available in Inspector.</p>}</div>} />;
}
