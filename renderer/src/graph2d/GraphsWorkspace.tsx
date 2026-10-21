import {
  analyzeGraph2DArcLength, analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, analyzeGraph2DIntervals,
  analyzeGraph2DIntersections,
  sampleGraph2DDerivativeCurve,
  analyzeGraph2DLocalDifferential, fitGraph2DViewport,
  graph2DSceneFitBounds, graph2DConstructionFitBounds,
  previewGraph2DScientificDataset,
  previewGraph2DScientificSlice, verifyGraph2DScientificPlane, verifyGraph2DScientificVolume,
  parseScientificSceneManifest, createGraph2DFieldReference, inspectGraph2DFieldReference,
  analyzeGraph2DPolarLocalDifferential, isGraph2DPolarLocalDifferentialCurrent,
  analyzeGraph2DParametricLocalDifferential, isGraph2DParametricLocalDifferentialCurrent,
  analyzeGraph2DPolarMeasurement, isGraph2DPolarMeasurementCurrent,
  GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_WORKSPACE_CONTRACT,
  graph2DWorldToScreen, panGraph2DViewport, pickGraph2DProbe,
  graph2DPhaseSeedAtScreen, graph2DPhaseSeedAction, graph2DPhaseSeedRemovalAction, previewGraph2DPhaseSeed,
  isGraph2DCriticalPointCurrent, isGraph2DIntegralCurrent, isGraph2DIntervalAnalysisCurrent,
  isGraph2DIntersectionCurrent,
  isGraph2DLocalDifferentialCurrent, queryGraph2DInspector,
  resolveGraph2DViewport, selectionForGraph2DObject, zoomGraph2DViewport,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DSelection, type Graph2DViewport,
  type Graph2DScientificDatasetPreview,
  type Graph2DScientificPlane,
  type Graph2DScientificVolume,
  type Graph2DFieldLocator, type Graph2DFieldReference,
  type Graph2DTrajectoryArtifact,
  type Graph2DPhasePortraitArtifact,
  type Graph2DTimeOdeArtifact,
  type Graph2DConstructionAction,
  graph2DConstructionFromCandidate, graph2DLineConstructionActionsFromProbe, GRAPH2D_MAX_CONSTRUCTIONS,
  type Graph2DIntegralMode,
  type Graph2DPolarMeasurement,
  type Graph2DAnyPromotion,
  type Graph2DPreset,
  type Graph2DPersonalPresetPreview,
  graph2DPublicationAnalysisTables,
  graph2DParameterSessionKey, previewGraph2DParameterValues, graph2DHasLogScale,
  isGraph2DRegressionCurrent, graph2DRegressionResidualTable, graph2DRegressionCurveTable, graph2DPublicationAnalysisTable,
  type Graph2DRegression, type Graph2DRegressionModel,
  projectGraph2DGrid, projectGraph2DPolarGrid,
  structuralHash,
  graph2DToolUnavailable, graph2DIntervalAnalysisUnavailable, graph2DSceneStatusLabel, type Graph2DTool,
  editGraph2DProbes, graph2DPinnedProbeState, projectGraph2DProbeMarkers,
  getGraph2DGuidedDocumentGuidance,
  projectGraph2DConstrainedPoint, previewGraph2DConstrainedPoint, resolveGraph2DConstructions,
} from "@math3d/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { WorkspaceDockLayout } from "../workspaceDocks";
import { Graph2DPlot } from "./Graph2DPlot";
import { ScientificFieldPlane } from "./ScientificFieldPlane";
import { ScientificFieldVolume } from "./ScientificFieldVolume";
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
import { Graph2DConstructionsPanel } from "./Graph2DConstructionsPanel";
import { Graph2DCriticalResultsPanel } from "./Graph2DCriticalResultsPanel";
import { Graph2DAnalysisQualityGuide } from "./Graph2DAnalysisQualityGuide";
import { Graph2DUnresolvedCoverage } from "./Graph2DUnresolvedCoverage";
import { Graph2DIntersectionResultsTable } from "./Graph2DIntersectionResultsTable";
import { downloadGraph2DNumericalDataset } from "./downloadGraph2DNumericalDataset";
import "./graphsWorkspace.css";

