import { GRAPH2D_WORKSPACE_CONTRACT, sampleGraph2DExplicit, type Graph2DDocument } from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";
import "./graphsWorkspace.css";

type Props = {
  dockLayout: WorkspaceDockLayout;
  document: Graph2DDocument;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, status = "ready", errorMessage }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const update = () => {
      const width = Math.max(1, Math.round(element.clientWidth));
      const height = Math.max(1, Math.round(element.clientHeight));
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (!observer) window.addEventListener("resize", update);
    return () => { observer?.disconnect(); if (!observer) window.removeEventListener("resize", update); };
  }, []);
  const showLeft = !dockLayout.viewerMaximized && !dockLayout.leftCollapsed;
  const showRight = !dockLayout.viewerMaximized && !dockLayout.rightCollapsed;
  const displayById = new Map(document.display.objects.map((entry) => [entry.objectId, entry]));
  const series = useMemo<Graph2DPlotSeries[]>(() => {
    const styles = new Map(document.display.objects.map((entry) => [entry.objectId, entry]));
    const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
    return document.source.objects.flatMap((object) => {
      const style = styles.get(object.id);
      if (!style?.visible) return [];
      return [{ objectId: object.id, style, artifact: sampleGraph2DExplicit({ ast: object.expression.ast,
        variables, domain: object.domain, viewport: document.display.viewport, width: size.width, height: size.height,
        policy: document.display.sampling }) }];
    });
  }, [document, size]);
  const selected = document.source.objects.find((object) => object.id === document.selection.objectId) ?? null;
  const functionList = document.source.objects.length ? (
    <ol className="graph2d-function-list">
      {document.source.objects.map((object) => (
        <li key={object.id} data-graph2d-id={object.id}>
          <strong>{object.label}</strong>
          <code>y = {object.expression.source}</code>
          {!displayById.get(object.id)?.visible && <span>Hidden</span>}
        </li>
      ))}
    </ol>
  ) : <p className="graph2d-muted">No functions in this graph.</p>;
  const inspector = selected ? (
    <dl className="graph2d-inspector-details">
      <dt>Function</dt><dd>{selected.label}</dd>
      <dt>Expression</dt><dd><code>y = {selected.expression.source}</code></dd>
      <dt>Domain</dt><dd>{selected.domain.includeMin ? "[" : "("}{selected.domain.min}, {selected.domain.max}{selected.domain.includeMax ? "]" : ")"}</dd>
      <dt>Visibility</dt><dd>{displayById.get(selected.id)?.visible ? "Visible" : "Hidden"}</dd>
    </dl>
  ) : <p className="graph2d-muted">Select a function to inspect it.</p>;
  return (
    <section data-testid="graphs-workspace" aria-label="Graphs workspace" className="graph2d-workspace"
      data-left={showLeft} data-right={showRight}
      style={{ "--graph2d-left-width": showLeft ? `${dockLayout.left}px` : "0px",
        "--graph2d-right-width": showRight ? `${dockLayout.right}px` : "0px" } as CSSProperties}>
      {showLeft && <aside className="graph2d-panel graph2d-left" aria-label="Graph functions">
        <h2>Functions</h2>{functionList}
      </aside>}
      <div data-testid="main-viewer" className="graph2d-viewer" aria-label="Graph scene" ref={viewerRef}>
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Functions ({document.source.objects.length})</summary>{functionList}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={document.display} size={size} series={series} />}
        {status === "loading" ? <div className="graph2d-viewer-message" role="status">Loading graph…</div> :
          status === "error" ? <div className="graph2d-viewer-message" role="alert">{errorMessage || "Graph could not be opened."}</div> :
          document.source.objects.length === 0 ? <div className="graph2d-viewer-message" aria-label="Empty graph scene">
            <h2>Graphs</h2>
            <p>An empty Cartesian graph scene is ready.</p>
            <small>{document.source.objects.length} functions · {GRAPH2D_WORKSPACE_CONTRACT.initialObjectKind} source</small>
          </div> : null}
      </div>
      {showRight && <aside className="graph2d-panel graph2d-right" aria-label="Graph inspector">
        <h2>Inspector</h2>{inspector}
      </aside>}
    </section>
  );
}
