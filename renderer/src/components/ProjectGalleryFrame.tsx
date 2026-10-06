import React from "react";
import { createPortal } from "react-dom";
import "./projectGallery.css";

export const ProjectGalleryFrame = ({ quick, onClose, children }: { quick: boolean; onClose: () => void; children: React.ReactNode }) => {
  const workspace = document.getElementById("project-gallery-host");
  return createPortal(quick
    ? <aside id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Quick project explorer" className="project-quick-panel">{children}</aside>
    : <section id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Projects Gallery" className="project-gallery-page"
        onKeyDown={event => { if (event.key === "Escape") onClose(); }}>{children}</section>, quick ? document.body : workspace ?? document.body);
};
