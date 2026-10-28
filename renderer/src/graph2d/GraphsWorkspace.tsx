import {
  analyzeGraph2DArcLength, analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, analyzeGraph2DIntervals,
  analyzeGraph2DIntersections,
  sampleGraph2DDerivativeCurve,
  analyzeGraph2DLocalDifferential, fitGraph2DViewport,
  graph2DSceneFitBounds, graph2DConstructionFitBounds,
  previewGraph2DScientificDataset,
  previewGraph2DScientificSlice, verifyGraph2DScientificPlane, verifyGraph2DScientificVectorPlane,
  verifyGraph2DScientificVolume,
  parseScientificSceneManifest, createGraph2DFieldReference, inspectGraph2DFieldReference,
  isGraph2DFieldLocator,
  scientificSceneLibraryKey, type ScientificSceneLibraryReference,
  createGraph2DVectorFieldReference, inspectGraph2DVectorFieldReference,
  reviewGraph2DVectorFieldRelink,
  reviewGraph2DFieldRelink,
  analyzeGraph2DPolarLocalDifferential, isGraph2DPolarLocalDifferentialCurrent,
  analyzeGraph2DParametricLocalDifferential, isGraph2DParametricLocalDifferentialCurrent,
  analyzeGraph2DPolarMeasurement, isGraph2DPolarMeasurementCurrent,
  GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_WORKSPACE_CONTRACT,
  GRAPH2D_MAX_OBJECTS,
  graph2DWorldToScreen, panGraph2DViewport, pickGraph2DProbe,
  graph2DPhaseSeedAtScreen, graph2DPhaseSeedAction, graph2DPhaseSeedRemovalAction, previewGraph2DPhaseSeed,
  isGraph2DCriticalPointCurrent, isGraph2DIntegralCurrent, isGraph2DIntervalAnalysisCurrent,
  isGraph2DIntersectionCurrent,
  isGraph2DLocalDifferentialCurrent, queryGraph2DInspector,
  resolveGraph2DViewport, selectionForGraph2DObject, zoomGraph2DViewport,
  type Graph2DAuthoringAction, type Graph2DDocument, type Graph2DSelection, type Graph2DViewport,
  type Graph2DPointSeriesDraft, type Graph2DPointSeriesObject,
  type Graph2DLinkedLineOrigin, type Graph2DLinkedRegionOrigin,
  type Graph2DScientificDatasetPreview,
  type VectorField3DDerivedLine,
  type Graph2DScientificPlane,
  type Graph2DScientificVolume,
  type Graph2DFieldLocator, type Graph2DFieldReference,
  type Graph2DVectorFieldReference,
  type Graph2DTrajectoryArtifact,
  type Graph2DPhasePortraitArtifact,
  type Graph2DTimeOdeArtifact,
  type Graph2DConstructionAction,
  graph2DConstructionFromCandidate, graph2DLineConstructionActionsFromProbe, GRAPH2D_MAX_CONSTRUCTIONS,
  graph2DConstructionActionsFromIntersectionCandidates,
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
  structuralHash, canonicalJsonStringify,
  createVectorField3DDocument, parseVectorField3DDocument,
  type VectorField3DDocument, type VectorField3DSource,
  createVectorField2DDocument, reviseVectorField2DDocument, type VectorField2DDocument,
  createScientificFieldDocument, reviseScientificFieldDocument,
  scientificFieldGraphResultState, scientificFieldResultBinding, type ScientificFieldDocument,
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
import { ScientificFieldVectorPlane } from "./ScientificFieldVectorPlane";
import { ScientificFieldVolume } from "./ScientificFieldVolume";
import { scientificExplorerEligibility } from "./scientificExplorerEligibility";
import { ScientificFieldWorkspacePanel } from "./ScientificFieldWorkspacePanel";
import { ScientificComplexVolumeLinesPanel } from "./ScientificComplexVolumeLinesPanel";
import { ScientificComplexField3DWorkspacePanel } from "./ScientificComplexField3DWorkspacePanel";
import type { ScientificComplexVolumeLineSelection } from "./ScientificComplexVolumeLinesPanel";
import { scientificFieldLineSelectionMatchesSlice } from "./reverifyScientificFieldLine";
import { ScientificFieldGraphResultControls } from "./ScientificFieldGraphResultControls";
import { invalidateVerifiedScientificFieldResults } from "./verifiedScientificFieldCache";
import { DEFAULT_SCIENTIFIC_FIELD_TRANSFER, type ScientificFieldTransfer } from "./scientificFieldTransfer";
import { VectorField3DPanel, fieldExplorerSessionKey, readFieldExplorerSession } from "../vectorfield3d/VectorField3DPanel";
import type { LinkedExplorerProbe } from "../vectorfield3d/linkedFieldProbe";
import { scientificExplorerLibrary, scientificSceneReferenceFromManifest, savedScientificExplorerEntries,
  type BuiltinExplorerSceneId, type ExplorerLibraryEntry } from
  "../vectorfield3d/scientificExplorerLibrary";
import { vectorField3DGraphLineMatches } from "../vectorfield3d/reverifyVectorField3DGraphLine";
import { reverifyVectorField3DDerivedLine } from "../vectorfield3d/reverifyVectorField3DDerivedLine";
import { reverifyLinkedOverlayGraphPair } from "../vectorfield3d/reverifyLinkedOverlayGraphPair";
import { reverifyLinkedOverlayRegionGraphPair } from "../vectorfield3d/reverifyLinkedOverlayRegionGraphPair";
import type { SavedRegionSourceStatus } from "../vectorfield3d/checkSavedRegionResultSources";
import type { LinkedOverlayGraphSeries } from "../vectorfield3d/linkedOverlayGraphPair";
import { VectorField2DPanel } from "./VectorField2DPanel";
import { Graph2DAuthoringPanel, type Graph2DLeftPalette } from "./Graph2DAuthoringPanel";
import { pointTableStore } from "./pointTableStore";
import { Graph2DPromotionPanel } from "./Graph2DPromotionPanel";
import { useGraph2DSampling } from "./useGraph2DSampling";
import { useGraph2DPhaseAnalysis } from "./useGraph2DPhaseAnalysis";
import { useGraph2DVectorFieldAnalysis } from "./useGraph2DVectorFieldAnalysis";
import { GraphGalleryDialog } from "./GraphGalleryDialog";
import { Graph2DExportDialog } from "./Graph2DExportDialog";
import { Graph2DParametersPanel } from "./Graph2DParametersPanel";
import { Graph2DScalePanel } from "./Graph2DScalePanel";
import { Graph2DGridPanel } from "./Graph2DGridPanel";
import { Graph2DRegressionPanel } from "./Graph2DRegressionPanel";
import { Graph2DFourierPanel } from "./Graph2DFourierPanel";
import { Graph2DComplexMappingPanel } from "./Graph2DComplexMappingPanel";
import { Graph2DToolsPanel } from "./Graph2DToolsPanel";
import { Graph2DProbesPanel } from "./Graph2DProbesPanel";
import { Graph2DConstructionsPanel } from "./Graph2DConstructionsPanel";
import { Graph2DCriticalResultsPanel } from "./Graph2DCriticalResultsPanel";
import { Graph2DAnalysisQualityGuide } from "./Graph2DAnalysisQualityGuide";
import { Graph2DAnalysisBudgetControl, type Graph2DAnalysisBudget } from "./Graph2DAnalysisBudgetControl";
import { Graph2DUnresolvedCoverage } from "./Graph2DUnresolvedCoverage";
import { Graph2DIntersectionResultsTable } from "./Graph2DIntersectionResultsTable";
import { Graph2DIntervalResultsPanel } from "./Graph2DIntervalResultsPanel";
import { Graph2DPhaseEquilibriaTable } from "./Graph2DPhaseEquilibriaTable";
import "./graphsWorkspace.css";

const GRAPH2D_LEFT_PALETTE_KEY = "math3d.graphs.leftPalette.v1";
const EXPLORER_SCENE_SESSION_KEY = "math3d.scientific-field-explorer.scene.v1";
const EMPTY_SCIENTIFIC_SCENES: readonly ScientificSceneLibraryReference[] = [];
type ExplorerSceneSource = Readonly<{ manifestJson: string; fingerprint: string;
  locator: Graph2DFieldLocator }>;
function readExplorerSceneSession(graphId: string): ExplorerSceneSource | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(EXPLORER_SCENE_SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { graphId?: unknown; source?: Partial<ExplorerSceneSource> };
    const source = saved.source;
    if (saved.graphId !== graphId || typeof source?.manifestJson !== "string" ||
        typeof source.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(source.fingerprint) ||
        !isGraph2DFieldLocator(source.locator) ||
        !parseScientificSceneManifest(source.manifestJson).ok) return null;
    return source as ExplorerSceneSource;
  } catch { return null; }
}
const SCIENTIFIC_GRID_LINE_COLORS = ["#2563eb", "#ea580c", "#059669", "#9333ea", "#e11d48", "#0d9488"] as const;
const SCIENTIFIC_FIELD_PRESETS = [
  { id: "sincos", kind: "scalar", title: "Sine–cosine grid", detail: "2D · oscillatory, dimensionless scalar" },
  { id: "thermal", kind: "scalar", title: "Thermal gradient", detail: "2D · temperature over time and distance; mixed axis units" },
  { id: "quadraticPotential", kind: "scalar", title: "Quadratic potential", detail: "2D · u = x² + y²; Laplacian = 4 V/m²" },
  { id: "saddlePotential", kind: "scalar", title: "Saddle potential", detail: "2D · u = x² − y²; Laplacian = 0 V/m²" },
  { id: "gaussianBump", kind: "scalar", title: "Gaussian bump", detail: "2D · localized peak with varying curvature" },
  { id: "quadraticVolume", kind: "scalar", title: "Quadratic potential volume", detail: "3D · u = x² + y² + z²; Laplacian = 6 V/m²" },
  { id: "vortexFlow", kind: "vector", title: "Planar vortex", detail: "2D · east and north velocity components" },
  { id: "vortexVolume", kind: "vector", explorer: true, title: "Swirling flow volume", detail: "3D vector · small Explorer example" },
  { id: "vortex80", kind: "vector", explorer: true, title: "Generated vortex 80³", detail: "3D vector · analytic 80 × 80 × 80 grid for numerical checks" },
  { id: "burgersMeasured", kind: "vector", explorer: true, title: "Measured Burgers vortex", detail: "3D vector · 47 × 85 × 55 laboratory velocity grid · BCO-DMO, CC BY 4.0" },
  { id: "complexWave", kind: "complex", title: "Complex wave packet", detail: "2D · real and imaginary wave components" },
  { id: "complexWaveVolume", kind: "complex", title: "Complex wave volume", detail: "3D · paired real and imaginary plane lines" },
] as const;
type ScientificFieldPresetId = typeof SCIENTIFIC_FIELD_PRESETS[number]["id"];
const SCIENTIFIC_EXPLORER_PRESETS = SCIENTIFIC_FIELD_PRESETS.filter(preset =>
  "explorer" in preset && preset.explorer);

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
  onComplexContourPlace?: (target: import("@math3d/core").ComplexAnalysisDocument) => void;
  onOpenPreset?: (preset: Graph2DPreset) => void;
  onResumeCheckpoint?: (id: string) => void;
  onCopyProject?: (id: string, title: string) => void;
  onExportPersonalProject?: (id: string) => { bytes: string; title: string; externalTableCount: number; missingTableCount: number; resultCount: number };
  onCopyGraphDefinition?: (id: string) => string;
  onPreviewPersonalImport?: (raw: string) => Graph2DPersonalPresetPreview;
  onImportPersonalProject?: (preview: Graph2DPersonalPresetPreview) => void;
  savedVectorField3D?: VectorField3DDocument | null;
  openVectorField3DRequest?: { document: VectorField3DDocument; token: number } | null;
  onSaveVectorField3D?: (document: VectorField3DDocument) => void;
  savedVectorField3DPointResults?: readonly import("@math3d/core").AnalysisResultEnvelope[];
  onSaveVectorField3DPointResult?: (document: VectorField3DDocument,
    result: import("@math3d/core").AnalysisResultEnvelope) => void;
  savedVectorField3DRegionResults?: readonly import("@math3d/core").AnalysisResultEnvelope[];
  vectorField3DRegionStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onSaveVectorField3DRegionResult?: (document: VectorField3DDocument,
    result: import("@math3d/core").AnalysisResultEnvelope) => void;
  onOpenVectorField3DProjectResults?: (resultId: string) => void;
  onPromoteVectorField3DIsosurface?: (document: VectorField3DDocument,
    surface: import("@math3d/core").VectorField3DIsosurface) => void;
  savedVectorField2D?: VectorField2DDocument | null;
  openVectorField2DRequest?: { document: VectorField2DDocument; token: number } | null;
  onSaveVectorField2D?: (document: VectorField2DDocument) => void;
  savedScientificFields?: readonly ScientificFieldDocument[];
  savedScientificScenes?: readonly ScientificSceneLibraryReference[];
  onSaveScientificScene?: (scene: ScientificSceneLibraryReference) => void;
  onRemoveScientificScene?: (scene: ScientificSceneLibraryReference) => void;
  openScientificFieldRequest?: { document: ScientificFieldDocument; token: number } | null;
  onSaveScientificField?: (document: ScientificFieldDocument) => void;
};

