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
  type Graph2DPersonalPresetPreview,
  graph2DPublicationAnalysisTables,
  graph2DParameterSessionKey, previewGraph2DParameterValues, graph2DHasLogScale,
  isGraph2DRegressionCurrent, graph2DRegressionResidualTable, graph2DRegressionCurveTable, graph2DPublicationAnalysisTable,
  type Graph2DRegression, type Graph2DRegressionModel,
  projectGraph2DGrid, projectGraph2DPolarGrid,
  structuralHash,
  graph2DToolUnavailable, type Graph2DTool,
  editGraph2DProbes, graph2DPinnedProbeState, projectGraph2DProbeMarkers,
  getGraph2DGuidedDocumentGuidance,
} from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot, type Graph2DPlotSeries } from "./Graph2DPlot";
import { Graph2DAuthoringPanel, type Graph2DLeftPalette } from "./Graph2DAuthoringPanel";
import { pointTableStore } from "./pointTableStore";
import { Graph2DPromotionPanel } from "./Graph2DPromotionPanel";
import { useGraph2DSampling } from "./useGraph2DSampling";
import { GraphGalleryDialog } from "./GraphGalleryDialog";
import { Graph2DExportDialog } from "./Graph2DExportDialog";
import { Graph2DParametersPanel } from "./Graph2DParametersPanel";
import { Graph2DScalePanel } from "./Graph2DScalePanel";
import { Graph2DGridPanel } from "./Graph2DGridPanel";
import { Graph2DRegressionPanel } from "./Graph2DRegressionPanel";
import { Graph2DToolsPanel } from "./Graph2DToolsPanel";
import { Graph2DProbesPanel } from "./Graph2DProbesPanel";
import "./graphsWorkspace.css";

const GRAPH2D_LEFT_PALETTE_KEY = "math3d.graphs.leftPalette.v1";

function readGraph2DLeftPalette(): Graph2DLeftPalette {
  if (typeof window === "undefined") return "classic";
  try {
    return window.localStorage.getItem(GRAPH2D_LEFT_PALETTE_KEY) === "geometry" ? "geometry" : "classic";
  } catch {
    return "classic";
  }
}

