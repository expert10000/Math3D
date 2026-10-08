import React, { useState } from "react";
import type { CanonicalJsonValue, SurfaceDocument } from "@math3d/core";
import type { AdditionalProjectSession } from "../projects/additionalProjectSession";
import { SurfaceFormulaControls } from "../projects/SurfaceFormulaControls";
import "./documentWorkspace.css";
import { SavedSurfaceToolbar } from "./SavedSurfaceToolbar";

/** Adds document ownership to the existing module layout, without replacing its panels. */
export function SavedSurfaceModuleFrame({ session, title, projectTitle, related, onOpenRelated, onChange, onCustom, onProject, onClose, children }: {
  session: AdditionalProjectSession | null; title?: string; projectTitle?: string; related?: ReturnType<typeof import("./relatedDocuments").relatedDocuments>; onOpenRelated?: (id: string, module: import("@math3d/core").KernelWorkspaceModule) => void;
  onChange: () => void; onCustom: () => void; onProject: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!session) return <>{children}</>;
  const document = session.document();
  const action = (run: () => void) => {
    try { run(); session.sourceDraft = JSON.stringify(session.document().source, null, 2); setError(null); onChange(); }
    catch (failure) { setError((failure as Error).message); }
  };
  return <section className="saved-surface-module" data-testid="project-source-editor" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} data-document-module="surface">
    <div className="document-toolbar"><SavedSurfaceToolbar session={session} title={title} projectTitle={projectTitle} custom={false} onSelectView={view => { if (view === "custom") onCustom(); }} onUndo={() => action(() => session.undo())} onRedo={() => action(() => session.redo())} onProject={onProject} onClose={onClose} related={related} onOpenRelated={onOpenRelated} error={error} /></div>
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
