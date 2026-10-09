import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Covers the middle viewport without replacing its owning document session. */
export const ProjectMiddlePortal: React.FC<{ testId: string; label: string; children: React.ReactNode }> = ({ testId, label, children }) => {
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
    let pendingFrame = 0;
    const observer = new MutationObserver(() => {
      if (!pendingFrame) pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; locate(); });
    });
    observer.observe(document.querySelector(".math3d-app") ?? document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (pendingFrame) cancelAnimationFrame(pendingFrame); };
  }, []);
  useLayoutEffect(() => {
    if (!host) return;
    const previous = host.style.position;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    return () => { host.style.position = previous; };
  }, [host]);
  if (!host) return null;
  return createPortal(<section data-testid={testId} aria-label={label}
    style={{ position: "absolute", inset: 0, zIndex: 30, overflow: "auto", background: "#f8fafc", padding: 16, boxSizing: "border-box" }}>
    {children}
  </section>, host);
};
