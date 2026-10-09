import React, { useState } from "react";
import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import { ProjectMiddlePortal } from "./ProjectMiddlePortal";

type Props = {
  project: Math3DProject;
  selectedDocumentId: string;
  documentTitle: string;
  onReturn: () => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onOpenWorkbook: (id: string) => Promise<void>;
  onOpenNote: (id: string) => void;
  onOpenFullDetails: () => void;
};

/** A compact Project reading surface over the retained native viewport. */
export const ProjectDetailMiddleView: React.FC<Props> = ({ project, selectedDocumentId, documentTitle, onReturn, onOpenDocument, onOpenWorkbook, onOpenNote, onOpenFullDetails }) => {
  const [error, setError] = useState("");
  return <ProjectMiddlePortal testId="project-middle-detail" label={`Project details ${project.metadata.title}`}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" data-testid="project-detail-return" onClick={onReturn}>Return to {documentTitle}</button>
      <button type="button" onClick={onOpenFullDetails}>Open full Project details</button>
    </div>
    <header style={{ borderBottom: "1px solid #cbd5e1", margin: "14px 0", paddingBottom: 12 }}>
      <small>Project / Details</small>
      <h2 style={{ margin: "5px 0" }}>{project.metadata.title}</h2>
      {project.metadata.description && <p>{project.metadata.description}</p>}
      <p>{project.workspace.entries.length} documents · {project.workbooks?.length ?? 0} Workbooks · {project.notes?.length ?? 0} Notes · {project.workspace.results.length} results</p>
    </header>
    <div style={{ display: "grid", gap: 16 }}>
      <section><h3>Documents</h3><div style={{ display: "grid", gap: 6 }}>
        {project.workspace.entries.filter(entry => !project.metadata.documents?.[entry.expected.id]?.archived).map(entry =>
          <button type="button" key={entry.expected.id} data-testid={`project-detail-document-${entry.expected.id}`}
            aria-current={selectedDocumentId === entry.expected.id ? "page" : undefined}
            onClick={() => onOpenDocument(entry.expected.id, entry.module)} style={{ textAlign: "left" }}>
            {entry.module} → {project.metadata.documents?.[entry.expected.id]?.title ?? ("metadata" in entry.checkpoint && "title" in entry.checkpoint.metadata ? entry.checkpoint.metadata.title : entry.expected.id)}
            {selectedDocumentId === entry.expected.id ? " · active" : ""}
          </button>)}
      </div></section>
      <section><h3>Workbooks</h3><div style={{ display: "grid", gap: 6 }}>
        {project.workbooks?.map(book => <button type="button" key={book.id} data-testid={`project-detail-workbook-${book.id}`} onClick={() => { setError(""); void onOpenWorkbook(book.id).catch(failure => setError(`Workbook unavailable: ${(failure as Error).message}`)); }}>{book.title} · r{book.revision}</button>)}
        {!project.workbooks?.length && <p>No Workbooks in this Project.</p>}
        {error && <p role="alert">{error}</p>}
      </div></section>
      <section><h3>Notes</h3><div style={{ display: "grid", gap: 6 }}>
        {project.notes?.map(note => <button type="button" key={note.identity.id} onClick={() => onOpenNote(note.identity.id)}>{note.title}</button>)}
        {!project.notes?.length && <p>No Notes in this Project.</p>}
      </div></section>
    </div>
  </ProjectMiddlePortal>;
};
