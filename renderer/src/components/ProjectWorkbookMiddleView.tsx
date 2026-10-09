import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import type { Workbook } from "@math3d/workbook";
import { WorkbookDocumentView } from "./WorkbookDocumentView";

type Props = {
  workbook: Workbook;
  project: Math3DProject | null;
  documentTitle: string;
  onReturn: () => void;
  onEdit: () => void;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onOpenNote: (id: string) => void;
  onOpenProjects: () => void;
};

/** A presentation layer over the current viewer; its document session stays mounted. */
export const ProjectWorkbookMiddleView: React.FC<Props> = ({ workbook, project, documentTitle, onReturn, onEdit, onOpenDocument, onOpenNote, onOpenProjects }) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const locate = () => {
      const candidates = [...document.querySelectorAll<HTMLElement>('[data-testid="main-viewer"], [data-testid="project-source-view"]')];
      const visible = candidates.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 200 && rect.height > 150 && getComputedStyle(element).display !== "none";
      });
      visible.sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      });
      setHost((current) => current === (visible[0] ?? null) ? current : visible[0] ?? null);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.querySelector(".math3d-app") ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!host) return;
    const previous = host.style.position;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    return () => { host.style.position = previous; };
  }, [host]);
  if (!host) return null;
  return createPortal(<section data-testid="project-middle-workbook" aria-label={`Project Workbook ${workbook.title}`}
    style={{ position: "absolute", inset: 0, zIndex: 30, overflow: "auto", background: "#f8fafc", padding: 16, boxSizing: "border-box" }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <button type="button" data-testid="project-return-to-document" onClick={onReturn}>Return to {documentTitle}</button>
      <button type="button" data-testid="project-edit-workbook" onClick={onEdit}>Open Workbook editor</button>
      <span style={{ color: "#475569" }}>The selected Project document remains active.</span>
    </div>
    <WorkbookDocumentView workbook={workbook} project={project} projectLive={!!project} readOnly
      statusFor={() => ({ state: "saved", label: "Saved" })} onUpdateBlock={() => undefined}
      onEditBlock={onEdit} onOpenDocument={onOpenDocument} onOpenProjects={onOpenProjects} onOpenNote={onOpenNote} />
  </section>, host);
};
