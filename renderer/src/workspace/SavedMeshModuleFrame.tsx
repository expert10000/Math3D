import React from "react";
import type { MeshDocument } from "@math3d/core";
import "./documentWorkspace.css";

/** Keep the saved Mesh identity visible while its buffer uses the normal Mesh workspace. */
export function SavedMeshModuleFrame({ document, projectTitle, onProject, onStudy, onSurface, onClose, children }: {
  document: MeshDocument | null;
  projectTitle?: string;
  onProject: () => void;
  onStudy: () => void;
  onSurface?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!document) return <>{children}</>;
  return <section className="saved-surface-module" data-testid="project-source-editor" data-document-id={document.identity.id} data-source-hash={document.identity.structuralHash} data-document-module="mesh">
    <div className="document-toolbar" data-testid="saved-mesh-toolbar">
      <button type="button" onClick={onProject}>Project</button>
      <strong data-testid="document-breadcrumb">{projectTitle ?? "Project"} → Mesh → {document.metadata.label}</strong>
      <span>Revision {document.identity.revision}</span>
      <button type="button" data-testid="project-mesh-module-view" aria-pressed="true">Mesh module</button>
      <button type="button" data-testid="project-mesh-study-view" onClick={onStudy}>Saved studies</button>
      {onSurface && <button type="button" data-testid="project-source-back-to-surface" onClick={onSurface}>Back to source Surface</button>}
      <button type="button" data-testid="project-source-back-to-module" onClick={onClose}>Exit project view</button>
    </div>
    {children}
  </section>;
}