const GRAPH2D_LEFT_PALETTE_KEY = "math3d.graphs.leftPalette.v1";
const SCIENTIFIC_GRID_LINE_COLORS = ["#2563eb", "#ea580c", "#059669", "#9333ea", "#e11d48", "#0d9488"] as const;
const SCIENTIFIC_FIELD_PRESETS = [
  { id: "sincos", title: "Sine–cosine grid", detail: "2D scalar · compare lines and inspect the full field" },
  { id: "thermal", title: "Thermal gradient", detail: "2D scalar · temperature in kelvin across time and distance" },
  { id: "complexWave", title: "Complex wave packet", detail: "2D complex · real and imaginary wave components" },
  { id: "vortexFlow", title: "Planar vortex", detail: "2D vector · east and north velocity components" },
  { id: "vortexVolume", title: "Swirling flow volume", detail: "3D vector · rotate volume and inspect exact planes" },
] as const;
type ScientificFieldPresetId = typeof SCIENTIFIC_FIELD_PRESETS[number]["id"];

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
  analysisRequest?: { documentId: string; token: number } | null;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  onViewportCommit?: (viewport: Graph2DViewport) => void;
  onGridModeCommit?: (mode: "cartesian" | "polar") => void;
  onAxesCommit?: (axes: Graph2DDocument["display"]["axes"]) => void;
  onProbesCommit?: (probes: NonNullable<Graph2DDocument["display"]["pinnedProbes"]>) => void;
  onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
  onConstructionCommit?: (action: Graph2DConstructionAction) => void;
  onConstructionBatchCommit?: (actions: readonly Graph2DConstructionAction[]) => void;
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
export function GraphsWorkspace({ dockLayout, document, analysisRequest, status = "ready", errorMessage, onViewportCommit,
  onGridModeCommit, onAxesCommit, onProbesCommit, onAuthoringCommit, onConstructionCommit, onConstructionBatchCommit, onSelectionCommit, onUndo, onRedo, promotions = [],
  onPromotionCreate, onPromotionLocate, onPromotionRegenerate, onOpenPreset, onResumeCheckpoint, onCopyProject,
  onExportPersonalProject, onCopyGraphDefinition, onPreviewPersonalImport, onImportPersonalProject }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryStartCategory, setGalleryStartCategory] = useState<"All" | "Differential equations">("All");
  const [leftPalette, setLeftPalette] = useState<Graph2DLeftPalette>(readGraph2DLeftPalette);
  const changeLeftPalette = (palette: Graph2DLeftPalette) => {
    setLeftPalette(palette);
    try { window.localStorage.setItem(GRAPH2D_LEFT_PALETTE_KEY, palette); } catch { /* Appearance remains session-local. */ }
  };
  const [presentation, setPresentation] = useState(false);
  const presentationOpener = useRef<HTMLButtonElement>(null);
  const exitPresentation = () => { setPresentation(false); requestAnimationFrame(() => presentationOpener.current?.focus()); };
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    if (analysisRequest?.documentId === document.identity.id) {
      setGalleryOpen(false); setGridOpen(false); setGridPreview(null); setScalesOpen(false); setParametersOpen(false); setToolsOpen(true);
    }
  }, [analysisRequest, document.identity.id]);
  const [toolHint, setToolHint] = useState("");
  const [scientificImport, setScientificImport] = useState<{
    manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator;
    datasets: ({ datasetId: string; component: string; values: number[]; shape?: never } |
      { datasetId: string; component: string; shape: [number, number] | [number, number, number]; values?: never })[] } | null>(null);
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, "current" | "changed" | "missing" | "error">>({});
  useEffect(() => setFieldStatuses({}), [document.identity.id]);
  const [scientificDatasetId, setScientificDatasetId] = useState("");
  const [scientificVaryingAxis, setScientificVaryingAxis] = useState<0 | 1 | null>(null);
  const [scientificFixedIndex, setScientificFixedIndex] = useState<number | null>(null);
  const [scientificSlicePreview, setScientificSlicePreview] = useState<{ key: string; preview: Graph2DScientificDatasetPreview } | null>(null);
  const [scientificPlane, setScientificPlane] = useState<Graph2DScientificPlane | null>(null);
  const [scientificVolume, setScientificVolume] = useState<Graph2DScientificVolume | null>(null);
  const [scientificNormalAxis, setScientificNormalAxis] = useState<0 | 1 | 2>(2);
  const [scientificPlaneIndex, setScientificPlaneIndex] = useState(0);
  const scientificPreviewEpoch = useRef(0);
  const [scientificImportBusy, setScientificImportBusy] = useState(false);
  const [scientificImportError, setScientificImportError] = useState("");
  const [scientificPresetOpen, setScientificPresetOpen] = useState(false);
  const scientificImportAvailable = typeof window !== "undefined" && !!window.scientificScenes?.openGraphDataset;
  const scientificSelected = scientificImport?.datasets.find(item => `${item.datasetId}:${item.component}` === scientificDatasetId);
  const scientificManifest = useMemo(() => scientificImport ? parseScientificSceneManifest(scientificImport.manifestJson) : null,
    [scientificImport]);
  const scientificDataset = scientificManifest?.ok ? scientificManifest.value.datasets.find(item => item.id === scientificSelected?.datasetId) : null;
  const scientificCoordinate = scientificManifest?.ok ? scientificManifest.value.coordinates.find(item => item.id === scientificDataset?.coordinateSystem) : null;
  const scientificSliceKey = scientificImport && scientificSelected?.shape?.length === 2 && scientificVaryingAxis !== null && scientificFixedIndex !== null ?
    `${scientificImport.fingerprint}:${scientificSelected.datasetId}:${scientificSelected.component}:${scientificVaryingAxis}:${scientificFixedIndex}` : "";
  const scientificPreview = useMemo(() => {
    if (!scientificImport) return null;
    const selected = scientificImport.datasets.find(item => `${item.datasetId}:${item.component}` === scientificDatasetId);
    if (!selected || !selected.values) return scientificSlicePreview?.key === scientificSliceKey ? scientificSlicePreview.preview : null;
    try { return previewGraph2DScientificDataset(scientificImport.manifestJson,
      scientificImport.fingerprint, selected.datasetId, selected.values, selected.component); }
    catch { return null; }
  }, [scientificImport, scientificDatasetId, scientificSlicePreview, scientificSliceKey]);
  const scientificImportedLines = scientificImport && scientificSelected?.shape?.length === 2 ? document.source.objects.filter(item =>
    item.kind === "point-series" && item.origin?.sceneFingerprint === scientificImport.fingerprint &&
    item.origin.datasetId === scientificSelected.datasetId && (item.origin.component ?? "scalar") === scientificSelected.component &&
    item.origin.slice) : [];
  const scientificLineAlreadyImported = !!scientificPreview?.origin.slice && scientificImportedLines.some(item =>
    item.kind === "point-series" && item.origin?.slice?.varyingAxis === scientificPreview.origin.slice?.varyingAxis &&
    item.origin?.slice?.fixedIndex === scientificPreview.origin.slice?.fixedIndex);
  const scientificFieldAlreadySaved = !!scientificImport && !!scientificSelected && !!document.source.fieldReferences?.some(item =>
    item.sceneFingerprint === scientificImport.fingerprint && item.datasetId === scientificSelected.datasetId &&
    item.component === scientificSelected.component);
  const scientificFieldViewed = !!scientificSelected && (scientificPlane?.datasetId === scientificSelected.datasetId &&
    scientificPlane.component === scientificSelected.component || scientificVolume?.datasetId === scientificSelected.datasetId &&
    scientificVolume.component === scientificSelected.component);
  const selectDefaultScientificSlice = (shape?: readonly number[]) => {
    const axis = shape?.length === 2 ? shape[0] >= 2 ? 0 : shape[1] >= 2 ? 1 : null : null;
    setScientificVaryingAxis(axis);
    setScientificFixedIndex(axis === null ? null : Math.floor(shape![1 - axis]! / 2));
    setScientificNormalAxis(2); setScientificPlaneIndex(shape?.length === 3 ? Math.floor(shape[2]! / 2) : 0);
  };
  const resetScientificSlice = () => { scientificPreviewEpoch.current += 1; setScientificSlicePreview(null);
    setScientificPlane(null); setScientificVolume(null); setScientificVaryingAxis(null);
    setScientificFixedIndex(null); setScientificImportError(""); };
  const previewScientificSlice = async () => {
    if (!scientificImport || scientificSelected?.shape?.length !== 2 || scientificVaryingAxis === null || scientificFixedIndex === null ||
        !window.scientificScenes?.previewGraphSlice) return;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificSlicePreview(null);
    try {
      const line = await window.scientificScenes.previewGraphSlice({ fingerprint: scientificImport.fingerprint,
        datasetId: scientificSelected.datasetId, component: scientificSelected.component,
        varyingAxis: scientificVaryingAxis, fixedIndex: scientificFixedIndex });
      const preview = previewGraph2DScientificSlice(scientificImport.manifestJson, scientificImport.fingerprint, line);
      if (scientificPreviewEpoch.current === epoch) setScientificSlicePreview({ key: scientificSliceKey, preview });
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const previewScientificPlane = async () => {
    if (!scientificImport || !scientificSelected?.shape || !window.scientificScenes?.previewGraphPlane) return;
    const selected = scientificSelected, source = scientificImport;
    const normalAxis = selected.shape.length === 3 ? scientificNormalAxis : null;
    const fixedIndex = selected.shape.length === 3 ? scientificPlaneIndex : null;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificPlane(null);
    try {
      const plane = await window.scientificScenes.previewGraphPlane({ fingerprint: source.fingerprint,
        datasetId: selected.datasetId, component: selected.component, normalAxis, fixedIndex });
      const verified = verifyGraph2DScientificPlane(source.manifestJson, source.fingerprint, plane);
      if (scientificPreviewEpoch.current === epoch) setScientificPlane(verified);
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const previewScientificVolume = async () => {
    if (!scientificImport || scientificSelected?.shape?.length !== 3 || !window.scientificScenes?.previewGraphVolume) return;
    const selected = scientificSelected, source = scientificImport;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificVolume(null);
    try {
      const volume = await window.scientificScenes.previewGraphVolume({ fingerprint: source.fingerprint,
        datasetId: selected.datasetId, component: selected.component });
      const verified = verifyGraph2DScientificVolume(source.manifestJson, source.fingerprint, volume);
      if (scientificPreviewEpoch.current === epoch) setScientificVolume(verified);
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const openScientificDataset = async (preset?: ScientificFieldPresetId) => {
    if (!window.scientificScenes?.openGraphDataset) return;
    setScientificPresetOpen(false);
    resetScientificSlice();
    setScientificImport(null);
    setScientificImportBusy(true); setScientificImportError("");
    try {
      const opened = preset ? await window.scientificScenes.openGraphDatasetPreset(preset) :
        await window.scientificScenes.openGraphDataset();
      if (opened.ok) { setScientificImport(opened.source); const first = opened.source.datasets[0];
        setScientificDatasetId(first ? `${first.datasetId}:${first.component}` : "");
        selectDefaultScientificSlice(first?.shape); }
      else if (!opened.canceled) setScientificImportError(opened.error);
    } catch (error) { setScientificImportError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const saveScientificFieldReference = () => {
    if (!scientificImport || !scientificSelected?.shape || !onAuthoringCommit ||
        !(scientificPlane?.datasetId === scientificSelected.datasetId && scientificPlane.component === scientificSelected.component ||
          scientificVolume?.datasetId === scientificSelected.datasetId && scientificVolume.component === scientificSelected.component)) return;
    try {
      const reference = createGraph2DFieldReference(scientificImport.manifestJson, scientificImport.fingerprint,
        scientificImport.locator, scientificSelected.datasetId, scientificSelected.component);
      onAuthoringCommit({ type: "save-field-reference", reference });
      setFieldStatuses(current => ({ ...current, [reference.id]: "current" }));
      setScientificImportError("");
    } catch (error) { setScientificImportError((error as Error).message); }
  };
  const openSavedFieldReference = async (reference: Graph2DFieldReference) => {
    if (!window.scientificScenes?.openGraphDatasetReference || scientificImportBusy) return;
    setScientificImportBusy(true); setScientificImportError("");
    resetScientificSlice();
    setScientificImport(null);
    try {
      const opened = await window.scientificScenes.openGraphDatasetReference({ locator: reference.locator,
        sceneFingerprint: reference.sceneFingerprint });
      if (!opened.ok) { setFieldStatuses(current => ({ ...current, [reference.id]: opened.status })); return; }
      const status = inspectGraph2DFieldReference(reference, opened.source.manifestJson);
      setFieldStatuses(current => ({ ...current, [reference.id]: status }));
      if (status !== "current") { void window.scientificScenes.closeGraphDataset(opened.source.fingerprint); return; }
      const selected = opened.source.datasets.find(item => item.datasetId === reference.datasetId &&
        item.component === reference.component);
      if (!selected) { setFieldStatuses(current => ({ ...current, [reference.id]: "changed" }));
        void window.scientificScenes.closeGraphDataset(opened.source.fingerprint); return; }
      setScientificImport(opened.source);
      setScientificDatasetId(`${selected.datasetId}:${selected.component}`);
      selectDefaultScientificSlice(selected.shape);
    } catch (error) { setFieldStatuses(current => ({ ...current, [reference.id]: "error" }));
      setScientificImportError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const commitScientificDataset = () => {
    if (!scientificPreview || !onAuthoringCommit || scientificLineAlreadyImported) return;
    try {
      const table = pointTableStore.publish(scientificPreview.rows);
      onAuthoringCommit({ type: "create-point-series", draft: { label: scientificPreview.label,
        table, mode: "line", domain: scientificPreview.domain, origin: scientificPreview.origin,
        style: { color: scientificSelected?.shape ? SCIENTIFIC_GRID_LINE_COLORS[scientificImportedLines.length % SCIENTIFIC_GRID_LINE_COLORS.length] : "#2563eb",
          lineWidth: 2, lineStyle: "solid", visible: true } } });
      if (scientificSelected?.shape) {
        scientificPreviewEpoch.current += 1;
        setScientificSlicePreview(null);
        const fixedAxis = 1 - scientificPreview.origin.slice!.varyingAxis;
        const count = scientificSelected.shape[fixedAxis]!;
        const nextIndex = Array.from({ length: count }, (_, offset) => (scientificPreview.origin.slice!.fixedIndex + offset + 1) % count)
          .find(index => index !== scientificPreview.origin.slice!.fixedIndex &&
            !scientificImportedLines.some(item => item.kind === "point-series" &&
            item.origin?.slice?.varyingAxis === scientificPreview.origin.slice!.varyingAxis &&
            item.origin?.slice?.fixedIndex === index));
        setScientificFixedIndex(nextIndex ?? null);
      } else {
        const remaining = scientificImport?.datasets.filter(item => `${item.datasetId}:${item.component}` !== scientificDatasetId) ?? [];
        if (remaining.length && scientificImport) {
          setScientificImport({ ...scientificImport, datasets: remaining });
          setScientificDatasetId(`${remaining[0]!.datasetId}:${remaining[0]!.component}`);
        } else { if (scientificImport) void window.scientificScenes?.closeGraphDataset(scientificImport.fingerprint);
          setScientificImport(null); }
        resetScientificSlice();
      }
      setScientificImportError("");
      setToolHint(`Imported ${scientificPreview.rows.length} checked samples. Use Fit to view the full line.`);
    } catch (error) { setScientificImportError((error as Error).message); }
  };
  const toolsOpener = useRef<HTMLButtonElement>(null);
  const [editRequest, setEditRequest] = useState<{ objectId: string; sequence: number } | null>(null);
  const closeTools = () => { setToolsOpen(false); toolsOpener.current?.focus(); };
  const [exportOpen, setExportOpen] = useState(false);
  const [criticalAnalysisBudget, setCriticalAnalysisBudget] = useState(12000);
  const [showDerivativeCurve, setShowDerivativeCurve] = useState(false);
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
  const [previewAnalysisEnabled, setPreviewAnalysisEnabled] = useState(false);
  const parameterPreviewActive = parameterPreview?.key === parameterKey;
  const cancelParameter = () => { setParameterPreview(null); setPreviewAnalysisEnabled(false);
    setParameterEpoch(value => value + 1); };
  const exportOpener = useRef<HTMLButtonElement | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const galleryOpener = useRef<HTMLButtonElement | null>(null);
  const galleryFocusFrame = useRef<number | null>(null);
  const closeGallery = () => { setGalleryOpen(false); galleryFocusFrame.current = requestAnimationFrame(() => {
    galleryFocusFrame.current = null; galleryOpener.current?.focus();
  }); };
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const openInspector = () => {
    const workspace = viewerRef.current?.closest(".graph2d-workspace");
    const compact = workspace?.querySelector<HTMLDetailsElement>(".graph2d-compact-panels > details:last-child");
    if (compact && window.matchMedia("(max-width: 1100px)").matches) {
      compact.open = true;
      requestAnimationFrame(() => (compact.querySelector<HTMLElement>(".graph2d-inspector-current") ??
        compact.querySelector<HTMLElement>("summary"))?.focus());
      return;
    }
    workspace?.querySelector<HTMLElement>(".graph2d-right .graph2d-inspector-current")?.focus();
  };
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [previewViewport, setPreviewViewport] = useState<Graph2DViewport | null>(null);
  const previewRef = useRef<Graph2DViewport | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; viewport: Graph2DViewport; moved: boolean } | null>(null);
  const pointDragRef = useRef<{ pointerId: number; id: string; x: number; y: number; start: number;
    parameter: number; moved: boolean; sourceHash: string; documentId: string } | null>(null);
  const [pointDragPreview, setPointDragPreview] = useState<{ id: string; parameter: number } | null>(null);
  const cancelPointDrag = () => { const active = pointDragRef.current; pointDragRef.current = null; setPointDragPreview(null);
    if (active && viewerRef.current?.hasPointerCapture(active.pointerId)) viewerRef.current.releasePointerCapture(active.pointerId); };
  const [phaseSeedPlacement, setPhaseSeedPlacement] = useState<string | null>(null);
  const [selectedPhaseSeed, setSelectedPhaseSeed] = useState<{ objectId: string; index: number } | null>(null);
  const phaseSeedDrag = useRef<{ pointerId: number; objectId: string; index: number; x: number; y: number;
    start: { x: number; y: number }; point: { x: number; y: number }; moved: boolean; sourceHash: string; documentId: string } | null>(null);
  const [phaseSeedPreview, setPhaseSeedPreview] = useState<{ objectId: string; index: number; point: { x: number; y: number } } | null>(null);
  const cancelPhaseSeedDrag = () => { const active = phaseSeedDrag.current; phaseSeedDrag.current = null; setPhaseSeedPreview(null);
    if (active && viewerRef.current?.hasPointerCapture(active.pointerId)) viewerRef.current.releasePointerCapture(active.pointerId); };
  const sampledDocument = useMemo(() => {
    const parameterDocument = parameterPreview?.key === parameterKey ? previewGraph2DParameterValues(document, parameterPreview.values) : document;
    if (!phaseSeedPreview || phaseSeedDrag.current?.documentId !== document.identity.id) return parameterDocument;
    try { return previewGraph2DPhaseSeed(parameterDocument, phaseSeedPreview.objectId, phaseSeedPreview.index, phaseSeedPreview.point); }
    catch { return parameterDocument; }
  }, [document, parameterPreview, parameterKey, phaseSeedPreview]);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const wheelHandlerRef = useRef<(event: globalThis.WheelEvent) => void>(() => {});
  const [hoverSelection, setHoverSelection] = useState<Graph2DSelection | null>(null);
  const [areaDraft, setAreaDraft] = useState({ min: "-1", max: "1", mode: "signed" as Graph2DIntegralMode });
  const [areaRequest, setAreaRequest] = useState<{ objectId: string; min: number; max: number;
    mode: Graph2DIntegralMode } | null>(null);
  const [arcRequest, setArcRequest] = useState<{ objectId: string; min: number; max: number } | null>(null);
  const [polarDraft, setPolarDraft] = useState({ objectId: "", min: "", max: "" });
  const [polarAreaRequest, setPolarAreaRequest] = useState<{ objectId: string; min: number; max: number } | null>(null);
  const [polarArcRequest, setPolarArcRequest] = useState<{ objectId: string; min: number; max: number } | null>(null);
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
    interaction: previewViewport !== null || phaseSeedPreview !== null,
    pointTables: Object.fromEntries(document.source.objects.flatMap((object) =>
      object.kind === "point-series" ? [[object.table.id, pointTableStore.resolve(object.table)]] : [])),
  }), [sampledDocument, size, viewport, previewViewport, phaseSeedPreview]);
  const sampling = useGraph2DSampling(samplingRequest, parameterPreviewActive || phaseSeedPreview ? document.identity : undefined);
  const pointPreviewDocument = useMemo(() => {
    if (!pointDragPreview || pointDragRef.current?.documentId !== document.identity.id) return null;
    try { return previewGraph2DConstrainedPoint(document, pointDragPreview.id, pointDragPreview.parameter); }
    catch { return null; }
  }, [document, pointDragPreview]);
  const pointPreviewConstructions = useMemo(() => pointPreviewDocument ? resolveGraph2DConstructions(pointPreviewDocument) : null,
    [pointPreviewDocument]);
  const shownConstructions = pointPreviewConstructions ?? sampling.constructions;
  useEffect(() => { if (pointDragRef.current && (pointDragRef.current.sourceHash !== document.identity.structuralHash ||
    pointDragRef.current.documentId !== document.identity.id)) cancelPointDrag(); },
    [document.identity.id, document.identity.structuralHash]);
  useEffect(() => { if (phaseSeedDrag.current && (phaseSeedDrag.current.sourceHash !== document.identity.structuralHash ||
    phaseSeedDrag.current.documentId !== document.identity.id)) cancelPhaseSeedDrag();
    const placingObject = document.source.objects.find(item => item.id === phaseSeedPlacement);
    if (phaseSeedPlacement && (document.selection.objectId !== phaseSeedPlacement ||
      placingObject?.kind !== "phase-portrait" || placingObject.seeds.length >= 8 ||
      !document.display.objects.find(item => item.objectId === phaseSeedPlacement)?.visible)) setPhaseSeedPlacement(null);
  }, [document.identity.id, document.identity.structuralHash, document.selection.objectId, document.display.objects, phaseSeedPlacement]);
  const series = sampling.series;
  const pick = (x: number, y: number, previous?: Graph2DSelection) => sampling.ready && !parameterPreviewActive ? pickGraph2DProbe({ document, series,
    viewport, size, screen: { x, y }, previous }).selection : document.selection;
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = (viewerRef.current!.querySelector("svg") ?? viewerRef.current!).getBoundingClientRect();
    // Use the actual plot rectangle, not its bordered/scrolled container.
    return { x: (event.clientX - rect.left) * size.width / rect.width, y: (event.clientY - rect.top) * size.height / rect.height };
  };
  const fitBounds = (bounds: ReturnType<typeof graph2DSceneFitBounds>) => {
    if (!sampling.ready || parameterPreviewActive || !bounds) return;
    onViewportCommit?.(fitGraph2DViewport(bounds, size, viewport.aspect, .12, viewport));
  };
  const fitSelection = () => fitBounds(graph2DSceneFitBounds(series, null, "selection", document.selection.objectId));
  const fitVisible = () => fitBounds(graph2DSceneFitBounds(series, sampling.constructions, "all", null));
  const fitConstruction = (id: string) => fitBounds(graph2DConstructionFitBounds(sampling.constructions, id));
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,summary,details,input,select,textarea,label,form")) return;
    const phaseTarget = (event.target as Element).closest("[data-graph2d-phase-seed]")?.getAttribute("data-graph2d-phase-seed");
    if (phaseTarget && onAuthoringCommit && sampling.ready && !parameterPreviewActive && !graph2DHasLogScale(viewport)) {
      const split = phaseTarget.lastIndexOf("-");
      const objectId = phaseTarget.slice(0, split), index = Number(phaseTarget.slice(split + 1));
      const object = document.source.objects.find(item => item.id === objectId);
      const style = document.display.objects.find(item => item.objectId === objectId);
      if (object?.kind === "phase-portrait" && style?.visible && Number.isInteger(index) && object.seeds[index]) {
        finishWheel(); setHoverSelection(null); setSelectedPhaseSeed({ objectId, index });
        phaseSeedDrag.current = { pointerId: event.pointerId, objectId, index, x: event.clientX, y: event.clientY,
          start: object.seeds[index], point: object.seeds[index], moved: false,
          sourceHash: document.identity.structuralHash, documentId: document.identity.id };
        event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus();
        return;
      }
    }
    const pointId = (event.target as Element).closest("[data-graph2d-draggable-point]")?.getAttribute("data-graph2d-draggable-point");
    if (pointId && onConstructionCommit && sampling.ready && !parameterPreviewActive) {
      const definition = document.source.constructions?.objects.find(item => item.id === pointId);
      const resolved = sampling.constructions?.objects.find(item => item.id === pointId);
      if (definition?.kind === "point-on-curve" && resolved?.state === "ready" && resolved.style.visible) {
        finishWheel(); setHoverSelection(null);
        pointDragRef.current = { pointerId: event.pointerId, id: pointId, x: event.clientX, y: event.clientY,
          start: definition.anchor.value, parameter: definition.anchor.value, moved: false,
          sourceHash: document.identity.structuralHash, documentId: document.identity.id };
        event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus();
        return;
      }
    }
    cancelParameter();
    const startingViewport = previewRef.current ?? document.display.viewport;
    finishWheel();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      viewport: startingViewport, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const seedDrag = phaseSeedDrag.current;
    if (seedDrag) {
      if (seedDrag.pointerId !== event.pointerId) return;
      if (!seedDrag.moved && Math.hypot(event.clientX - seedDrag.x, event.clientY - seedDrag.y) < 3) return;
      const point = graph2DPhaseSeedAtScreen(document, seedDrag.objectId, viewport, size, localPoint(event), "drag");
      if (point) { seedDrag.moved = true; seedDrag.point = point;
        setPhaseSeedPreview({ objectId: seedDrag.objectId, index: seedDrag.index, point }); }
      return;
    }
    const pointDrag = pointDragRef.current;
    if (pointDrag) {
      if (pointDrag.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointDrag.x, event.clientY - pointDrag.y) < 3 && !pointDrag.moved) return;
      pointDrag.moved = true;
      const projection = projectGraph2DConstrainedPoint(document, pointDrag.id, viewport, size,
        localPoint(event), pointDrag.parameter);
      if (projection) { pointDrag.parameter = projection.parameter;
        setPointDragPreview({ id: pointDrag.id, parameter: projection.parameter }); }
      return;
    }
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
    const seedDrag = phaseSeedDrag.current;
    if (seedDrag && seedDrag.pointerId === event.pointerId) {
      if (seedDrag.moved) {
        const point = graph2DPhaseSeedAtScreen(document, seedDrag.objectId, viewport, size, localPoint(event), "drag");
        if (point) seedDrag.point = point;
      }
      const canCommit = seedDrag.moved && seedDrag.sourceHash === document.identity.structuralHash &&
        seedDrag.documentId === document.identity.id &&
        Math.hypot(seedDrag.point.x - seedDrag.start.x, seedDrag.point.y - seedDrag.start.y) > 1e-9;
      cancelPhaseSeedDrag();
      if (canCommit) onAuthoringCommit?.(graph2DPhaseSeedAction(document, seedDrag.objectId, seedDrag.index, seedDrag.point));
      return;
    }
    const pointDrag = pointDragRef.current;
    if (pointDrag && pointDrag.pointerId === event.pointerId) {
      if (pointDrag.moved) {
        const projection = projectGraph2DConstrainedPoint(document, pointDrag.id, viewport, size,
          localPoint(event), pointDrag.parameter);
        if (projection) pointDrag.parameter = projection.parameter;
      }
      const definition = document.source.constructions?.objects.find(item => item.id === pointDrag.id);
      const canCommit = pointDrag.moved && pointDrag.sourceHash === document.identity.structuralHash &&
        pointDrag.documentId === document.identity.id &&
        definition?.kind === "point-on-curve" && Math.abs(pointDrag.parameter - pointDrag.start) > 1e-9;
      cancelPointDrag();
      if (canCommit && definition?.kind === "point-on-curve") onConstructionCommit?.({ type: "update",
        object: { ...definition, anchor: { ...definition.anchor, value: pointDrag.parameter } } });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && previewRef.current) onViewportCommit?.(previewRef.current);
    else if (!drag.moved && !gridOpen && !scalesOpen && !parametersOpen) {
      const point = localPoint(event);
      if (phaseSeedPlacement && onAuthoringCommit && sampling.ready && !parameterPreviewActive && !graph2DHasLogScale(viewport)) {
        const seed = graph2DPhaseSeedAtScreen(document, phaseSeedPlacement, viewport, size, point, "place");
        if (seed) { onAuthoringCommit(graph2DPhaseSeedAction(document, phaseSeedPlacement, null, seed));
          setPhaseSeedPlacement(null); setToolHint(""); }
        else setToolHint("Tap inside the selected phase portrait domain to place an initial point.");
      } else onSelectionCommit?.(pick(point.x, point.y, document.selection));
    }
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
    if (event.key === "Escape" && phaseSeedDrag.current) { event.preventDefault(); event.stopPropagation(); cancelPhaseSeedDrag(); return; }
    if (event.key === "Escape" && phaseSeedPlacement) { event.preventDefault(); event.stopPropagation(); setPhaseSeedPlacement(null); setToolHint(""); return; }
    if (event.key === "Escape" && pointDragRef.current) { event.preventDefault(); event.stopPropagation(); cancelPointDrag(); return; }
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
  const activePolarDraft = selectedObject?.kind === "polar" && polarDraft.objectId !== selectedObject.id ?
    { objectId: selectedObject.id, min: String(selectedObject.domain.min), max: String(selectedObject.domain.max) } : polarDraft;
  const polarMin = activePolarDraft.min.trim() ? Number(activePolarDraft.min) : NaN;
  const polarMax = activePolarDraft.max.trim() ? Number(activePolarDraft.max) : NaN;
  const polarValid = selectedObject?.kind === "polar" && Number.isFinite(polarMin) && Number.isFinite(polarMax) &&
    polarMin < polarMax && polarMin >= selectedObject.domain.min && polarMax <= selectedObject.domain.max;
  const areaUnavailable = graph2DIntervalAnalysisUnavailable(document, document.selection.objectId, "area");
  const arcUnavailable = graph2DIntervalAnalysisUnavailable(document, document.selection.objectId, "arc-length");
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
      const compact = root?.querySelector<HTMLDetailsElement>(".graph2d-compact-panels > details:last-child");
      if (compact && compact.getBoundingClientRect().width > 0) compact.open = true;
      const compactSection = compact?.open ? compact.querySelector<HTMLElement>(target) : null;
      const section = compactSection ?? Array.from(root?.querySelectorAll<HTMLElement>(target) ?? []).find(el => el.getBoundingClientRect().width > 0);
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
      interval: { min: bounds.xMin, max: bounds.xMax }, maxEvaluations: criticalAnalysisBudget });
  }, [document, size, selectedObject, criticalAnalysisBudget]);
  const previewCriticalPoints = useMemo(() => {
    if (!previewAnalysisEnabled || !parameterPreviewActive || !sampling.settled ||
        selectedObject?.kind !== "explicit-cartesian") return null;
    const bounds = resolveGraph2DViewport(sampledDocument.display.viewport, size);
    return analyzeGraph2DCriticalPoints({ document: sampledDocument, objectId: selectedObject.id,
      interval: { min: bounds.xMin, max: bounds.xMax }, maxEvaluations: 2000 });
  }, [previewAnalysisEnabled, parameterPreviewActive, sampling.settled, sampledDocument, selectedObject, size]);
  const intervals = useMemo(() => criticalPoints ? analyzeGraph2DIntervals({ document,
    objectId: criticalPoints.objectId, interval: criticalPoints.interval, criticalPoints }) : null,
  [document, criticalPoints]);
  const area = useMemo(() => !areaUnavailable && areaRequest && areaRequest.objectId === document.selection.objectId ?
    analyzeGraph2DIntegral({ document, objectId: areaRequest.objectId,
      interval: { min: areaRequest.min, max: areaRequest.max }, mode: areaRequest.mode }) : null,
  [document, areaRequest, areaUnavailable]);
  const arcLength = useMemo(() => !arcUnavailable && arcRequest && arcRequest.objectId === document.selection.objectId ?
    analyzeGraph2DArcLength({ document, objectId: arcRequest.objectId,
      interval: { min: arcRequest.min, max: arcRequest.max } }) : null,
  [document, arcRequest, arcUnavailable]);
  const polarArea = useMemo(() => selectedObject?.kind === "polar" && polarAreaRequest?.objectId === selectedObject.id &&
    polarAreaRequest.min >= selectedObject.domain.min && polarAreaRequest.max <= selectedObject.domain.max ?
    analyzeGraph2DPolarMeasurement({ document, objectId: selectedObject.id, kind: "swept-area",
      interval: { min: polarAreaRequest.min, max: polarAreaRequest.max } }) : null,
  [document, selectedObject, polarAreaRequest]);
  const polarArcLength = useMemo(() => selectedObject?.kind === "polar" && polarArcRequest?.objectId === selectedObject.id &&
    polarArcRequest.min >= selectedObject.domain.min && polarArcRequest.max <= selectedObject.domain.max ?
    analyzeGraph2DPolarMeasurement({ document, objectId: selectedObject.id, kind: "arc-length",
      interval: { min: polarArcRequest.min, max: polarArcRequest.max } }) : null,
  [document, selectedObject, polarArcRequest]);
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
    if (!intersectionRequest || selectedObject?.kind !== "explicit-cartesian" ||
      intersectionRequest.firstId !== selectedObject.id ||
      !document.source.objects.some((entry) => entry.id === intersectionRequest.secondId && entry.kind === "explicit-cartesian")) return null;
    const bounds = resolveGraph2DViewport(document.display.viewport, size);
    return analyzeGraph2DIntersections({ document, firstObjectId: intersectionRequest.firstId,
      secondObjectId: intersectionRequest.secondId, interval: intersectionRequest.intervalMode === "visible" ?
        { min: bounds.xMin, max: bounds.xMax } :
        { min: intersectionRequest.min, max: intersectionRequest.max } });
  }, [document, size, intersectionRequest, selectedObject]);
  const differential = useMemo(() => analyzeGraph2DLocalDifferential(document), [document]);
  const polarDifferential = useMemo(() => analyzeGraph2DPolarLocalDifferential(document), [document]);
  const parametricDifferential = useMemo(() => analyzeGraph2DParametricLocalDifferential(document), [document]);
  const derivatives = differential?.derivatives ?? null;
  const derivativeCurve = useMemo(() => showDerivativeCurve && selectedObject?.kind === "explicit-cartesian" &&
    !graph2DHasLogScale(document.display.viewport) ?
    sampleGraph2DDerivativeCurve(document, selectedObject.id, size) : null,
  [showDerivativeCurve, selectedObject, document, size]);
  const differentialOverlays = useMemo(() => [
    ...(differential && isGraph2DLocalDifferentialCurrent(differential, document) ? differential.overlays : []),
    ...(polarDifferential && isGraph2DPolarLocalDifferentialCurrent(polarDifferential, document) ? polarDifferential.overlays : []),
    ...(parametricDifferential && isGraph2DParametricLocalDifferentialCurrent(parametricDifferential, document) ? parametricDifferential.overlays : []),
  ], [differential, polarDifferential, parametricDifferential, document]);
  const probeMarkers = useMemo(() => parameterPreviewActive ? [] :
    projectGraph2DProbeMarkers({ ...document, display: renderedDisplay }, size),
  [document, renderedDisplay, size, parameterPreviewActive]);
  const exportAnalyses = useMemo(() => {
    const tables = graph2DPublicationAnalysisTables(!exportOpen ? [] : [criticalPoints, intervals, area, arcLength, polarArea, polarArcLength, intersections,
      differential, polarDifferential, parametricDifferential, ...(derivatives ?? [])].filter(result => !!result) as { publication: import("@math3d/core").AnalysisResultEnvelope }[]);
    if (exportOpen && currentRegression) {
      tables.analyses.push(graph2DPublicationAnalysisTable({ publication: currentRegression.publication, summary: currentRegression.publication.summary } as { publication: import("@math3d/core").AnalysisResultEnvelope }),
        graph2DRegressionResidualTable(currentRegression), graph2DRegressionCurveTable(currentRegression));
      if (currentRegression.n > 2048) tables.analysisNotes.push(`Regression residual table includes first 2048 of ${currentRegression.n} rows; full data and model are unchanged.`);
    }
    return tables;
  }, [exportOpen, criticalPoints, intervals, area, arcLength, polarArea, polarArcLength, intersections, differential, polarDifferential, parametricDifferential, derivatives, currentRegression]);
  const locateSelected = () => {
    if (!document.selection.probe) return;
    const screen = graph2DWorldToScreen(viewport, size, document.selection.probe);
    onViewportCommit?.(panGraph2DViewport(viewport, size, { x: size.width / 2 - screen.x, y: size.height / 2 - screen.y }));
  };
  const functionList = (placement: "desktop" | "compact" | "modal-only") => <Graph2DAuthoringPanel document={document} onCommit={onAuthoringCommit}
    placement={placement} editRequest={editRequest}
    palette={leftPalette} onPaletteChange={changeLeftPalette}
    onBrowsePhasePortraits={opener => { galleryOpener.current = opener; setGalleryStartCategory("Differential equations"); setGalleryError(null); setGalleryOpen(true); }}
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
  const constructions = <Graph2DConstructionsPanel document={pointPreviewDocument ?? document}
    artifact={parameterPreviewActive ? null : shownConstructions}
    onAction={onConstructionCommit} onBatchAction={onConstructionBatchCommit} onFitConstruction={fitConstruction} />;
  const savedFields = !!document.source.fieldReferences?.length && <section className="graph2d-saved-fields"
    data-testid="graph2d-saved-fields" aria-label="Saved scientific fields">
    <h3>Saved scientific fields</h3>
    <p>References contain source metadata only. Verify the original .sscene before viewing field values.</p>
    {document.source.fieldReferences.map(reference => <article key={reference.id}>
      <strong>{reference.datasetId} · {reference.component}</strong>
      <small>{reference.shape.join(" × ")} · {reference.axes.map(axis => `${axis.name} (${axis.unit})`).join(" / ")}</small>
      <small>Source {reference.locator.kind === "preset" ? `preset ${reference.locator.value}` : reference.locator.value}</small>
      <small role="status">{fieldStatuses[reference.id] === "current" ? "Source verified on last opening" :
        fieldStatuses[reference.id] === "changed" ? "Changed source — values withheld" :
        fieldStatuses[reference.id] === "missing" ? "Missing source — values unavailable" :
        fieldStatuses[reference.id] === "error" ? "Reverification failed — values unavailable" :
          "Not reverified on this opening"}</small>
      <div><button type="button" disabled={scientificImportBusy || !window.scientificScenes?.openGraphDatasetReference}
        onClick={() => void openSavedFieldReference(reference)}>Reverify and view</button>
        <button type="button" disabled={!onAuthoringCommit}
          onClick={() => onAuthoringCommit?.({ type: "remove-field-reference", referenceId: reference.id })}>
          Remove reference</button></div>
    </article>)}
  </section>;
  const saveTangentButton = (available: boolean) => <button type="button"
    disabled={!available || !document.selection.probe || !onConstructionBatchCommit ||
      (document.source.constructions?.objects.length ?? 0) > GRAPH2D_MAX_CONSTRUCTIONS - 2}
    onClick={() => { try {
      if (!document.selection.probe || !onConstructionBatchCommit) return;
      onConstructionBatchCommit(graph2DLineConstructionActionsFromProbe(document, document.selection.probe, "tangent"));
      setToolHint("Saved point and tangent as dependent constructions. The line recomputes from source and is approximate.");
    } catch (caught) { setToolHint((caught as Error).message); } }}>
    Save tangent as construction</button>;
  const inspector = inspected ? <div className="graph2d-inspector">
    <header className="graph2d-inspector-current" aria-label="Selected graph result" tabIndex={-1}>
      <strong>{inspected.label}</strong>
      <span>{inspected.probe ? `Probe (${inspected.probe.x.toPrecision(5)}, ${inspected.probe.y.toPrecision(5)})` :
        "Select a point or run an analysis below."}</span>
      <button type="button" disabled={!selectedObject || !onAuthoringCommit} onClick={() => {
        if (selectedObject) setEditRequest(previous => ({ objectId: selectedObject.id, sequence: (previous?.sequence ?? 0) + 1 }));
      }}>Edit graph</button>
    </header>
    {constructions}
    {selectedObject?.kind === "point-series" && <Graph2DRegressionPanel document={document} model={regressionModel} onModel={setRegressionModel} result={regression} onResult={setRegression} />}
    {parameterPreviewActive && <p role="status">Inspector and analyses refer to the committed source, not the parameter preview.</p>}
    {differential && <section className="graph2d-local-differential" data-testid="graph2d-local-differential" aria-label="Local differential">
      <h3>Local differential</h3>
      <p>Signed curvature is f''(x)/(1+f'(x)²)^(3/2); positive bends upward as x increases. Values have no certified error bound.</p>
      <dl className="graph2d-inspector-details">
        <dt>State</dt><dd data-testid="graph2d-differentiability">{differential.state}</dd>
        <dt>Point</dt><dd>{differential.point ? `(${differential.point.x.toPrecision(6)}, ${differential.point.y.toPrecision(6)})` : "Unavailable"}</dd>
        <dt>Slope</dt><dd>{differential.slope === null ? "Unavailable" : differential.slope.toPrecision(8)}</dd>
        <dt>Signed curvature κ</dt><dd data-testid="graph2d-signed-curvature">{differential.curvature === null ? "Unavailable" : differential.curvature.toPrecision(8)}</dd>
        <dt>Curvature method</dt><dd>{differential.curvatureMethod === "symbolic-rules" ? "Symbolic rules; floating point value" :
          differential.curvatureMethod === "finite-difference" ? "Finite difference; no certified error bound" : "Unavailable"}</dd>
        <dt>Slope method</dt><dd>{differential.slopeMethod === "symbolic-rules" ? "Symbolic rules; floating point value" :
          differential.slopeMethod === "finite-difference" ? "Richardson finite difference" : "Unavailable"}</dd>
        <dt>Tangent</dt><dd data-testid="graph2d-tangent-equation">{differential.tangent?.equation ?? "Unavailable"}</dd>
        <dt>Normal</dt><dd data-testid="graph2d-normal-equation">{differential.normal?.equation ?? "Unavailable"}</dd>
      </dl>
      {saveTangentButton(!!differential.tangent)}
      {differential.diagnostics.length > 0 && <ul className="graph2d-derivative-diagnostics">
        {differential.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message}</li>)}
      </ul>}
    </section>}
    {polarDifferential && <section className="graph2d-local-differential" data-testid="graph2d-local-differential" aria-label="Local differential">
      <h3>Local differential</h3>
      <p>Polar tangent and normal follow increasing θ. Signed curvature is (r² + 2r′² − rr″)/(r² + r′²)^(3/2); positive turns counterclockwise. Values have no certified error bound.</p>
      <dl className="graph2d-inspector-details">
        <dt>State</dt><dd data-testid="graph2d-differentiability">{polarDifferential.state}</dd>
        <dt>Angle θ (radians)</dt><dd>{polarDifferential.theta.toPrecision(8)}</dd>
        <dt>Signed radius</dt><dd>{polarDifferential.signedRadius === null ? "Unavailable" : polarDifferential.signedRadius.toPrecision(8)}</dd>
        <dt>Point</dt><dd>{polarDifferential.point ? `(${polarDifferential.point.x.toPrecision(6)}, ${polarDifferential.point.y.toPrecision(6)})` : "Unavailable"}</dd>
        <dt>Signed curvature κ</dt><dd data-testid="graph2d-signed-curvature">{polarDifferential.curvature === null ? "Unavailable" : polarDifferential.curvature.toPrecision(8)}</dd>
        <dt>Curvature method</dt><dd>{polarDifferential.curvatureMethod === "symbolic-rules" ? "Symbolic rules; floating point value" :
          polarDifferential.curvatureMethod === "finite-difference" ? "Finite difference; no certified error bound" : "Unavailable"}</dd>
        <dt>Tangent</dt><dd data-testid="graph2d-tangent-equation">{polarDifferential.tangent ?? "Unavailable"}</dd>
        <dt>Normal</dt><dd data-testid="graph2d-normal-equation">{polarDifferential.normal ?? "Unavailable"}</dd>
      </dl>
      {saveTangentButton(!!polarDifferential.tangent)}
      {polarDifferential.diagnostics.length > 0 && <ul className="graph2d-derivative-diagnostics">
        {polarDifferential.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message}</li>)}
      </ul>}
    </section>}
    {parametricDifferential && <section className="graph2d-local-differential" data-testid="graph2d-local-differential" aria-label="Local differential">
      <h3>Local differential</h3>
      <p>Parametric tangent and normal follow increasing t. Signed curvature is (x′y″ − y′x″)/(x′² + y′²)^(3/2); positive turns counterclockwise. Values have no certified error bound.</p>
      <dl className="graph2d-inspector-details">
        <dt>State</dt><dd data-testid="graph2d-differentiability">{parametricDifferential.state}</dd>
        <dt>Parameter t</dt><dd>{parametricDifferential.parameter.toPrecision(8)}</dd>
        <dt>Point</dt><dd>{parametricDifferential.point ? `(${parametricDifferential.point.x.toPrecision(6)}, ${parametricDifferential.point.y.toPrecision(6)})` : "Unavailable"}</dd>
        <dt>Speed</dt><dd>{parametricDifferential.speed === null ? "Unavailable" : parametricDifferential.speed.toPrecision(8)}</dd>
        <dt>Signed curvature κ</dt><dd data-testid="graph2d-signed-curvature">{parametricDifferential.curvature === null ? "Unavailable" : parametricDifferential.curvature.toPrecision(8)}</dd>
        <dt>Curvature method</dt><dd>{parametricDifferential.curvatureMethod === "symbolic-rules" ? "Symbolic rules; floating point value" :
          parametricDifferential.curvatureMethod === "finite-difference" ? "Finite difference; no certified error bound" : "Unavailable"}</dd>
        <dt>Tangent</dt><dd data-testid="graph2d-tangent-equation">{parametricDifferential.tangent ?? "Unavailable"}</dd>
        <dt>Normal</dt><dd data-testid="graph2d-normal-equation">{parametricDifferential.normal ?? "Unavailable"}</dd>
      </dl>
      {saveTangentButton(!!parametricDifferential.tangent)}
      {parametricDifferential.diagnostics.length > 0 && <ul className="graph2d-derivative-diagnostics">
        {parametricDifferential.diagnostics.map((diagnostic) => <li key={diagnostic.code}>{diagnostic.message}</li>)}
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
    {selectedObject?.kind === "explicit-cartesian" && <section className="graph2d-calculus-overlays"
      data-testid="graph2d-calculus-overlays" aria-label="Calculus overlays">
      <h3>Calculus overlays</h3>
      <button type="button" aria-pressed={showDerivativeCurve} onClick={() => setShowDerivativeCurve(value => !value)}>
        {showDerivativeCurve ? "Hide derivative plot" : "Show derivative plot"}</button>
      {showDerivativeCurve && <small>{graph2DHasLogScale(document.display.viewport) ?
        "Derivative plot is unavailable on log axes." : derivativeCurve?.status === "unavailable" ?
          derivativeCurve.reason : derivativeCurve ?
            `${derivativeCurve.status === "incomplete" ? "Incomplete" : "Approximate"} sampled first derivative · ${derivativeCurve.artifact?.samplesEvaluated ?? 0} evaluations. Gaps and rapid changes may be missed.` :
            "Derivative plot is unavailable."}</small>}
    </section>}
    {parameterPreviewActive && previewAnalysisEnabled && <div data-testid="graph2d-preview-analysis">
      {previewCriticalPoints ? <Graph2DCriticalResultsPanel analysis={previewCriticalPoints}
        document={sampledDocument} analysisBudget={2000} onAnalysisBudgetChange={() => {}}
        readOnlyPreview /> : <p role="status">Waiting for the preview frame to settle before analyzing it.</p>}
    </div>}
    {criticalPoints && !(parameterPreviewActive && previewAnalysisEnabled) &&
      <Graph2DCriticalResultsPanel analysis={criticalPoints} document={document}
      analysisBudget={criticalAnalysisBudget} onAnalysisBudgetChange={setCriticalAnalysisBudget}
      onSelectionCommit={onSelectionCommit} onConstructionBatchCommit={onConstructionBatchCommit} />}
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
    {selectedObject?.kind === "polar" ? <section className="graph2d-polar-measurements" data-testid="graph2d-polar-measurements" aria-label="Polar measurements">
      <h3>Polar measurements</h3>
      <p>Angular bounds are in radians. Swept area counts repeated traversal, including loops.</p>
      <div className="graph2d-area-controls graph2d-polar-controls">
        <label>From θ (radians) <input aria-label="Polar angle from" type="number" value={activePolarDraft.min}
          onChange={event => { setPolarDraft({ ...activePolarDraft, min: event.target.value }); setPolarAreaRequest(null); setPolarArcRequest(null); }} /></label>
        <label>To θ (radians) <input aria-label="Polar angle to" type="number" value={activePolarDraft.max}
          onChange={event => { setPolarDraft({ ...activePolarDraft, max: event.target.value }); setPolarAreaRequest(null); setPolarArcRequest(null); }} /></label>
      </div>
      {!polarValid && <div role="status"><p>Choose increasing angles within the authored angular domain.</p>
        <button type="button" onClick={() => { setPolarDraft({ objectId: selectedObject.id,
          min: String(selectedObject.domain.min), max: String(selectedObject.domain.max) });
          setPolarAreaRequest(null); setPolarArcRequest(null); }}>Use source angle range</button></div>}
      <div className="graph2d-area-controls">
        <button type="button" disabled={!polarValid} title={!polarValid ? "Choose increasing angles within the authored angular domain." : undefined} onClick={() => polarValid && selectedObject.kind === "polar" &&
          setPolarAreaRequest({ objectId: selectedObject.id, min: polarMin, max: polarMax })}>Measure swept area</button>
        <button type="button" disabled={!polarValid} title={!polarValid ? "Choose increasing angles within the authored angular domain." : undefined} onClick={() => polarValid && selectedObject.kind === "polar" &&
          setPolarArcRequest({ objectId: selectedObject.id, min: polarMin, max: polarMax })}>Measure polar arc length</button>
      </div>
      {[polarArea, polarArcLength].filter((result): result is Graph2DPolarMeasurement =>
        result !== null && isGraph2DPolarMeasurementCurrent(result, document)).map(result =>
        <div key={result.resultId} data-testid={result.kind === "swept-area" ? "graph2d-polar-area-result" : "graph2d-polar-arc-result"}
          data-result-id={result.resultId}>
          <p>{result.kind === "swept-area" ? "Swept area" : "Polar arc length"}: {result.value === null ?
            "Unavailable over full angular interval" : result.value.toPrecision(9)}</p>
          <small>{result.method} · tolerance {result.tolerance.toExponential(1)} · estimated error {result.errorEstimate === null ?
            "unavailable" : result.errorEstimate.toExponential(2)} · {result.evaluations.toLocaleString()} evaluations</small>
          {result.unresolvedCells > 0 && <p>{result.unresolvedCells} unresolved cells; partial value {result.partialValue.toPrecision(7)}.</p>}
        </div>)}
    </section> : areaUnavailable && arcUnavailable ? <section className="graph2d-measurement-unavailable" aria-label="Measurements unavailable">
      <h3>Measurements</h3><p>{areaUnavailable}</p><p>{arcUnavailable}</p>
    </section> : <><section className="graph2d-area" data-testid="graph2d-area" aria-label="Interval area">
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
        <button type="button" disabled={!areaValid || !!areaUnavailable} onClick={() => !areaUnavailable && document.selection.objectId &&
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
      <button type="button" disabled={!areaValid || !!arcUnavailable} onClick={() => !arcUnavailable && document.selection.objectId &&
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
    </section></>}
    {selectedObject?.kind === "explicit-cartesian" && <section className="graph2d-intersections" data-testid="graph2d-intersections" aria-label="Pairwise intersections">
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
        <button type="button" disabled={!intersectionValid} onClick={() => selectedObject.kind === "explicit-cartesian" &&
          setIntersectionRequest({ firstId: selectedObject.id, secondId,
            intervalMode: intersectionDraft.intervalMode, min: intersectionMin, max: intersectionMax })}>
          Solve intersections</button>
      </div> : <p>Add another function to compare.</p>}
      {intersections && <div data-testid="graph2d-intersection-result" data-result-id={intersections.resultId}>
        <p><strong>{intersections.quality === "incomplete" ? "Incomplete" :
          intersections.quality === "approximate" ? "Approximate enumeration" : "Unavailable"}</strong>
          {" "}· {intersections.candidates.length} candidates · x ∈
          [{intersections.interval.min.toPrecision(5)}, {intersections.interval.max.toPrecision(5)}]</p>
        <Graph2DUnresolvedCoverage intervals={intersections.unresolvedIntervals} />
        <Graph2DIntersectionResultsTable analysis={intersections} document={document}
          onSelectionCommit={onSelectionCommit}
          canSave={!!onConstructionCommit &&
            (document.source.constructions?.objects.length ?? 0) < GRAPH2D_MAX_CONSTRUCTIONS}
          onSave={candidate => onConstructionCommit?.({ type: "create",
            object: graph2DConstructionFromCandidate(document, intersections, candidate) })} />
        {(intersections.invalidCells > 0 || intersections.unresolvedBrackets > 0 || intersections.coincidentCells > 0) &&
          <small>{intersections.invalidCells} undefined cells · {intersections.unresolvedBrackets} unresolved brackets ·
            {" "}{intersections.coincidentCells} coincident cells</small>}
        <small>Refined means a bracket solver met residual tolerance 1e−7. A small residual does not prove a unique intersection or complete enumeration. Tangencies are possible candidates; narrow intersections may be missed.</small>
        <button type="button" onClick={() => downloadGraph2DNumericalDataset(intersections)}>Export numerical JSON</button>
        <Graph2DAnalysisQualityGuide />
      </div>}
    </section>}
    {onPromotionCreate && onPromotionLocate && onPromotionRegenerate && <Graph2DPromotionPanel document={document}
      promotions={promotions} onCreate={onPromotionCreate} onLocate={onPromotionLocate} onRegenerate={onPromotionRegenerate} />}
    <section className="graph2d-inspector-source" aria-label="Source and sampling details">
      <h3>Source and sampling</h3>
      <dl className="graph2d-inspector-details">
        <dt>Graph object</dt><dd>{inspected.label}</dd>
        <dt>Source</dt><dd><code>{inspected.kind === "explicit-cartesian" ? `y = ${inspected.expression}` : inspected.expression}</code></dd>
        {selectedObject?.kind === "point-series" && selectedObject.origin && <>
          <dt>Scientific source</dt><dd>{selectedObject.origin.sourceProducer}/{selectedObject.origin.sourceId} ·
            {" "}{selectedObject.origin.sceneId}/{selectedObject.origin.datasetId}</dd>
          <dt>Units</dt><dd>{selectedObject.origin.xName} ({selectedObject.origin.xUnit}) →
            {" "}{selectedObject.origin.yName} ({selectedObject.origin.yUnit})</dd>
          {selectedObject.origin.slice && <><dt>Grid line</dt><dd>Vary axis {selectedObject.origin.slice.varyingAxis};
            {" "}{selectedObject.origin.slice.fixedName} = {selectedObject.origin.slice.fixedCoordinate} {selectedObject.origin.slice.fixedUnit}
            {" "}(index {selectedObject.origin.slice.fixedIndex})</dd></>}
          <dt>Source hashes</dt><dd><code>manifest {selectedObject.origin.sceneFingerprint}<br />resource {selectedObject.origin.resourceSha256}</code></dd>
        </>}
        <dt>{inspected.kind === "parametric" ? "Parameter t" : inspected.kind === "polar" ? "Angle θ" : inspected.kind === "time-ode" ? "Time domain" : "X domain"}</dt>
        <dd>{inspected.domain.includeMin ? "[" : "("}{inspected.domain.min}, {inspected.domain.max}{inspected.domain.includeMax ? "]" : ")"}</dd>
        {(selectedObject?.kind === "implicit" || selectedObject?.kind === "inequality" || selectedObject?.kind === "slope-field" || selectedObject?.kind === "phase-portrait") && <><dt>Y domain</dt>
          <dd>{selectedObject.yDomain.min}, {selectedObject.yDomain.max}</dd></>}
        {selectedObject?.kind === "phase-portrait" && <>
          <dt>System</dt><dd>x′ = {selectedObject.xDerivative.source}; y′ = {selectedObject.yDerivative.source}</dd>
          <dt>Time horizon</dt><dd>±{selectedObject.timeSpan}</dd>
          <dt>Field settings</dt><dd>{selectedObject.fieldDensity ?? 12} arrows per longest side ·
            x {selectedObject.fieldUnits?.x || "unitless"}, y {selectedObject.fieldUnits?.y || "unitless"},
            time {selectedObject.fieldUnits?.time || "unitless"}</dd>
          <dt>Initial points</dt><dd data-testid="graph2d-phase-seed-list">
            {selectedObject.seeds.length === 0 && <span>No initial points. Place one on the graph.</span>}
            {selectedObject.seeds.map((seed, index) => {
              const orbit = selectedSeries?.artifact && "kind" in selectedSeries.artifact &&
                selectedSeries.artifact.kind === "phase-portrait" ?
                (selectedSeries.artifact as Graph2DPhasePortraitArtifact).orbits[index] : undefined;
              return <div className="graph2d-phase-seed-row" key={index}>
                <button type="button" aria-pressed={selectedPhaseSeed?.objectId === selectedObject.id && selectedPhaseSeed.index === index}
                  onClick={() => setSelectedPhaseSeed({ objectId: selectedObject.id, index })}>
                  Point {index + 1} ({seed.x.toPrecision(5)}, {seed.y.toPrecision(5)})</button>
                <button type="button" aria-label={`Remove initial point ${index + 1}`} disabled={!onAuthoringCommit || parameterPreviewActive}
                  onClick={() => { onAuthoringCommit?.(graph2DPhaseSeedRemovalAction(document, selectedObject.id, index));
                    setSelectedPhaseSeed(null); setPhaseSeedPlacement(null); }}>Remove</button>
                {orbit && <small>Backward {orbit.backward}; forward {orbit.forward} · {orbit.acceptedSteps} accepted, {orbit.rejectedSteps} rejected</small>}
              </div>;
            })}
            <button type="button" data-testid="graph2d-phase-clear-seeds" disabled={!onAuthoringCommit || !selectedObject.seeds.length || parameterPreviewActive}
              onClick={() => { onAuthoringCommit?.(graph2DPhaseSeedRemovalAction(document, selectedObject.id, null));
                setSelectedPhaseSeed(null); setPhaseSeedPlacement(null); }}>Clear all initial points</button>
          </dd>
          <dt>Explore</dt><dd><button type="button" data-testid="graph2d-phase-place-seed"
            disabled={!onAuthoringCommit || !sampling.ready || !selectedSeries?.style.visible || selectedObject.seeds.length >= 8 ||
              parameterPreviewActive || graph2DHasLogScale(viewport)}
            aria-pressed={phaseSeedPlacement === selectedObject.id}
            onClick={() => { setPhaseSeedPlacement(current => current === selectedObject.id ? null : selectedObject.id); setToolHint(""); }}>
            {phaseSeedPlacement === selectedObject.id ? "Cancel placement" : "Place initial point"}</button>
            <span> Drag a marked initial point to update its orbit. Release saves one undo step.</span></dd>
          {selectedSeries?.artifact && "kind" in selectedSeries.artifact && selectedSeries.artifact.kind === "phase-portrait" && <>
            <dt>Orbits</dt><dd data-testid="graph2d-phase-orbits">{(selectedSeries.artifact as Graph2DPhasePortraitArtifact).orbits.map((orbit, index) =>
              <span key={index}>{index + 1}: backward {orbit.backward}, forward {orbit.forward}; {orbit.acceptedSteps} accepted, {orbit.rejectedSteps} rejected<br /></span>)}</dd>
            <dt>Field</dt><dd>{(selectedSeries.artifact as Graph2DPhasePortraitArtifact).fieldSegments.length} direction arrows · adaptive RK4, local tolerance 10⁻⁶.
              {(() => { const speeds = (selectedSeries.artifact as Graph2DPhasePortraitArtifact).fieldMagnitudes;
                return speeds.length ? ` Sampled speed ${Math.min(...speeds).toPrecision(3)}–${Math.max(...speeds).toPrecision(3)} coordinate units per time unit; arrow length is median-relative.` : " No finite nonzero vectors sampled."; })()}</dd>
            <dt>Nullclines</dt><dd data-testid="graph2d-phase-nullclines">x′=0 orange dashed;
              {" "}y′=0 cyan dotted · {(selectedSeries.artifact as Graph2DPhasePortraitArtifact).analysis.status}</dd>
            <dt>Equilibria</dt><dd data-testid="graph2d-phase-equilibria">
              {(selectedSeries.artifact as Graph2DPhasePortraitArtifact).equilibria.length ?
                (selectedSeries.artifact as Graph2DPhasePortraitArtifact).equilibria.map((point, index) =>
                  <span key={index} data-testid="graph2d-phase-classification">
                    ({point.x.toPrecision(6)}, {point.y.toPrecision(6)}) · residual {point.residual.toExponential(2)}<br />
                    Linearization: {point.linearization.kind.replace(/-/g, " ")} · {point.linearization.stability}
                    {point.linearization.jacobian && <> · J = [{point.linearization.jacobian.map(value => value.toPrecision(4)).join(", ")}]</>}
                    {point.linearization.eigenvalues && <> · λ = {point.linearization.eigenvalues.map(value => value.imaginary === 0 ?
                        value.real.toPrecision(4) :
                        `${value.real.toPrecision(4)}${value.imaginary < 0 ? "−" : "+"}${Math.abs(value.imaginary).toPrecision(4)}i`).join(", ")}</>}
                    {point.linearization.reason && <> · {point.linearization.reason}</>}<br />
                  </span>) :
                "None resolved at sampled grid resolution"}</dd>
            <dt>Method</dt><dd>Marching squares contour crossings, then up to five Newton steps.
              {" "}{(selectedSeries.artifact as Graph2DPhasePortraitArtifact).analysis.candidates} candidates;
              {" "}{(selectedSeries.artifact as Graph2DPhasePortraitArtifact).analysis.unresolved} unresolved.
              {" "}Grid scale ≈ {(selectedSeries.artifact as Graph2DPhasePortraitArtifact).analysis.gridScale?.toPrecision(3) ?? "unavailable"} world units.
              {" "}Residual tolerance 10⁻⁷(1+|position|); no certified error bound.</dd>
          </>}
        </>}
        {selectedObject?.kind === "trajectory" && <>
          <dt>Linked field</dt><dd>{document.source.objects.find(object => object.id === selectedObject.sourceFieldId)?.label ?? selectedObject.sourceFieldId}</dd>
          <dt>Initial value</dt><dd>y({selectedObject.seed.x}) = {selectedObject.seed.y}</dd>
          {selectedSeries?.artifact && "kind" in selectedSeries.artifact && selectedSeries.artifact.kind === "trajectory" && <>
            <dt>Integration</dt><dd data-testid="graph2d-trajectory-stops">Backward: {(selectedSeries.artifact as Graph2DTrajectoryArtifact).stops.backward};
              {" "}forward: {(selectedSeries.artifact as Graph2DTrajectoryArtifact).stops.forward}</dd>
            <dt>Steps</dt><dd>{(selectedSeries.artifact as Graph2DTrajectoryArtifact).acceptedSteps} accepted,
              {" "}{(selectedSeries.artifact as Graph2DTrajectoryArtifact).rejectedSteps} rejected · local tolerance 10⁻⁶</dd>
          </>}
        </>}
        {selectedObject?.kind === "time-ode" && <>
          <dt>Equation</dt><dd>x′ = {selectedObject.expression.source}</dd>
          <dt>Axes</dt><dd>Horizontal: time t; vertical: state x. Linear scales only.</dd>
          <dt>State bounds</dt><dd>{selectedObject.stateDomain.min}, {selectedObject.stateDomain.max}</dd>
          <dt>Initial value</dt><dd>x({selectedObject.seed.t}) = {selectedObject.seed.x}</dd>
          {selectedSeries?.artifact && "kind" in selectedSeries.artifact && selectedSeries.artifact.kind === "time-ode" && (() => {
            const ode = selectedSeries.artifact as Graph2DTimeOdeArtifact;
            return <><dt>Integration</dt><dd data-testid="graph2d-time-ode-stops">
              {ode.backward && ode.forward ? <>Backward: {ode.backward.stop} at ({ode.backward.last.t.toPrecision(6)}, {ode.backward.last.x.toPrecision(6)}) · {ode.backward.acceptedSteps} accepted, {ode.backward.rejectedSteps} rejected;
                {" "}forward: {ode.forward.stop} at ({ode.forward.last.t.toPrecision(6)}, {ode.forward.last.x.toPrecision(6)}) · {ode.forward.acceptedSteps} accepted, {ode.forward.rejectedSteps} rejected.</> :
                "Unavailable on logarithmic axes."}</dd>
              <dt>Method</dt><dd>Adaptive RK4 step doubling, local tolerance 10⁻⁶. Paths are numerical approximations.</dd></>;
          })()}
        </>}
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
          sampling.retained ? "Updating — previous observation" : "Updating — no observation yet" :
            `${inspected.sampling.method === "bounded-direction-grid" ? "Bounded direction grid" :
              inspected.sampling.method === "adaptive-initial-value-trajectory" ? "Adaptive initial-value trajectory" :
              inspected.sampling.method === "adaptive-phase-portrait" ? "Adaptive phase portrait" :
              inspected.sampling.method === "adaptive-time-ode" ? "Adaptive time-dependent ODE" :
                "Adaptive bounded polyline"} · ${inspected.sampling.status}`}</dd>
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
    </section>
    <div className="graph2d-inspector-actions">
      <button type="button" disabled={!inspected.probe} onClick={locateSelected}>Locate</button>
      <button type="button" disabled={!sampling.ready || parameterPreviewActive || !selectedSeries?.artifact.segments.length} onClick={fitSelection}>Fit selection</button>
      <button type="button" onClick={() => onSelectionCommit?.({ objectId: null, probe: null })}>Clear selection</button>
    </div>
    {savedProbes}
  </div> : <div className="graph2d-inspector"><p className="graph2d-muted">Select a graph object to inspect it.</p>{constructions}{savedProbes}</div>;
  return (
    <section data-testid="graphs-workspace" aria-label="Graphs workspace" className="graph2d-workspace"
      data-left={showLeft} data-right={showRight} data-presentation={presentation}
      style={{ "--graph2d-left-width": showLeft ? `${dockLayout.left}px` : "0px",
        "--graph2d-right-width": showRight ? `${dockLayout.right}px` : "0px" } as CSSProperties}>
      {showLeft && <aside className="graph2d-panel graph2d-left" data-palette={leftPalette} aria-label="Graph functions">
        {functionList("desktop")}
      </aside>}
      {!showLeft && functionList("modal-only")}
      <div data-testid="main-viewer" className="graph2d-viewer" aria-label="Graph scene" ref={viewerRef}
        data-point-dragging={!!pointDragPreview} data-phase-seed-dragging={!!phaseSeedPreview}
        tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { cancelPointDrag(); cancelPhaseSeedDrag(); dragRef.current = null; setPreview(null); setHoverSelection(null); }}
        onLostPointerCapture={event => { if (pointDragRef.current?.pointerId === event.pointerId) cancelPointDrag();
          if (phaseSeedDrag.current?.pointerId === event.pointerId) cancelPhaseSeedDrag(); }}
        onPointerLeave={() => setHoverSelection(null)} onKeyDown={onKeyDown}>
        {presentation && <div className="graph2d-presentation-controls" onPointerDown={event => event.stopPropagation()}>
          <span>Presentation · {document.metadata.title}</span>
          <button type="button" onClick={() => { finishWheel(); fitVisible(); }}>Fit</button>
          <button type="button" onClick={event => { exportOpener.current = event.currentTarget; finishWheel(); setExportOpen(true); }}>Export</button>
          <button type="button" data-testid="graph2d-presentation-exit" onClick={exitPresentation}>Exit presentation</button>
        </div>}
        <div className="graph2d-toolbar" ref={toolbarRef} onPointerDown={(event) => event.stopPropagation()}>
          <div className="graph2d-toolbar-primary" role="group" aria-label="Graph view essentials">
            <button type="button" disabled={!sampling.ready || !selectedSeries?.artifact.segments.length || parameterPreviewActive}
              onClick={() => { finishWheel(); fitSelection(); }}>Fit selection</button>
            <button type="button" disabled={!sampling.ready || parameterPreviewActive}
              onClick={() => { finishWheel(); fitVisible(); }}>Fit all</button>
            <button type="button" onClick={() => { finishWheel(); onViewportCommit?.({ ...GRAPH2D_DEFAULT_VIEWPORT }); }}>Reset view</button>
            <button type="button" aria-label="Zoom in" onClick={() => {
              const current = previewRef.current ?? document.display.viewport;
              finishWheel(); onViewportCommit?.(zoomGraph2DViewport(current, size,
                { x: size.width / 2, y: size.height / 2 }, 1.2));
            }}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => {
              const current = previewRef.current ?? document.display.viewport;
              finishWheel(); onViewportCommit?.(zoomGraph2DViewport(current, size,
                { x: size.width / 2, y: size.height / 2 }, 1 / 1.2));
            }}>−</button>
          </div>
          <div className="graph2d-toolbar-secondary">
            <button type="button" data-testid="graph-gallery-open" onClick={event => { galleryOpener.current = event.currentTarget; setGalleryStartCategory("All"); finishWheel(); closeGrid(true, false); setScalesOpen(false); setParametersOpen(false); setParameterPreview(null); setGalleryError(null); setGalleryOpen(true); }}>Gallery</button>
            <div className="graph2d-toolbar-group" role="group" aria-label="Construction tools">
              <button type="button" ref={toolsOpener} aria-expanded={toolsOpen} onClick={() => { finishWheel(); closeGrid(true, false); cancelParameter(); setToolsOpen(!toolsOpen); }}>Tools</button>
            </div>
            <div className="graph2d-toolbar-group" role="group" aria-label="Analysis">
              <button type="button" disabled={!showRight} title={!showRight ? "Open the Inspector dock to view analysis." : undefined}
                onClick={() => { finishWheel(); openInspector(); }}>Inspector</button>
            </div>
            <details className="graph2d-toolbar-menu"><summary>More</summary><div className="graph2d-toolbar-menu-content">
              <div className="graph2d-toolbar-group" role="group" aria-label="Authoring">
                <span>Author</span>
                <button type="button" disabled={!scientificImportAvailable || !onAuthoringCommit || scientificImportBusy}
                  title={!scientificImportAvailable ? "Available in the desktop app" : undefined}
                  onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); void openScientificDataset(); }}>Import scientific dataset</button>
                <button type="button" disabled={!scientificImportAvailable || !onAuthoringCommit || scientificImportBusy}
                  title={!scientificImportAvailable ? "Available in the desktop app" : undefined}
                  onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open");
                    setScientificPresetOpen(true); }}>Scientific field presets</button>
                <button type="button" data-testid="graph2d-parameters-open" disabled={status !== "ready"} onClick={event => {
                  parametersOpener.current = event.currentTarget; finishWheel(); setParametersOpen(value => !value); setParameterPreview(null);
                  setScalesOpen(false); closeGrid(true, false);
                  if (!parametersOpen) galleryFocusFrame.current = requestAnimationFrame(() => { galleryFocusFrame.current = null;
                    parametersOpener.current?.closest(".graph2d-workspace")?.querySelector<HTMLButtonElement>('[data-testid="graph2d-parameters-close"]')?.focus(); });
                }}>Parameters</button>
                <button type="button" aria-pressed={parameterCards} onClick={() => { finishWheel(); cancelParameter(); setParametersOpen(false); setParameterCards(!parameterCards); }}>Parameter cards</button>
              </div>
              <div className="graph2d-toolbar-group" role="group" aria-label="View settings">
                <span>View</span>
                <button type="button" ref={gridOpener} aria-expanded={gridOpen} disabled={status !== "ready"} onClick={() => {
                  finishWheel(); cancelParameter(); setParametersOpen(false); setScalesOpen(false);
                  if (gridOpen) closeGrid(true); else setGridOpen(true);
                }}>Grid</button>
                <button type="button" ref={scalesOpener} onClick={() => { finishWheel(); cancelParameter(); closeGrid(true, false); setParametersOpen(false); setScalesOpen(!scalesOpen); }}>Scales</button>
                <button type="button" aria-pressed={viewport.continuation ?? false} onClick={() => { finishWheel(); cancelParameter(); onViewportCommit?.({ ...document.display.viewport, continuation: !document.display.viewport.continuation }); }}>Show continuation</button>
                <button type="button" aria-label="Toggle polar grid" aria-pressed={(document.display.axes.gridMode ?? "cartesian") === "polar"}
                  disabled={graph2DHasLogScale(viewport) || manualGrid} title={graph2DHasLogScale(viewport) ? "Polar grid needs linear axes" : manualGrid ? "Set both grid spacings to Auto before switching to polar" : undefined}
                  onClick={() => onGridModeCommit?.((document.display.axes.gridMode ?? "cartesian") === "polar" ? "cartesian" : "polar")}>
                  {(document.display.axes.gridMode ?? "cartesian") === "polar" ? "Cartesian grid" : "Polar grid"}</button>
              </div>
              <div className="graph2d-toolbar-group" role="group" aria-label="Export and presentation">
                <span>Share</span>
                <button type="button" data-testid="graph2d-export-open" disabled={status !== "ready" || parameterPreviewActive} onClick={event => {
                  exportOpener.current = event.currentTarget; finishWheel(); closeGrid(true, false); dragRef.current = null; setExportOpen(true);
                }}>Export</button>
                <button type="button" ref={presentationOpener} data-testid="graph2d-presentation-open" onClick={() => {
                  finishWheel(); closeGrid(true, false); cancelParameter(); setParametersOpen(false); setScalesOpen(false); setToolsOpen(false);
                  setParameterCards(false); setPresentation(true);
                  requestAnimationFrame(() => viewerRef.current?.querySelector<HTMLButtonElement>('[data-testid="graph2d-presentation-exit"]')?.focus());
                }}>Present</button>
              </div>
            </div></details>
          </div>
        </div>
        {scientificImportBusy && <p className="graph2d-tool-hint" role="status">Verifying scientific dataset…</p>}
        {scientificImportError && !scientificImport && <p className="graph2d-tool-hint" role="alert">{scientificImportError}</p>}
        {scientificPresetOpen && <div className="graph2d-scientific-import graph2d-scientific-presets" role="dialog"
          aria-label="Scientific field presets" onPointerDown={event => event.stopPropagation()}>
          <h3>Scientific field presets</h3>
          <p>Choose a verified sample dataset. You can preview its components before importing a line.</p>
          {SCIENTIFIC_FIELD_PRESETS.map(preset => <div key={preset.id} className="graph2d-scientific-preset-option">
            <button type="button" disabled={scientificImportBusy} onClick={() => void openScientificDataset(preset.id)}>
              {preset.title}</button><small>{preset.detail}</small>
          </div>)}
          <button type="button" onClick={() => setScientificPresetOpen(false)}>Cancel</button>
        </div>}
        {scientificImport && <div className="graph2d-scientific-import" role="dialog" aria-label="Import verified scientific dataset"
          onPointerDown={event => event.stopPropagation()}>
          <h3>Import verified scientific dataset</h3>
          {scientificManifest?.ok && <p>{scientificManifest.value.title}</p>}
          <label>Dataset component <select value={scientificDatasetId} onChange={event => {
            setScientificDatasetId(event.target.value); resetScientificSlice();
            selectDefaultScientificSlice(scientificImport.datasets.find(item => `${item.datasetId}:${item.component}` === event.target.value)?.shape);
          }}>
            {scientificImport.datasets.map(item => <option key={`${item.datasetId}:${item.component}`}
              value={`${item.datasetId}:${item.component}`}>{item.datasetId} · {item.component}</option>)}
          </select></label>
          {scientificSelected?.shape && <>
            <p>{scientificSelected.shape.length}D {scientificDataset?.semanticType ?? "field"} grid · {scientificSelected.component} component ·
              {" "}shape [{scientificSelected.shape.join(", ")}] · last axis varies fastest in the source.</p>
            {scientificSelected.shape.length === 2 && <>
            <p>{scientificImportedLines.length} line{scientificImportedLines.length === 1 ? "" : "s"} imported from this grid.
              {scientificImportedLines.length ? " Choose another fixed coordinate and preview again." : ""} Each preview re-verifies the source.</p>
            </>}
            {scientificCoordinate?.axes.map((axis, index) => <p key={index}>Axis {index}: {axis.name} ({axis.unit}) ·
              {" "}{scientificCoordinate.origin[index]} → {scientificCoordinate.origin[index]! +
                scientificCoordinate.spacing[index]! * (scientificSelected.shape![index]! - 1)}
            </p>)}
            {scientificSelected.shape.length === 2 && <><label>Varying axis <select aria-label="Varying axis" value={scientificVaryingAxis ?? ""}
              onChange={event => { scientificPreviewEpoch.current += 1; setScientificSlicePreview(null);
                const axis = event.target.value === "" ? null : Number(event.target.value) as 0 | 1;
                setScientificVaryingAxis(axis);
                setScientificFixedIndex(axis === null ? null : Math.floor(scientificSelected.shape![1 - axis]! / 2));
                setScientificImportError(""); }}>
              <option value="">Choose axis</option>
              {[0, 1].filter(axis => scientificSelected.shape![axis]! >= 2).map(axis =>
                <option key={axis} value={axis}>Axis {axis} · {scientificCoordinate?.axes[axis]?.name ?? axis}</option>)}
            </select></label>
            {scientificVaryingAxis !== null && <label>Fixed index on axis {1 - scientificVaryingAxis}
              <select aria-label="Fixed index" value={scientificFixedIndex ?? ""}
                onChange={event => { scientificPreviewEpoch.current += 1; setScientificSlicePreview(null);
                  setScientificFixedIndex(event.target.value === "" ? null : Number(event.target.value)); setScientificImportError(""); }}>
                <option value="">Choose index</option>
                {Array.from({ length: scientificSelected.shape[1 - scientificVaryingAxis]! }, (_, index) =>
                  <option key={index} value={index}>{index} · {scientificCoordinate?.axes[1 - scientificVaryingAxis]?.name} =
                    {" "}{scientificCoordinate ? scientificCoordinate.origin[1 - scientificVaryingAxis]! +
                      scientificCoordinate.spacing[1 - scientificVaryingAxis]! * index : index}</option>)}
              </select></label>}
            <p>Use the selected fixed coordinate or choose another, then click Preview line to verify it before importing.</p>
            <button type="button" disabled={scientificVaryingAxis === null || scientificFixedIndex === null || scientificImportBusy}
              onClick={previewScientificSlice}>Preview line</button>
            </>}
            {scientificSelected.shape.length === 3 && <>
              <label>Plane normal axis <select aria-label="Plane normal axis" value={scientificNormalAxis}
                onChange={event => { const axis = Number(event.target.value) as 0 | 1 | 2;
                  scientificPreviewEpoch.current += 1; setScientificPlane(null); setScientificNormalAxis(axis);
                  setScientificPlaneIndex(Math.floor(scientificSelected.shape![axis]! / 2)); }}>
                {[0, 1, 2].map(axis => <option key={axis} value={axis}>Axis {axis} · {scientificCoordinate?.axes[axis]?.name ?? axis}</option>)}
              </select></label>
              <label>Plane at {scientificCoordinate?.axes[scientificNormalAxis]?.name} <select aria-label="Plane fixed index"
                value={scientificPlaneIndex} onChange={event => { scientificPreviewEpoch.current += 1;
                  setScientificPlane(null); setScientificPlaneIndex(Number(event.target.value)); }}>
                {Array.from({ length: scientificSelected.shape[scientificNormalAxis]! }, (_, index) =>
                  <option key={index} value={index}>{index} · {scientificCoordinate?.axes[scientificNormalAxis]?.name} =
                    {" "}{scientificCoordinate ? scientificCoordinate.origin[scientificNormalAxis]! +
                      scientificCoordinate.spacing[scientificNormalAxis]! * index : index}</option>)}
              </select></label>
            </>}
            <button type="button" disabled={scientificImportBusy} onClick={previewScientificPlane}>
              {scientificSelected.shape.length === 2 ? "View verified field" : "View verified plane"}</button>
            {scientificSelected.shape.length === 3 && <button type="button" disabled={scientificImportBusy}
              onClick={previewScientificVolume}>View verified volume</button>}
            {scientificPlane && scientificCoordinate && scientificPlane.datasetId === scientificSelected.datasetId &&
              scientificPlane.component === scientificSelected.component &&
              <ScientificFieldPlane plane={scientificPlane} coordinate={scientificCoordinate}
                label={`${scientificDataset?.quantity.name ?? scientificSelected.datasetId} ${scientificSelected.component}`}
                unit={scientificDataset?.quantity.unit ?? ""} />}
            {scientificVolume && scientificCoordinate && scientificVolume.datasetId === scientificSelected.datasetId &&
              scientificVolume.component === scientificSelected.component &&
              <ScientificFieldVolume volume={scientificVolume} coordinate={scientificCoordinate}
                label={`${scientificDataset?.quantity.name ?? scientificSelected.datasetId} ${scientificSelected.component}`}
                unit={scientificDataset?.quantity.unit ?? ""} />}
          </>}
          {scientificPreview ? <>
            <p>{scientificPreview.rows.length} checked samples · {scientificPreview.origin.xName} ({scientificPreview.origin.xUnit}) →
              {" "}{scientificPreview.origin.yName} ({scientificPreview.origin.yUnit})</p>
            <p>Source {scientificPreview.origin.sourceProducer}/{scientificPreview.origin.sourceId} · scene {scientificPreview.origin.sceneId}</p>
            <small>Manifest {scientificPreview.origin.sceneFingerprint} · resource {scientificPreview.origin.resourceSha256}</small>
            {scientificPreview.origin.slice && <p>Line at {scientificPreview.origin.slice.fixedName} =
              {" "}{scientificPreview.origin.slice.fixedCoordinate} {scientificPreview.origin.slice.fixedUnit} ·
              {" "}first ({scientificPreview.rows[0]?.x}, {scientificPreview.rows[0]?.y}) ·
              {" "}last ({scientificPreview.rows.at(-1)?.x}, {scientificPreview.rows.at(-1)?.y})</p>}
            <p>A new point series copies this verified component. {scientificPreview.origin.slice ?
              "After importing, choose another fixed coordinate and preview it separately." :
              "Select another component to import it separately."}</p>
          </> : !scientificSelected?.shape ? <p role="alert">Dataset verification failed.</p> :
            scientificSelected.shape.length === 2 ?
              <p role="status">No verified line is ready yet. Click Preview line; then Import as point series becomes available.</p> : null}
          {scientificLineAlreadyImported && <p role="status">This grid line is already imported. Choose a different fixed coordinate.</p>}
          {scientificImportError && <p role="alert">{scientificImportError}</p>}
          <div>{scientificSelected?.shape?.length !== 3 && <button type="button"
            disabled={!scientificPreview || scientificLineAlreadyImported || scientificImportBusy}
            onClick={commitScientificDataset}>Import as point series</button>}
            {scientificSelected?.shape && <button type="button" disabled={!scientificFieldViewed || scientificFieldAlreadySaved ||
              scientificImportBusy || !onAuthoringCommit} onClick={saveScientificFieldReference}>
              Save field reference</button>}
            <button type="button" onClick={() => { resetScientificSlice();
              void window.scientificScenes?.closeGraphDataset(scientificImport.fingerprint); setScientificImport(null); }}>Cancel</button></div>
        </div>}
        {toolHint && <p className="graph2d-tool-hint" role="status">{toolHint}</p>}
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Graph objects ({document.source.objects.length})</summary>{functionList("compact")}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}{savedFields}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={series}
          selectedPhaseSeed={selectedPhaseSeed}
          constructions={parameterPreviewActive ? null : shownConstructions}
          probeMarkers={probeMarkers}
          regression={!parameterPreviewActive && document.display.objects.find(s => s.objectId === currentRegression?.objectId)?.visible ? currentRegression : null}
          selectedProbe={parameterPreviewActive ? null : document.selection.probe} hoverProbe={parameterPreviewActive ? null : hoverSelection?.probe} overlays={parameterPreviewActive ? [] : differentialOverlays}
          intervals={!parameterPreviewActive && intervals && isGraph2DIntervalAnalysisCurrent(intervals, document) ? intervals : null}
          area={!parameterPreviewActive && area && isGraph2DIntegralCurrent(area, document) ? area : null}
          derivativeCurve={!parameterPreviewActive && derivativeCurve?.sourceHash === document.identity.structuralHash ? derivativeCurve : null}
          unresolvedIntervals={parameterPreviewActive ? [] : [
            ...(criticalPoints?.unresolvedIntervals ?? []),
            ...(intersections && isGraph2DIntersectionCurrent(intersections, document) ? intersections.unresolvedIntervals : []),
          ]}
          intersections={!parameterPreviewActive && intersections && isGraph2DIntersectionCurrent(intersections, document) ? intersections : null} />}
        {sampling.error && <div role="alert" className="graph2d-viewer-message"><p>{sampling.error}</p>
          <button type="button" onClick={sampling.retry}>Retry sampling</button></div>}
        {(gridWarnings.length > 0 || viewport.continuation || graph2DHasLogScale(viewport) || parameterPreviewActive || pointDragPreview || phaseSeedPreview || phaseSeedPlacement || !sampling.ready && !sampling.error && document.source.objects.length > 0) && <div role="status" className="graph2d-update-status" data-testid="graph2d-update-status">
          {gridWarnings.join(" ")}
          {pointDragPreview ? ` Dragging saved point: parameter ${pointDragPreview.parameter.toPrecision(7)}. Release to save; Esc to cancel.` : ""}
          {phaseSeedPreview ? ` Dragging initial point (${phaseSeedPreview.point.x.toPrecision(5)}, ${phaseSeedPreview.point.y.toPrecision(5)}). Release to save; Esc to cancel.` : ""}
          {phaseSeedPlacement ? " Tap inside the phase portrait domain to add an initial point; Esc to cancel." : ""}
          {parameterPreviewActive ? "Parameter preview — not saved. Apply or Cancel; committed analyses are hidden on the plot." : ""}
          {!sampling.ready && !sampling.error ? sampling.retained ? " Updating graph… previous preview/same-source samples remain visible." : " Sampling graph…" : ""}
          {viewport.continuation ? " Light dotted continuation: outside authored range; visual only, not analysed/exported. Bounded preview may be incomplete." : ""}
          {graph2DHasLogScale(viewport) ? " Log axes: non-positive coordinates omitted; analysis uses world units, tangent/area/interval overlays hidden." : ""}
          {graph2DHasLogScale(viewport) && document.source.objects.some(object => object.kind === "slope-field" &&
            document.display.objects.some(style => style.objectId === object.id && style.visible)) ? " Slope fields require linear axes." : ""}
        </div>}
        {status === "loading" ? <div className="graph2d-viewer-message" role="status">Loading graph…</div> :
          status === "error" ? <div className="graph2d-viewer-message" role="alert">{errorMessage || "Graph could not be opened."}</div> :
          document.source.objects.length === 0 ? <div className="graph2d-viewer-message" aria-label="Empty graph scene">
            <h2>Graphs</h2>
            <p>{graph2DSceneStatusLabel(document)} is ready.</p>
            <button type="button" onClick={event => { galleryOpener.current = event.currentTarget; setGalleryStartCategory("All"); setGalleryError(null); setGalleryOpen(true); }}>Explore Graph Gallery</button>
            <small>{document.source.objects.length} graph objects · {GRAPH2D_WORKSPACE_CONTRACT.initialObjectKind} starter source</small>
          </div> : null}
      </div>
      {showRight && <aside className="graph2d-panel graph2d-right" aria-label="Graph inspector">
        <h2>Inspector</h2>
        {guided && <details className="graph2d-guided-panel" data-testid="graph2d-guided-panel">
          <summary>Guide: {guided.concept.title} · {guided.state}</summary>
          {guided.state === "stale" && <p role="status">Source or marker changed. These steps describe the original example; request fresh analysis before drawing conclusions.</p>}
          <ol>{guided.concept.steps.map(step => <li key={step.heading}><strong>{step.heading}</strong><p>{step.explanation}</p><p>Try this: {step.tryThis}</p></li>)}</ol>
          <small>Markers are saved probes. Numerical results are computed only when requested, with their stated limits.</small>
        </details>}{inspector}{savedFields}
      </aside>}
      {galleryOpen && <GraphGalleryDialog activeId={document.identity.id} activeTitle={document.metadata.title} error={galleryError} onClose={closeGallery} initialCategory={galleryStartCategory}
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
        analysisPreviewEnabled={previewAnalysisEnabled} onAnalysisPreviewChange={setPreviewAnalysisEnabled}
        onPreview={values => { if (values) previewGraph2DParameterValues(document, values); setParameterPreview(values ? { key: parameterKey, values } : null); }}
        onCommit={action => { if (!onAuthoringCommit) throw new Error("Parameter authoring is unavailable."); onAuthoringCommit(action); setParameterPreview(null); }}
        onClose={() => { setParametersOpen(false); setParameterCards(false); cancelParameter(); parametersOpener.current?.focus(); }} />}
      {toolsOpen && <Graph2DToolsPanel document={document} rowsAvailable={toolRowsAvailable} onTool={routeTool} onClose={closeTools} />}
    </section>
  );
}
