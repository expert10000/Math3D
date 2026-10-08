import React, { useLayoutEffect, useRef, useState } from "react";
import "./documentWorkspace.css";

/** Shared docks: changing a panel never replaces the owning session or viewport. */
export function DocumentWorkspaceHost({ documentId, sourceHash, module, toolbar, viewport, source, tools, inspector, display, results, integratedInspector = false }:
  { documentId: string; sourceHash: string; module: string; toolbar: React.ReactNode; viewport: React.ReactNode;
    source: React.ReactNode; tools: React.ReactNode; inspector: React.ReactNode; display: React.ReactNode; results: React.ReactNode; integratedInspector?: boolean }) {
  const host = useRef<HTMLElement>(null);
  const [left, setLeft] = useState("Source/Object"), [right, setRight] = useState("Inspector");
  const [projectDock, setProjectDock] = useState<string | null>(null);
  const showProject = (placement: string) => window.dispatchEvent(new CustomEvent("math3d:open-project-dock", { detail: placement }));
  const showModule = (placement: string) => window.dispatchEvent(new CustomEvent("math3d:hide-project-dock", { detail: placement }));
  useLayoutEffect(() => {
    const element = host.current, header = element?.closest(".math3d-app")?.querySelector("header");
    if (!element || !header) return;
    const size = () => element.style.setProperty("--document-header-height", `${Math.max(header.getBoundingClientRect().bottom, element.getBoundingClientRect().top) + window.scrollY}px`);
    size(); const observer = new ResizeObserver(size); observer.observe(header);
    const project = () => setProjectDock(element.querySelector(".project-embedded-panel")?.getAttribute("data-project-placement") ?? null);
    project(); const dockObserver = new MutationObserver(project); dockObserver.observe(element, { childList: true, subtree: true });
    window.addEventListener("resize", size);
    return () => { observer.disconnect(); dockObserver.disconnect(); window.removeEventListener("resize", size); };
  }, []);
  return <section ref={host} className="document-workspace" data-testid="project-source-editor" data-document-id={documentId} data-source-hash={sourceHash} data-document-module={module}>
    <div className="document-toolbar">{toolbar}</div>
    <div className="document-docks">
      <aside className="document-source-dock" aria-label="Document source and tools">
        <div role="tablist" aria-label="Document controls"><button role="tab" aria-selected={projectDock === "left"} className="document-project-tab" onClick={() => showProject("left")}>Project</button>{["Source/Object", "Tools"].map(tab => <button key={tab} role="tab" aria-selected={projectDock !== "left" && left === tab} onClick={() => { showModule("left"); setLeft(tab); }}>{tab}</button>)}</div>
        <div className="document-project-slot" data-placement="left" />
        <div className="document-module-controls"><div hidden={left !== "Source/Object"}>{source}</div><div hidden={left !== "Tools"}>{tools}</div></div>
      </aside>
      <div className="document-viewport" data-testid="project-source-view"><div className="document-primary-view">{viewport}</div><div className="document-project-slot document-project-expanded" data-placement="middle" /><div className="document-project-slot document-project-expanded" data-placement="all" /></div>
      <aside className="document-inspector" data-testid="project-source-inspector" aria-label="Document inspector">
        <div role="tablist" aria-label="Document details"><button role="tab" aria-selected={projectDock === "right"} onClick={() => showProject("right")}>Project</button>{(integratedInspector ? ["Inspector"] : ["Inspector", "Display", "Results"]).map(tab => <button key={tab} role="tab" aria-selected={projectDock !== "right" && (integratedInspector || right === tab)} onClick={() => { showModule("right"); setRight(tab); }}>{tab}</button>)}</div>
        <div className="document-project-slot" data-placement="right" />
        <div className="document-module-controls"><div hidden={!integratedInspector && right !== "Inspector"}>{inspector}</div>{!integratedInspector && <><div hidden={right !== "Display"}>{display}</div><div hidden={right !== "Results"}>{results}</div></>}</div>
      </aside>
    </div>
  </section>;
}
