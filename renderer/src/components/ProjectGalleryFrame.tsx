import React from "react";
import { createPortal } from "react-dom";
import "./projectGallery.css";

export type ProjectPlacement = "left" | "middle" | "right" | "all";

export const ProjectGalleryFrame = ({ quick, viewerCompanion = false, placement = "left", onClose, children }: { quick: boolean; viewerCompanion?: boolean; placement?: ProjectPlacement; onClose: () => void; children: React.ReactNode }) => {
  const workspace = document.getElementById("project-gallery-host");
  return createPortal(quick
    ? <aside id="project-explorer-panel" data-testid="project-explorer-panel" data-project-placement={viewerCompanion ? placement : undefined} aria-label={viewerCompanion ? "Open project" : "Quick project explorer"} className={`project-quick-panel${viewerCompanion ? " project-viewer-panel" : ""}`}>{children}</aside>
    : <section id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Projects Gallery" className="project-gallery-page"
        onKeyDown={event => { if (event.key === "Escape") onClose(); }}>{children}</section>, quick ? document.body : workspace ?? document.body);
};
