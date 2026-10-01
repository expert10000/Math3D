import React, { useState } from "react";
import { inspectProjectDocumentDelete, type Math3DProject, type ProjectExplorerDocument } from "@math3d/core";

export type ProjectDocumentAction = "rename" | "duplicate" | "archive" | "restore" | "delete";
export const ProjectDocumentActions: React.FC<{ project: Math3DProject; document: ProjectExplorerDocument;
  onAction: (action: ProjectDocumentAction, id: string, title?: string) => void }> = ({ project, document, onAction }) => {
  const [title, setTitle] = useState(document.title), [review, setReview] = useState(false);
  const impact = review ? inspectProjectDocumentDelete(project, document.id) : null;
  return <div style={{ margin: "6px 0", display: "grid", gap: 5 }} data-testid={`project-actions-${document.id}`}>
    <label>Document name<input aria-label={`Name ${document.title}`} data-testid={`project-document-name-${document.id}`} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></label>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      <button type="button" disabled={!title.trim()} onClick={() => onAction("rename", document.id, title)}>Rename</button>
      <button type="button" onClick={() => onAction("duplicate", document.id)}>Duplicate source</button>
      <button type="button" onClick={() => onAction(document.archived ? "restore" : "archive", document.id)}>{document.archived ? "Restore" : "Archive"}</button>
      <button type="button" onClick={() => setReview(!review)}>Review delete</button>
    </div>
    {impact && <div data-testid={`project-delete-review-${document.id}`} style={{ padding: 6, background: "#fff7ed", overflowWrap: "anywhere" }}>
      <strong>{impact.canDelete ? "Isolated document can be removed" : "Delete blocked by dependencies"}</strong>
      <div>{impact.ownedResultIds.length} owned result(s) will also be removed. External artifacts are retained.</div>
      <div>{impact.dependentDocumentIds.length} dependent document(s), {impact.dependentResultIds.length} dependent result(s), {impact.dependentArtifactIds.length} dependent artifact(s).</div>
      {!!impact.dependentRelationIds.length && <div>{impact.dependentRelationIds.length} relation(s) retain document or result references.</div>}
      {impact.dependentDocumentIds.map((id) => <div key={id}>{project.metadata.documents?.[id]?.title ?? id}</div>)}
      {impact.constructionReferences && <div>A saved construction still references this document.</div>}
      <button type="button" disabled={!impact.canDelete} onClick={() => onAction("delete", document.id)}>Delete document</button>
    </div>}
  </div>;
};
