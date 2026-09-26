import {
  fitGraph2DViewport, GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_WORKSPACE_CONTRACT,
  panGraph2DViewport, sampleGraph2DExplicit, zoomGraph2DViewport,
  type Graph2DDocument, type Graph2DViewport,
} from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";
import "./graphsWorkspace.css";

type Props = {
  dockLayout: WorkspaceDockLayout;
  document: Graph2DDocument;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onViewportCommit?: (viewport: Graph2DViewport) => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, status = "ready", errorMessage, onViewportCommit, onUndo, onRedo }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [previewViewport, setPreviewViewport] = useState<Graph2DViewport | null>(null);
  const previewRef = useRef<Graph2DViewport | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewport: Graph2DViewport; moved: boolean } | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setPreview = (viewport: Graph2DViewport | null) => { previewRef.current = viewport; setPreviewViewport(viewport); };
  const finishWheel = () => {
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
    const viewport = previewRef.current;
    if (viewport) onViewportCommit?.(viewport);
    setPreview(null);
  };
  useEffect(() => () => { if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current); }, []);
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
  const viewport = previewViewport ?? document.display.viewport;
  const renderedDisplay = useMemo(() => ({ ...document.display, viewport }), [document.display, viewport]);
  const series = useMemo<Graph2DPlotSeries[]>(() => {
    const styles = new Map(document.display.objects.map((entry) => [entry.objectId, entry]));
    const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
    return document.source.objects.flatMap((object) => {
      const style = styles.get(object.id);
      if (!style?.visible) return [];
      const policy = previewViewport ? { ...document.display.sampling,
        maxSamples: Math.min(2000, document.display.sampling.maxSamples),
        maxDepth: Math.min(8, document.display.sampling.maxDepth),
        tolerancePx: Math.max(2, document.display.sampling.tolerancePx) } : document.display.sampling;
      return [{ objectId: object.id, style, artifact: sampleGraph2DExplicit({ ast: object.expression.ast,
        variables, domain: object.domain, viewport, width: size.width, height: size.height, policy }) }];
    });
  }, [document, size, viewport, previewViewport]);
  const fitVisible = () => {
    let xMin = Number.POSITIVE_INFINITY, xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY, yMax = Number.NEGATIVE_INFINITY;
    for (const item of series) for (const segment of item.artifact.segments) for (const point of segment.points) {
      xMin = Math.min(xMin, point.x); xMax = Math.max(xMax, point.x);
      yMin = Math.min(yMin, point.y); yMax = Math.max(yMax, point.y);
    }
    if (!Number.isFinite(xMin)) { onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); return; }
    onViewportCommit?.(fitGraph2DViewport({ xMin, xMax, yMin, yMax }, size, viewport.aspect));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,summary,details,input")) return;
    const startingViewport = previewRef.current ?? document.display.viewport;
    finishWheel();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      viewport: startingViewport, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    let dx = event.clientX - drag.x;
    let dy = event.clientY - drag.y;
    if (event.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    drag.moved = true;
    setPreview(panGraph2DViewport(drag.viewport, size, { x: dx, y: dy }));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && previewRef.current) onViewportCommit?.(previewRef.current);
    setPreview(null);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const next = zoomGraph2DViewport(previewRef.current ?? document.display.viewport, size, anchor,
      Math.exp(-event.deltaY * 0.0015));
    setPreview(next);
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(finishWheel, 180);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault(); if (event.shiftKey) onRedo?.(); else onUndo?.(); return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); onRedo?.(); return; }
    const delta = key === "arrowleft" ? { x: -40, y: 0 } : key === "arrowright" ? { x: 40, y: 0 } :
      key === "arrowup" ? { x: 0, y: -40 } : key === "arrowdown" ? { x: 0, y: 40 } : null;
    if (delta) { event.preventDefault(); onViewportCommit?.(panGraph2DViewport(viewport, size, delta)); return; }
    if (key === "+" || key === "=") { event.preventDefault(); onViewportCommit?.(zoomGraph2DViewport(viewport, size, { x: size.width / 2, y: size.height / 2 }, 1.2)); return; }
    if (key === "-" || key === "_") { event.preventDefault(); onViewportCommit?.(zoomGraph2DViewport(viewport, size, { x: size.width / 2, y: size.height / 2 }, 1 / 1.2)); return; }
    if (key === "home") { event.preventDefault(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); return; }
    if (key === "f") { event.preventDefault(); fitVisible(); }
  };
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
      <div data-testid="main-viewer" className="graph2d-viewer" aria-label="Graph scene" ref={viewerRef}
        tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setPreview(null); }} onWheel={onWheel} onKeyDown={onKeyDown}>
        <div className="graph2d-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { finishWheel(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); }}>Reset</button>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
        </div>
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Functions ({document.source.objects.length})</summary>{functionList}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={series} />}
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
