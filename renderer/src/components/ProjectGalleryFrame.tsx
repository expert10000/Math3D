import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./projectGallery.css";

export type ProjectPlacement = "left" | "middle" | "right" | "all";

export const ProjectGalleryFrame = ({ quick, viewerCompanion = false, placement = "left", onClose, children }: { quick: boolean; viewerCompanion?: boolean; placement?: ProjectPlacement; onClose: () => void; children: React.ReactNode }) => {
  const workspace = document.getElementById("project-gallery-host");
  const [dock, setDock] = useState<Element | null>(null);
  const [companionTop, setCompanionTop] = useState(142);
  useLayoutEffect(() => {
    const locate = () => setDock(quick && viewerCompanion ? document.querySelector(`.document-project-slot[data-placement="${placement}"]`) : null);
    locate(); const observer = new MutationObserver(locate);
    observer.observe(document.querySelector(".math3d-app") ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [quick, viewerCompanion, placement]);
  useLayoutEffect(() => {
    if (!quick || !viewerCompanion || placement !== "left") return;
    const header = document.querySelector(".math3d-app > header");
    if (!header) return;
    const update = () => {
      const anchor = header.querySelector('[data-testid="surface-module-actions"], [data-testid="curves-professional-shell"], [data-testid="geometry-professional-shell"], [data-testid="workspace-context-label"]');
      setCompanionTop(Math.round((anchor ?? header).getBoundingClientRect()[anchor ? "top" : "bottom"]));
    };
    update();
    const resize = new ResizeObserver(update), mutation = new MutationObserver(update);
    resize.observe(header);
    mutation.observe(header, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", update); };
  }, [quick, viewerCompanion, placement]);
  const frame = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (quick || !frame.current) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    const element = frame.current;
    const size = () => element.style.setProperty("--project-gallery-top", `${element.getBoundingClientRect().top}px`);
    size(); const header = document.querySelector(".math3d-app > header");
    const observer = new ResizeObserver(size); if (header) observer.observe(header);
    window.addEventListener("resize", size);
    return () => { observer.disconnect(); window.removeEventListener("resize", size); };
  }, [quick]);
  return createPortal(quick
    ? <aside id="project-explorer-panel" data-testid="project-explorer-panel" data-project-placement={viewerCompanion ? placement : undefined} aria-label={viewerCompanion ? "Open project" : "Quick project explorer"} className={`project-quick-panel${viewerCompanion ? " project-viewer-panel" : ""}${dock ? " project-embedded-panel" : ""}`} style={viewerCompanion && placement === "left" ? { "--project-companion-top": `${companionTop}px` } as React.CSSProperties : undefined}>{children}</aside>
    : <section ref={frame} id="project-explorer-panel" data-testid="project-explorer-panel" aria-label="Projects Gallery" className="project-gallery-page"
        onKeyDown={event => { if (event.key === "Escape") onClose(); }}>{children}</section>, quick ? dock ?? document.body : workspace ?? document.body);
};