type Props = {
  dockLayout: WorkspaceDockLayout;
  document: Graph2DDocument;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onViewportCommit?: (viewport: Graph2DViewport) => void;
  onGridModeCommit?: (mode: "cartesian" | "polar") => void;
  onAxesCommit?: (axes: Graph2DDocument["display"]["axes"]) => void;
  onProbesCommit?: (probes: NonNullable<Graph2DDocument["display"]["pinnedProbes"]>) => void;
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
  onCopyProject?: (id: string, title: string) => void;
  onExportPersonalProject?: (id: string) => { bytes: string; title: string; externalTableCount: number; missingTableCount: number; resultCount: number };
  onCopyGraphDefinition?: (id: string) => string;
  onPreviewPersonalImport?: (raw: string) => Graph2DPersonalPresetPreview;
  onImportPersonalProject?: (preview: Graph2DPersonalPresetPreview) => void;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, status = "ready", errorMessage, onViewportCommit,
  onGridModeCommit, onAxesCommit, onProbesCommit, onAuthoringCommit, onSelectionCommit, onUndo, onRedo, promotions = [],
  onPromotionCreate, onPromotionLocate, onPromotionRegenerate, onOpenPreset, onResumeCheckpoint, onCopyProject,
  onExportPersonalProject, onCopyGraphDefinition, onPreviewPersonalImport, onImportPersonalProject }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [leftPalette, setLeftPalette] = useState<Graph2DLeftPalette>(readGraph2DLeftPalette);
  const changeLeftPalette = (palette: Graph2DLeftPalette) => {
    setLeftPalette(palette);
    try { window.localStorage.setItem(GRAPH2D_LEFT_PALETTE_KEY, palette); } catch { /* Appearance remains session-local. */ }
  };
  const [presentation, setPresentation] = useState(false);
  const presentationOpener = useRef<HTMLButtonElement>(null);
  const exitPresentation = () => { setPresentation(false); requestAnimationFrame(() => presentationOpener.current?.focus()); };
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolHint, setToolHint] = useState("");
  const toolsOpener = useRef<HTMLButtonElement>(null);
  const closeTools = () => { setToolsOpen(false); toolsOpener.current?.focus(); };
  const [exportOpen, setExportOpen] = useState(false);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [parameterCards, setParameterCards] = useState(false);
  const [scalesOpen, setScalesOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [gridPreview, setGridPreview] = useState<Graph2DDocument["display"]["axes"] | null>(null);
  useEffect(() => { setGridPreview(null); setGridOpen(false); }, [document.identity.id]);
  const gridOpener = useRef<HTMLButtonElement | null>(null);
  const commitGrid = (axes: Graph2DDocument["display"]["axes"]) => {
    if (!onAxesCommit) throw new Error("Grid settings are unavailable.");
    if (structuralHash(axes) !== structuralHash(document.display.axes)) onAxesCommit(axes);
    setGridPreview(null);
  };
  const closeGrid = (save = false, focus = true) => {
    if (save && gridPreview) commitGrid(gridPreview);
    setGridPreview(null); setGridOpen(false); if (focus) gridOpener.current?.focus();
  };
  const [regression, setRegression] = useState<Graph2DRegression | null>(null), [regressionModel, setRegressionModel] = useState<Graph2DRegressionModel>("linear");
  const [parameterEpoch, setParameterEpoch] = useState(0);
  const parametersOpener = useRef<HTMLButtonElement | null>(null);
  const scalesOpener = useRef<HTMLButtonElement | null>(null);
  const parameterKey = graph2DParameterSessionKey(document);
  const [parameterPreview, setParameterPreview] = useState<{ key: string; values: Record<string, number> } | null>(null);
  const parameterPreviewActive = parameterPreview?.key === parameterKey;
  const cancelParameter = () => { setParameterPreview(null); setParameterEpoch(value => value + 1); };
  const sampledDocument = useMemo(() => parameterPreview?.key === parameterKey ? previewGraph2DParameterValues(document, parameterPreview.values) : document,
    [document, parameterPreview, parameterKey]);
  const exportOpener = useRef<HTMLButtonElement | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryOpener = useRef<HTMLButtonElement | null>(null);
  const galleryFocusFrame = useRef<number | null>(null);
  const closeGallery = () => { setGalleryOpen(false); galleryFocusFrame.current = requestAnimationFrame(() => {
    galleryFocusFrame.current = null; galleryOpener.current?.focus();
  }); };
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [previewViewport, setPreviewViewport] = useState<Graph2DViewport | null>(null);
  const previewRef = useRef<Graph2DViewport | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewport: Graph2DViewport; moved: boolean } | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const wheelHandlerRef = useRef<(event: globalThis.WheelEvent) => void>(() => {});
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
    const element = viewerRef.current; if (!element) return;
    const wheel = (event: globalThis.WheelEvent) => wheelHandlerRef.current(event);
    // React's delegated wheel listener is passive: preventDefault there cannot
    // stop native scrolling/browser zoom, which moves the apparent focal point.
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
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
  useEffect(() => {
    const viewer = viewerRef.current, toolbar = toolbarRef.current;
    if (!viewer || !toolbar) return;
    const update = () => viewer.style.setProperty("--graph2d-toolbar-bottom", `${toolbar.offsetTop + toolbar.offsetHeight + 8}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    if (!observer) window.addEventListener("resize", update);
    return () => { observer?.disconnect(); if (!observer) window.removeEventListener("resize", update); };
  }, []);
  const showLeft = !presentation && !dockLayout.viewerMaximized && !dockLayout.leftCollapsed;
  const showRight = !presentation && !dockLayout.viewerMaximized && !dockLayout.rightCollapsed;
  const guided = getGraph2DGuidedDocumentGuidance(document);
  const viewport = previewViewport ?? document.display.viewport;
  const displayAxes = gridPreview ?? document.display.axes;
  const gridWarnings = useMemo(() => !displayAxes.grid ? [] : displayAxes.gridMode === "polar" ?
    (displayAxes.gridOptions ? projectGraph2DPolarGrid(viewport, size, displayAxes.gridOptions).warnings : []) :
    (projectGraph2DGrid(viewport, size, displayAxes.gridOptions).warnings ?? []), [displayAxes, viewport, size]);
  const manualGrid = displayAxes.gridOptions?.xStep != null || displayAxes.gridOptions?.yStep != null;
  const renderedDisplay = useMemo(() => ({ ...document.display, axes: displayAxes, viewport, ...(parameterPreviewActive ? { pinnedProbes: [] } : {}) }), [document.display, displayAxes, viewport, parameterPreviewActive]);
  const samplingRequest = useMemo(() => ({ document: sampledDocument, viewport, width: size.width, height: size.height,
    interaction: previewViewport !== null,
    pointTables: Object.fromEntries(document.source.objects.flatMap((object) =>
      object.kind === "point-series" ? [[object.table.id, pointTableStore.resolve(object.table)]] : [])),
  }), [sampledDocument, size, viewport, previewViewport]);
  const sampling = useGraph2DSampling(samplingRequest, parameterPreviewActive ? document.identity : undefined);
  const series = sampling.series;
  const pick = (x: number, y: number, previous?: Graph2DSelection) => sampling.ready && !parameterPreviewActive ? pickGraph2DProbe({ document, series,
    viewport, size, screen: { x, y }, previous }).selection : document.selection;
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = (viewerRef.current!.querySelector("svg") ?? viewerRef.current!).getBoundingClientRect();
    // Use the actual plot rectangle, not its bordered/scrolled container.
    return { x: (event.clientX - rect.left) * size.width / rect.width, y: (event.clientY - rect.top) * size.height / rect.height };
  };
  const fitSeries = (items: readonly Graph2DPlotSeries[]) => {
    if (!sampling.ready || parameterPreviewActive) return;
    let xMin = Number.POSITIVE_INFINITY, xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY, yMax = Number.NEGATIVE_INFINITY;
    for (const item of items) for (const segment of item.artifact.segments) for (const point of segment.points) {
      if ((viewport.xScale === "log10" && point.x <= 0) || (viewport.yScale === "log10" && point.y <= 0)) continue;
      xMin = Math.min(xMin, point.x); xMax = Math.max(xMax, point.x);
      yMin = Math.min(yMin, point.y); yMax = Math.max(yMax, point.y);
    }
    if (!Number.isFinite(xMin)) return;
    onViewportCommit?.(fitGraph2DViewport({ xMin, xMax, yMin, yMax }, size, viewport.aspect, .08, viewport));
  };
  const fitVisible = () => fitSeries(series);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,summary,details,input,select,textarea,label,form")) return;
    cancelParameter();
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
    else if (!drag.moved && !gridOpen && !scalesOpen && !parametersOpen) { const point = localPoint(event); onSelectionCommit?.(pick(point.x, point.y, document.selection)); }
    setPreview(null);
  };
  wheelHandlerRef.current = (event: globalThis.WheelEvent) => {
    if (galleryOpen || exportOpen || (event.target as Element).closest(".graph2d-toolbar,.graph2d-compact-panels,.graph2d-viewer-message")) return;
    cancelParameter();
    event.preventDefault();
    const anchor = localPoint(event);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
    const next = zoomGraph2DViewport(previewRef.current ?? document.display.viewport, size, anchor,
      Math.exp(-Math.max(-1000, Math.min(1000, delta)) * 0.0015));
    setPreview(next);
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(finishWheel, 180);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && presentation) { event.preventDefault(); event.stopPropagation(); exitPresentation(); return; }
    if (event.key === "Escape" && toolsOpen) { event.preventDefault(); event.stopPropagation(); closeTools(); return; }
    if (event.key === "Escape" && gridOpen) { event.preventDefault(); event.stopPropagation(); closeGrid(); return; }
    if ((event.target as HTMLElement).closest("input,select,textarea,[contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault(); if (event.shiftKey) onRedo?.(); else onUndo?.(); return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") { event.preventDefault(); onRedo?.(); return; }
    // Toolbar/compact-panel focus is not a request to change the plot selection or viewport.
    if (event.target !== event.currentTarget) return;
    if (key === "escape") { event.preventDefault(); onSelectionCommit?.({ objectId: null, probe: null }); return; }
    if (key === "[" || key === "]") {
      event.preventDefault();
      if (parameterPreviewActive || !sampling.ready) return;
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
  const toolRowsAvailable = selectedObject?.kind !== "point-series" || !!pointTableStore.resolve(selectedObject.table);
  const routeTool = (tool: Graph2DTool) => {
    const reason = graph2DToolUnavailable(document, tool, toolRowsAvailable);
    if (reason) { setToolHint(reason); return; }
    finishWheel(); closeGrid(true, false); cancelParameter(); setToolsOpen(false);
    if (tool === "slider") { setParametersOpen(true); return; }
    setToolHint(tool === "probe" ? "Click a curve to commit a probe. Saved probes are source-linked observations." :
      tool === "move" ? "Drag to move; click a curve to select." : "Approximate bounded observations; review confidence and interval before using a result.");
    const target = tool === "roots" || tool === "extrema" ? '[data-testid="graph2d-critical-points"]' :
      tool === "intersections" ? '[data-testid="graph2d-intersections"]' : tool === "regression" ? '[data-testid="graph2d-regression"]' :
      tool === "tangent" ? '[data-testid="graph2d-local-differential"]' : null;
    if (!target) { viewerRef.current?.focus(); return; }
    galleryFocusFrame.current = requestAnimationFrame(() => {
      galleryFocusFrame.current = null;
      const root = viewerRef.current?.closest(".graph2d-workspace");
      const compact = root?.querySelector<HTMLDetailsElement>(".graph2d-compact-panels details:last-child");
      if (compact && compact.getBoundingClientRect().width > 0) compact.open = true;
      const section = Array.from(root?.querySelectorAll<HTMLElement>(target) ?? []).find(el => el.getBoundingClientRect().width > 0);
      if (section) { section.tabIndex = -1; section.focus(); section.scrollIntoView({ block: "nearest" }); }
    });
  };
  const currentRegression = regression && regression.model === regressionModel && regression.objectId === selectedObject?.id &&
    isGraph2DRegressionCurrent(regression, document) ? regression : null;
  // Same-source retained samples are an explicitly labelled previous observation, not current analysis evidence.
  const inspected = queryGraph2DInspector(document, parameterPreviewActive ? undefined : selectedSeries);
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
  const exportAnalyses = useMemo(() => {
    const tables = graph2DPublicationAnalysisTables(!exportOpen ? [] : [criticalPoints, intervals, area, arcLength, intersections,
      differential, ...(derivatives ?? [])].filter(result => !!result) as { publication: import("@math3d/core").AnalysisResultEnvelope }[]);
    if (exportOpen && currentRegression) {
      tables.analyses.push(graph2DPublicationAnalysisTable({ publication: currentRegression.publication, summary: currentRegression.publication.summary } as { publication: import("@math3d/core").AnalysisResultEnvelope }),
        graph2DRegressionResidualTable(currentRegression), graph2DRegressionCurveTable(currentRegression));
      if (currentRegression.n > 2048) tables.analysisNotes.push(`Regression residual table includes first 2048 of ${currentRegression.n} rows; full data and model are unchanged.`);
    }
    return tables;
  }, [exportOpen, criticalPoints, intervals, area, arcLength, intersections, differential, derivatives, currentRegression]);
  const locateSelected = () => {
    if (!document.selection.probe) return;
    const screen = graph2DWorldToScreen(viewport, size, document.selection.probe);
    onViewportCommit?.(panGraph2DViewport(viewport, size, { x: size.width / 2 - screen.x, y: size.height / 2 - screen.y }));
  };
  const functionList = <Graph2DAuthoringPanel document={document} onCommit={onAuthoringCommit}
    palette={leftPalette} onPaletteChange={changeLeftPalette}
    onSelect={(objectId) => onSelectionCommit?.(parameterPreviewActive || !sampling.ready ? { objectId, probe: null } : selectionForGraph2DObject(document, series, objectId, document.selection.probe?.x))} />;
  const savedProbes = <Graph2DProbesPanel document={document} onAction={action => {
    if (!onProbesCommit) throw new Error("Probe storage unavailable.");
    onProbesCommit(editGraph2DProbes(document, action));
  }} onLocate={id => {
    const p = document.display.pinnedProbes?.find(p => p.id === id);
    if (!p || ["stale", "invalid"].includes(graph2DPinnedProbeState(document, p))) return;
    onSelectionCommit?.({ objectId: p.objectId, probe: { objectId: p.objectId, x: p.x, y: p.y } });
    const screen = graph2DWorldToScreen(viewport, size, p);
    onViewportCommit?.(panGraph2DViewport(viewport, size, { x: size.width / 2 - screen.x, y: size.height / 2 - screen.y }));
  }} />;
  const inspector = inspected ? <div className="graph2d-inspector">
    {selectedObject?.kind === "point-series" && <Graph2DRegressionPanel document={document} model={regressionModel} onModel={setRegressionModel} result={regression} onResult={setRegression} />}
    {parameterPreviewActive && <p role="status">Inspector and analyses refer to the committed source, not the parameter preview.</p>}
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
      <dt>Sampling</dt><dd className="graph2d-sampling-observation-status" data-testid="graph2d-sampling-status">{!parameterPreviewActive && !sampling.ready ?
        sampling.retained ? "Updating — previous observation" : "Updating — no observation yet" : `Adaptive bounded polyline · ${inspected.sampling.status}`}</dd>
      {inspected.regionState && <><dt>Region</dt><dd data-testid="graph2d-region-status">{inspected.regionState}</dd></>}
      {inspected.pointState && <><dt>Table</dt><dd data-testid="graph2d-table-status">{inspected.pointState}</dd></>}
      <dt>Budget</dt><dd>{inspected.sampling.policy.maxSamples.toLocaleString()} samples, depth {inspected.sampling.policy.maxDepth},
        {" "}{inspected.sampling.policy.tolerancePx} px tolerance</dd>
      <dt>Observed</dt><dd className="graph2d-sampling-observation-count" data-testid="graph2d-observed-sampling">{inspected.sampling.samplesEvaluated === null ? "Unavailable" :
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
      <button type="button" disabled={!sampling.ready || parameterPreviewActive || !selectedSeries?.artifact.segments.length} onClick={() => selectedSeries && fitSeries([selectedSeries])}>Fit function</button>
      <button type="button" onClick={() => onSelectionCommit?.({ objectId: null, probe: null })}>Clear selection</button>
    </div>
    {savedProbes}
  </div> : <div className="graph2d-inspector"><p className="graph2d-muted">Select a function to inspect it.</p>{savedProbes}</div>;
  return (
    <section data-testid="graphs-workspace" aria-label="Graphs workspace" className="graph2d-workspace"
      data-left={showLeft} data-right={showRight} data-presentation={presentation}
      style={{ "--graph2d-left-width": showLeft ? `${dockLayout.left}px` : "0px",
        "--graph2d-right-width": showRight ? `${dockLayout.right}px` : "0px" } as CSSProperties}>
      {showLeft && <aside className="graph2d-panel graph2d-left" data-palette={leftPalette} aria-label="Graph functions">
        {functionList}
      </aside>}
      <div data-testid="main-viewer" className="graph2d-viewer" aria-label="Graph scene" ref={viewerRef}
        tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setPreview(null); setHoverSelection(null); }}
        onPointerLeave={() => setHoverSelection(null)} onKeyDown={onKeyDown}>
        {presentation && <div className="graph2d-presentation-controls" onPointerDown={event => event.stopPropagation()}>
          <span>Presentation · {document.metadata.title}</span>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
          <button type="button" onClick={event => { exportOpener.current = event.currentTarget; finishWheel(); setExportOpen(true); }}>Export</button>
          <button type="button" data-testid="graph2d-presentation-exit" onClick={exitPresentation}>Exit presentation</button>
        </div>}
        <div className="graph2d-toolbar" ref={toolbarRef} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" ref={presentationOpener} data-testid="graph2d-presentation-open" onClick={() => {
            finishWheel(); closeGrid(true, false); cancelParameter(); setParametersOpen(false); setScalesOpen(false); setToolsOpen(false);
            setParameterCards(false); setPresentation(true);
            requestAnimationFrame(() => viewerRef.current?.querySelector<HTMLButtonElement>('[data-testid="graph2d-presentation-exit"]')?.focus());
          }}>Present</button>
          <button type="button" ref={toolsOpener} aria-expanded={toolsOpen} onClick={() => { finishWheel(); closeGrid(true, false); cancelParameter(); setToolsOpen(!toolsOpen); }}>Tools</button>
          <button type="button" ref={gridOpener} aria-expanded={gridOpen} disabled={status !== "ready"} onClick={() => { finishWheel(); cancelParameter(); setParametersOpen(false); setScalesOpen(false); if (gridOpen) closeGrid(true); else setGridOpen(true); }}>Grid</button>
          <button type="button" ref={scalesOpener} onClick={() => { finishWheel(); cancelParameter(); closeGrid(true, false); setParametersOpen(false); setScalesOpen(!scalesOpen); }}>Scales</button>
          <button type="button" aria-pressed={viewport.continuation ?? false} onClick={() => { finishWheel(); cancelParameter(); onViewportCommit?.({ ...document.display.viewport, continuation: !document.display.viewport.continuation }); }}>Show continuation</button>
          <button type="button" data-testid="graph-gallery-open" onClick={event => { galleryOpener.current = event.currentTarget; finishWheel(); closeGrid(true, false); setScalesOpen(false); setParametersOpen(false); setParameterPreview(null); setGalleryError(null); setGalleryOpen(true); }}>Gallery</button>
          <button type="button" data-testid="graph2d-parameters-open" disabled={status !== "ready"} onClick={event => {
            parametersOpener.current = event.currentTarget; finishWheel(); setParametersOpen(value => !value); setParameterPreview(null);
            setScalesOpen(false);
            closeGrid(true, false);
            if (!parametersOpen) galleryFocusFrame.current = requestAnimationFrame(() => { galleryFocusFrame.current = null;
              parametersOpener.current?.closest(".graph2d-workspace")?.querySelector<HTMLButtonElement>('[data-testid="graph2d-parameters-close"]')?.focus(); });
          }}>Parameters</button>
          <button type="button" aria-pressed={parameterCards} onClick={() => { finishWheel(); cancelParameter(); setParametersOpen(false); setParameterCards(!parameterCards); }}>Parameter cards</button>
          <button type="button" data-testid="graph2d-export-open" disabled={status !== "ready" || parameterPreviewActive} onClick={event => {
            exportOpener.current = event.currentTarget; finishWheel(); closeGrid(true, false); dragRef.current = null; setExportOpen(true);
          }}>Export</button>
          <button type="button" onClick={() => { finishWheel(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); }}>Reset</button>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
          <button type="button" aria-label="Toggle polar grid" aria-pressed={(document.display.axes.gridMode ?? "cartesian") === "polar"}
            disabled={graph2DHasLogScale(viewport) || manualGrid} title={graph2DHasLogScale(viewport) ? "Polar grid needs linear axes" : manualGrid ? "Set both grid spacings to Auto before switching to polar" : undefined}
            onClick={() => onGridModeCommit?.((document.display.axes.gridMode ?? "cartesian") === "polar" ? "cartesian" : "polar")}>
            {(document.display.axes.gridMode ?? "cartesian") === "polar" ? "Cartesian grid" : "Polar grid"}</button>
        </div>
        {toolHint && <p className="graph2d-tool-hint" role="status">{toolHint}</p>}
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Functions ({document.source.objects.length})</summary>{functionList}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={series}
          probeMarkers={parameterPreviewActive ? [] : projectGraph2DProbeMarkers({ ...document, display: renderedDisplay }, size)}
          regression={!parameterPreviewActive && document.display.objects.find(s => s.objectId === currentRegression?.objectId)?.visible ? currentRegression : null}
          selectedProbe={parameterPreviewActive ? null : document.selection.probe} hoverProbe={parameterPreviewActive ? null : hoverSelection?.probe} overlays={parameterPreviewActive ? [] : differentialOverlays}
          intervals={!parameterPreviewActive && intervals && isGraph2DIntervalAnalysisCurrent(intervals, document) ? intervals : null}
          area={!parameterPreviewActive && area && isGraph2DIntegralCurrent(area, document) ? area : null}
          intersections={!parameterPreviewActive && intersections && isGraph2DIntersectionCurrent(intersections, document) ? intersections : null} />}
        {sampling.error && <div role="alert" className="graph2d-viewer-message">{sampling.error}</div>}
        {(gridWarnings.length > 0 || viewport.continuation || graph2DHasLogScale(viewport) || parameterPreviewActive || !sampling.ready && document.source.objects.length > 0) && <div role="status" className="graph2d-update-status" data-testid="graph2d-update-status">
          {gridWarnings.join(" ")}
          {parameterPreviewActive ? "Parameter preview — not saved. Apply or Cancel; committed analyses are hidden on the plot." : ""}
          {!sampling.ready ? sampling.retained ? " Updating graph… previous preview/same-source samples remain visible." : " Sampling graph…" : ""}
          {viewport.continuation ? " Light dotted continuation: outside authored range; visual only, not analysed/exported. Bounded preview may be incomplete." : ""}
          {graph2DHasLogScale(viewport) ? " Log axes: non-positive coordinates omitted; analysis uses world units, tangent/area/interval overlays hidden." : ""}
        </div>}
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
        <h2>Inspector</h2>
        {guided && <details className="graph2d-guided-panel" data-testid="graph2d-guided-panel">
          <summary>Guide: {guided.concept.title} · {guided.state}</summary>
          {guided.state === "stale" && <p role="status">Source or marker changed. These steps describe the original example; request fresh analysis before drawing conclusions.</p>}
          <ol>{guided.concept.steps.map(step => <li key={step.heading}><strong>{step.heading}</strong><p>{step.explanation}</p><p>Try this: {step.tryThis}</p></li>)}</ol>
          <small>Markers are saved probes. Numerical results are computed only when requested, with their stated limits.</small>
        </details>}{inspector}
      </aside>}
      {galleryOpen && <GraphGalleryDialog activeId={document.identity.id} activeTitle={document.metadata.title} error={galleryError} onClose={closeGallery}
        onExportProject={onExportPersonalProject} onCopyDefinition={onCopyGraphDefinition} onPreviewImport={onPreviewPersonalImport}
        onImportProject={preview => { try { if (!onImportPersonalProject) throw new Error("Project import is unavailable.");
          onImportPersonalProject(preview); setGalleryOpen(false); } catch (e) { setGalleryError((e as Error).message); } }}
        onCopy={(id,title) => { try { if (!onCopyProject) throw new Error("Project storage unavailable."); onCopyProject(id,title); setGalleryOpen(false); } catch(e) { setGalleryError((e as Error).message); } }}
        onOpen={preset => { try { if (!onOpenPreset) throw new Error("Project storage is unavailable."); onOpenPreset(preset); setGalleryOpen(false); }
          catch (error) { setGalleryError((error as Error).message); } }}
        onResume={id => { try { if (!onResumeCheckpoint) throw new Error("Project storage is unavailable."); onResumeCheckpoint(id); setGalleryOpen(false); }
          catch (error) { setGalleryError((error as Error).message); } }} />}
      {exportOpen && <Graph2DExportDialog document={document} analyses={exportAnalyses.analyses} analysisNotes={exportAnalyses.analysisNotes} onClose={() => {
        setExportOpen(false); galleryFocusFrame.current = requestAnimationFrame(() => {
          galleryFocusFrame.current = null; exportOpener.current?.focus();
        });
      }} />}
      {scalesOpen && <Graph2DScalePanel key={document.identity.id} document={document} onCommit={v => onViewportCommit?.(v)} onClose={() => { setScalesOpen(false); scalesOpener.current?.focus(); }} />}
      {gridOpen && <Graph2DGridPanel key={document.identity.id} document={document} onPreview={setGridPreview} onCommit={commitGrid} onClose={() => closeGrid()} />}
      {(parametersOpen || parameterCards) && <Graph2DParametersPanel key={`${parameterKey}:${parameterEpoch}`} document={document} settled={sampling.settled} samplingError={sampling.error}
        compact={!parametersOpen} onExpand={() => setParametersOpen(true)}
        onPreview={values => { if (values) previewGraph2DParameterValues(document, values); setParameterPreview(values ? { key: parameterKey, values } : null); }}
        onCommit={action => { if (!onAuthoringCommit) throw new Error("Parameter authoring is unavailable."); onAuthoringCommit(action); setParameterPreview(null); }}
        onClose={() => { setParametersOpen(false); setParameterCards(false); cancelParameter(); parametersOpener.current?.focus(); }} />}
      {toolsOpen && <Graph2DToolsPanel document={document} rowsAvailable={toolRowsAvailable} onTool={routeTool} onClose={closeTools} />}
    </section>
  );
}
