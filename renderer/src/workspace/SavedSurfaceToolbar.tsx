import React from "react";
import type { KernelWorkspaceModule } from "@math3d/core";
import type { AdditionalProjectSession } from "../projects/additionalProjectSession";
import type { relatedDocuments } from "./relatedDocuments";

/** Keep document navigation in the same position in native and Custom views. */
export function SavedSurfaceToolbar({ session, title, projectTitle, custom, onSelectView, onUndo, onRedo, onProject, onClose, related, onOpenRelated, onPresentation, error }: {
  session: AdditionalProjectSession; title?: string; projectTitle?: string; custom: boolean;
  onSelectView: (view: "surface" | "custom") => void; onUndo: () => void; onRedo: () => void; onProject: () => void; onClose: () => void;
  related?: ReturnType<typeof relatedDocuments>; onOpenRelated?: (id: string, module: KernelWorkspaceModule) => void;
  onPresentation?: (view: typeof session.presentation) => void; error?: string | null;
}) {
  const history = session.history();
  return <div className="saved-surface-toolbar" data-testid="saved-surface-toolbar">
    <div className="document-view-switch" role="group" aria-label="Document view">
      <button data-testid="document-surface-view" aria-pressed={!custom} onClick={() => onSelectView("surface")}>Surface</button>
      <button data-testid="document-custom-view" aria-pressed={custom} onClick={() => onSelectView("custom")}>Custom</button>
    </div>
    <button data-testid="document-project-open" onClick={onProject}>Project overview</button>
    <strong data-testid="document-breadcrumb" title={`${projectTitle ?? "Project"} → Surface → ${title ?? "Surface"}`}>{projectTitle ?? "Project"} → Surface → {title ?? "Surface"}</strong>
    <span data-testid="project-source-revision">Revision {session.document().identity.revision}</span>
    <button data-testid="project-source-undo" disabled={!history.undoDepth} onClick={onUndo}>Undo document</button>
    <button data-testid="project-source-redo" disabled={!history.redoDepth} onClick={onRedo}>Redo document</button>
    <label className="saved-surface-custom-options" style={{ visibility: custom ? undefined : "hidden" }}>Custom rendering <select data-testid="document-view-choice" disabled={!custom} value={session.presentation} onChange={event => onPresentation?.(event.target.value as typeof session.presentation)}><option value="surface">Surface</option><option value="sampled">Sampled</option></select></label>
    <button data-testid="project-source-back-to-surface" style={{ visibility: custom ? undefined : "hidden" }} disabled={!custom} onClick={() => onSelectView("surface")}>Back to {title ?? "Surface"}</button>
    <button data-testid="project-source-back-to-module" onClick={onClose}>Exit project view</button>
    {!!related?.length && <nav data-testid="document-related" aria-label="Related documents">{related.map(item => <button key={item.id} onClick={() => onOpenRelated?.(item.id, item.module)}>{item.label}</button>)}</nav>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
