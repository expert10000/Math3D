import React, { useEffect } from "react";
import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import type { Workbook } from "@math3d/workbook";
import { WorkbookDocumentView } from "./WorkbookDocumentView";
import { ProjectMiddlePortal } from "./ProjectMiddlePortal";

type Props = {
  workbook: Workbook;
  project: Math3DProject | null;
  documentTitle: string;
  onReturn: () => void;
  onEdit: () => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onOpenNote: (id: string) => void;
  onOpenProjects: () => void;
  focusBlockId?: string;
};

/** A presentation layer over the current viewer; its document session stays mounted. */
export const ProjectWorkbookMiddleView: React.FC<Props> = ({ workbook, project, documentTitle, onReturn, onEdit, onOpenDocument, onOpenNote, onOpenProjects, focusBlockId }) => {
  useEffect(() => {
    if (!focusBlockId) return;
    const frame = requestAnimationFrame(() => document.querySelector(`[data-testid="workbook-document-block-${CSS.escape(focusBlockId)}"]`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [workbook, focusBlockId]);
  return <ProjectMiddlePortal testId="project-middle-workbook" label={`Project Workbook ${workbook.title}`}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <button type="button" data-testid="project-return-to-document" onClick={onReturn}>Return to {documentTitle}</button>
      <button type="button" data-testid="project-edit-workbook" onClick={onEdit}>Open Workbook editor</button>
      <span style={{ color: "#475569" }}>The selected Project document remains active.</span>
    </div>
    <WorkbookDocumentView workbook={workbook} project={project} projectLive={!!project} readOnly
      statusFor={() => ({ state: "saved", label: "Saved" })} onUpdateBlock={() => undefined}
      onEditBlock={onEdit} onOpenDocument={onOpenDocument} onOpenProjects={onOpenProjects} onOpenNote={onOpenNote} />
  </ProjectMiddlePortal>;
};
