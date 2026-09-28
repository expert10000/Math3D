import {
  analyzeGraph2DArcLength, analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, analyzeGraph2DIntervals,
  analyzeGraph2DIntersections,
  analyzeGraph2DLocalDifferential, fitGraph2DViewport,
  GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_WORKSPACE_CONTRACT,
  graph2DWorldToScreen, panGraph2DViewport, pickGraph2DProbe,
  isGraph2DCriticalPointCurrent, isGraph2DIntegralCurrent, isGraph2DIntervalAnalysisCurrent,
  isGraph2DIntersectionCurrent,
  isGraph2DLocalDifferentialCurrent, queryGraph2DInspector,
  resolveGraph2DViewport, selectionForGraph2DObject, zoomGraph2DViewport,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DSelection, type Graph2DViewport,
  type Graph2DIntegralMode,
  type Graph2DAnyPromotion,
  type Graph2DPreset,
} from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";
import { Graph2DAuthoringPanel } from "./Graph2DAuthoringPanel";
import { pointTableStore } from "./pointTableStore";
import { Graph2DPromotionPanel } from "./Graph2DPromotionPanel";
import { useGraph2DSampling } from "./useGraph2DSampling";
import { GraphGalleryDialog } from "./GraphGalleryDialog";
import "./graphsWorkspace.css";

