import React, { useState } from "react";
import type { CanonicalJsonValue, SurfaceDocument } from "@math3d/core";
import type { AdditionalProjectSession } from "../projects/additionalProjectSession";
import { SurfaceFormulaControls } from "../projects/SurfaceFormulaControls";
import "./documentWorkspace.css";

/** Adds document ownership to the existing module layout, without replacing its panels. */
export function SavedSurfaceModuleFrame({ session, title, related, onOpenRelated, onChange, onCustom, onClose, children }: {
  session: AdditionalProjectSession | null; title?: string; related?: ReturnType<typeof import("./relatedDocuments").relatedDocuments>; onOpenRelated?: (id: string, module: import("@math3d/core").KernelWorkspaceModule) => void;
  onChange: () => void; onCustom: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!session) return <>{children}</>;
  const document = session.document(), history = session.history();
  const action = (run: () => void) => {
    try { run(); session.sourceDraft = JSON.stringify(session.document().source, null, 2); setError(null); onChange(); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <section className="saved-surface-module" data-testid="project-source-editor" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} data-document-module="surface">
    <div className="document-toolbar">
      <strong data-testid="document-breadcrumb">{title} · Project Surface</strong>
      <span data-testid="project-source-revision">Revision {document.identity.revision}</span>
      <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={() => action(() => session.undo())}>Undo document</button>
      <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={() => action(() => session.redo())}>Redo document</button>
      <div className="document-view-switch" role="group" aria-label="Document view">
        <button data-testid="document-surface-view" aria-pressed="true">Surface</button>
        <button data-testid="document-custom-view" aria-pressed="false" onClick={onCustom}>Custom</button>
      </div>
      <button data-testid="project-source-back-to-module" onClick={onClose}>Exit project view</button>
      {!!related?.length && <nav data-testid="document-related" aria-label="Related documents">{related.map(item => <button key={item.id} onClick={() => onOpenRelated?.(item.id, item.module)}>{item.label}</button>)}</nav>}
      {error && <span role="alert">{error}</span>}
    </div>
    {children}
  </section>;
}

export function SavedSurfaceModuleSource({ session, onChange }: { session: AdditionalProjectSession; onChange: () => void }) {
  const document = session.document() as SurfaceDocument;
  const [draft, setDraft] = useState(() => session.sourceDraft ?? JSON.stringify(document.source, null, 2));
  const [error, setError] = useState<string | null>(null);
  const apply = (source: CanonicalJsonValue) => {
    try { session.commit(source); const text = JSON.stringify(session.document().source, null, 2); session.sourceDraft = text; setDraft(text); setError(null); onChange(); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <div data-testid="saved-surface-module-source">
    <SurfaceFormulaControls key={document.identity.structuralHash} document={document} onApply={source => apply(source as unknown as CanonicalJsonValue)} />
    <details data-testid="project-source-json"><summary>Edit source definition · Advanced JSON</summary>
      <textarea data-testid="project-source-definition" aria-label="Saved source definition" rows={12} value={draft} onChange={event => { session.sourceDraft = event.target.value; setDraft(event.target.value); }} style={{ width: "100%", boxSizing: "border-box" }} />
      <button data-testid="project-source-apply" onClick={() => { try { apply(JSON.parse(draft)); } catch (failure) { setError((failure as Error).message); } }}>Apply source</button>
    </details>
    {error && <div role="alert">{error}</div>}
  </div>;
}

export function SurfaceProjectDock({ placement }: { placement: "left" | "right" }) {
  const open = (show: boolean) => window.dispatchEvent(new CustomEvent(show ? "math3d:open-project-dock" : "math3d:hide-project-dock", { detail: placement }));
  return <><nav className="surface-project-dock-controls" aria-label={`Surface ${placement} dock`}>
    <button onClick={() => open(true)}>Project</button>
    <button onClick={() => open(false)}>{placement === "left" ? "Surface controls" : "Inspector"}</button>
  </nav><div className="document-project-slot" data-placement={placement} /></>;
}
