import {
  analyzeGraph2DLocalDifferential, fitGraph2DViewport, GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_WORKSPACE_CONTRACT,
  graph2DWorldToScreen, panGraph2DViewport, pickGraph2DProbe, sampleGraph2DExplicit,
  isGraph2DLocalDifferentialCurrent, queryGraph2DInspector, selectionForGraph2DObject, zoomGraph2DViewport,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DSelection, type Graph2DViewport,
} from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";
import { Graph2DAuthoringPanel } from "./Graph2DAuthoringPanel";
import "./graphsWorkspace.css";

type Props = {
  dockLayout: WorkspaceDockLayout;
  document: Graph2DDocument;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onViewportCommit?: (viewport: Graph2DViewport) => void;
  onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  onUndo?: () => void;
  onRedo?: () => void;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, status = "ready", errorMessage, onViewportCommit, onAuthoringCommit, onSelectionCommit, onUndo, onRedo }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [previewViewport, setPreviewViewport] = useState<Graph2DViewport | null>(null);
  const previewRef = useRef<Graph2DViewport | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewport: Graph2DViewport; moved: boolean } | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const [hoverSelection, setHoverSelection] = useState<Graph2DSelection | null>(null);
  const setPreview = (viewport: Graph2DViewport | null) => { previewRef.current = viewport; setPreviewViewport(viewport); };
  const finishWheel = () => {
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
    const viewport = previewRef.current;
    if (viewport) onViewportCommit?.(viewport);
    setPreview(null);
  };
  useEffect(() => () => { if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current); }, []);
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
  const pick = (x: number, y: number, previous?: Graph2DSelection) => pickGraph2DProbe({ document, series,
    viewport, size, screen: { x, y }, previous }).selection;
  const localPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const fitSeries = (items: readonly Graph2DPlotSeries[]) => {
    let xMin = Number.POSITIVE_INFINITY, xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY, yMax = Number.NEGATIVE_INFINITY;
    for (const item of items) for (const segment of item.artifact.segments) for (const point of segment.points) {
      xMin = Math.min(xMin, point.x); xMax = Math.max(xMax, point.x);
      yMin = Math.min(yMin, point.y); yMax = Math.max(yMax, point.y);
    }
    if (!Number.isFinite(xMin)) { onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); return; }
    onViewportCommit?.(fitGraph2DViewport({ xMin, xMax, yMin, yMax }, size, viewport.aspect));
  };
  const fitVisible = () => fitSeries(series);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,summary,details,input,select,textarea,label,form")) return;
    const startingViewport = previewRef.current ?? document.display.viewport;
    finishWheel();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      viewport: startingViewport, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      const point = localPoint(event);
      if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = requestAnimationFrame(() => { hoverFrameRef.current = null; setHoverSelection(pick(point.x, point.y)); });
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    setHoverSelection(null);
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
    else if (!drag.moved) { const point = localPoint(event); onSelectionCommit?.(pick(point.x, point.y, document.selection)); }
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
    if ((event.target as HTMLElement).closest("input,select,textarea,[contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault(); if (event.shiftKey) onRedo?.(); else onUndo?.(); return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); onRedo?.(); return; }
    if (key === "escape") { event.preventDefault(); onSelectionCommit?.({ objectId: null, probe: null }); return; }
    if (key === "[" || key === "]") {
      event.preventDefault();
      const visible = document.source.objects.filter((object) => document.display.objects.find((entry) => entry.objectId === object.id)?.visible &&
        series.some((entry) => entry.objectId === object.id && entry.artifact.segments.length));
      if (visible.length) {
        const current = visible.findIndex((object) => object.id === document.selection.objectId);
        const next = current < 0 ? 0 : (current + (key === "]" ? 1 : visible.length - 1)) % visible.length;
        onSelectionCommit?.(selectionForGraph2DObject(document, series, visible[next]!.id, document.selection.probe?.x));
      }
      return;
    }
    const delta = key === "arrowleft" ? { x: -40, y: 0 } : key === "arrowright" ? { x: 40, y: 0 } :
      key === "arrowup" ? { x: 0, y: -40 } : key === "arrowdown" ? { x: 0, y: 40 } : null;
    if (delta) { event.preventDefault(); onViewportCommit?.(panGraph2DViewport(viewport, size, delta)); return; }
    if (key === "+" || key === "=") { event.preventDefault(); onViewportCommit?.(zoomGraph2DViewport(viewport, size, { x: size.width / 2, y: size.height / 2 }, 1.2)); return; }
    if (key === "-" || key === "_") { event.preventDefault(); onViewportCommit?.(zoomGraph2DViewport(viewport, size, { x: size.width / 2, y: size.height / 2 }, 1 / 1.2)); return; }
    if (key === "home") { event.preventDefault(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); return; }
    if (key === "f") { event.preventDefault(); fitVisible(); }
  };
  const selectedSeries = series.find((item) => item.objectId === document.selection.objectId);
  const inspected = queryGraph2DInspector(document, selectedSeries);
  const differential = useMemo(() => analyzeGraph2DLocalDifferential(document), [document]);
  const derivatives = differential?.derivatives ?? null;
  const differentialOverlays = differential && isGraph2DLocalDifferentialCurrent(differential, document) ? differential.overlays : [];
  const locateSelected = () => {
    if (!document.selection.probe) return;
    const screen = graph2DWorldToScreen(viewport, size, document.selection.probe);
    onViewportCommit?.(panGraph2DViewport(viewport, size, { x: size.width / 2 - screen.x, y: size.height / 2 - screen.y }));
  };
  const functionList = <Graph2DAuthoringPanel document={document} onCommit={onAuthoringCommit}
    onSelect={(objectId) => onSelectionCommit?.(selectionForGraph2DObject(document, series, objectId, document.selection.probe?.x))} />;
  const inspector = inspected ? <div className="graph2d-inspector">
    <dl className="graph2d-inspector-details">
      <dt>Function</dt><dd>{inspected.label}</dd>
      <dt>Source</dt><dd><code>y = {inspected.expression}</code></dd>
      <dt>Domain</dt><dd>{inspected.domain.includeMin ? "[" : "("}{inspected.domain.min}, {inspected.domain.max}{inspected.domain.includeMax ? "]" : ")"}</dd>
      <dt>Style</dt><dd><span className="graph2d-inspector-swatch" style={{ background: inspected.style.color }} />
        {inspected.style.lineStyle}, {inspected.style.lineWidth} px · {inspected.style.visible ? "visible" : "hidden"}</dd>
      <dt>Probe</dt><dd>{inspected.probe ? <span data-testid="graph2d-probe-coordinates">
        ({inspected.probe.x.toPrecision(6)}, {inspected.probe.y.toPrecision(6)})</span> : "No point selected"}</dd>
      <dt>Probe method</dt><dd>{inspected.probeMethod === "direct-expression-floating-point" ?
        "Direct expression evaluation (floating point)" : "Unavailable"}</dd>
      <dt>Sampling</dt><dd data-testid="graph2d-sampling-status">Adaptive bounded polyline · {inspected.sampling.status}</dd>
      <dt>Budget</dt><dd>{inspected.sampling.policy.maxSamples.toLocaleString()} samples, depth {inspected.sampling.policy.maxDepth},
        {" "}{inspected.sampling.policy.tolerancePx} px tolerance</dd>
      <dt>Observed</dt><dd>{inspected.sampling.samplesEvaluated === null ? "Unavailable" :
        `${inspected.sampling.samplesEvaluated.toLocaleString()} evaluations · ${inspected.sampling.segmentCount} segments`}</dd>
      <dt>Jumps</dt><dd>{inspected.sampling.suspectedJumpCount} suspected · {inspected.sampling.invalidSampleCount} invalid samples</dd>
    </dl>
    {inspected.sampling.diagnostics.length > 0 && <details className="graph2d-inspector-more"><summary>Sampling diagnostics</summary>
      <ul>{inspected.sampling.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.code}: {diagnostic.count}</li>)}</ul>
    </details>}
    <details className="graph2d-inspector-more"><summary>Provenance</summary>
      <dl className="graph2d-inspector-details">
        <dt>Document</dt><dd>{inspected.provenance.documentId}</dd>
        <dt>Revision</dt><dd>{inspected.provenance.revision}</dd>
        <dt>Source hash</dt><dd><code>{inspected.provenance.structuralHash}</code></dd>
        <dt>Expression AST</dt><dd>v{inspected.provenance.expressionAstVersion}</dd>
        <dt>Sampler</dt><dd>{inspected.provenance.samplerVersion === null ? "Unavailable" : `v${inspected.provenance.samplerVersion}`}</dd>
      </dl>
    </details>
    {differential && <section className="graph2d-local-differential" data-testid="graph2d-local-differential" aria-label="Local differential">
      <h3>Local differential</h3>
      <dl className="graph2d-inspector-details">
        <dt>State</dt><dd data-testid="graph2d-differentiability">{differential.state}</dd>
        <dt>Point</dt><dd>{differential.point ? `(${differential.point.x.toPrecision(6)}, ${differential.point.y.toPrecision(6)})` : "Unavailable"}</dd>
        <dt>Slope</dt><dd>{differential.slope === null ? "Unavailable" : differential.slope.toPrecision(8)}</dd>
        <dt>Method</dt><dd>{differential.slopeMethod === "symbolic-rules" ? "Symbolic rules; floating point value" :
          differential.slopeMethod === "finite-difference" ? "Richardson finite difference" : "Unavailable"}</dd>
        <dt>Tangent</dt><dd data-testid="graph2d-tangent-equation">{differential.tangent?.equation ?? "Unavailable"}</dd>
        <dt>Normal</dt><dd data-testid="graph2d-normal-equation">{differential.normal?.equation ?? "Unavailable"}</dd>
      </dl>
      {differential.diagnostics.length > 0 && <ul className="graph2d-derivative-diagnostics">
        {differential.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message}</li>)}
      </ul>}
    </section>}
    {derivatives && <section className="graph2d-derivatives" data-testid="graph2d-derivatives" aria-label="Derivatives">
      <h3>Derivatives at x = {derivatives[0].x.toPrecision(6)}</h3>
      {derivatives.map((result) => <div className="graph2d-derivative-result" key={result.order}>
        <strong>{result.order === 1 ? "First derivative" : "Second derivative"}</strong>
        <dl className="graph2d-inspector-details">
          <dt>Value</dt><dd data-testid={result.order === 1 ? "graph2d-first-derivative" : "graph2d-second-derivative"}>
            {result.value === null ? "Unavailable" : result.value.toPrecision(8)}</dd>
          <dt>Method</dt><dd>{result.method === "symbolic-rules" ? "Symbolic rules; floating point evaluation" :
            result.method === "finite-difference" ? "Richardson finite difference" : "Unavailable"}</dd>
          <dt>Domain</dt><dd>{result.domain.includeMin ? "[" : "("}{result.domain.min}, {result.domain.max}{result.domain.includeMax ? "]" : ")"}</dd>
          <dt>Step</dt><dd>{result.step === null ? "Not applicable" : result.step.toExponential(3)}</dd>
          <dt>Tolerance</dt><dd>{result.tolerance.toExponential(1)}</dd>
          <dt>Error</dt><dd>{result.errorEstimate === null ? "No certified bound" : `Estimated ~ ${result.errorEstimate.toExponential(2)} (not certified)`}</dd>
        </dl>
        {result.diagnostics.length > 0 && <ul className="graph2d-derivative-diagnostics">
          {result.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message}</li>)}
        </ul>}
        {result.formula && <details className="graph2d-inspector-more"><summary>Derivative expression</summary>
          <code>{result.formula}</code></details>}
      </div>)}
    </section>}
    <div className="graph2d-inspector-actions">
      <button type="button" disabled={!inspected.probe} onClick={locateSelected}>Locate</button>
      <button type="button" disabled={!selectedSeries?.artifact.segments.length} onClick={() => selectedSeries && fitSeries([selectedSeries])}>Fit function</button>
      <button type="button" onClick={() => onSelectionCommit?.({ objectId: null, probe: null })}>Clear selection</button>
    </div>
  </div> : <p className="graph2d-muted">Select a function to inspect it.</p>;
  return (
    <section data-testid="graphs-workspace" aria-label="Graphs workspace" className="graph2d-workspace"
      data-left={showLeft} data-right={showRight}
      style={{ "--graph2d-left-width": showLeft ? `${dockLayout.left}px` : "0px",
        "--graph2d-right-width": showRight ? `${dockLayout.right}px` : "0px" } as CSSProperties}>
      {showLeft && <aside className="graph2d-panel graph2d-left" aria-label="Graph functions">
        {functionList}
      </aside>}
      <div data-testid="main-viewer" className="graph2d-viewer" aria-label="Graph scene" ref={viewerRef}
        tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setPreview(null); setHoverSelection(null); }}
        onPointerLeave={() => setHoverSelection(null)} onWheel={onWheel} onKeyDown={onKeyDown}>
        <div className="graph2d-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { finishWheel(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); }}>Reset</button>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
        </div>
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Functions ({document.source.objects.length})</summary>{functionList}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={series}
          selectedProbe={document.selection.probe} hoverProbe={hoverSelection?.probe} overlays={differentialOverlays} />}
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
