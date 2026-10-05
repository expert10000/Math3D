import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./projectGallery.css";

export const ProjectGalleryFrame = ({ quick, onClose, children }: { quick: boolean; onClose: () => void; children: React.ReactNode }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!quick && element) { element.showModal(); return () => element.close(); }
  }, [quick]);
  return createPortal(quick
    ? <aside id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Quick project explorer" className="project-quick-panel">{children}</aside>
    : <dialog ref={dialog} id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Projects Gallery" className="project-gallery-dialog" onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>, document.body);
};