type Props = {
  dockLayout: WorkspaceDockLayout;
  document: Graph2DDocument;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onViewportCommit?: (viewport: Graph2DViewport) => void;
  onGridModeCommit?: (mode: "cartesian" | "polar") => void;
  onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  promotions?: readonly Graph2DAnyPromotion[];
  onPromotionCreate?: (promotion: Graph2DAnyPromotion) => void;
  onPromotionLocate?: (id: string) => void;
  onPromotionRegenerate?: (id: string, mode: "replace" | "fork") => void;
  onOpenPreset?: (preset: Graph2DPreset) => void;
  onResumeCheckpoint?: (id: string) => void;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, status = "ready", errorMessage, onViewportCommit,
  onGridModeCommit, onAuthoringCommit, onSelectionCommit, onUndo, onRedo, promotions = [],
  onPromotionCreate, onPromotionLocate, onPromotionRegenerate, onOpenPreset, onResumeCheckpoint }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryOpener = useRef<HTMLButtonElement | null>(null);
  const galleryFocusFrame = useRef<number | null>(null);
  const closeGallery = () => { setGalleryOpen(false); galleryFocusFrame.current = requestAnimationFrame(() => {
    galleryFocusFrame.current = null; galleryOpener.current?.focus();
  }); };
  const viewerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [previewViewport, setPreviewViewport] = useState<Graph2DViewport | null>(null);
  const previewRef = useRef<Graph2DViewport | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewport: Graph2DViewport; moved: boolean } | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const [hoverSelection, setHoverSelection] = useState<Graph2DSelection | null>(null);
  const [areaDraft, setAreaDraft] = useState({ min: "-1", max: "1", mode: "signed" as Graph2DIntegralMode });
  const [areaRequest, setAreaRequest] = useState<{ objectId: string; min: number; max: number;
    mode: Graph2DIntegralMode } | null>(null);
  const [arcRequest, setArcRequest] = useState<{ objectId: string; min: number; max: number } | null>(null);
  const [intersectionDraft, setIntersectionDraft] = useState({ secondId: "", intervalMode: "visible" as "visible" | "custom",
    min: "-1", max: "1" });
  const [intersectionRequest, setIntersectionRequest] = useState<{ firstId: string; secondId: string;
    intervalMode: "visible" | "custom"; min: number; max: number } | null>(null);
  const setPreview = (viewport: Graph2DViewport | null) => { previewRef.current = viewport; setPreviewViewport(viewport); };
  const finishWheel = () => {
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
    const viewport = previewRef.current;
    if (viewport) onViewportCommit?.(viewport);
    setPreview(null);
  };
  useEffect(() => () => { if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    if (galleryFocusFrame.current !== null) cancelAnimationFrame(galleryFocusFrame.current);
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
  const samplingRequest = useMemo(() => ({ document, viewport, width: size.width, height: size.height,
    interaction: previewViewport !== null,
    pointTables: Object.fromEntries(document.source.objects.flatMap((object) =>
      object.kind === "point-series" ? [[object.table.id, pointTableStore.resolve(object.table)]] : [])),
  }), [document, size, viewport, previewViewport]);
  const sampling = useGraph2DSampling(samplingRequest);
  const series = sampling.series;
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
  const selectedObject = document.source.objects.find((item) => item.id === document.selection.objectId);
  const inspected = queryGraph2DInspector(document, selectedSeries);
  const criticalPoints = useMemo(() => {
    if (!selectedObject || selectedObject.kind !== "explicit-cartesian") return null;
    const bounds = resolveGraph2DViewport(document.display.viewport, size);
    return analyzeGraph2DCriticalPoints({ document, objectId: selectedObject.id,
      interval: { min: bounds.xMin, max: bounds.xMax } });
  }, [document, size, selectedObject]);
  const intervals = useMemo(() => criticalPoints ? analyzeGraph2DIntervals({ document,
    objectId: criticalPoints.objectId, interval: criticalPoints.interval, criticalPoints }) : null,
  [document, criticalPoints]);
  const area = useMemo(() => areaRequest && areaRequest.objectId === document.selection.objectId ?
    analyzeGraph2DIntegral({ document, objectId: areaRequest.objectId,
      interval: { min: areaRequest.min, max: areaRequest.max }, mode: areaRequest.mode }) : null,
  [document, areaRequest]);
  const arcLength = useMemo(() => arcRequest && arcRequest.objectId === document.selection.objectId ?
    analyzeGraph2DArcLength({ document, objectId: arcRequest.objectId,
      interval: { min: arcRequest.min, max: arcRequest.max } }) : null,
  [document, arcRequest]);
  const areaMin = areaDraft.min.trim() === "" ? NaN : Number(areaDraft.min);
  const areaMax = areaDraft.max.trim() === "" ? NaN : Number(areaDraft.max);
  const areaValid = Number.isFinite(areaMin) && Number.isFinite(areaMax) && areaMin < areaMax;
  const otherFunctions = document.source.objects.filter((entry) => entry.kind === "explicit-cartesian" &&
    selectedObject?.kind === "explicit-cartesian" && entry.id !== document.selection.objectId);
  const secondId = otherFunctions.some((entry) => entry.id === intersectionDraft.secondId) ?
    intersectionDraft.secondId : otherFunctions[0]?.id ?? "";
  const intersectionMin = intersectionDraft.min.trim() === "" ? NaN : Number(intersectionDraft.min);
  const intersectionMax = intersectionDraft.max.trim() === "" ? NaN : Number(intersectionDraft.max);
  const intersectionValid = !!secondId && (intersectionDraft.intervalMode === "visible" ||
    Number.isFinite(intersectionMin) && Number.isFinite(intersectionMax) && intersectionMin < intersectionMax);
  const intersections = useMemo(() => {
    if (!intersectionRequest || intersectionRequest.firstId !== document.selection.objectId ||
      !document.source.objects.some((entry) => entry.id === intersectionRequest.secondId)) return null;
    const bounds = resolveGraph2DViewport(document.display.viewport, size);
    return analyzeGraph2DIntersections({ document, firstObjectId: intersectionRequest.firstId,
      secondObjectId: intersectionRequest.secondId, interval: intersectionRequest.intervalMode === "visible" ?
        { min: bounds.xMin, max: bounds.xMax } :
        { min: intersectionRequest.min, max: intersectionRequest.max } });
  }, [document, size, intersectionRequest]);
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
    {onPromotionCreate && onPromotionLocate && onPromotionRegenerate && <Graph2DPromotionPanel document={document}
      promotions={promotions} onCreate={onPromotionCreate} onLocate={onPromotionLocate} onRegenerate={onPromotionRegenerate} />}
    <dl className="graph2d-inspector-details">
      <dt>Function</dt><dd>{inspected.label}</dd>
      <dt>Source</dt><dd><code>{inspected.kind === "explicit-cartesian" ? `y = ${inspected.expression}` : inspected.expression}</code></dd>
      <dt>{inspected.kind === "parametric" ? "Parameter t" : inspected.kind === "polar" ? "Angle θ" : "X domain"}</dt>
      <dd>{inspected.domain.includeMin ? "[" : "("}{inspected.domain.min}, {inspected.domain.max}{inspected.domain.includeMax ? "]" : ")"}</dd>
      {(selectedObject?.kind === "implicit" || selectedObject?.kind === "inequality") && <><dt>Y domain</dt>
        <dd>{selectedObject.yDomain.min}, {selectedObject.yDomain.max}</dd></>}
      <dt>Style</dt><dd><span className="graph2d-inspector-swatch" style={{ background: inspected.style.color }} />
        {inspected.style.lineStyle}, {inspected.style.lineWidth} px · {inspected.style.visible ? "visible" : "hidden"}</dd>
      <dt>Probe</dt><dd>{inspected.probe ? <span data-testid="graph2d-probe-coordinates">
        ({inspected.probe.x.toPrecision(6)}, {inspected.probe.y.toPrecision(6)})</span> : "No point selected"}</dd>
      {inspected.probe?.parameter !== undefined && <><dt>{inspected.kind === "polar" ? "Angle θ" : "Parameter t"}</dt>
        <dd data-testid="graph2d-probe-parameter">{inspected.probe.parameter.toPrecision(8)}</dd></>}
      {inspected.signedRadius !== null && <><dt>Signed radius</dt>
        <dd data-testid="graph2d-probe-radius">{inspected.signedRadius.toPrecision(8)}</dd></>}
      {inspected.probe?.rowId && <><dt>Row</dt><dd data-testid="graph2d-probe-row">{inspected.probe.rowId}</dd></>}
      <dt>Probe method</dt><dd>{inspected.probeMethod === "direct-expression-floating-point" ?
        "Direct expression evaluation (floating point)" : inspected.probeMethod === "sampled-contour" ?
          "Sampled contour projection" : inspected.probeMethod === "table-row" ? "Table row" : "Unavailable"}</dd>
      <dt>Sampling</dt><dd data-testid="graph2d-sampling-status">Adaptive bounded polyline · {inspected.sampling.status}</dd>
      {inspected.regionState && <><dt>Region</dt><dd data-testid="graph2d-region-status">{inspected.regionState}</dd></>}
      {inspected.pointState && <><dt>Table</dt><dd data-testid="graph2d-table-status">{inspected.pointState}</dd></>}
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
        <dt>Expression AST</dt><dd>{inspected.provenance.expressionAstVersion === null ? "N/A" :
          `v${inspected.provenance.expressionAstVersion}`}</dd>
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
    {criticalPoints && <section className="graph2d-critical-points" data-testid="graph2d-critical-points" aria-label="Zeros extrema and inflections">
      <h3>Zeros, extrema, inflections</h3>
      <p>Bounded scan: {criticalPoints.status} · x ∈ [{criticalPoints.interval.min.toPrecision(5)}, {criticalPoints.interval.max.toPrecision(5)}]
        {" "}· {criticalPoints.evaluations.toLocaleString()} evaluations</p>
      {criticalPoints.candidates.length ? <ol className="graph2d-critical-list">
        {criticalPoints.candidates.map((candidate) => <li key={candidate.candidateId}>
          <button type="button" aria-label={`Select ${candidate.kind} at x ${candidate.x.toPrecision(7)}`}
            disabled={!isGraph2DCriticalPointCurrent(candidate, document)}
            onClick={() => onSelectionCommit?.({ objectId: candidate.objectId,
              probe: { objectId: candidate.objectId, x: candidate.x, y: candidate.y } })}>
            <strong>{candidate.kind}</strong> ({candidate.x.toPrecision(7)}, {candidate.y.toPrecision(7)})
          </button>
          <small>{candidate.confidence} · {candidate.method} · residual {candidate.residual.toExponential(2)}
            {candidate.multiplicity === "even-possible" ? " · even multiplicity possible" : " · multiplicity unknown"}</small>
        </li>)}
      </ol> : <p>No candidates found in the scanned interval.</p>}
      <small>Candidate locations and multiplicities are not certified; narrow features may be missed.</small>
      {criticalPoints.diagnostics.length > 0 && <details className="graph2d-inspector-more"><summary>Analysis diagnostics</summary>
        <ul>{criticalPoints.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message} ({diagnostic.count})</li>)}</ul>
      </details>}
    </section>}
    {intervals && <section className="graph2d-intervals" data-testid="graph2d-intervals"
      data-result-id={intervals.resultId} aria-label="Monotonicity and concavity intervals">
      <h3>Monotonicity and concavity</h3>
      <p>{intervals.status} · {intervals.partitions.length} bounded intervals · {intervals.invalidSamples} undefined samples</p>
      <div className="graph2d-interval-table-wrap"><table><thead><tr>
        <th>Interval</th><th>Trend</th><th>Concavity</th><th>Boundary</th>
      </tr></thead><tbody>{intervals.partitions.map((part) => <tr key={part.intervalId}>
        <td>({part.min.toPrecision(5)}, {part.max.toPrecision(5)})</td>
        <td>{part.monotonicity}</td><td>{part.concavity}</td>
        <td>{part.leftBoundary} → {part.rightBoundary}</td>
      </tr>)}</tbody></table></div>
      <small>Signs are numerical samples, not proofs. Unknown intervals may contain discontinuities or narrow changes.</small>
    </section>}
    <section className="graph2d-area" data-testid="graph2d-area" aria-label="Interval area">
      <h3>Interval area</h3>
      <div className="graph2d-area-controls">
        <label>From x <input aria-label="Area from x" type="number" value={areaDraft.min}
          onChange={(event) => { setAreaDraft({ ...areaDraft, min: event.target.value }); setAreaRequest(null); setArcRequest(null); }} /></label>
        <label>To x <input aria-label="Area to x" type="number" value={areaDraft.max}
          onChange={(event) => { setAreaDraft({ ...areaDraft, max: event.target.value }); setAreaRequest(null); setArcRequest(null); }} /></label>
        <label>Measure <select aria-label="Area measure" value={areaDraft.mode}
          onChange={(event) => { setAreaDraft({ ...areaDraft, mode: event.target.value as Graph2DIntegralMode }); setAreaRequest(null); }}>
          <option value="signed">Signed area</option><option value="absolute">Absolute area</option>
        </select></label>
        <button type="button" disabled={!areaValid} onClick={() => document.selection.objectId &&
          setAreaRequest({ objectId: document.selection.objectId, min: areaMin, max: areaMax, mode: areaDraft.mode })}>
          Integrate interval</button>
      </div>
      {area && <div data-testid="graph2d-area-result" data-result-id={area.resultId}>
        <p>{area.mode} area: {area.value === null ? "Unavailable over full interval" : area.value.toPrecision(9)}</p>
        <small>Adaptive Simpson · tolerance {area.tolerance.toExponential(1)} · estimated error {area.errorEstimate === null ?
          "unavailable" : area.errorEstimate.toExponential(2)} · {area.evaluations.toLocaleString()} evaluations</small>
        {area.skippedCells > 0 && <p>{area.skippedCells} undefined or unresolved cells skipped; partial area {area.partialValue.toPrecision(7)}.</p>}
      </div>}
    </section>
    <section className="graph2d-arc-length" data-testid="graph2d-arc-length" aria-label="Arc length">
      <h3>Arc length</h3>
      <p>Measure the selected function over the x interval above.</p>
      <button type="button" disabled={!areaValid} onClick={() => document.selection.objectId &&
        setArcRequest({ objectId: document.selection.objectId, min: areaMin, max: areaMax })}>
        Measure arc length</button>
      {arcLength && <div data-testid="graph2d-arc-length-result" data-result-id={arcLength.resultId}>
        <p>Length: {arcLength.value === null ? "Unavailable over full interval" : arcLength.value.toPrecision(9)}</p>
        <small>{arcLength.method} · tolerance {arcLength.tolerance.toExponential(1)} · estimated error
          {" "}{arcLength.errorEstimate === null ? "unavailable" : arcLength.errorEstimate.toExponential(2)} ·
          {" "}{arcLength.evaluations.toLocaleString()} evaluations</small>
        {arcLength.unresolvedCells > 0 && <p>{arcLength.unresolvedCells} unresolved cells; partial length
          {" "}{arcLength.partialValue.toPrecision(7)}.</p>}
      </div>}
    </section>
    <section className="graph2d-intersections" data-testid="graph2d-intersections" aria-label="Pairwise intersections">
      <h3>Pairwise intersections</h3>
      {otherFunctions.length ? <div className="graph2d-intersection-controls">
        <label>Second function <select aria-label="Intersect with function" value={secondId}
          onChange={(event) => { setIntersectionDraft({ ...intersectionDraft, secondId: event.target.value }); setIntersectionRequest(null); }}>
          {otherFunctions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select></label>
        <label>Interval <select aria-label="Intersection interval" value={intersectionDraft.intervalMode}
          onChange={(event) => { setIntersectionDraft({ ...intersectionDraft,
            intervalMode: event.target.value as "visible" | "custom" }); setIntersectionRequest(null); }}>
          <option value="visible">Visible x range</option><option value="custom">Custom [a,b]</option>
        </select></label>
        {intersectionDraft.intervalMode === "custom" && <>
          <label>From x <input aria-label="Intersection from x" type="number" value={intersectionDraft.min}
            onChange={(event) => { setIntersectionDraft({ ...intersectionDraft, min: event.target.value }); setIntersectionRequest(null); }} /></label>
          <label>To x <input aria-label="Intersection to x" type="number" value={intersectionDraft.max}
            onChange={(event) => { setIntersectionDraft({ ...intersectionDraft, max: event.target.value }); setIntersectionRequest(null); }} /></label>
        </>}
        <button type="button" disabled={!intersectionValid} onClick={() => document.selection.objectId &&
          setIntersectionRequest({ firstId: document.selection.objectId, secondId,
            intervalMode: intersectionDraft.intervalMode, min: intersectionMin, max: intersectionMax })}>
          Solve intersections</button>
      </div> : <p>Add another function to compare.</p>}
      {intersections && <div data-testid="graph2d-intersection-result" data-result-id={intersections.resultId}>
        <p>{intersections.status} · {intersections.candidates.length} candidates · x ∈
          [{intersections.interval.min.toPrecision(5)}, {intersections.interval.max.toPrecision(5)}]</p>
        {intersections.candidates.length > 0 ? <ol className="graph2d-intersection-list">
          {intersections.candidates.map((candidate) => <li key={candidate.candidateId}>
            <button type="button" aria-label={`Select intersection at x ${candidate.x.toPrecision(7)}`}
              disabled={!isGraph2DIntersectionCurrent(intersections, document)}
              onClick={() => onSelectionCommit?.({ objectId: candidate.firstObjectId,
                probe: { objectId: candidate.firstObjectId, x: candidate.x, y: candidate.y } })}>
              ({candidate.x.toPrecision(7)}, {candidate.y.toPrecision(7)})</button>
            <small>{candidate.classification} · {candidate.confidence} · {candidate.method} · residual {candidate.residual.toExponential(2)}</small>
          </li>)}
        </ol> : <p>No isolated candidates found.</p>}
        {(intersections.invalidCells > 0 || intersections.unresolvedBrackets > 0 || intersections.coincidentCells > 0) &&
          <small>{intersections.invalidCells} undefined cells · {intersections.unresolvedBrackets} unresolved brackets ·
            {" "}{intersections.coincidentCells} coincident cells</small>}
        <small>Tangencies are possible candidates; narrow intersections may be missed.</small>
      </div>}
    </section>
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
          <button type="button" data-testid="graph-gallery-open" onClick={event => { galleryOpener.current = event.currentTarget; finishWheel(); setGalleryError(null); setGalleryOpen(true); }}>Gallery</button>
          <button type="button" onClick={() => { finishWheel(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); }}>Reset</button>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
          <button type="button" aria-label="Toggle polar grid" aria-pressed={(document.display.axes.gridMode ?? "cartesian") === "polar"}
            onClick={() => onGridModeCommit?.((document.display.axes.gridMode ?? "cartesian") === "polar" ? "cartesian" : "polar")}>
            {(document.display.axes.gridMode ?? "cartesian") === "polar" ? "Cartesian grid" : "Polar grid"}</button>
        </div>
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Functions ({document.source.objects.length})</summary>{functionList}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={series}
          selectedProbe={document.selection.probe} hoverProbe={hoverSelection?.probe} overlays={differentialOverlays}
          intervals={intervals && isGraph2DIntervalAnalysisCurrent(intervals, document) ? intervals : null}
          area={area && isGraph2DIntegralCurrent(area, document) ? area : null}
          intersections={intersections && isGraph2DIntersectionCurrent(intersections, document) ? intersections : null} />}
        {sampling.error && <div role="alert" className="graph2d-viewer-message">{sampling.error}</div>}
        {status === "loading" ? <div className="graph2d-viewer-message" role="status">Loading graph…</div> :
          status === "error" ? <div className="graph2d-viewer-message" role="alert">{errorMessage || "Graph could not be opened."}</div> :
          document.source.objects.length === 0 ? <div className="graph2d-viewer-message" aria-label="Empty graph scene">
            <h2>Graphs</h2>
            <p>An empty Cartesian graph scene is ready.</p>
            <button type="button" onClick={event => { galleryOpener.current = event.currentTarget; setGalleryError(null); setGalleryOpen(true); }}>Explore Graph Gallery</button>
            <small>{document.source.objects.length} functions · {GRAPH2D_WORKSPACE_CONTRACT.initialObjectKind} source</small>
          </div> : null}
      </div>
      {showRight && <aside className="graph2d-panel graph2d-right" aria-label="Graph inspector">
        <h2>Inspector</h2>{inspector}
      </aside>}
      {galleryOpen && <GraphGalleryDialog activeId={document.identity.id} error={galleryError} onClose={closeGallery}
        onOpen={preset => { try { if (!onOpenPreset) throw new Error("Project storage is unavailable."); onOpenPreset(preset); setGalleryOpen(false); }
          catch (error) { setGalleryError((error as Error).message); } }}
        onResume={id => { try { if (!onResumeCheckpoint) throw new Error("Project storage is unavailable."); onResumeCheckpoint(id); setGalleryOpen(false); }
          catch (error) { setGalleryError((error as Error).message); } }} />}
    </section>
  );
}