/** Desktop/web projection of shared Graph2D source and persistent display state. */
export function GraphsWorkspace({ dockLayout, document, analysisRequest, status = "ready", errorMessage, onViewportCommit,
  onGridModeCommit, onAxesCommit, onProbesCommit, onAuthoringCommit, onConstructionCommit, onConstructionBatchCommit, onSelectionCommit, onUndo, onRedo, promotions = [],
  onPromotionCreate, onPromotionLocate, onPromotionRegenerate, onComplexContourPlace, onOpenPreset, onResumeCheckpoint, onCopyProject,
  onExportPersonalProject, onCopyGraphDefinition, onPreviewPersonalImport, onImportPersonalProject,
  savedVectorField3D, openVectorField3DRequest, onSaveVectorField3D,
  savedVectorField3DPointResults, onSaveVectorField3DPointResult,
  savedVectorField3DRegionResults, vectorField3DRegionStatuses,
  onSaveVectorField3DRegionResult, onOpenVectorField3DProjectResults,
  onPromoteVectorField3DIsosurface,
  savedScientificFields = [], savedScientificScenes = EMPTY_SCIENTIFIC_SCENES,
  onSaveScientificScene, onRemoveScientificScene,
  openScientificFieldRequest, onSaveScientificField,
  savedVectorField2D, openVectorField2DRequest, onSaveVectorField2D }: Props) {
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
  const [derivedLineStatus, setDerivedLineStatus] = useState<{ id: string; message: string } | null>(null);
  const [scientificImport, setScientificImport] = useState<{
    manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator;
    datasets: ({ datasetId: string; component: string; values: number[]; shape?: never } |
      { datasetId: string; component: string; shape: [number, number] | [number, number, number]; values?: never })[] } | null>(null);
  const [explorerScene, setExplorerScene] = useState<ExplorerSceneSource | null>(() =>
    readExplorerSceneSession(document.identity.id));
  const [sceneSourceStatuses, setSceneSourceStatuses] = useState<Record<string,
    "checking" | "current" | "missing" | "changed" | "error">>({});
  const [sceneLibraryChecking, setSceneLibraryChecking] = useState(false);
  const sceneStatusKey = (scene: ScientificSceneLibraryReference) =>
    `${scientificSceneLibraryKey(scene)}:${scene.fingerprint}`;
  useEffect(() => {
    let active = true;
    const bridge = window.scientificScenes;
    if (!savedScientificScenes.length) { setSceneSourceStatuses({}); setSceneLibraryChecking(false); return; }
    setSceneSourceStatuses(Object.fromEntries(savedScientificScenes.map(scene =>
      [sceneStatusKey(scene), "checking"])));
    if (!bridge?.checkGraphDatasetReference) {
      setSceneSourceStatuses(Object.fromEntries(savedScientificScenes.map(scene =>
        [sceneStatusKey(scene), "error"])));
      return;
    }
    setSceneLibraryChecking(true);
    void (async () => {
      for (const scene of savedScientificScenes) {
        let status: "current" | "missing" | "changed" | "error" = "error";
        try {
          const opened = await bridge.checkGraphDatasetReference({ locator: scene.locator,
            sceneFingerprint: scene.fingerprint });
          if (!opened.ok) status = opened.status;
          else {
            const parsed = parseScientificSceneManifest(opened.source.manifestJson);
            status = parsed.ok && parsed.value.sceneId === scene.sceneId ? "current" : "error";
          }
        } catch { status = "error"; }
        if (!active) break;
        setSceneSourceStatuses(current => ({ ...current, [sceneStatusKey(scene)]: status }));
      }
      if (active) setSceneLibraryChecking(false);
    })();
    return () => { active = false; };
  }, [savedScientificScenes, document.identity.id]);
  const [explorerFieldLayer, setExplorerFieldLayer] = useState<ScientificFieldDocument | null>(null);
  const explorerGraphId = useRef(document.identity.id);
  useEffect(() => {
    if (explorerGraphId.current !== document.identity.id) {
      explorerGraphId.current = document.identity.id;
      setExplorerScene(null);
      setExplorerFieldLayer(null);
      setLinkedExplorerProbe(null);
    }
  }, [document.identity.id]);
  useEffect(() => {
    try {
      if (explorerScene) window.sessionStorage.setItem(EXPLORER_SCENE_SESSION_KEY,
        JSON.stringify({ graphId: document.identity.id, source: explorerScene }));
      else window.sessionStorage.removeItem(EXPLORER_SCENE_SESSION_KEY);
    } catch { try { window.sessionStorage.removeItem(EXPLORER_SCENE_SESSION_KEY); }
      catch { /* The current Explorer remains available without session storage. */ } }
  }, [document.identity.id, explorerScene]);
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, "current" | "changed" | "missing" | "error">>({});
  useEffect(() => setFieldStatuses({}), [document.identity.id]);
  const [fieldRelink, setFieldRelink] = useState<{ referenceId: string; source: {
    manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator;
    datasets: { datasetId: string; component: string; shape: [number, number] | [number, number, number] }[] };
    selectedKey: string } | null>(null);
  useEffect(() => setFieldRelink(null), [document.identity.id]);
  const [fieldRelinkError, setFieldRelinkError] = useState("");
  const relinkSaved = document.source.fieldReferences?.find(item => item.id === fieldRelink?.referenceId);
  const relinkSelected = fieldRelink?.source.datasets.find(item => `${item.datasetId}:${item.component}` === fieldRelink.selectedKey);
  const relinkCandidate = useMemo(() => {
    if (!fieldRelink || !relinkSelected) return null;
    try { return createGraph2DFieldReference(fieldRelink.source.manifestJson, fieldRelink.source.fingerprint,
      fieldRelink.source.locator, relinkSelected.datasetId, relinkSelected.component); }
    catch { return null; }
  }, [fieldRelink, relinkSelected]);
  const relinkReview = relinkSaved && relinkCandidate ? reviewGraph2DFieldRelink(relinkSaved, relinkCandidate) : null;
  const [vectorFieldRelink, setVectorFieldRelink] = useState<{ referenceId: string; source: {
    manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator };
    datasetId: string } | null>(null);
  useEffect(() => setVectorFieldRelink(null), [document.identity.id]);
  const [vectorFieldRelinkError, setVectorFieldRelinkError] = useState("");
  const vectorRelinkSaved = document.source.vectorFieldReferences?.find(item => item.id === vectorFieldRelink?.referenceId);
  const vectorRelinkDatasets = useMemo(() => {
    if (!vectorFieldRelink) return [];
    const parsed = parseScientificSceneManifest(vectorFieldRelink.source.manifestJson);
    return parsed.ok ? parsed.value.datasets.filter(item =>
      item.semanticType === "vector-field" && item.shape.length === 2 && item.components?.length === 2) : [];
  }, [vectorFieldRelink]);
  const vectorRelinkCandidate = useMemo(() => {
    if (!vectorFieldRelink || !vectorRelinkDatasets.some(item => item.id === vectorFieldRelink.datasetId)) return null;
    try { return createGraph2DVectorFieldReference(vectorFieldRelink.source.manifestJson,
      vectorFieldRelink.source.fingerprint, vectorFieldRelink.source.locator, vectorFieldRelink.datasetId); }
    catch { return null; }
  }, [vectorFieldRelink, vectorRelinkDatasets]);
  const vectorRelinkReview = vectorRelinkSaved && vectorRelinkCandidate ?
    reviewGraph2DVectorFieldRelink(vectorRelinkSaved, vectorRelinkCandidate) : null;
  const [scientificDatasetId, setScientificDatasetId] = useState("");
  const [scientificVaryingAxis, setScientificVaryingAxis] = useState<0 | 1 | null>(null);
  const [scientificFixedIndex, setScientificFixedIndex] = useState<number | null>(null);
  const [scientificSlicePreview, setScientificSlicePreview] = useState<{ key: string; preview: Graph2DScientificDatasetPreview } | null>(null);
  const [scientificPlane, setScientificPlane] = useState<Graph2DScientificPlane | null>(null);
  const [scientificVectorPlane, setScientificVectorPlane] =
    useState<readonly [Graph2DScientificPlane, Graph2DScientificPlane] | null>(null);
  const [scientificVolume, setScientificVolume] = useState<Graph2DScientificVolume | null>(null);
  const [scientificTransfer, setScientificTransfer] = useState<ScientificFieldTransfer>(DEFAULT_SCIENTIFIC_FIELD_TRANSFER);
  const [scientificNormalAxis, setScientificNormalAxis] = useState<0 | 1 | 2>(2);
  const [scientificPlaneIndex, setScientificPlaneIndex] = useState(0);
  const scientificPreviewEpoch = useRef(0);
  const [scientificImportBusy, setScientificImportBusy] = useState(false);
  const [scientificImportError, setScientificImportError] = useState("");
  const [linkedPairVerification, setLinkedPairVerification] = useState<{
    document: Graph2DDocument | null; states: Record<string, string> }>({ document: null, states: {} });
  const linkedVerificationQueue = useRef<Promise<void>>(Promise.resolve());
  const [scientificPresetOpen, setScientificPresetOpen] = useState(false);
  const [scientificPresetKind, setScientificPresetKind] = useState<"all" | "scalar" | "vector" | "complex" | "explorer">("all");
  const [vectorField3DDocument, setVectorField3DDocument] = useState<VectorField3DDocument | null>(readFieldExplorerSession);
  const [linkedExplorerProbe, setLinkedExplorerProbe] = useState<LinkedExplorerProbe | null>(() => {
    const saved = readFieldExplorerSession() ?? savedVectorField3D;
    return saved?.workspace?.linkedProbe ?? (saved?.workspace?.probe ? {
      point: saved.workspace.probe,
      units: saved.source.axes.map(axis => axis.unit) as [string, string, string] } : null);
  });
  useEffect(() => {
    const saved = savedVectorField3D;
    if (!saved) return;
    setLinkedExplorerProbe(current => current ?? saved.workspace?.linkedProbe ??
      (saved.workspace?.probe ? { point: saved.workspace.probe,
        units: saved.source.axes.map(axis => axis.unit) as [string, string, string] } : null));
  }, [savedVectorField3D?.identity.id]);
  const [vectorField3DOpen, setVectorField3DOpen] = useState(() => readFieldExplorerSession() !== null);
  const [vectorField2DDocument, setVectorField2DDocument] = useState<VectorField2DDocument | null>(null);
  const [vectorField2DOpen, setVectorField2DOpen] = useState(false);
  const [scientificFieldDocument, setScientificFieldDocument] = useState<ScientificFieldDocument | null>(null);
  const [scientificFieldOpen, setScientificFieldOpen] = useState(false);
  useEffect(() => {
    if (!openVectorField2DRequest) return;
    setVectorField2DDocument(openVectorField2DRequest.document);
    setVectorField2DOpen(true);
  }, [openVectorField2DRequest?.token]);
  useEffect(() => {
    if (!openScientificFieldRequest) return;
    setScientificFieldDocument(openScientificFieldRequest.document);
    setScientificFieldOpen(true);
  }, [openScientificFieldRequest?.token]);
  useEffect(() => {
    if (!openVectorField3DRequest) return;
    setVectorField3DDocument(openVectorField3DRequest.document);
    setLinkedExplorerProbe(current => current ?? openVectorField3DRequest.document.workspace?.linkedProbe ?? null);
    setVectorField3DOpen(true);
  }, [openVectorField3DRequest?.token]);
  const scientificImportAvailable = typeof window !== "undefined" && !!window.scientificScenes?.openGraphDataset;
  const scientificSelected = scientificImport?.datasets.find(item => `${item.datasetId}:${item.component}` === scientificDatasetId);
  const scientificManifest = useMemo(() => scientificImport ? parseScientificSceneManifest(scientificImport.manifestJson) : null,
    [scientificImport]);
  const explorerManifest = useMemo(() => explorerScene ?
    parseScientificSceneManifest(explorerScene.manifestJson) : null, [explorerScene]);
  const currentSceneIsSaved = !!explorerScene && savedScientificScenes.some(scene =>
    scene.fingerprint === explorerScene.fingerprint &&
    scene.locator.kind === explorerScene.locator.kind && scene.locator.value === explorerScene.locator.value);
  const explorerLibrary = [...savedScientificExplorerEntries(savedScientificScenes, sceneSourceStatuses),
    ...scientificExplorerLibrary(!currentSceneIsSaved && explorerManifest?.ok ? explorerManifest.value : null,
    [savedVectorField3D].filter((item): item is VectorField3DDocument => !!item),
    savedScientificFields, explorerScene?.fingerprint)];
  const scientificDataset = scientificManifest?.ok ? scientificManifest.value.datasets.find(item => item.id === scientificSelected?.datasetId) : null;
  const scientificCoordinate = scientificManifest?.ok ? scientificManifest.value.coordinates.find(item => item.id === scientificDataset?.coordinateSystem) : null;
  const scientificExplorerDatasets = scientificManifest?.ok ? scientificManifest.value.datasets
    .filter(item => item.shape.length === 3)
    .map(item => ({ dataset: item,
      eligibility: scientificExplorerEligibility(scientificManifest.value, item) })) : [];
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
  const scientificVectorFieldAlreadySaved = !!scientificImport && !!scientificSelected &&
    !!document.source.vectorFieldReferences?.some(item => item.components[0].sceneFingerprint === scientificImport.fingerprint &&
      item.components[0].datasetId === scientificSelected.datasetId);
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
    setScientificPlane(null); setScientificVectorPlane(null); setScientificVolume(null); setScientificVaryingAxis(null);
    setScientificFixedIndex(null); setScientificTransfer(DEFAULT_SCIENTIFIC_FIELD_TRANSFER); setScientificImportError(""); };
  const previewScientificSlice = async () => {
    if (!scientificImport || scientificSelected?.shape?.length !== 2 || scientificVaryingAxis === null || scientificFixedIndex === null ||
        !window.scientificScenes?.previewGraphSlice) return;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificSlicePreview(null);
    setScientificVectorPlane(null);
    try {
      const line = await window.scientificScenes.previewGraphSlice({ fingerprint: scientificImport.fingerprint,
        datasetId: scientificSelected.datasetId, component: scientificSelected.component,
        varyingAxis: scientificVaryingAxis, fixedIndex: scientificFixedIndex });
      const preview = previewGraph2DScientificSlice(scientificImport.manifestJson, scientificImport.fingerprint, line);
      if (scientificPreviewEpoch.current === epoch) setScientificSlicePreview({ key: scientificSliceKey, preview });
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const previewScientificPlane = async (transfer = scientificTransfer) => {
    if (!scientificImport || !scientificSelected?.shape || !window.scientificScenes?.previewGraphPlane) return;
    const selected = scientificSelected, source = scientificImport;
    const normalAxis = selected.shape.length === 3 ? scientificNormalAxis : null;
    const fixedIndex = selected.shape.length === 3 ? scientificPlaneIndex : null;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificPlane(null);
    setScientificVectorPlane(null); setScientificVolume(null);
    try {
      const plane = await window.scientificScenes.previewGraphPlane({ fingerprint: source.fingerprint,
        datasetId: selected.datasetId, component: selected.component, normalAxis, fixedIndex });
      const verified = verifyGraph2DScientificPlane(source.manifestJson, source.fingerprint, plane);
      if (scientificPreviewEpoch.current === epoch) { setScientificTransfer(transfer); setScientificPlane(verified); }
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const previewScientificVectorPlane = async () => {
    if (!scientificImport || !scientificSelected || scientificSelected.shape?.length !== 2 ||
        scientificDataset?.semanticType !== "vector-field" || scientificDataset.components?.length !== 2 ||
        !window.scientificScenes?.previewVectorPlane) return;
    const source = scientificImport, datasetId = scientificSelected.datasetId;
    const components: [string, string] = [scientificDataset.components[0]!.name, scientificDataset.components[1]!.name];
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificPlane(null);
    setScientificVectorPlane(null); setScientificVolume(null);
    try {
      const planes = await window.scientificScenes.previewVectorPlane({ fingerprint: source.fingerprint,
        datasetId, components });
      const verified = verifyGraph2DScientificVectorPlane(source.manifestJson, source.fingerprint, planes);
      if (scientificPreviewEpoch.current === epoch) {
        setScientificVectorPlane(verified);
        const saved = document.source.vectorFieldReferences?.find(item =>
          item.components[0].sceneFingerprint === source.fingerprint && item.components[0].datasetId === datasetId);
        if (saved) setFieldStatuses(current => ({ ...current, [saved.id]: "current" }));
      }
    } catch (error) {
      if (scientificPreviewEpoch.current === epoch) {
        const message = (error as Error).message;
        setScientificImportError(message);
        const saved = document.source.vectorFieldReferences?.find(item =>
          item.components[0].sceneFingerprint === source.fingerprint && item.components[0].datasetId === datasetId);
        if (saved) setFieldStatuses(current => ({ ...current, [saved.id]:
          /ENOENT|not found|does not exist|missing/i.test(message) ? "missing" : "changed" }));
      }
    }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const previewScientificVolume = async (transfer = scientificTransfer) => {
    if (!scientificImport || scientificSelected?.shape?.length !== 3 || !window.scientificScenes?.previewGraphVolume) return;
    const selected = scientificSelected, source = scientificImport;
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificVolume(null);
    setScientificVectorPlane(null); setScientificPlane(null);
    try {
      const volume = await window.scientificScenes.previewGraphVolume({ fingerprint: source.fingerprint,
        datasetId: selected.datasetId, component: selected.component });
      const verified = verifyGraph2DScientificVolume(source.manifestJson, source.fingerprint, volume);
      if (scientificPreviewEpoch.current === epoch) { setScientificTransfer(transfer); setScientificVolume(verified); }
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const openScientificDataset = async (preset?: ScientificFieldPresetId) => {
    if (!window.scientificScenes?.openGraphDataset) return;
    const previousFingerprint = scientificImport?.fingerprint;
    setScientificPresetOpen(false);
    resetScientificSlice();
    setScientificImport(null);
    setScientificImportBusy(true); setScientificImportError("");
    try {
      if (previousFingerprint) await window.scientificScenes.closeGraphDataset(previousFingerprint);
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
      if (!scientificDataset?.quantity) throw new TypeError("Field quantity metadata is unavailable.");
      const threeDimensional = scientificSelected.shape.length === 3;
      const workspace = createScientificFieldDocument({ reference,
        quantity: { name: scientificDataset.quantity.name, unit: scientificDataset.quantity.unit },
        display: { view: threeDimensional && scientificVolume ? "volume" : "plane",
          normalAxis: threeDimensional ? scientificNormalAxis : null,
          fixedIndex: threeDimensional ? scientificPlaneIndex : null, transfer: scientificTransfer } },
      { stableKey: reference.id, title: `${scientificDataset.quantity.name} · ${scientificSelected.component}` });
      onAuthoringCommit({ type: "save-field-reference", reference });
      onSaveScientificField?.(workspace);
      setScientificFieldDocument(workspace);
      setFieldStatuses(current => ({ ...current, [reference.id]: "current" }));
      setScientificImportError("");
    } catch (error) { setScientificImportError((error as Error).message); }
  };
  const saveScientificComplexField = (line: ScientificComplexVolumeLineSelection) => {
    if (!scientificImport || !scientificDataset || !onSaveScientificField ||
        scientificDataset.semanticType !== "complex-scalar-field" || scientificDataset.shape.length !== 3)
      throw new TypeError("A verified 3D complex field is required.");
    const real = createGraph2DFieldReference(scientificImport.manifestJson, scientificImport.fingerprint,
      scientificImport.locator, scientificDataset.id, "real");
    const imaginary = createGraph2DFieldReference(scientificImport.manifestJson, scientificImport.fingerprint,
      scientificImport.locator, scientificDataset.id, "imaginary");
    const source = { reference: real, paired: { imaginary, line },
      quantity: { name: scientificDataset.quantity.name, unit: scientificDataset.quantity.unit },
      display: { view: "plane" as const, normalAxis: line.normalAxis,
        fixedIndex: line.planeFixedIndex, transfer: { mode: "data" as const } } };
    const saved = savedScientificFields.find(item => item.source.reference.id === real.id && item.source.paired);
    const workspace = saved ? reviseScientificFieldDocument(saved, source) :
      createScientificFieldDocument(source, { stableKey: real.id,
        title: scientificDataset.quantity.name + " · 3D complex field" });
    if (saved) invalidateVerifiedScientificFieldResults(saved.identity.id);
    onSaveScientificField(workspace);
    setScientificFieldDocument(workspace);
    setFieldStatuses(current => ({ ...current, [real.id]: "current" }));
  };
  const saveScientificVectorFieldReference = async () => {
    if (!scientificImport || !scientificSelected || !scientificVectorPlane || !onAuthoringCommit ||
        !window.scientificScenes?.previewVectorPlane || scientificImportBusy ||
        scientificVectorPlane[0].datasetId !== scientificSelected.datasetId) return;
    const source = scientificImport, datasetId = scientificSelected.datasetId;
    const components: [string, string] = [scientificVectorPlane[0].component, scientificVectorPlane[1].component];
    const epoch = ++scientificPreviewEpoch.current;
    setScientificImportBusy(true); setScientificImportError(""); setScientificVectorPlane(null);
    try {
      const planes = await window.scientificScenes.previewVectorPlane({ fingerprint: source.fingerprint,
        datasetId, components });
      const verified = verifyGraph2DScientificVectorPlane(source.manifestJson, source.fingerprint, planes);
      if (scientificPreviewEpoch.current !== epoch) return;
      const reference = createGraph2DVectorFieldReference(source.manifestJson, source.fingerprint,
        source.locator, datasetId);
      const quantity = scientificDataset?.quantity;
      if (!quantity) throw new TypeError("Vector quantity metadata is unavailable.");
      const workspace = createVectorField2DDocument({ reference,
        quantity: { name: quantity.name, unit: quantity.unit },
        display: { density: [17, 17], maxGlyphs: 512, magnitudeScale: 1 } },
      { stableKey: reference.id, title: quantity.name + " · 2D vector field" });
      onAuthoringCommit({ type: "save-vector-field-reference", reference });
      onSaveVectorField2D?.(workspace);
      setVectorField2DDocument(workspace);
      setScientificVectorPlane(verified);
      setFieldStatuses(current => ({ ...current, [reference.id]: "current" }));
    } catch (error) { if (scientificPreviewEpoch.current === epoch) setScientificImportError((error as Error).message); }
    finally { if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false); }
  };
  const openSavedVectorField2DWorkspace = async (reference: Graph2DVectorFieldReference) => {
    if (scientificImportBusy) return;
    if (savedVectorField2D?.source.reference.id === reference.id &&
        savedVectorField2D.source.reference.components[0]?.sceneFingerprint === reference.components[0]?.sceneFingerprint) {
      setVectorField2DDocument(savedVectorField2D); setVectorField2DOpen(true); return;
    }
    if (!window.scientificScenes?.openGraphDatasetReference) return;
    setScientificImportBusy(true); setScientificImportError("");
    let fingerprint: string | null = null;
    try {
      const first = reference.components[0]!;
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: first.locator, sceneFingerprint: first.sceneFingerprint });
      if (!opened.ok) throw new Error("Saved source " + opened.status + ": " + opened.error);
      fingerprint = opened.source.fingerprint;
      if (inspectGraph2DVectorFieldReference(reference, opened.source.manifestJson) !== "current")
        throw new Error("Saved vector components, axes, shape or checksums changed.");
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      if (!parsed.ok) throw new Error(parsed.errors.join(" "));
      const quantity = parsed.value.datasets.find(item => item.id === first.datasetId)?.quantity;
      if (!quantity) throw new TypeError("Saved vector quantity metadata is unavailable.");
      const workspace = createVectorField2DDocument({ reference,
        quantity: { name: quantity.name, unit: quantity.unit },
        display: { density: [17, 17], maxGlyphs: 512, magnitudeScale: 1 } },
      { stableKey: reference.id, title: quantity.name + " · 2D vector field" });
      onSaveVectorField2D?.(workspace);
      setVectorField2DDocument(workspace); setVectorField2DOpen(true);
    } catch (error) { setScientificImportError((error as Error).message); }
    finally { if (fingerprint) await window.scientificScenes.closeGraphDataset(fingerprint);
      setScientificImportBusy(false); }
  };
  const openExplorerSceneDataset = async (datasetId: string,
    sourceOverride?: ExplorerSceneSource) => {
    const source = sourceOverride ?? scientificImport ?? explorerScene;
    if (!source || scientificImportBusy) return;
    setScientificImportBusy(true); setScientificImportError("");
    try {
      const parsed = parseScientificSceneManifest(source.manifestJson);
      if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
      if (scientificImport) onSaveScientificScene?.(scientificSceneReferenceFromManifest(parsed.value,
        source.fingerprint, source.locator));
      const dataset = parsed.value.datasets.find(item => item.id === datasetId);
      if (!dataset || dataset.shape.length !== 3)
        throw new TypeError("The selected 3D dataset is unavailable.");
      const coordinate = parsed.value.coordinates.find(item => item.id === dataset.coordinateSystem);
      if (!coordinate || coordinate.kind !== "cartesian" || coordinate.axes.length !== 3 ||
          dataset.shape.some(size => size < 2))
        throw new TypeError("The selected field requires a regular 3D Cartesian grid.");
      setExplorerScene({ manifestJson: source.manifestJson, fingerprint: source.fingerprint,
        locator: source.locator });
      if (dataset.semanticType !== "vector-field") {
        const reference = createGraph2DFieldReference(source.manifestJson, source.fingerprint,
          source.locator, dataset.id, dataset.semanticType === "complex-scalar-field" ? "real" : "scalar");
        const paired = dataset.semanticType === "complex-scalar-field" ? {
          imaginary: createGraph2DFieldReference(source.manifestJson, source.fingerprint,
            source.locator, dataset.id, "imaginary"),
          line: { normalAxis: 2 as const, planeFixedIndex: Math.floor(dataset.shape[2]! / 2),
            varyingAxis: 0 as const, fixedIndex: Math.floor(dataset.shape[1]! / 2) } } : undefined;
        const field = createScientificFieldDocument({ reference, ...(paired ? { paired } : {}),
          quantity: { name: dataset.quantity.name, unit: dataset.quantity.unit },
          display: { view: paired ? "plane" : "volume", normalAxis: 2,
            fixedIndex: Math.floor(dataset.shape[2]! / 2), transfer: { mode: "data" } } },
        { stableKey: reference.id, title: `${dataset.quantity.name} · ${paired ? "3D complex field" : "scalar"}` });
        if (scientificImport) await window.scientificScenes?.closeGraphDataset(source.fingerprint);
        setScientificImport(null); setExplorerFieldLayer(field); setVectorField3DOpen(true);
        return;
      }
      const eligibility = scientificExplorerEligibility(parsed.value, dataset);
      if (!eligibility.ready || !eligibility.timeUnit) throw new TypeError(eligibility.reason);
      const refs = dataset.components!.map(part => createGraph2DFieldReference(
        source.manifestJson, source.fingerprint, source.locator,
        dataset.id, part.name)) as [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
      const axes = coordinate.axes.map((axis, index) => ({ role: (["x", "y", "z"] as const)[index]!,
        label: axis.name, unit: axis.unit, min: coordinate.origin[index]!,
        max: coordinate.origin[index]! + coordinate.spacing[index]! *
          (dataset.shape[index]! - 1) })) as unknown as VectorField3DSource["axes"];
      const vectorSource: VectorField3DSource = { axes, timeUnit: eligibility.timeUnit, field: { kind: "scientific-bundle",
        componentUnits: [dataset.quantity.unit, dataset.quantity.unit,
          dataset.quantity.unit], references: refs }, seeds: [],
        display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
        solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 10000, maxTime: 20 } };
      const next = createVectorField3DDocument(vectorSource, { stableKey: `${source.fingerprint}:${dataset.id}`,
        title: `${parsed.value.title} · ${dataset.quantity.name}` });
      if (scientificImport) await window.scientificScenes?.closeGraphDataset(source.fingerprint);
      setVectorField3DDocument(next); setExplorerFieldLayer(null);
      setVectorField3DOpen(true); setScientificImport(null);
    } catch (error) { setScientificImportError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const openScientificVectorField3D = () => scientificDataset &&
    openExplorerSceneDataset(scientificDataset.id);
  const browseExplorerScene = async (example?: BuiltinExplorerSceneId) => {
    const bridge = window.scientificScenes;
    if (!bridge?.openGraphDataset || !bridge.openGraphDatasetPreset || scientificImportBusy) return;
    setScientificImportBusy(true); setScientificImportError("");
    let fingerprint: string | null = null;
    let selected: { source: ExplorerSceneSource; datasetId: string } | null = null;
    try {
      const opened = example ? await bridge.openGraphDatasetPreset(example) :
        await bridge.openGraphDataset();
      if (!opened.ok) { if (!opened.canceled) setScientificImportError(opened.error); return; }
      fingerprint = opened.source.fingerprint;
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
      const source = { manifestJson: opened.source.manifestJson,
        fingerprint: opened.source.fingerprint, locator: opened.source.locator };
      onSaveScientificScene?.(scientificSceneReferenceFromManifest(parsed.value,
        source.fingerprint, source.locator));
      setExplorerScene(source);
      if (example) {
        const dataset = parsed.value.datasets.find(item => item.shape.length === 3);
        if (!dataset) throw new TypeError("This example has no 3D field for Explorer.");
        selected = { source, datasetId: dataset.id };
      }
    } catch (error) { setScientificImportError((error as Error).message); }
    finally {
      if (fingerprint) try { await bridge.closeGraphDataset(fingerprint); }
        catch (error) { setScientificImportError((error as Error).message); }
      setScientificImportBusy(false);
    }
    if (selected) await openExplorerSceneDataset(selected.datasetId, selected.source);
  };
  const recheckExplorerLibraryScene = async (entry: ExplorerLibraryEntry, openDataset = false) => {
    const scene = savedScientificScenes.find(item => scientificSceneLibraryKey(item) === entry.sceneKey);
    const bridge = window.scientificScenes;
    if (!scene || !bridge?.checkGraphDatasetReference || scientificImportBusy) return;
    const key = sceneStatusKey(scene);
    setSceneSourceStatuses(current => ({ ...current, [key]: "checking" }));
    setScientificImportError("");
    let source: ExplorerSceneSource | null = null;
    try {
      const opened = await bridge.checkGraphDatasetReference({ locator: scene.locator,
        sceneFingerprint: scene.fingerprint });
      if (!opened.ok) {
        setSceneSourceStatuses(current => ({ ...current, [key]: opened.status }));
        return;
      }
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      const status = parsed.ok && parsed.value.sceneId === scene.sceneId ? "current" : "error";
      setSceneSourceStatuses(current => ({ ...current, [key]: status }));
      if (status === "current") source = { manifestJson: opened.source.manifestJson,
        fingerprint: opened.source.fingerprint, locator: opened.source.locator };
    } catch (error) {
      setSceneSourceStatuses(current => ({ ...current, [key]: "error" }));
      setScientificImportError((error as Error).message);
    }
    if (source && openDataset) await openExplorerSceneDataset(entry.datasetId, source);
  };
  const openExplorerLibraryEntry = (entry: ExplorerLibraryEntry) => {
    if (!entry.ready) return;
    setScientificImportError("");
    if (entry.sceneKey) { void recheckExplorerLibraryScene(entry, true); return; }
    if (entry.origin === "scene") { void openExplorerSceneDataset(entry.datasetId); return; }
    if (entry.kind === "vector") {
      const vector = [vectorField3DDocument, savedVectorField3D].find(item =>
        item?.identity.id === entry.documentId);
      if (vector) { setVectorField3DDocument(vector); setExplorerFieldLayer(null);
        setLinkedExplorerProbe(current => current ?? vector.workspace?.linkedProbe ?? null);
        setVectorField3DOpen(true); }
      return;
    }
    const field = savedScientificFields.find(item => item.identity.id === entry.documentId);
    if (field) setExplorerFieldLayer(field);
  };
  const openSavedFieldReference = async (reference: Graph2DFieldReference) => {
    if (!window.scientificScenes?.openGraphDatasetReference || scientificImportBusy) return;
    const savedScientificField = savedScientificFields.find(item => item.source.reference.id === reference.id &&
      item.source.reference.sceneFingerprint === reference.sceneFingerprint && !item.source.derivation);
    if (savedScientificField) {
      resetScientificSlice(); setScientificImport(null);
      setScientificFieldDocument(savedScientificField); setScientificFieldOpen(true); return;
    }
    setScientificImportBusy(true); setScientificImportError("");
    resetScientificSlice();
    setScientificImport(null);
    let fingerprint: string | null = null;
    try {
      const opened = await window.scientificScenes.openGraphDatasetReference({ locator: reference.locator,
        sceneFingerprint: reference.sceneFingerprint });
      if (!opened.ok) { setFieldStatuses(current => ({ ...current, [reference.id]: opened.status })); return; }
      fingerprint = opened.source.fingerprint;
      const status = inspectGraph2DFieldReference(reference, opened.source.manifestJson);
      setFieldStatuses(current => ({ ...current, [reference.id]: status }));
      if (status !== "current") return;
      const parsed = parseScientificSceneManifest(opened.source.manifestJson);
      if (!parsed.ok) throw new TypeError(parsed.errors.join(" "));
      const quantity = parsed.value.datasets.find(item => item.id === reference.datasetId)?.quantity;
      if (!quantity) throw new TypeError("Saved field quantity metadata is unavailable.");
      const threeDimensional = reference.shape.length === 3;
      const axis = threeDimensional ? 2 : null;
      const workspace = createScientificFieldDocument({ reference,
        quantity: { name: quantity.name, unit: quantity.unit },
        display: { view: "plane", normalAxis: axis,
          fixedIndex: axis === null ? null : Math.floor(reference.shape[axis]! / 2),
          transfer: DEFAULT_SCIENTIFIC_FIELD_TRANSFER } },
      { stableKey: reference.id, title: `${quantity.name} · ${reference.component}` });
      onSaveScientificField?.(workspace);
      setScientificFieldDocument(workspace); setScientificFieldOpen(true);
    } catch (error) { setFieldStatuses(current => ({ ...current, [reference.id]: "error" }));
      setScientificImportError((error as Error).message); }
    finally { if (fingerprint) await window.scientificScenes.closeGraphDataset(fingerprint);
      setScientificImportBusy(false); }
  };
  const openSavedVectorFieldReference = async (reference: Graph2DVectorFieldReference) => {
    if (!window.scientificScenes?.openGraphDatasetReference || !window.scientificScenes.previewVectorPlane ||
        scientificImportBusy) return;
    resetScientificSlice(); setScientificImport(null); setScientificImportBusy(true);
    const epoch = scientificPreviewEpoch.current;
    const saved = reference.components[0]!;
    let activeFingerprint: string | null = null;
    try {
      const opened = await window.scientificScenes.openGraphDatasetReference({ locator: saved.locator,
        sceneFingerprint: saved.sceneFingerprint });
      if (opened.ok) activeFingerprint = opened.source.fingerprint;
      if (scientificPreviewEpoch.current !== epoch) return;
      if (!opened.ok) {
        setFieldStatuses(current => ({ ...current, [reference.id]: opened.status }));
        return;
      }
      if (inspectGraph2DVectorFieldReference(reference, opened.source.manifestJson) !== "current")
        throw new Error("Saved vector components, axes, shape or checksums changed.");
      const datasetId = saved.datasetId;
      const components: [string, string] = [reference.components[0]!.component, reference.components[1]!.component];
      const planes = await window.scientificScenes.previewVectorPlane({ fingerprint: opened.source.fingerprint,
        datasetId, components });
      const verified = verifyGraph2DScientificVectorPlane(opened.source.manifestJson, opened.source.fingerprint, planes);
      if (scientificPreviewEpoch.current !== epoch) return;
      const selected = opened.source.datasets.find(item => item.datasetId === datasetId &&
        item.component === components[0]);
      if (!selected) throw new Error("Saved vector components are absent from the verified source.");
      setScientificImport(opened.source);
      setScientificDatasetId(datasetId + ":" + components[0]);
      selectDefaultScientificSlice(selected.shape);
      setScientificVectorPlane(verified);
      setFieldStatuses(current => ({ ...current, [reference.id]: "current" }));
      activeFingerprint = null;
    } catch (error) {
      if (scientificPreviewEpoch.current === epoch) {
        const message = (error as Error).message;
        setFieldStatuses(current => ({ ...current, [reference.id]:
          /ENOENT|not found|does not exist|missing/i.test(message) ? "missing" : "changed" }));
        setScientificImportError(message);
      }
    } finally {
      if (activeFingerprint) void window.scientificScenes.closeGraphDataset(activeFingerprint);
      if (scientificPreviewEpoch.current === epoch) setScientificImportBusy(false);
    }
  };
  const chooseFieldRelink = async (reference: Graph2DFieldReference) => {
    if (!window.scientificScenes?.chooseGraphDatasetRelink || scientificImportBusy) return;
    setVectorFieldRelink(null);
    setScientificImportBusy(true); setFieldRelinkError("");
    try {
      const picked = await window.scientificScenes.chooseGraphDatasetRelink();
      if (!picked.ok) { if (!picked.canceled) setFieldRelinkError(picked.error); return; }
      const preferred = picked.source.datasets.find(item => item.datasetId === reference.datasetId &&
        item.component === reference.component) ?? picked.source.datasets[0]!;
      setFieldRelink({ referenceId: reference.id, source: picked.source,
        selectedKey: `${preferred.datasetId}:${preferred.component}` });
    } catch (error) { setFieldRelinkError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const acceptFieldRelink = async () => {
    if (!fieldRelink || !relinkSaved || !relinkSelected || !relinkReview?.eligible ||
        !onAuthoringCommit || !window.scientificScenes?.openGraphDatasetReference || scientificImportBusy) return;
    setScientificImportBusy(true); setFieldRelinkError("");
    try {
      // A fresh bundle read closes the time-of-check/time-of-use gap after the comparison was displayed.
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: fieldRelink.source.locator, sceneFingerprint: fieldRelink.source.fingerprint });
      if (!opened.ok) throw new Error(`Replacement ${opened.status}: ${opened.error}`);
      try {
        const replacement = createGraph2DFieldReference(opened.source.manifestJson, opened.source.fingerprint,
          opened.source.locator, relinkSelected.datasetId, relinkSelected.component);
        if (!reviewGraph2DFieldRelink(relinkSaved, replacement).eligible)
          throw new Error("Replacement component, axes, shape or checksum changed during verification.");
        const parsed = parseScientificSceneManifest(opened.source.manifestJson);
        if (!parsed.ok) throw new Error(parsed.errors.join(" "));
        const quantity = parsed.value.datasets.find(item => item.id === replacement.datasetId)?.quantity;
        if (!quantity) throw new Error("Replacement field quantity metadata is unavailable.");
        const savedWorkspace = savedScientificFields.find(item => item.source.reference.id === relinkSaved.id &&
          !item.source.derivation);
        const revisedWorkspace = savedWorkspace ? reviseScientificFieldDocument(savedWorkspace, {
          ...savedWorkspace.source, reference: { ...replacement, id: relinkSaved.id },
          quantity: { name: quantity.name, unit: quantity.unit } }) : null;
        onAuthoringCommit({ type: "relink-field-reference", referenceId: relinkSaved.id, replacement });
        if (revisedWorkspace) { invalidateVerifiedScientificFieldResults(revisedWorkspace.identity.id);
          onSaveScientificField?.(revisedWorkspace);
          setScientificFieldDocument(revisedWorkspace); setScientificFieldOpen(false); }
        setFieldStatuses(current => ({ ...current, [relinkSaved.id]: "current" }));
        setFieldRelink(null);
      } finally { await window.scientificScenes.closeGraphDataset(opened.source.fingerprint); }
    } catch (error) { setFieldRelinkError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const chooseVectorFieldRelink = async (reference: Graph2DVectorFieldReference) => {
    if (!window.scientificScenes?.chooseGraphDatasetRelink || scientificImportBusy) return;
    setFieldRelink(null); setVectorFieldRelinkError(""); setScientificImportBusy(true);
    try {
      const picked = await window.scientificScenes.chooseGraphDatasetRelink();
      if (!picked.ok) { if (!picked.canceled) setVectorFieldRelinkError(picked.error); return; }
      const parsed = parseScientificSceneManifest(picked.source.manifestJson);
      const candidates = parsed.ok ? parsed.value.datasets.filter(item =>
        item.semanticType === "vector-field" && item.shape.length === 2 && item.components?.length === 2) : [];
      if (!candidates.length) throw new TypeError("Replacement has no complete two-component 2D vector field.");
      const preferred = candidates.find(item => item.id === reference.components[0]!.datasetId) ?? candidates[0]!;
      setVectorFieldRelink({ referenceId: reference.id, source: picked.source, datasetId: preferred.id });
    } catch (error) { setVectorFieldRelinkError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const acceptVectorFieldRelink = async () => {
    if (!vectorFieldRelink || !vectorRelinkSaved || !vectorRelinkReview?.eligible || !onAuthoringCommit ||
        !window.scientificScenes?.openGraphDatasetReference || !window.scientificScenes.previewVectorPlane ||
        scientificImportBusy) return;
    setScientificImportBusy(true); setVectorFieldRelinkError("");
    try {
      const opened = await window.scientificScenes.openGraphDatasetReference({
        locator: vectorFieldRelink.source.locator, sceneFingerprint: vectorFieldRelink.source.fingerprint });
      if (!opened.ok) throw new Error(`Replacement ${opened.status}: ${opened.error}`);
      try {
        const replacement = createGraph2DVectorFieldReference(opened.source.manifestJson, opened.source.fingerprint,
          opened.source.locator, vectorFieldRelink.datasetId);
        if (!reviewGraph2DVectorFieldRelink(vectorRelinkSaved, replacement).eligible)
          throw new Error("Replacement vector components, axes, shape or checksums changed during verification.");
        const components: [string, string] = [replacement.components[0]!.component, replacement.components[1]!.component];
        const planes = await window.scientificScenes.previewVectorPlane({ fingerprint: opened.source.fingerprint,
          datasetId: vectorFieldRelink.datasetId, components });
        verifyGraph2DScientificVectorPlane(opened.source.manifestJson, opened.source.fingerprint, planes);
        const parsed = parseScientificSceneManifest(opened.source.manifestJson);
        if (!parsed.ok) throw new Error(parsed.errors.join(" "));
        const quantity = parsed.value.datasets.find(item => item.id === vectorFieldRelink.datasetId)?.quantity;
        if (!quantity) throw new Error("Replacement vector quantity metadata is unavailable.");
        const revisedWorkspace = savedVectorField2D?.source.reference.id === vectorRelinkSaved.id ?
          reviseVectorField2DDocument(savedVectorField2D, { ...savedVectorField2D.source, reference: {
            ...replacement, id: vectorRelinkSaved.id }, quantity: { name: quantity.name, unit: quantity.unit } }) : null;
        onAuthoringCommit({ type: "relink-vector-field-reference", referenceId: vectorRelinkSaved.id, replacement });
        if (revisedWorkspace) { onSaveVectorField2D?.(revisedWorkspace);
          setVectorField2DDocument(revisedWorkspace); setVectorField2DOpen(false); }
        resetScientificSlice(); setScientificImport(null);
        setFieldStatuses(current => ({ ...current, [vectorRelinkSaved.id]: "current" }));
        setVectorFieldRelink(null);
      } finally { await window.scientificScenes.closeGraphDataset(opened.source.fingerprint); }
    } catch (error) { setVectorFieldRelinkError((error as Error).message); }
    finally { setScientificImportBusy(false); }
  };
  const commitScientificDataset = () => {
    if (!scientificPreview || !scientificImport || !onAuthoringCommit || scientificLineAlreadyImported) return;
    try {
      const table = pointTableStore.publish(scientificPreview.rows);
      onAuthoringCommit({ type: "create-point-series", draft: { label: scientificPreview.label,
        table, mode: "line", domain: scientificPreview.domain,
        origin: { ...scientificPreview.origin, locator: scientificImport.locator },
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
  const [criticalAnalysisBudget, setCriticalAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [intersectionAnalysisBudget, setIntersectionAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [areaAnalysisBudget, setAreaAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [arcAnalysisBudget, setArcAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [polarAreaAnalysisBudget, setPolarAreaAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [polarArcAnalysisBudget, setPolarArcAnalysisBudget] = useState<Graph2DAnalysisBudget>(12000);
  const [phaseAnalysisBudget, setPhaseAnalysisBudget] = useState<Graph2DAnalysisBudget>(6000);
  const [vectorFieldAnalysisBudget, setVectorFieldAnalysisBudget] = useState<Graph2DAnalysisBudget>(2000);
  const [focusedInterval, setFocusedInterval] = useState<{ resultId: string; intervalId: string } | null>(null);
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
  const [focusedNumericalPoint, setFocusedNumericalPoint] = useState<
    { origin: "regression"; resultId: string; point: { objectId: string; x: number; y: number } } |
    { origin: "phase"; artifact: Graph2DPhasePortraitArtifact; point: { objectId: string; x: number; y: number } } | null>(null);
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
  useEffect(() => {
    let active = true;
    const linked = document.source.objects.filter((object): object is Graph2DPointSeriesObject =>
      object.kind === "point-series" && !!object.linkedOrigin);
    const pairIds = [...new Set(linked.map(object => object.linkedOrigin!.pairId))];
    setLinkedPairVerification({ document,
      states: Object.fromEntries(pairIds.map(id => [id, "Verifying both saved sources…"])) });
    const verifyPairs = async () => { for (const id of pairIds) {
      if (!active) break;
      try {
        const pair = linked.filter(object => object.linkedOrigin?.pairId === id);
        const vector = pair.find(object => object.linkedOrigin?.series === "vector");
        const scalar = pair.find(object => object.linkedOrigin?.series === "scalar" ||
          object.linkedOrigin?.series === "complex");
        if (pair.length !== 2 || !vector || !scalar || !vector.linkedOrigin || !scalar.linkedOrigin ||
            vector.linkedOrigin.kind !== scalar.linkedOrigin.kind ||
            canonicalJsonStringify({ ...vector.linkedOrigin, series: "vector", yUnit: "", rowsSha256: "" }) !==
              canonicalJsonStringify({ ...scalar.linkedOrigin, series: "vector", yUnit: "", rowsSha256: "" }))
          throw new TypeError("Saved linked Graphs pair is incomplete or misaligned.");
        const vectorRows = pointTableStore.resolve(vector.table);
        const scalarRows = pointTableStore.resolve(scalar.table);
        if (!vectorRows || !scalarRows ||
            structuralHash(vectorRows) !== vector.linkedOrigin.rowsSha256 ||
            structuralHash(scalarRows) !== scalar.linkedOrigin.rowsSha256 ||
            vectorRows.length !== scalarRows.length ||
            vectorRows.some((row, index) => row.x !== scalarRows[index]?.x))
          throw new TypeError("Saved linked Graphs tables changed or lost alignment.");
        if (vector.linkedOrigin.kind === "vector-scalar-linked-region/v1" ||
            vector.linkedOrigin.kind === "vector-complex-linked-region/v1")
          await reverifyLinkedOverlayRegionGraphPair(vector.linkedOrigin,
            scalar.linkedOrigin as Graph2DLinkedRegionOrigin);
        else await reverifyLinkedOverlayGraphPair(vector.linkedOrigin as Graph2DLinkedLineOrigin,
          scalar.linkedOrigin as Graph2DLinkedLineOrigin);
        if (active) setLinkedPairVerification(previous => previous.document === document ?
          { ...previous, states: { ...previous.states, [id]: "Verified both sources." } } : previous);
      } catch (cause) { if (active) setLinkedPairVerification(previous => previous.document === document ?
        { ...previous, states: { ...previous.states, [id]: cause instanceof Error ? cause.message : String(cause) } } : previous); }
    } };
    linkedVerificationQueue.current = linkedVerificationQueue.current.then(verifyPairs, verifyPairs);
    return () => { active = false; };
  }, [document]);
  const samplingRequest = useMemo(() => ({ document: sampledDocument, viewport, width: size.width, height: size.height,
    interaction: previewViewport !== null || phaseSeedPreview !== null,
    separatePhaseAnalysis: true,
    pointTables: Object.fromEntries(document.source.objects.flatMap((object) =>
      object.kind === "point-series" ? [[object.table.id,
        object.linkedOrigin && (linkedPairVerification.document !== document ||
          linkedPairVerification.states[object.linkedOrigin.pairId] !== "Verified both sources.") ?
          null : pointTableStore.resolve(object.table)]] : [])),
  }), [sampledDocument, size, viewport, previewViewport, phaseSeedPreview, linkedPairVerification]);
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
  const selectedLinkedVectorField = selectedObject?.kind === "point-series" && selectedObject.linkedOrigin ?
    parseVectorField3DDocument(selectedObject.linkedOrigin.vectorDocumentJson).source.field : null;
  const selectedLinkedReady = selectedObject?.kind !== "point-series" || !selectedObject.linkedOrigin ||
    linkedPairVerification.document === document &&
    linkedPairVerification.states[selectedObject.linkedOrigin.pairId] === "Verified both sources.";
  const selectedFieldOrigin = selectedObject?.kind === "point-series" ? selectedObject.origin : undefined;
  const selectedSavedField = savedScientificFields.find(item =>
    item.identity.id === selectedFieldOrigin?.fieldDocument?.id);
  const selectedFieldVerification = selectedSavedField ?
    fieldStatuses[selectedSavedField.source.reference.id] : undefined;
  const phaseObject = sampledDocument.source.objects.find((item) => item.id === document.selection.objectId);
  const phaseVisible = sampledDocument.display.objects.some(style =>
    style.objectId === phaseObject?.id && style.visible);
  const phaseRequest = useMemo(() => phaseVisible && phaseObject?.kind === "phase-portrait" ? {
    object: phaseObject,
    variables: Object.fromEntries(sampledDocument.source.variables.map(entry => [entry.name, entry.value])),
    viewport, width: size.width, height: size.height, maxEvaluations: phaseAnalysisBudget,
  } : null, [phaseVisible, phaseObject, sampledDocument.source.variables, viewport, size, phaseAnalysisBudget]);
  const phaseAnalysis = useGraph2DPhaseAnalysis(phaseRequest);
  const vectorFieldRequest = useMemo(() => phaseRequest ? {
    object: { id: phaseRequest.object.id,
      xDerivative: phaseRequest.object.xDerivative, yDerivative: phaseRequest.object.yDerivative,
      domain: phaseRequest.object.domain, yDomain: phaseRequest.object.yDomain },
    variables: phaseRequest.variables, viewport,
    maxEvaluations: vectorFieldAnalysisBudget,
  } : null, [phaseRequest, viewport, vectorFieldAnalysisBudget]);
  const vectorFieldAnalysis = useGraph2DVectorFieldAnalysis(vectorFieldRequest);
  const phaseArtifact = useMemo<Graph2DPhasePortraitArtifact | null>(() => selectedSeries?.artifact &&
    "kind" in selectedSeries.artifact && selectedSeries.artifact.kind === "phase-portrait" ?
    (sampling.ready && phaseAnalysis.result ? { ...selectedSeries.artifact, ...phaseAnalysis.result } :
      selectedSeries.artifact) as Graph2DPhasePortraitArtifact : null,
  [selectedSeries?.artifact, sampling.ready, phaseAnalysis.result]);
  const phaseSeries = useMemo(() => phaseArtifact ? series.map(item =>
    item.objectId === document.selection.objectId ? { ...item, artifact: phaseArtifact } : item) : series,
  [series, phaseArtifact, document.selection.objectId]);
  const activePolarDraft = selectedObject?.kind === "polar" && polarDraft.objectId !== selectedObject.id ?
    { objectId: selectedObject.id, min: String(selectedObject.domain.min), max: String(selectedObject.domain.max) } : polarDraft;
  const polarMin = activePolarDraft.min.trim() ? Number(activePolarDraft.min) : NaN;
  const polarMax = activePolarDraft.max.trim() ? Number(activePolarDraft.max) : NaN;
  const polarValid = selectedObject?.kind === "polar" && Number.isFinite(polarMin) && Number.isFinite(polarMax) &&
    polarMin < polarMax && polarMin >= selectedObject.domain.min && polarMax <= selectedObject.domain.max;
  const areaUnavailable = graph2DIntervalAnalysisUnavailable(document, document.selection.objectId, "area");
  const arcUnavailable = graph2DIntervalAnalysisUnavailable(document, document.selection.objectId, "arc-length");
  const toolRowsAvailable = selectedLinkedReady &&
    (selectedObject?.kind !== "point-series" || !!pointTableStore.resolve(selectedObject.table));
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
  const currentRegression = selectedLinkedReady && regression && regression.model === regressionModel && regression.objectId === selectedObject?.id &&
    isGraph2DRegressionCurrent(regression, document) ? regression : null;
  const focusedNumericalProbe = focusedNumericalPoint?.origin === "regression" &&
    focusedNumericalPoint.resultId === currentRegression?.publication.resultId ? focusedNumericalPoint.point :
    focusedNumericalPoint?.origin === "phase" && focusedNumericalPoint.artifact === phaseArtifact &&
      selectedObject?.id === focusedNumericalPoint.point.objectId && !phaseSeedPreview && !parameterPreviewActive ?
      focusedNumericalPoint.point : null;
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
      interval: { min: areaRequest.min, max: areaRequest.max }, mode: areaRequest.mode,
      maxEvaluations: areaAnalysisBudget }) : null,
  [document, areaRequest, areaUnavailable, areaAnalysisBudget]);
  const arcLength = useMemo(() => !arcUnavailable && arcRequest && arcRequest.objectId === document.selection.objectId ?
    analyzeGraph2DArcLength({ document, objectId: arcRequest.objectId,
      interval: { min: arcRequest.min, max: arcRequest.max }, maxEvaluations: arcAnalysisBudget }) : null,
  [document, arcRequest, arcUnavailable, arcAnalysisBudget]);
  const polarArea = useMemo(() => selectedObject?.kind === "polar" && polarAreaRequest?.objectId === selectedObject.id &&
    polarAreaRequest.min >= selectedObject.domain.min && polarAreaRequest.max <= selectedObject.domain.max ?
    analyzeGraph2DPolarMeasurement({ document, objectId: selectedObject.id, kind: "swept-area",
      interval: { min: polarAreaRequest.min, max: polarAreaRequest.max },
      maxEvaluations: polarAreaAnalysisBudget }) : null,
  [document, selectedObject, polarAreaRequest, polarAreaAnalysisBudget]);
  const polarArcLength = useMemo(() => selectedObject?.kind === "polar" && polarArcRequest?.objectId === selectedObject.id &&
    polarArcRequest.min >= selectedObject.domain.min && polarArcRequest.max <= selectedObject.domain.max ?
    analyzeGraph2DPolarMeasurement({ document, objectId: selectedObject.id, kind: "arc-length",
      interval: { min: polarArcRequest.min, max: polarArcRequest.max },
      maxEvaluations: polarArcAnalysisBudget }) : null,
  [document, selectedObject, polarArcRequest, polarArcAnalysisBudget]);
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
        { min: intersectionRequest.min, max: intersectionRequest.max },
      maxEvaluations: intersectionAnalysisBudget });
  }, [document, size, intersectionRequest, selectedObject, intersectionAnalysisBudget]);
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
  const savedFields = !!(document.source.fieldReferences?.length || document.source.vectorFieldReferences?.length) &&
    <section className="graph2d-saved-fields"
    data-testid="graph2d-saved-fields" aria-label="Saved scientific fields">
    <h3>Saved scientific fields</h3>
    <p>References contain source metadata only. Verify the original .sscene before viewing field values.</p>
    {document.source.fieldReferences?.map(reference => <article key={reference.id}>
      <strong>{reference.datasetId} · {reference.component}</strong>
      <small>{reference.shape.join(" × ")} · {reference.axes.map(axis => `${axis.name} (${axis.unit})`).join(" / ")}</small>
      <small>Source {reference.locator.kind === "preset" ? `preset ${reference.locator.value}` : reference.locator.value}</small>
      <small role="status">{fieldStatuses[reference.id] === "current" ? "Source verified on last opening" :
        fieldStatuses[reference.id] === "changed" ? "Changed source — values withheld" :
        fieldStatuses[reference.id] === "missing" ? "Missing source — values unavailable" :
        fieldStatuses[reference.id] === "error" ? "Reverification failed — values unavailable" :
          "Not reverified on this opening"}</small>
      <div><button type="button" disabled={scientificImportBusy || !window.scientificScenes?.openGraphDatasetReference}
        onClick={() => void openSavedFieldReference(reference)}>Open field workspace</button>
        <button type="button" disabled={scientificImportBusy || !onAuthoringCommit || !window.scientificScenes?.chooseGraphDatasetRelink}
          onClick={() => void chooseFieldRelink(reference)}>Find replacement…</button>
        <button type="button" disabled={!onAuthoringCommit}
          onClick={() => onAuthoringCommit?.({ type: "remove-field-reference", referenceId: reference.id })}>
          Remove reference</button></div>
    </article>)}
    {document.source.vectorFieldReferences?.map(reference => {
      const first = reference.components[0], second = reference.components[1];
      return <article key={reference.id} data-testid="graph2d-saved-vector-field">
        <strong>{first.datasetId} · 2D vector field · {first.component} + {second.component}</strong>
        <small>{first.shape.join(" × ")} · {first.axes.map(axis => `${axis.name} (${axis.unit})`).join(" / ")}</small>
        <small>Source {first.locator.kind === "preset" ? `preset ${first.locator.value}` : first.locator.value}</small>
        <small>Component checksums: {first.resourceSha256}, {second.resourceSha256}</small>
        <small role="status">{fieldStatuses[reference.id] === "current" ? "Both components verified on last opening" :
          fieldStatuses[reference.id] === "changed" ? "Changed source — arrows withheld" :
          fieldStatuses[reference.id] === "missing" ? "Missing source — arrows unavailable" :
          fieldStatuses[reference.id] === "error" ? "Reverification failed — arrows unavailable" :
            "Not reverified on this opening"}</small>
        <div><button type="button" disabled={scientificImportBusy || !window.scientificScenes?.openGraphDatasetReference}
          onClick={() => void openSavedVectorFieldReference(reference)}>Reverify and view vector field</button>
          <button type="button" disabled={scientificImportBusy}
            onClick={() => void openSavedVectorField2DWorkspace(reference)}>Open 2D field workspace</button>
          <button type="button" disabled={scientificImportBusy || !onAuthoringCommit || !window.scientificScenes?.chooseGraphDatasetRelink}
            onClick={() => void chooseVectorFieldRelink(reference)}>Find vector replacement…</button>
          <button type="button" disabled={!onAuthoringCommit}
            onClick={() => onAuthoringCommit?.({ type: "remove-vector-field-reference", referenceId: reference.id })}>
            Remove vector reference</button></div>
      </article>;
    })}
    {fieldRelinkError && !fieldRelink && <p role="alert">{fieldRelinkError}</p>}
    {vectorFieldRelinkError && !vectorFieldRelink && <p role="alert">{vectorFieldRelinkError}</p>}
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
      {selectedObject?.kind === "point-series" && selectedObject.derivedOrigin &&
        <><button type="button" data-testid="graph2d-reverify-derived-line"
          onClick={() => { const selected = selectedObject;
            setDerivedLineStatus({ id: selected.id, message: "Verifying…" });
            void reverifyVectorField3DDerivedLine(selected.derivedOrigin!).then(fresh => {
              const stored = pointTableStore.resolve(selected.table);
              if (!stored || canonicalJsonStringify(stored) !== canonicalJsonStringify(fresh.rows))
                throw new Error("Saved Graphs line differs from the verified source.");
              setDerivedLineStatus({ id: selected.id, message: "Verified against saved source." });
            }).catch(cause => setDerivedLineStatus({ id: selected.id,
              message: cause instanceof Error ? cause.message : String(cause) }));
          }}>Reverify derived line</button>
          {derivedLineStatus?.id === selectedObject.id &&
            <span role="status">{derivedLineStatus.message}</span>}</>}
    </header>
    {constructions}
    {selectedObject?.kind === "point-series" && selectedLinkedReady && <Graph2DRegressionPanel document={document} model={regressionModel} onModel={setRegressionModel} result={regression} onResult={setRegression}
      onResidualFocus={(row, result) => setFocusedNumericalPoint({ origin: "regression", resultId: result.publication.resultId,
        point: { objectId: result.objectId, x: row.x, y: row.observed } })} />}
    {selectedObject?.kind === "point-series" && selectedLinkedReady && <Graph2DFourierPanel document={document} />}
    {(selectedObject?.kind === "parametric" || selectedObject?.kind === "explicit-cartesian" ||
      selectedObject?.kind === "point-series" && selectedObject.origin?.component === "real" && !!selectedObject.origin.slice) &&
      <Graph2DComplexMappingPanel document={document} onPlace={onComplexContourPlace} />}
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
    {intervals && <Graph2DIntervalResultsPanel analysis={intervals} document={document}
      focusedId={focusedInterval?.resultId === intervals.resultId ? focusedInterval.intervalId : null}
      onFocus={part => setFocusedInterval({ resultId: intervals.resultId, intervalId: part.intervalId })} />}
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
        <Graph2DAnalysisBudgetControl label="Polar area evaluation budget"
          value={polarAreaAnalysisBudget} onChange={setPolarAreaAnalysisBudget} />
        <button type="button" disabled={!polarValid} title={!polarValid ? "Choose increasing angles within the authored angular domain." : undefined} onClick={() => polarValid && selectedObject.kind === "polar" &&
          setPolarAreaRequest({ objectId: selectedObject.id, min: polarMin, max: polarMax })}>Measure swept area</button>
        <Graph2DAnalysisBudgetControl label="Polar arc length evaluation budget"
          value={polarArcAnalysisBudget} onChange={setPolarArcAnalysisBudget} />
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
            "unavailable" : result.errorEstimate.toExponential(2)} · {result.evaluations.toLocaleString()} of
            {" "}{(result.kind === "swept-area" ? polarAreaAnalysisBudget : polarArcAnalysisBudget).toLocaleString()} evaluations</small>
          {result.unresolvedCells > 0 && <p>{result.unresolvedCells} unresolved cells; partial value {result.partialValue.toPrecision(7)}.</p>}
          {result.publication.diagnostics.filter(entry => entry.code === "evaluation-limit")
            .map(entry => <p key={entry.code} role="status">{entry.message}</p>)}
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
        <Graph2DAnalysisBudgetControl label="Area evaluation budget"
          value={areaAnalysisBudget} onChange={setAreaAnalysisBudget} />
        <button type="button" disabled={!areaValid || !!areaUnavailable} onClick={() => !areaUnavailable && document.selection.objectId &&
          setAreaRequest({ objectId: document.selection.objectId, min: areaMin, max: areaMax, mode: areaDraft.mode })}>
          Integrate interval</button>
      </div>
      {area && <div data-testid="graph2d-area-result" data-result-id={area.resultId}>
        <p>{area.mode} area: {area.value === null ? "Unavailable over full interval" : area.value.toPrecision(9)}</p>
        <small>Adaptive Simpson · tolerance {area.tolerance.toExponential(1)} · estimated error {area.errorEstimate === null ?
          "unavailable" : area.errorEstimate.toExponential(2)} · {area.evaluations.toLocaleString()} of
          {" "}{areaAnalysisBudget.toLocaleString()} evaluations</small>
        {area.skippedCells > 0 && <p>{area.skippedCells} undefined or unresolved cells skipped; partial area {area.partialValue.toPrecision(7)}.</p>}
        {area.publication.diagnostics.filter(entry => entry.code === "evaluation-limit")
          .map(entry => <p key={entry.code} role="status">{entry.message}</p>)}
      </div>}
    </section>
    <section className="graph2d-arc-length" data-testid="graph2d-arc-length" aria-label="Arc length">
      <h3>Arc length</h3>
      <p>Measure the selected function over the x interval above.</p>
      <Graph2DAnalysisBudgetControl label="Arc length evaluation budget"
        value={arcAnalysisBudget} onChange={setArcAnalysisBudget} />
      <button type="button" disabled={!areaValid || !!arcUnavailable} onClick={() => !arcUnavailable && document.selection.objectId &&
        setArcRequest({ objectId: document.selection.objectId, min: areaMin, max: areaMax })}>
        Measure arc length</button>
      {arcLength && <div data-testid="graph2d-arc-length-result" data-result-id={arcLength.resultId}>
        <p>Length: {arcLength.value === null ? "Unavailable over full interval" : arcLength.value.toPrecision(9)}</p>
        <small>{arcLength.method} · tolerance {arcLength.tolerance.toExponential(1)} · estimated error
          {" "}{arcLength.errorEstimate === null ? "unavailable" : arcLength.errorEstimate.toExponential(2)} ·
          {" "}{arcLength.evaluations.toLocaleString()} of {arcAnalysisBudget.toLocaleString()} evaluations</small>
        {arcLength.unresolvedCells > 0 && <p>{arcLength.unresolvedCells} unresolved cells; partial length
          {" "}{arcLength.partialValue.toPrecision(7)}.</p>}
        {arcLength.publication.diagnostics.filter(entry => entry.code === "evaluation-limit")
          .map(entry => <p key={entry.code} role="status">{entry.message}</p>)}
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
        <Graph2DAnalysisBudgetControl label="Intersection evaluation budget"
          value={intersectionAnalysisBudget} onChange={setIntersectionAnalysisBudget} />
        <button type="button" disabled={!intersectionValid} onClick={() => selectedObject.kind === "explicit-cartesian" &&
          setIntersectionRequest({ firstId: selectedObject.id, secondId,
            intervalMode: intersectionDraft.intervalMode, min: intersectionMin, max: intersectionMax })}>
          Solve intersections</button>
      </div> : <p>Add another function to compare.</p>}
      {intersections && <div data-testid="graph2d-intersection-result" data-result-id={intersections.resultId}>
        <p><strong>{intersections.quality === "incomplete" ? "Incomplete" :
          intersections.quality === "approximate" ? "Approximate enumeration" : "Unavailable"}</strong>
          {" "}· {intersections.candidates.length} candidates · x ∈
          [{intersections.interval.min.toPrecision(5)}, {intersections.interval.max.toPrecision(5)}]
          {" "}· {intersections.evaluations.toLocaleString()} of {intersectionAnalysisBudget.toLocaleString()} evaluations</p>
        <Graph2DUnresolvedCoverage intervals={intersections.unresolvedIntervals} />
        <Graph2DIntersectionResultsTable analysis={intersections} document={document}
          onSelectionCommit={onSelectionCommit}
          canSave={!!onConstructionCommit &&
            (document.source.constructions?.objects.length ?? 0) < GRAPH2D_MAX_CONSTRUCTIONS}
          onSave={candidate => onConstructionCommit?.({ type: "create",
            object: graph2DConstructionFromCandidate(document, intersections, candidate) })}
          onSaveBatch={onConstructionBatchCommit ? candidates => onConstructionBatchCommit(
            graph2DConstructionActionsFromIntersectionCandidates(document, intersections, candidates)) : undefined} />
        {(intersections.invalidCells > 0 || intersections.unresolvedBrackets > 0 || intersections.coincidentCells > 0) &&
          <small>{intersections.invalidCells} undefined cells · {intersections.unresolvedBrackets} unresolved brackets ·
            {" "}{intersections.coincidentCells} coincident cells</small>}
        <small>Refined means a bracket solver met residual tolerance 1e−7. A small residual does not prove a unique intersection or complete enumeration. Tangencies are possible candidates; narrow intersections may be missed.</small>
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
          {selectedObject.origin.fieldDocument && <><dt>Saved field result</dt><dd>
            <ScientificFieldGraphResultControls graph={document} object={selectedObject}
              fields={savedScientificFields} sourceStatus={selectedFieldVerification}
              onCommit={onAuthoringCommit}
              onVerificationStatus={status => {
                if (selectedSavedField) setFieldStatuses(current => ({ ...current,
                  [selectedSavedField.source.reference.id]: status }));
              }} />
          </dd></>}
          <dt>Scientific source</dt><dd>{selectedObject.origin.sourceProducer}/{selectedObject.origin.sourceId} ·
            {" "}{selectedObject.origin.sceneId}/{selectedObject.origin.datasetId}</dd>
          <dt>Units</dt><dd>{selectedObject.origin.xName} ({selectedObject.origin.xUnit}) →
            {" "}{selectedObject.origin.yName} ({selectedObject.origin.yUnit})</dd>
          {selectedObject.origin.slice && <><dt>Grid line</dt><dd>Vary axis {selectedObject.origin.slice.varyingAxis};
            {" "}{selectedObject.origin.slice.fixedName} = {selectedObject.origin.slice.fixedCoordinate} {selectedObject.origin.slice.fixedUnit}
            {" "}(index {selectedObject.origin.slice.fixedIndex})</dd>
            {"plane" in selectedObject.origin.slice && selectedObject.origin.slice.plane &&
              <><dt>Source plane</dt><dd>Normal axis {selectedObject.origin.slice.plane.normalAxis};
                {" "}{selectedObject.origin.slice.plane.fixedName} = {selectedObject.origin.slice.plane.fixedCoordinate}
                {" "}{selectedObject.origin.slice.plane.fixedUnit}
                {" "}(index {selectedObject.origin.slice.plane.fixedIndex})</dd></>}</>}
          <dt>Source hashes</dt><dd><code>manifest {selectedObject.origin.sceneFingerprint}<br />resource {selectedObject.origin.resourceSha256}</code></dd>
        </>}
        {selectedObject?.kind === "point-series" && selectedObject.analyticOrigin && <>
          <dt>Analytic field source</dt><dd>{selectedObject.analyticOrigin.documentId} · revision
            {" "}{selectedObject.analyticOrigin.revision}</dd>
          <dt>Line coordinates</dt><dd>Vary {selectedObject.analyticOrigin.xName} (axis
            {" "}{selectedObject.analyticOrigin.varyingAxis}); {selectedObject.analyticOrigin.fixedCoordinates.map(
              (value, index) => index === selectedObject.analyticOrigin!.varyingAxis ? null :
                `${["x", "y", "z"][index]} = ${value}`).filter(Boolean).join(" · ")}</dd>
          <dt>Component and units</dt><dd>{selectedObject.analyticOrigin.component.toUpperCase()};
            {" "}{selectedObject.analyticOrigin.xUnit} → {selectedObject.analyticOrigin.yUnit}</dd>
          <dt>Field expressions</dt><dd>{selectedObject.analyticOrigin.expressions.join("; ")}</dd>
          <dt>Source hash</dt><dd><code>{selectedObject.analyticOrigin.structuralHash}</code></dd>
        </>}
        {selectedObject?.kind === "point-series" && selectedObject.derivedOrigin && <>
          <dt>Derived operation</dt><dd>{selectedObject.derivedOrigin.operation}</dd>
          <dt>Stencil grid</dt><dd>{selectedObject.derivedOrigin.stencilGrid === "source" ?
            "Source grid" : "Bounded preview grid"}</dd>
          <dt>Physical line</dt><dd>Vary {selectedObject.derivedOrigin.xName} (axis {selectedObject.derivedOrigin.varyingAxis});
            {" "}plane axis {selectedObject.derivedOrigin.normalAxis} = {selectedObject.derivedOrigin.fixedCoordinate};
            {" "}other axis = {selectedObject.derivedOrigin.profileFixedCoordinate}</dd>
          <dt>Units</dt><dd>{selectedObject.derivedOrigin.xUnit} → {selectedObject.derivedOrigin.yUnit}</dd>
          <dt>Verified source samples</dt><dd>{selectedObject.derivedOrigin.verifiedSamples.map(part =>
            <div key={part.name}>{part.name}: <code>{part.sampleSha256}</code></div>)}</dd>
          <dt>Source and line hashes</dt><dd><code>{selectedObject.derivedOrigin.sourceHash}<br />
            {selectedObject.derivedOrigin.lineSha256}</code></dd>
        </>}
        {selectedObject?.kind === "point-series" && selectedObject.linkedOrigin && <>
          <dt>Linked series</dt><dd>{selectedObject.linkedOrigin.series} · pair
            {" "}<code>{selectedObject.linkedOrigin.pairId}</code></dd>
          {"region" in selectedObject.linkedOrigin ?
            <><dt>Physical region profile</dt><dd>Mean along {selectedObject.linkedOrigin.xName}
              {" "}over 17 aligned samples per column; bounds
              {" "}{selectedObject.linkedOrigin.region.bounds.map(bounds =>
                `[${bounds[0]}, ${bounds[1]}]`).join(" × ")}; fixed coordinate
              {" "}{selectedObject.linkedOrigin.region.fixedCoordinate}.</dd></> :
            <><dt>Physical line</dt><dd>Vary {selectedObject.linkedOrigin.xName} (axis
              {" "}{selectedObject.linkedOrigin.profile.varyingAxis}); probe
              {" "}{selectedObject.linkedOrigin.profile.point.join(", ")}.</dd></>}
          <dt>Units</dt><dd>{selectedObject.linkedOrigin.xUnit} → {selectedObject.linkedOrigin.yUnit}</dd>
          {selectedObject.linkedOrigin.kind === "vector-scalar-linked-line/v1" ||
           selectedObject.linkedOrigin.kind === "vector-scalar-linked-region/v1" ?
            <><dt>Scalar source</dt><dd>{selectedObject.linkedOrigin.scalarReference.sceneId} /
              {" "}{selectedObject.linkedOrigin.scalarReference.datasetId} /
              {" "}{selectedObject.linkedOrigin.scalarReference.component}</dd></> :
            <><dt>Complex mode</dt><dd>{selectedObject.linkedOrigin.mode}</dd>
              <dt>Complex real source</dt><dd>{selectedObject.linkedOrigin.realReference.sceneId} /
                {" "}{selectedObject.linkedOrigin.realReference.datasetId} /
                {" "}{selectedObject.linkedOrigin.realReference.component}</dd>
              <dt>Complex imaginary source</dt><dd>{selectedObject.linkedOrigin.imaginaryReference.sceneId} /
                {" "}{selectedObject.linkedOrigin.imaginaryReference.datasetId} /
                {" "}{selectedObject.linkedOrigin.imaginaryReference.component}</dd></>}
          <dt>Vector source</dt><dd>{selectedLinkedVectorField?.kind === "scientific-bundle" ?
            `${selectedLinkedVectorField.references[0].sceneId} / ${selectedLinkedVectorField.references[0].datasetId}` :
            "Authored expression field"}</dd>
          <dt>Verified samples</dt><dd>{selectedObject.linkedOrigin.vectorSamples.map(part =>
            <div key={part.name}>{part.name}: <code>{part.sampleSha256}</code></div>)}
            {(selectedObject.linkedOrigin.kind === "vector-complex-linked-line/v1" ||
              selectedObject.linkedOrigin.kind === "vector-complex-linked-region/v1") && <>
              <div>Real: <code>{selectedObject.linkedOrigin.realSampleSha256}</code></div>
              <div>Imaginary: <code>{selectedObject.linkedOrigin.imaginarySampleSha256}</code></div></>}
            <div>{selectedObject.linkedOrigin.kind === "vector-complex-linked-line/v1" ||
              selectedObject.linkedOrigin.kind === "vector-complex-linked-region/v1" ?
              "Complex pair" : "Scalar"}: <code>{selectedObject.linkedOrigin.scalarSampleSha256}</code></div></dd>
          <dt>Source and row hashes</dt><dd><code>{selectedObject.linkedOrigin.vectorSourceHash}<br />
            {selectedObject.linkedOrigin.rowsSha256}</code></dd>
          <dt>Project source check</dt><dd role={linkedPairVerification.states[selectedObject.linkedOrigin.pairId] ===
            "Verified both sources." ? "status" : "alert"}>
            {linkedPairVerification.document === document ?
              linkedPairVerification.states[selectedObject.linkedOrigin.pairId] ?? "Verifying both saved sources…" :
              "Verifying both saved sources…"}</dd>
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
          {phaseArtifact && <>
            <dt>Orbits</dt><dd data-testid="graph2d-phase-orbits">{phaseArtifact.orbits.map((orbit, index) =>
              <span key={index}>{index + 1}: backward {orbit.backward}, forward {orbit.forward}; {orbit.acceptedSteps} accepted, {orbit.rejectedSteps} rejected<br /></span>)}</dd>
            <dt>Field</dt><dd>{phaseArtifact.fieldSegments.length} direction arrows · adaptive RK4, local tolerance 10⁻⁶.
              {(() => { const speeds = phaseArtifact.fieldMagnitudes;
                return speeds.length ? ` Sampled speed ${Math.min(...speeds).toPrecision(3)}–${Math.max(...speeds).toPrecision(3)} coordinate units per time unit; arrow length is median-relative.` : " No finite nonzero vectors sampled."; })()}</dd>
            <dt>Field diagnostics</dt><dd data-testid="graph2d-vector-field-analysis"
              data-result-id={vectorFieldAnalysis.result?.resultId ?? ""}>
              <Graph2DAnalysisBudgetControl label="Vector field analysis evaluation budget"
                value={vectorFieldAnalysisBudget} onChange={setVectorFieldAnalysisBudget} />
              <small>Separate sampled grid; changing this budget does not resample arrows, orbits or equilibria.</small>
              {vectorFieldAnalysis.error && <span role="alert"> {vectorFieldAnalysis.error}</span>}
              {!vectorFieldAnalysis.ready && !vectorFieldAnalysis.error && <span role="status"> Computing field diagnostics…</span>}
              {vectorFieldAnalysis.result && <div role="status">
                {vectorFieldAnalysis.result.status === "complete" ? "Sampled grid complete" :
                  vectorFieldAnalysis.result.status === "partial" ? "Partial sampled grid" : "Field scan unavailable"}
                {" "}· {vectorFieldAnalysis.result.gridSize}×{vectorFieldAnalysis.result.gridSize} cells
                {" "}· {vectorFieldAnalysis.result.validCells} valid, {vectorFieldAnalysis.result.invalidCells} undefined
                {" "}· {vectorFieldAnalysis.result.evaluations.toLocaleString("en-US")} / {vectorFieldAnalysisBudget.toLocaleString("en-US")} evaluations
                {vectorFieldAnalysis.result.speed && <>
                  <br />Speed {vectorFieldAnalysis.result.speed.min.toPrecision(4)}–{vectorFieldAnalysis.result.speed.max.toPrecision(4)}
                  {" "}· mean divergence {vectorFieldAnalysis.result.divergence?.mean.toPrecision(4)}
                  {" "}· mean scalar curl {vectorFieldAnalysis.result.curl?.mean.toPrecision(4)}</>}
                {vectorFieldAnalysis.result.status === "partial" && <> · {vectorFieldAnalysis.result.reason}; results not exhaustive</>}
              </div>}
              <small>Finite-difference estimates on sampled cells only; extrema and full-domain behavior are not certified. Scalar curl assumes compatible x/y coordinate units.</small>
            </dd>
            <dt>Analysis budget</dt><dd><Graph2DAnalysisBudgetControl label="Phase equilibrium evaluation budget"
              value={phaseAnalysisBudget} onChange={setPhaseAnalysisBudget} />
              <small>Independent of field and orbit rendering · {phaseArtifact.analysis.evaluations.toLocaleString()} evaluations</small>
              {phaseAnalysis.error && <span role="alert"> {phaseAnalysis.error}</span>}
              {!phaseAnalysis.ready && !phaseAnalysis.error && <span role="status"> Computing nullclines and equilibria…</span>}</dd>
            <dt>Nullclines</dt><dd data-testid="graph2d-phase-nullclines">x′=0 orange dashed;
              {" "}y′=0 cyan dotted · {phaseArtifact.analysis.status}</dd>
          <dt>Equilibria</dt><dd data-testid="graph2d-phase-equilibria">
            {phaseAnalysis.ready && sampling.ready && <Graph2DPhaseEquilibriaTable artifact={phaseArtifact}
              budget={phaseAnalysisBudget}
              document={document} objectId={selectedObject.id}
              onHighlight={point => setFocusedNumericalPoint({ origin: "phase",
                artifact: phaseArtifact,
                point: { objectId: selectedObject.id, x: point.x, y: point.y } })}
              readOnlyPreview={!sampling.ready || !!phaseSeedPreview || parameterPreviewActive} />}
          </dd>
            <dt>Method</dt><dd>Marching squares contour crossings, then up to five Newton steps.
              {" "}{phaseArtifact.analysis.candidates} candidates;
              {" "}{phaseArtifact.analysis.unresolved} unresolved.
              {" "}Grid scale ≈ {phaseArtifact.analysis.gridScale?.toPrecision(3) ?? "unavailable"} world units.
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
      data-field-explorer={vectorField3DOpen}
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
                <button type="button" disabled={!scientificImportAvailable}
                  onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open");
                    setVectorField3DDocument(current => current ?? savedVectorField3D ?? null);
                    setVectorField3DOpen(true); }}>Scientific Field Explorer</button>
                {vectorField3DDocument?.source.field.kind === "scientific-bundle" &&
                  <small data-testid="scientific-explorer-current-source">Current Explorer source:
                    {" "}{vectorField3DDocument.source.field.references[0].sceneId} ·
                    {" "}{vectorField3DDocument.source.field.references[0].datasetId}</small>}
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
        {vectorField3DOpen && <VectorField3DPanel key={vectorField3DDocument?.identity.id ?? "new"}
          mount={viewerRef.current?.closest<HTMLElement>(".graph2d-workspace") ?? undefined}
          initialDocument={vectorField3DDocument ?? undefined} savedDocument={savedVectorField3D}
          savedPointResults={savedVectorField3DPointResults}
          onSavePointResult={onSaveVectorField3DPointResult}
          savedRegionResults={savedVectorField3DRegionResults}
          regionResultStatuses={vectorField3DRegionStatuses}
          onSaveRegionResult={onSaveVectorField3DRegionResult}
          onOpenProjectResults={onOpenVectorField3DProjectResults}
          onPromoteIsosurface={onPromoteVectorField3DIsosurface}
          isGraphLineImported={(selection, vectorDocument) => {
            const field = vectorDocument.source.field;
            if (field.kind !== "scientific-bundle") return false;
            return document.source.objects.some(item => item.kind === "point-series" &&
              item.origin?.sceneFingerprint === field.references[0].sceneFingerprint &&
              item.origin.datasetId === field.references[0].datasetId &&
              vectorField3DGraphLineMatches(selection, item.origin));
          }}
          onAddGraphLine={(preview, selection) => {
            if (!onAuthoringCommit) throw new Error("Graph authoring is unavailable.");
            if (document.source.objects.some(item => item.kind === "point-series" &&
              item.origin?.sceneFingerprint === preview.origin.sceneFingerprint &&
              item.origin.datasetId === preview.origin.datasetId &&
              vectorField3DGraphLineMatches(selection, item.origin)))
              throw new Error("This vector line is already in Graphs.");
            const matching = document.source.objects.filter(item => item.kind === "point-series" &&
              item.origin?.sceneFingerprint === preview.origin.sceneFingerprint &&
              item.origin.datasetId === preview.origin.datasetId);
            const table = pointTableStore.publish(preview.rows);
            onAuthoringCommit({ type: "create-point-series", draft: { label: preview.label,
              table, mode: "line", domain: preview.domain, origin: preview.origin,
              style: { color: SCIENTIFIC_GRID_LINE_COLORS[matching.length % SCIENTIFIC_GRID_LINE_COLORS.length],
                lineWidth: 2, lineStyle: "solid", visible: true } } });
            setToolHint(`Added ${preview.rows.length} verified vector samples to Graphs. Use Fit to view the full line.`);
          }}
          onAddAnalyticLine={line => {
            if (!onAuthoringCommit) throw new Error("Graph authoring is unavailable.");
            if (document.source.objects.some(item => item.kind === "point-series" &&
              item.analyticOrigin?.documentId === line.origin.documentId &&
              item.analyticOrigin.structuralHash === line.origin.structuralHash &&
              item.analyticOrigin.component === line.origin.component &&
              item.analyticOrigin.varyingAxis === line.origin.varyingAxis &&
              item.analyticOrigin.fixedCoordinates.every((value, index) =>
                value === line.origin.fixedCoordinates[index])))
              throw new Error("This analytic line is already in Graphs.");
            const table = pointTableStore.publish(line.rows);
            const count = document.source.objects.filter(item => item.kind === "point-series" &&
              item.analyticOrigin).length;
            onAuthoringCommit({ type: "create-point-series", draft: { label: line.label,
              table, mode: "line", domain: line.domain, analyticOrigin: line.origin,
              style: { color: SCIENTIFIC_GRID_LINE_COLORS[count % SCIENTIFIC_GRID_LINE_COLORS.length],
                lineWidth: 2, lineStyle: "solid", visible: true } } });
            setToolHint(`Added ${line.finiteCount} analytic line samples to Graphs. Use Fit to view the full line.`);
          }}
          onAddDerivedLine={(line: VectorField3DDerivedLine) => {
            if (!onAuthoringCommit) throw new Error("Graph authoring is unavailable.");
            if (document.source.objects.some(item => item.kind === "point-series" &&
              item.derivedOrigin?.sourceHash === line.origin.sourceHash &&
              item.derivedOrigin.operation === line.origin.operation &&
              item.derivedOrigin.normalAxis === line.origin.normalAxis &&
              item.derivedOrigin.fixedCoordinate === line.origin.fixedCoordinate &&
              item.derivedOrigin.varyingAxis === line.origin.varyingAxis &&
              item.derivedOrigin.profileFixedCoordinate === line.origin.profileFixedCoordinate))
              throw new Error("This derived line is already in Graphs.");
            const count = document.source.objects.filter(item => item.kind === "point-series" &&
              item.derivedOrigin).length;
            const table = pointTableStore.publish(line.rows);
            onAuthoringCommit({ type: "create-point-series", draft: { label: line.label,
              table, mode: "line", domain: line.domain, derivedOrigin: line.origin,
              style: { color: SCIENTIFIC_GRID_LINE_COLORS[count % SCIENTIFIC_GRID_LINE_COLORS.length],
                lineWidth: 2, lineStyle: "solid", visible: true } } });
            setToolHint(`Added ${line.rows.length} verified ${line.origin.operation} samples to Graphs.`);
          }}
          onAddLinkedOverlayLine={(pair: readonly [LinkedOverlayGraphSeries, LinkedOverlayGraphSeries]) => {
            if (!onAuthoringCommit) throw new Error("Graph authoring is unavailable.");
            if (document.source.objects.length > GRAPH2D_MAX_OBJECTS - 2)
              throw new TypeError("Graph object limit reached.");
            if (document.source.objects.some(item => item.kind === "point-series" &&
              item.linkedOrigin?.pairId === pair[0].origin.pairId))
              throw new TypeError("This linked profile is already in Graphs.");
            const drafts = pair.map((series, index) => ({ label: series.label,
              table: pointTableStore.publish(series.rows), mode: "line" as const,
              domain: series.domain, linkedOrigin: series.origin,
              style: { color: index === 0 ? "#fde047" : "#38bdf8",
                lineWidth: 2, lineStyle: "solid" as const, visible: true } })) as
              [Graph2DPointSeriesDraft, Graph2DPointSeriesDraft];
            onAuthoringCommit({ type: "create-point-series-pair", drafts });
            setToolHint(`Added ${pair[0].rows.length} aligned vector and ${
              pair[1].origin.series} samples to Graphs.`);
          }}
          libraryEntries={explorerLibrary} libraryBusy={scientificImportBusy || sceneLibraryChecking}
          libraryError={scientificImportError}
          onBrowseLibraryScene={scientificImportAvailable ? () => void browseExplorerScene() : undefined}
          onOpenLibraryExample={scientificImportAvailable ? id => void browseExplorerScene(id) : undefined}
          onOpenLibraryEntry={openExplorerLibraryEntry}
          onRecheckLibraryScene={entry => void recheckExplorerLibraryScene(entry)}
          onRemoveLibraryScene={entry => {
            const scene = savedScientificScenes.find(item => scientificSceneLibraryKey(item) === entry.sceneKey);
            if (scene) {
              if (explorerScene?.locator.kind === scene.locator.kind &&
                  explorerScene.locator.value === scene.locator.value) setExplorerScene(null);
              onRemoveScientificScene?.(scene);
            }
          }}
          fieldLayer={explorerFieldLayer} overlayFields={savedScientificFields}
          linkedProbe={linkedExplorerProbe}
          onLinkedProbeChange={setLinkedExplorerProbe}
          onReturnToVectorLayer={() => setExplorerFieldLayer(null)}
          onOpenFieldDetails={() => { if (explorerFieldLayer) {
            setScientificFieldDocument(explorerFieldLayer); setScientificFieldOpen(true);
          } }}
          onSaveDocument={field => { setVectorField3DDocument(field); onSaveVectorField3D?.(field); }}
          onClose={() => { window.sessionStorage.removeItem(fieldExplorerSessionKey);
            setVectorField3DOpen(false);
            requestAnimationFrame(() => viewerRef.current?.querySelector<HTMLElement>(".graph2d-toolbar-menu > summary")?.focus()); }} />}
        {vectorField2DOpen && vectorField2DDocument && <VectorField2DPanel
          key={vectorField2DDocument.identity.id} initialDocument={vectorField2DDocument}
          onSaveDocument={field => { setVectorField2DDocument(field); onSaveVectorField2D?.(field); }}
          onClose={() => setVectorField2DOpen(false)} />}
        {scientificFieldOpen && scientificFieldDocument?.source.paired &&
          <ScientificComplexField3DWorkspacePanel key={scientificFieldDocument.identity.id}
            initialDocument={scientificFieldDocument} graphDocument={document}
            onSaveDocument={field => { setScientificFieldDocument(field);
              setExplorerFieldLayer(current => current?.identity.id === field.identity.id ? field : current);
              onSaveScientificField?.(field); }}
            onAuthoringCommit={onAuthoringCommit}
            onVerificationStatus={status => setFieldStatuses(current => ({ ...current,
              [scientificFieldDocument.source.reference.id]: status }))}
            onClose={() => setScientificFieldOpen(false)} />}
        {scientificFieldOpen && scientificFieldDocument && !scientificFieldDocument.source.paired && <ScientificFieldWorkspacePanel
          key={scientificFieldDocument.identity.id} initialDocument={scientificFieldDocument}
          onSaveDocument={field => { setScientificFieldDocument(field);
            setExplorerFieldLayer(current => current?.identity.id === field.identity.id ? field : current);
            onSaveScientificField?.(field); }}
          isGraphLineImported={selection => document.source.objects.some(item =>
            item.kind === "point-series" && item.origin?.sceneFingerprint === scientificFieldDocument.source.reference.sceneFingerprint &&
            item.origin.datasetId === scientificFieldDocument.source.reference.datasetId &&
            (item.origin.component ?? "scalar") === scientificFieldDocument.source.reference.component &&
            scientificFieldGraphResultState(item.origin, savedScientificFields) === "current" &&
            scientificFieldLineSelectionMatchesSlice(selection, item.origin.slice))}
          onAddGraphLine={(preview, selection) => {
            if (!onAuthoringCommit) throw new Error("Graph authoring is unavailable.");
            const reference = scientificFieldDocument.source.reference;
            if (document.source.objects.some(item => item.kind === "point-series" &&
              item.origin?.sceneFingerprint === preview.origin.sceneFingerprint &&
              item.origin.datasetId === preview.origin.datasetId &&
              (item.origin.component ?? "scalar") === reference.component &&
              scientificFieldGraphResultState(item.origin, savedScientificFields) === "current" &&
              scientificFieldLineSelectionMatchesSlice(selection, item.origin.slice)))
              throw new Error("This field line is already in Graphs.");
            const matching = document.source.objects.filter(item => item.kind === "point-series" &&
              item.origin?.sceneFingerprint === preview.origin.sceneFingerprint &&
              item.origin.datasetId === preview.origin.datasetId &&
              (item.origin.component ?? "scalar") === reference.component);
            const table = pointTableStore.publish(preview.rows);
            onAuthoringCommit({ type: "create-point-series", draft: { label: preview.label,
              table, mode: "line", domain: preview.domain,
              origin: { ...preview.origin, locator: reference.locator,
                fieldDocument: scientificFieldResultBinding(scientificFieldDocument) },
              style: { color: SCIENTIFIC_GRID_LINE_COLORS[matching.length % SCIENTIFIC_GRID_LINE_COLORS.length],
                lineWidth: 2, lineStyle: "solid", visible: true } } });
            setToolHint(`Added ${preview.rows.length} verified field samples to Graphs. Use Fit to view the full line.`);
          }}
          onVerificationStatus={status => setFieldStatuses(current => ({ ...current,
            [scientificFieldDocument.source.reference.id]: status }))}
          onClose={() => setScientificFieldOpen(false)} />}
        {scientificPresetOpen && <div className="graph2d-scientific-import graph2d-scientific-presets" role="dialog"
          aria-label="Scientific field presets" onPointerDown={event => event.stopPropagation()}>
          <h3>Scientific field presets</h3>
          <p>Choose a verified sample dataset. Preview a field, save its reference, or import a line.</p>
          <label>Data type <select aria-label="Preset data type" value={scientificPresetKind}
            onChange={event => setScientificPresetKind(event.target.value as typeof scientificPresetKind)}>
            <option value="all">All data types</option><option value="scalar">Scalar fields</option>
            <option value="vector">Vector fields</option><option value="complex">Complex fields</option>
            <option value="explorer">3D Field Explorer datasets</option>
          </select></label>
          {SCIENTIFIC_FIELD_PRESETS.filter(preset => {
            if (scientificPresetKind === "all") return true;
            if (scientificPresetKind === "explorer") return "explorer" in preset && preset.explorer;
            return preset.kind === scientificPresetKind;
          })
            .map(preset => <div key={preset.id} className="graph2d-scientific-preset-option">
            <button type="button" disabled={scientificImportBusy} onClick={() => void openScientificDataset(preset.id)}>
              {preset.title}</button><small>{preset.detail}</small>
          </div>)}
          <button type="button" onClick={() => setScientificPresetOpen(false)}>Cancel</button>
        </div>}
        {fieldRelink && <div className="graph2d-scientific-import graph2d-field-relink" role="dialog"
          aria-label="Review replacement scientific field" aria-modal="true">
          <h3>Review replacement scientific field</h3>
          <p>The candidate bundle was verified. Compare its metadata before replacing the saved location. No field values are displayed here.</p>
          <label>Replacement component <select aria-label="Replacement component" value={fieldRelink.selectedKey}
            onChange={event => setFieldRelink({ ...fieldRelink, selectedKey: event.target.value })}>
            {fieldRelink.source.datasets.map(item => <option key={`${item.datasetId}:${item.component}`}
              value={`${item.datasetId}:${item.component}`}>{item.datasetId} · {item.component} · {item.shape.join(" × ")}</option>)}
          </select></label>
          {relinkReview ? <>
            <table><thead><tr><th>Property</th><th>Saved</th><th>Replacement</th></tr></thead>
              <tbody>{relinkReview.differences.map(item => <tr key={item.field}
                data-match={item.matches ? "yes" : "no"} data-required={item.required ? "yes" : "no"}>
                <th scope="row">{item.field}{item.required ? " *" : ""}</th>
                <td>{item.saved}</td><td>{item.replacement}</td></tr>)}</tbody></table>
            <p role="status">{relinkReview.eligible ?
              "Required component, field type, shape, axes and resource checksum match. Source details may differ." :
              "Relink unavailable: a required field differs, or this is already the saved source."}</p>
          </> : <p role="alert">This replacement has no valid field component.</p>}
          {fieldRelinkError && <p role="alert">{fieldRelinkError}</p>}
          <div><button type="button" disabled={!relinkReview?.eligible || scientificImportBusy}
            onClick={() => void acceptFieldRelink()}>Accept verified relink</button>
            <button type="button" disabled={scientificImportBusy} onClick={() => { setFieldRelink(null); setFieldRelinkError(""); }}>Cancel</button></div>
          <small>* Required for relinking. Acceptance re-reads and verifies the bundle again; opening it later re-verifies before viewing.</small>
        </div>}
        {vectorFieldRelink && <div className="graph2d-scientific-import graph2d-field-relink" role="dialog"
          aria-label="Review replacement 2D vector field" aria-modal="true">
          <h3>Review replacement 2D vector field</h3>
          <p>The candidate bundle was verified. Compare both ordered components before replacing the saved location.
            No field values are displayed here.</p>
          <label>Replacement vector dataset <select aria-label="Replacement vector dataset"
            value={vectorFieldRelink.datasetId}
            onChange={event => setVectorFieldRelink({ ...vectorFieldRelink, datasetId: event.target.value })}>
            {vectorRelinkDatasets.map(item => <option key={item.id} value={item.id}>
              {item.id} · {item.components?.map(part => part.name).join(" + ")} · {item.shape.join(" × ")}</option>)}
          </select></label>
          {vectorRelinkReview ? <>
            <table><thead><tr><th>Property</th><th>Saved</th><th>Replacement</th></tr></thead>
              <tbody>{vectorRelinkReview.differences.map(item => <tr key={item.field}
                data-match={item.matches ? "yes" : "no"} data-required={item.required ? "yes" : "no"}>
                <th scope="row">{item.field}{item.required ? " *" : ""}</th>
                <td>{item.saved}</td><td>{item.replacement}</td></tr>)}</tbody></table>
            <p role="status">{vectorRelinkReview.eligible ?
              "Both component names, field type, shape, axes and resource checksums match. Source details may differ." :
              "Relink unavailable: a required vector field property differs, or this is already the saved source."}</p>
          </> : <p role="alert">This replacement has no valid paired vector field.</p>}
          {vectorFieldRelinkError && <p role="alert">{vectorFieldRelinkError}</p>}
          <div><button type="button" disabled={!vectorRelinkReview?.eligible || scientificImportBusy}
            onClick={() => void acceptVectorFieldRelink()}>Accept verified vector relink</button>
            <button type="button" disabled={scientificImportBusy} onClick={() => {
              setVectorFieldRelink(null); setVectorFieldRelinkError("");
            }}>Cancel</button></div>
          <small>* Required for relinking. Acceptance re-reads the bundle and verifies both component planes again.</small>
        </div>}
        {scientificImport && <div className="graph2d-scientific-import" role="dialog" aria-label="Import verified scientific dataset"
          onPointerDown={event => event.stopPropagation()}>
          <h3>Import verified scientific dataset</h3>
          {scientificManifest?.ok && <p>{scientificManifest.value.title}</p>}
          <section className="graph2d-scientific-explorer-catalog" aria-label="Available 3D Field Explorer examples">
            <h4>Available 3D Explorer datasets</h4>
            <p>Each example is a separate verified scene. Switch scenes here; the list below describes the opened scene.</p>
            <div>{SCIENTIFIC_EXPLORER_PRESETS.map(preset =>
              <div key={preset.id}>
                <button type="button" disabled={scientificImportBusy ||
                  scientificImport.locator.kind === "preset" && scientificImport.locator.value === preset.id}
                  onClick={() => void openScientificDataset(preset.id)}>
                  {preset.title}</button>
                <small>{preset.detail}</small>
              </div>)}</div>
          </section>
          <section className="graph2d-scientific-explorer-datasets" aria-label="3D Field Explorer datasets">
            <h4>3D datasets in this scene ({scientificExplorerDatasets.length})</h4>
            {scientificExplorerDatasets.length ? scientificExplorerDatasets.map(({ dataset, eligibility }) =>
              <div className="graph2d-scientific-explorer-dataset" key={dataset.id}
                data-testid={`scientific-explorer-dataset-${dataset.id}`}>
                <strong>{dataset.quantity.name}</strong> · {dataset.id} · {dataset.shape.join(" × ")} grid ·
                {" "}{dataset.quantity.unit} · {eligibility.reason}
                {scientificDataset?.id === dataset.id ? " · Selected" : ""}
                {eligibility.ready && scientificDataset?.id !== dataset.id &&
                  <button type="button" disabled={scientificImportBusy} onClick={() => {
                    const first = dataset.components![0]!.name;
                    setScientificDatasetId(`${dataset.id}:${first}`); resetScientificSlice();
                    selectDefaultScientificSlice(dataset.shape);
                  }}>Select for Explorer</button>}
              </div>) : <p>No 3D dataset in this scene. Choose a 3D vector preset or open a 3D scene.</p>}
          </section>
          <label>Dataset component <select value={scientificDatasetId} onChange={event => {
            setScientificDatasetId(event.target.value); resetScientificSlice();
            selectDefaultScientificSlice(scientificImport.datasets.find(item => `${item.datasetId}:${item.component}` === event.target.value)?.shape);
          }}>
            {scientificImport.datasets.map(item => <option key={`${item.datasetId}:${item.component}`}
              value={`${item.datasetId}:${item.component}`}>{item.datasetId} · {item.component} ·
              {" "}{item.shape ? `${item.shape.length}D` : "series"}</option>)}
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
            <button type="button" disabled={scientificImportBusy} onClick={() => void previewScientificPlane()}>
              {scientificSelected.shape.length === 2 ? "View verified field" : "View verified plane"}</button>
            {scientificSelected.shape.length === 2 && scientificDataset?.semanticType === "vector-field" &&
              scientificDataset.components?.length === 2 &&
              <button type="button" disabled={scientificImportBusy} onClick={previewScientificVectorPlane}>
                View verified vector field</button>}
            {scientificSelected.shape.length === 3 && <button type="button" disabled={scientificImportBusy}
              onClick={() => void previewScientificVolume()}>View verified volume</button>}
            {scientificPlane && scientificCoordinate && scientificPlane.datasetId === scientificSelected.datasetId &&
              scientificPlane.component === scientificSelected.component &&
              <ScientificFieldPlane plane={scientificPlane} coordinate={scientificCoordinate}
                label={`${scientificDataset?.quantity.name ?? scientificSelected.datasetId} ${scientificSelected.component}`}
                unit={scientificDataset?.quantity.unit ?? ""} transfer={scientificTransfer}
                onApplyTransfer={transfer => void previewScientificPlane(transfer)} />}
            {scientificVectorPlane && scientificCoordinate &&
              scientificVectorPlane[0].datasetId === scientificSelected.datasetId &&
              <ScientificFieldVectorPlane planes={scientificVectorPlane} coordinate={scientificCoordinate}
                label={scientificDataset?.quantity.name ?? scientificSelected.datasetId}
                unit={scientificDataset?.quantity.unit ?? ""} />}
            {scientificVolume && scientificCoordinate && scientificVolume.datasetId === scientificSelected.datasetId &&
              scientificVolume.component === scientificSelected.component &&
              <ScientificFieldVolume volume={scientificVolume} coordinate={scientificCoordinate}
                label={`${scientificDataset?.quantity.name ?? scientificSelected.datasetId} ${scientificSelected.component}`}
                unit={scientificDataset?.quantity.unit ?? ""} transfer={scientificTransfer}
                onApplyTransfer={transfer => void previewScientificVolume(transfer)} />}
            {scientificImport && scientificDataset?.semanticType === "complex-scalar-field" &&
              scientificSelected.shape.length === 3 && scientificCoordinate?.axes.length === 3 &&
              <ScientificComplexVolumeLinesPanel key={`${scientificImport.fingerprint}:${scientificSelected.datasetId}`}
                manifestJson={scientificImport.manifestJson} fingerprint={scientificImport.fingerprint}
                locator={scientificImport.locator} datasetId={scientificSelected.datasetId}
                shape={scientificSelected.shape as [number, number, number]}
                axes={scientificCoordinate.axes as [typeof scientificCoordinate.axes[number],
                  typeof scientificCoordinate.axes[number], typeof scientificCoordinate.axes[number]]}
                origin={scientificCoordinate.origin as [number, number, number]}
                spacing={scientificCoordinate.spacing as [number, number, number]}
                document={document} fieldDocument={scientificFieldDocument?.source.paired &&
                  scientificFieldDocument.source.reference.sceneFingerprint === scientificImport.fingerprint &&
                  scientificFieldDocument.source.reference.datasetId === scientificSelected.datasetId &&
                  canonicalJsonStringify(scientificFieldDocument.source.reference.locator) ===
                    canonicalJsonStringify(scientificImport.locator) ?
                    scientificFieldDocument : undefined}
                disabled={scientificImportBusy} onAuthoringCommit={onAuthoringCommit}
                onSaveWorkspace={onSaveScientificField ? saveScientificComplexField : undefined} />}
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
            {scientificDataset?.semanticType === "vector-field" && scientificDataset.shape.length === 2 &&
              scientificDataset.components?.length === 2 &&
              <button type="button" disabled={!scientificVectorPlane || scientificVectorFieldAlreadySaved ||
                scientificImportBusy || !onAuthoringCommit} onClick={saveScientificVectorFieldReference}>
                Save 2D vector field reference</button>}
            {scientificDataset && scientificManifest?.ok &&
              scientificExplorerEligibility(scientificManifest.value, scientificDataset).ready &&
              <button type="button" disabled={scientificImportBusy}
                onClick={() => void openScientificVectorField3D()}>Open in Field Explorer</button>}
            <button type="button" onClick={() => { resetScientificSlice();
              void window.scientificScenes?.closeGraphDataset(scientificImport.fingerprint); setScientificImport(null); }}>Cancel</button></div>
        </div>}
        {toolHint && <p className="graph2d-tool-hint" role="status">{toolHint}</p>}
        <div className="graph2d-compact-panels">
          {showLeft && <details><summary>Graph objects ({document.source.objects.length})</summary>{functionList("compact")}</details>}
          {showRight && <details><summary>Inspector</summary>{inspector}{savedFields}</details>}
        </div>
        {status === "ready" && <Graph2DPlot display={renderedDisplay} size={size} series={phaseSeries}
          selectedPhaseSeed={selectedPhaseSeed}
          constructions={parameterPreviewActive ? null : shownConstructions}
          probeMarkers={probeMarkers}
          regression={!parameterPreviewActive && document.display.objects.find(s => s.objectId === currentRegression?.objectId)?.visible ? currentRegression : null}
          selectedProbe={parameterPreviewActive ? null : focusedNumericalProbe ?? document.selection.probe}
          hoverProbe={parameterPreviewActive ? null : hoverSelection?.probe} overlays={parameterPreviewActive ? [] : differentialOverlays}
          intervals={!parameterPreviewActive && intervals && isGraph2DIntervalAnalysisCurrent(intervals, document) ? intervals : null}
          focusedIntervalId={focusedInterval && focusedInterval.resultId === intervals?.resultId ?
            focusedInterval.intervalId : null}
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
