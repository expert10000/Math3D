import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { canonicalJsonStringify, createVectorField3DDocument, defaultVectorField3DWorkspace,
  parseVectorField3DDocument, reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  createScientificDatasetLink,
  sampleVectorField3DArrows, sampleVectorField3DScientificArrows, serializeVectorField3DDocument,
  sampleVectorField3DSlice, sampleVectorField3DProbe, vectorField3DSliceCoordinates,
  sampleVectorField3DSparseSlice, sampleVectorField3DSparseProbe,
  analyzeVectorField3DDifferential, sampleVectorField3DDerivedSlice,
  createVectorField3DPointResult, reverifyVectorField3DPointResult,
  createCombinedVectorField3DRegionResultWithCurl,
  createVectorDerivedRegionResult,
  verifyVectorField3DVolumes,
  type VectorField3DDifferentialArtifact,
  type AnalysisResultEnvelope,
  type VectorField3DEquilibriumSearch,
  type VectorField3DIsosurface,
  sampleVectorField3DAnalyticLine, type VectorField3DAnalyticLine,
  createVectorField3DDerivedLine, type VectorField3DDerivedLine,
  integrateVectorField3DScientificTrajectories,
  vectorField3DSeedPreset, vectorField3DSpatialSeedPattern,
  vectorField3DTolerancePresets, vectorField3DTolerancePresetOf,
  type VectorField3DTolerancePreset,
  scientificPointWithinBounds,
  scientificCoordinateIndex,
  vectorField3DExpression, type VectorField3DArrowArtifact, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DExpression, type VectorField3DTrajectoryArtifact,
  type Graph2DScientificDatasetPreview, type VectorField3DLayer,
  type ScientificFieldDocument,
  type VectorField3DSliceArtifact, type VectorField3DProbeArtifact,
  type VectorField3DClipBounds, type VectorField3DCameraPreset,
  type VectorField3DSpatialSeedPattern,
  type VectorField3DSeedGroupStyle,
  type VectorField3DScalarOverlay,
  type VectorField3DComplexOverlay, type VectorField3DWorkspace,
  type VectorField3DLinkedLineProfile,
  type VectorField3DOverlayRegion,
  type Graph2DLinkedRegionSelection,
  type Graph2DScientificVolume,
  inspectGraph2DFieldReference, verifyGraph2DScientificVolume,
  type VectorField3DVerifiedTile } from "@math3d/core";
import type { VectorField3DCameraState } from "@math3d/core";
import { VectorField3DArrowView } from "./VectorField3DArrowView";
import { seedPlaneNormalAxis, type SeedPlane3D } from "./fieldSeedPlacement3D";
import { captureSeedEdit, restoreSeedEdit, seedGroupStyle,
  type SeedEditSnapshot } from "./seedGroupManagement";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { VectorField3DGraphLinePanel } from "./VectorField3DGraphLinePanel";
import { previewVerifiedVectorField3D } from "./previewVerifiedVectorField3D";
import type { VectorField3DGraphLineSelection } from "./reverifyVectorField3DGraphLine";
import { reverifyVectorField3DDerivedLine } from "./reverifyVectorField3DDerivedLine";
import { cachedVerifiedVectorField3DSlice, invalidateVerifiedDerivedResults } from
  "./verifiedDerivedResultCache";
import { exportVectorField3DIsosurfaceGltf } from "./exportVectorField3DIsosurface";
import { BUILTIN_EXPLORER_SCENES, type BuiltinExplorerSceneId,
  type ExplorerLibraryEntry } from "./scientificExplorerLibrary";
import { ScientificExplorerFieldLayer } from "./ScientificExplorerFieldLayer";
import { LinkedExplorerVectorProbe } from "./LinkedExplorerVectorProbe";
import { CombinedOverlayProbe } from "./CombinedOverlayProbe";
import { CombinedOverlayRegionReadout } from "./CombinedOverlayRegionReadout";
import { LinkedRegionBoundsEditor } from "./LinkedRegionBoundsEditor";
import type { LinkedExplorerProbe } from "./linkedFieldProbe";
import { sampleComplexSliceOverlay, sampleScalarSliceOverlay, sampleSliceOverlayVectorPlane,
  sliceOverlayArrowsFromPlane, type LinkedOverlayLineProfile, type SliceOverlayArrow,
  type OverlayRegionSummary, type VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import { linkedOverlayGraphPair, type LinkedOverlayGraphSeries } from "./linkedOverlayGraphPair";
import { reverifyLinkedOverlayGraphPair } from "./reverifyLinkedOverlayGraphPair";
import { linkedOverlayRegionGraphPair } from "./linkedOverlayRegionGraphPair";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import { reverifyLinkedOverlayRegionGraphPair } from "./reverifyLinkedOverlayRegionGraphPair";
import { linkedCombinedRegionGraphs, linkedCombinedRegionGraphsWithCurl,
  checkCombinedRegionGraphSeries,
  createCombinedRegionVerificationSession,
  type CombinedRegionGraphGroup } from "./linkedCombinedRegionGraphs";
import { verifiedCombinedDerivedRegionProfiles } from "./derivedCombinedRegionProfile";
import { verifiedVectorRegionProfile } from "./derivedCombinedRegionProfile";
import { linkedVectorDerivedRegionGraphs, checkVectorDerivedRegionGraphSeries,
  type VectorDerivedRegionGraphGroup,
  type VectorDerivedRegionVerificationSession } from "./linkedVectorDerivedRegionGraphs";
import type { CombinedRegionInspection } from "./combinedFieldInspection";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";

const storageKey = "math3d.vector-field3d.document.v1";
const tileTransferBuffers = (tiles: readonly VectorField3DVerifiedTile[]): ArrayBuffer[] => {
  const buffers = new Set<ArrayBuffer>();
  for (const tile of tiles) for (const part of tile.components)
    if (part.bytes.buffer instanceof ArrayBuffer) buffers.add(part.bytes.buffer);
  return [...buffers];
};
const trajectoryHasError = (reason: string) =>
  reason === "undefined" || reason === "solver-failure" || reason === "step-limit" ||
  reason === "cancelled";
type SeedSliceLayer = "xy" | "xz" | "yz";
type OverlaySampleDigest = Readonly<{ name: string; sampleSha256: string }>;
const hasVisibleSliceOverlay = (view?: VectorField3DWorkspace): view is VectorField3DWorkspace =>
  !!(view?.scalarOverlay?.visible || view?.complexOverlay?.visible);
export const fieldExplorerSessionKey = "math3d.scientific-field-explorer.session.v1";
export function readFieldExplorerSession(): VectorField3DDocument | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(fieldExplorerSessionKey);
    return raw ? parseVectorField3DDocument(raw) : null;
  } catch { return null; }
}
export function createDefaultVectorField3DDocument(): VectorField3DDocument {
  const axes = (["x", "y", "z"] as const).map(role => ({ role, label: role, unit: "m", min: -4, max: 4 })) as
    unknown as VectorField3DSource["axes"];
  return createVectorField3DDocument({ axes, timeUnit: "s", field: { kind: "expressions",
    components: [vectorField3DExpression("-y", "m/s"), vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s")] }, seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512,
      magnitudeScale: 1, colorBy: "speed" }, solver: { absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6, maxSteps: 10000, maxTime: 20 } },
  { stableKey: crypto.randomUUID(), title: "3D vector field" });
}

export function VectorField3DPanel({ initialDocument, savedDocument, onSaveDocument, onClose, mount,
  onAddGraphLine, isGraphLineImported, onAddAnalyticLine, onAddDerivedLine,
  onAddLinkedOverlayLine, onFocusRegionInGraphs, linkedRegionFocus = null,
  savedPointResults = [], onSavePointResult, savedRegionResults = [], regionResultStatuses = {},
  onSaveRegionResult, onOpenProjectResults, onPromoteIsosurface,
  libraryEntries = [], libraryBusy = false, libraryError = "", onBrowseLibraryScene,
  onOpenLibraryExample, onOpenLibraryEntry, onRemoveLibraryScene, onRecheckLibraryScene,
  fieldLayer, linkedProbe = null, onLinkedProbeChange, onOpenFieldDetails,
  onReturnToVectorLayer, overlayFields = [] }: {
  initialDocument?: VectorField3DDocument; savedDocument?: VectorField3DDocument | null;
  onSaveDocument?: (document: VectorField3DDocument) => void; onClose: () => void;
  mount?: HTMLElement;
  onAddGraphLine?: (preview: Graph2DScientificDatasetPreview, selection: VectorField3DGraphLineSelection) => void;
  isGraphLineImported?: (selection: VectorField3DGraphLineSelection, document: VectorField3DDocument) => boolean;
  onAddAnalyticLine?: (line: VectorField3DAnalyticLine) => void;
  onAddDerivedLine?: (line: VectorField3DDerivedLine) => void;
  onAddLinkedOverlayLine?: (pair: readonly [LinkedOverlayGraphSeries,
    LinkedOverlayGraphSeries] | CombinedRegionGraphGroup |
    VectorDerivedRegionGraphGroup) => void;
  onFocusRegionInGraphs?: (document: VectorField3DDocument,
    region: VectorField3DOverlayRegion,
    physical: Graph2DLinkedRegionSelection["physical"], profileAxis: 0 | 1) => Promise<void>;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  savedPointResults?: readonly AnalysisResultEnvelope[];
  onSavePointResult?: (document: VectorField3DDocument, result: AnalysisResultEnvelope) => void;
  savedRegionResults?: readonly AnalysisResultEnvelope[];
  regionResultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onSaveRegionResult?: (document: VectorField3DDocument, result: AnalysisResultEnvelope) => void;
  onOpenProjectResults?: (resultId: string) => void;
  onPromoteIsosurface?: (document: VectorField3DDocument,
    surface: VectorField3DIsosurface) => void;
  libraryEntries?: readonly ExplorerLibraryEntry[];
  libraryBusy?: boolean;
  libraryError?: string;
  onBrowseLibraryScene?: () => void;
  onOpenLibraryExample?: (id: BuiltinExplorerSceneId) => void;
  onOpenLibraryEntry?: (entry: ExplorerLibraryEntry) => void;
  onRemoveLibraryScene?: (entry: ExplorerLibraryEntry) => void;
  onRecheckLibraryScene?: (entry: ExplorerLibraryEntry) => void;
  fieldLayer?: ScientificFieldDocument | null;
  overlayFields?: readonly ScientificFieldDocument[];
  linkedProbe?: LinkedExplorerProbe | null;
  onLinkedProbeChange?: (probe: LinkedExplorerProbe | null) => void;
  onOpenFieldDetails?: () => void;
  onReturnToVectorLayer?: () => void;
}) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const matchingLibraryEntries = libraryEntries.filter(entry =>
    [entry.title, entry.sceneTitle, entry.datasetId, entry.kind, entry.unit,
      entry.sourceStatus, entry.reason].some(value => value?.toLowerCase().includes(libraryQuery.trim().toLowerCase())));
  const dialogRef = useRef<HTMLDivElement>(null);
  const equilibriaButtonRef = useRef<HTMLButtonElement>(null);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const cancelRequested = useRef(false);
  const probeEpoch = useRef(0);
  const previewEpoch = useRef(0);
  useEffect(() => {
    cancelRequested.current = false;
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { cancelRequested.current = true; cancelRunRef.current?.(); probeEpoch.current++;
      previewEpoch.current++; previous?.focus(); };
  }, []);
  const onDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
  };
  const [document, setDocument] = useState(initialDocument ?? createDefaultVectorField3DDocument);
  useEffect(() => {
    try { window.sessionStorage.setItem(fieldExplorerSessionKey, serializeVectorField3DDocument(document)); }
    catch { /* Project save remains available when session storage is unavailable. */ }
  }, [document]);
  const [expressions, setExpressions] = useState<[string, string, string]>(document.source.field.kind === "expressions" ?
    document.source.field.components.map(component => component.source) as [string, string, string] : ["-y", "x", "0"]);
  const [artifact, setArtifact] = useState<VectorField3DArrowArtifact | null>(() =>
    document.source.field.kind === "expressions" ? sampleVectorField3DArrows(document) : null);
  const [slice, setSlice] = useState<VectorField3DSliceArtifact | null>(null);
  const [linkedSlices, setLinkedSlices] = useState<Partial<Record<"xy" | "xz" | "yz",
    VectorField3DSliceArtifact>>>({});
  const [overlayVectorArrows, setOverlayVectorArrows] = useState<Partial<Record<SeedSliceLayer,
    readonly SliceOverlayArrow[]>>>({});
  const [overlayVectorPlanes, setOverlayVectorPlanes] = useState<Partial<Record<SeedSliceLayer,
    VectorSliceOverlayPlane>>>({});
  const [overlayVectorSamples, setOverlayVectorSamples] = useState<Partial<Record<SeedSliceLayer,
    readonly OverlaySampleDigest[]>>>({});
  const [verifiedScalarOverlay, setVerifiedScalarOverlay] = useState<{
    referenceId: string; resourceSha256: string; volume: Graph2DScientificVolume } | null>(null);
  const [verifiedComplexOverlay, setVerifiedComplexOverlay] = useState<{
    realId: string; imaginaryId: string; realHash: string; imaginaryHash: string;
    real: Graph2DScientificVolume; imaginary: Graph2DScientificVolume } | null>(null);
  const [scalarOverlayStatus, setScalarOverlayStatus] = useState("");
  const [complexOverlayStatus, setComplexOverlayStatus] = useState("");
  const [overlayReading, setOverlayReading] = useState(false);
  const [overlayRecheck, setOverlayRecheck] = useState(0);
  const [overlayReadGeneration, setOverlayReadGeneration] = useState(0);
  const [reopenPreview, setReopenPreview] = useState(0);
  const [probeArtifact, setProbeArtifact] = useState<VectorField3DProbeArtifact | null>(null);
  const [differential, setDifferential] = useState<VectorField3DDifferentialArtifact | null>(null);
  const [pointResultId, setPointResultId] = useState<string | null>(null);
  const [equilibriumSearch, setEquilibriumSearch] = useState<VectorField3DEquilibriumSearch | null>(null);
  const [isosurface, setIsosurface] = useState<VectorField3DIsosurface | null>(null);
  const [isosurfaceLevelDraft, setIsosurfaceLevelDraft] = useState(
    String(document.workspace?.isosurfaceLevel ?? 1));
  const [selectedEquilibrium, setSelectedEquilibrium] = useState<number | null>(null);
  const [trajectories, setTrajectories] = useState<VectorField3DTrajectoryArtifact | null>(null);
  const [seedDraft, setSeedDraft] = useState<[string, string, string]>(document.source.axes.map(axis =>
    String((axis.min + axis.max) / 2)) as [string, string, string]);
  const [spatialSeedKind, setSpatialSeedKind] = useState<VectorField3DSpatialSeedPattern["kind"]>("shell");
  const [spatialCenter, setSpatialCenter] = useState<[string, string, string]>(document.source.axes.map(axis =>
    String((axis.min + axis.max) / 2)) as [string, string, string]);
  const [spatialRadius, setSpatialRadius] = useState(String(Math.min(...document.source.axes.map(axis =>
    axis.max - axis.min)) / 4));
  const [spatialCount, setSpatialCount] = useState("8");
  const [spatialRandomSeed, setSpatialRandomSeed] = useState("1");
  const [seedPlacementLayer, setSeedPlacementLayer] = useState<SeedSliceLayer | null>(null);
  const [seedPlacement3DPlane, setSeedPlacement3DPlane] = useState<SeedPlane3D | null>(null);
  const [seedProposal, setSeedProposal] = useState<{ layer: SeedSliceLayer;
    view: "slice" | "3d";
    position: readonly [number, number, number]; fixedCoordinate: number;
    sourceRevision: number; sourceStructuralHash: string } | null>(null);
  const [seedGroupChoice, setSeedGroupChoice] = useState("manual");
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<string, string>>({});
  const [seedHistory, setSeedHistory] = useState<{
    undo: SeedEditSnapshot[]; redo: SeedEditSnapshot[] }>({ undo: [], redo: [] });
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [error, setError] = useState("");
  const [sourceVerification, setSourceVerification] = useState<
    "pending" | "verifying" | "verified" | "failed">("pending");
  const [busy, setBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"render" | "trajectory" | "equilibrium" | "isosurface" | null>(null);
  const [runStatus, setRunStatus] = useState("");
  const [seedProgress, setSeedProgress] = useState<{ completed: number; total: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const datasetLink = document.source.field.kind === "scientific-bundle" ?
    createScientificDatasetLink(document.source.field.references) : null;
  const currentLibraryVector = (entry: ExplorerLibraryEntry) => entry.kind === "vector" &&
    (entry.documentId === document.identity.id ||
      document.source.field.kind === "scientific-bundle" &&
      entry.sceneFingerprint === document.source.field.references[0].sceneFingerprint &&
      entry.datasetId === document.source.field.references[0].datasetId);
  const workspace = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const regionLayer = workspace.overlayRegion ?
    ({ 0: "yz", 1: "xz", 2: "xy" } as const)[workspace.overlayRegion.normalAxis] : null;
  const regionPlane = regionLayer ? overlayVectorPlanes[regionLayer] : null;
  const linkedVectorReady = document.source.field.kind === "expressions" ||
    !!regionPlane && regionPlane.sourceStructuralHash === document.identity.structuralHash &&
    !!regionLayer && overlayVectorSamples[regionLayer]?.length === 3;
  const linkedVectorStatus = error ? `Vector source withheld: ${error}` :
    "Verifying the saved rectangle's vector source plane…";
  const scalarOverlay = workspace.scalarOverlay;
  const complexOverlay = workspace.complexOverlay;
  const linkedProfileScalarVolume = scalarOverlay?.visible && verifiedScalarOverlay &&
    verifiedScalarOverlay.referenceId === scalarOverlay.reference.id &&
    verifiedScalarOverlay.resourceSha256 === scalarOverlay.reference.resourceSha256 ?
    verifiedScalarOverlay.volume : null;
  const linkedRegionComplexVolumes = complexOverlay?.visible && verifiedComplexOverlay &&
    verifiedComplexOverlay.realId === complexOverlay.real.id &&
    verifiedComplexOverlay.imaginaryId === complexOverlay.imaginary.id &&
    verifiedComplexOverlay.realHash === complexOverlay.real.resourceSha256 &&
    verifiedComplexOverlay.imaginaryHash === complexOverlay.imaginary.resourceSha256 ?
    [verifiedComplexOverlay.real, verifiedComplexOverlay.imaginary] as const : null;
  const scalarOverlayChoices = [fieldLayer, ...overlayFields]
    .filter((field): field is ScientificFieldDocument => !!field && !field.source.paired &&
      !field.source.derivation && field.source.reference.semanticType === "scalar-field" &&
      field.source.reference.shape.length === 3)
    .filter((field, index, all) => all.findIndex(item =>
      item.source.reference.id === field.source.reference.id) === index);
  const complexOverlayChoices = [fieldLayer, ...overlayFields]
    .filter((field): field is ScientificFieldDocument => !!field && !!field.source.paired &&
      field.source.reference.shape.length === 3)
    .filter((field, index, all) => all.findIndex(item =>
      item.source.reference.id === field.source.reference.id) === index);
  const overlayForSlice = (candidate: VectorField3DSliceArtifact,
    layer: SeedSliceLayer) => {
    if (complexOverlay?.visible && complexOverlay.mode !== "phase-contours") {
      if (!verifiedComplexOverlay || verifiedComplexOverlay.realId !== complexOverlay.real.id ||
          verifiedComplexOverlay.imaginaryId !== complexOverlay.imaginary.id ||
          verifiedComplexOverlay.realHash !== complexOverlay.real.resourceSha256 ||
          verifiedComplexOverlay.imaginaryHash !== complexOverlay.imaginary.resourceSha256)
        return { sample: null, status: complexOverlayStatus || "Verifying complex overlay source…" };
      if (!overlayVectorArrows[layer]) return { sample: null,
        status: "Verifying vector arrows on this slice…" };
      try {
        const sample = sampleComplexSliceOverlay(document, candidate, complexOverlay,
          verifiedComplexOverlay.real, verifiedComplexOverlay.imaginary);
        return { sample, status: sample.covered < sample.values.length ?
          `Partial complex domain overlap: ${sample.covered}/${sample.values.length} cells covered.` :
          complexOverlayStatus };
      } catch (cause) { return { sample: null,
        status: `Complex overlay withheld: ${cause instanceof Error ? cause.message : String(cause)}` }; }
    }
    if (!scalarOverlay?.visible) return { sample: null, status: "" };
    if (!verifiedScalarOverlay || verifiedScalarOverlay.referenceId !== scalarOverlay.reference.id ||
        verifiedScalarOverlay.resourceSha256 !== scalarOverlay.reference.resourceSha256)
      return { sample: null, status: scalarOverlayStatus || "Verifying scalar overlay source…" };
    if (!overlayVectorArrows[layer]) return { sample: null,
      status: "Verifying vector arrows on this slice…" };
    try {
      const sample = sampleScalarSliceOverlay(document, candidate,
        scalarOverlay.reference, verifiedScalarOverlay.volume, scalarOverlay.title,
        scalarOverlay.unit, scalarOverlay.opacity);
      return { sample, status: sample.covered < sample.values.length ?
        `Partial scalar domain overlap: ${sample.covered}/${sample.values.length} cells covered.` :
        scalarOverlayStatus };
    }
    catch (cause) { return { sample: null,
      status: `Scalar overlay withheld: ${cause instanceof Error ? cause.message : String(cause)}` }; }
  };
  const contourForSlice = (candidate: VectorField3DSliceArtifact,
    layer: SeedSliceLayer) => {
    if (!complexOverlay?.visible || complexOverlay.mode !== "phase-contours")
      return { sample: null, status: "" };
    if (!verifiedComplexOverlay || verifiedComplexOverlay.realId !== complexOverlay.real.id ||
        verifiedComplexOverlay.imaginaryId !== complexOverlay.imaginary.id ||
        verifiedComplexOverlay.realHash !== complexOverlay.real.resourceSha256 ||
        verifiedComplexOverlay.imaginaryHash !== complexOverlay.imaginary.resourceSha256)
      return { sample: null, status: complexOverlayStatus || "Verifying complex contour source…" };
    if (!overlayVectorArrows[layer]) return { sample: null,
      status: "Verifying vector arrows on this slice…" };
    try {
      const sample = sampleComplexSliceOverlay(document, candidate, complexOverlay,
        verifiedComplexOverlay.real, verifiedComplexOverlay.imaginary);
      return { sample, status: sample.covered < sample.values.length ?
        `Partial complex contour coverage: ${sample.covered}/${sample.values.length} cells covered.` :
        complexOverlayStatus };
    } catch (cause) { return { sample: null,
      status: `Complex contours withheld: ${cause instanceof Error ? cause.message : String(cause)}` }; }
  };
  useEffect(() => {
    let active = true;
    setVerifiedScalarOverlay(null);
    if (!scalarOverlay?.visible) { setScalarOverlayStatus(""); setOverlayReading(false); return; }
    setScalarOverlayStatus("Verifying scalar overlay source…");
    setOverlayReading(true);
    const verify = async () => {
      let fingerprint: string | null = null;
      try {
        const reference = scalarOverlay.reference, bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference || !bridge.previewGraphVolume)
          throw new Error("Scalar overlay requires the desktop source verifier.");
        const opened = await bridge.openGraphDatasetReference({ locator: reference.locator,
          sceneFingerprint: reference.sceneFingerprint });
        if (!opened.ok) throw new Error(`Scalar source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        if (inspectGraph2DFieldReference(reference, opened.source.manifestJson) !== "current")
          throw new Error("Saved scalar source metadata or resource hash changed.");
        const fresh = await bridge.previewGraphVolume({ fingerprint,
          datasetId: reference.datasetId, component: reference.component });
        const volume = verifyGraph2DScientificVolume(opened.source.manifestJson, fingerprint, fresh);
        if (active) {
          setVerifiedScalarOverlay({ referenceId: reference.id,
            resourceSha256: reference.resourceSha256, volume });
          setScalarOverlayStatus(`Verified scalar samples ${volume.sampleSha256}.`);
        }
      } catch (cause) { if (active) {
        setVerifiedScalarOverlay(null);
        setScalarOverlayStatus(`Scalar overlay withheld: ${cause instanceof Error ?
          cause.message : String(cause)}`);
      } } finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
        if (active) setOverlayReading(false); }
    };
    void verify();
    return () => { active = false; };
  }, [scalarOverlay?.reference.id, scalarOverlay?.reference.resourceSha256,
    scalarOverlay?.visible, overlayRecheck, overlayReadGeneration]);
  useEffect(() => {
    let active = true;
    setVerifiedComplexOverlay(null);
    if (!complexOverlay?.visible) { setComplexOverlayStatus(""); return; }
    setComplexOverlayStatus("Verifying both complex components…");
    setOverlayReading(true);
    const verify = async () => {
      let fingerprint: string | null = null;
      try {
        const { real, imaginary } = complexOverlay, bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference || !bridge.previewGraphVolume)
          throw new Error("Complex overlay requires the desktop source verifier.");
        createScientificDatasetLink([real, imaginary]);
        const opened = await bridge.openGraphDatasetReference({ locator: real.locator,
          sceneFingerprint: real.sceneFingerprint });
        if (!opened.ok) throw new Error(`Complex source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        if ([real, imaginary].some(reference => inspectGraph2DFieldReference(reference,
          opened.source.manifestJson) !== "current"))
          throw new Error("Saved complex source metadata or component hash changed.");
        const freshReal = await bridge.previewGraphVolume({ fingerprint,
          datasetId: real.datasetId, component: real.component });
        const checkedReal = verifyGraph2DScientificVolume(opened.source.manifestJson,
          fingerprint, freshReal);
        const freshImaginary = await bridge.previewGraphVolume({ fingerprint,
          datasetId: imaginary.datasetId, component: imaginary.component });
        const checkedImaginary = verifyGraph2DScientificVolume(opened.source.manifestJson,
          fingerprint, freshImaginary);
        if (active) {
          setVerifiedComplexOverlay({ realId: real.id, imaginaryId: imaginary.id,
            realHash: real.resourceSha256, imaginaryHash: imaginary.resourceSha256,
            real: checkedReal, imaginary: checkedImaginary });
          setComplexOverlayStatus(`Verified real ${checkedReal.sampleSha256} and imaginary ${
            checkedImaginary.sampleSha256} samples.`);
        }
      } catch (cause) { if (active) {
        setVerifiedComplexOverlay(null);
        setComplexOverlayStatus(`Complex overlay withheld: ${cause instanceof Error ?
          cause.message : String(cause)}`);
      } } finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
        if (active) setOverlayReading(false); }
    };
    void verify();
    return () => { active = false; };
  }, [complexOverlay?.real.id, complexOverlay?.imaginary.id,
    complexOverlay?.real.resourceSha256, complexOverlay?.imaginary.resourceSha256,
    complexOverlay?.visible, overlayRecheck, overlayReadGeneration]);
  const linkedAxes = fieldLayer ? fieldLayer.source.reference.axes.map((axis, index) => ({
    label: axis.name, unit: axis.unit, min: axis.origin,
    max: axis.origin + axis.spacing * (fieldLayer.source.reference.shape[index]! - 1) })) :
    document.source.axes;
  const linkedUnits = linkedAxes.map(axis => axis.unit) as [string, string, string];
  const sharedProfileMismatch = linkedProbe && !linkedProbe.units.every((unit, axis) =>
    unit === document.source.axes[axis]!.unit) ?
    "Shared probe coordinate units do not match the vector field." :
    linkedProbe && !scientificPointWithinBounds(linkedProbe.point, document.source.axes) ?
      "Shared probe is outside the vector field domain." : "";
  const sharedProfileProbe = linkedProbe && linkedProbe.units.every((unit, axis) =>
    unit === document.source.axes[axis]!.unit) &&
    scientificPointWithinBounds(linkedProbe.point, document.source.axes) ?
    linkedProbe.point : workspace.probe;
  const changeLinkedProbe = (probe: LinkedExplorerProbe | null) => {
    const physicallyCompatible = !!probe && probe.units.every((unit, axis) =>
      unit === document.source.axes[axis]!.unit) &&
      scientificPointWithinBounds(probe.point, document.source.axes);
    const aligned = physicallyCompatible &&
      (document.source.field.kind === "expressions" || probe.point.every((value, axis) =>
        vectorField3DSliceCoordinates(document, axis as 0 | 1 | 2).some(sample =>
          Math.abs(sample - value) < 1e-9)));
    if (aligned && workspace.viewsLinked && probe.point.some((value, axis) =>
      Math.abs(value - workspace.sliceCoordinates[axis]!) > 1e-9)) {
      setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setOverlayVectorSamples({}); setOverlayReadGeneration(0);
    }
    setDocument(current => {
      const view = current.workspace ?? defaultVectorField3DWorkspace(current.source);
      return reviseVectorField3DWorkspace(current, { ...view, linkedProbe: probe,
        linkedLineProfile: physicallyCompatible && view.linkedLineProfile ?
          { ...view.linkedLineProfile, point: [...probe.point] as [number, number, number] } :
          view.linkedLineProfile,
        ...(aligned ? { probe: [...probe.point] as [number, number, number],
          sliceCoordinates: view.viewsLinked ? [...probe.point] as [number, number, number] :
            view.sliceCoordinates } : {}) });
    });
    onLinkedProbeChange?.(probe);
  };
  const seedGroups = [...new Set(document.source.seeds.map(seed => seed.group ?? "manual"))]
    .map(id => ({ id, seeds: document.source.seeds.filter(seed =>
      (seed.group ?? "manual") === id) }));
  const visibleTrajectories = trajectories ? { ...trajectories,
    trajectories: trajectories.trajectories.filter(path => {
      const group = document.source.seeds.find(seed => seed.id === path.seedId)?.group ?? "manual";
      return !workspace.hiddenSeedGroups.includes(group);
    }) } : null;
  const multiView = workspace.layout === "split" || workspace.layout === "quad";
  const visibleRegionSlice = regionLayer && (multiView ? linkedSlices[regionLayer] :
    workspace.selectedLayer === regionLayer ? slice : null);
  const normalAxis = ({ xy: 2, xz: 1, yz: 0 } as const)[workspace.selectedLayer as "xy" | "xz" | "yz"];
  const sliceControlAxis = normalAxis ?? (multiView ? 2 : undefined);
  const sliceOptions = sliceControlAxis === undefined ? [] :
    vectorField3DSliceCoordinates(document, sliceControlAxis);
  const selectLayer = (selectedLayer: VectorField3DLayer) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), selectedLayer }));
    if (!multiView) { setSlice(null); setOverlayVectorArrows({}); setOverlayVectorPlanes({}); setOverlayVectorSamples({}); }
    setSeedPlacementLayer(null); setSeedPlacement3DPlane(null); setSeedProposal(null);
    setError("");
  };
  const setSliceCoordinate = (axis: 0 | 1 | 2, coordinate: number) => {
    setSeedProposal(null);
    if (workspace.viewsLinked && workspace.probe) {
      const position = [...workspace.probe] as [number, number, number];
      position[axis] = coordinate;
      void selectProbe(position);
      return;
    }
    setDocument(current => { const currentWorkspace = current.workspace ?? defaultVectorField3DWorkspace(current.source);
      const sliceCoordinates = [...currentWorkspace.sliceCoordinates] as [number, number, number];
      sliceCoordinates[axis] = coordinate;
      return reviseVectorField3DWorkspace(current, { ...currentWorkspace, sliceCoordinates }); });
    setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
    setOverlayVectorSamples({}); setError("");
    setOverlayReadGeneration(0);
  };
  const setClipBound = (axis: 0 | 1 | 2, end: 0 | 1, value: number) => {
    try {
      const next = workspace.clipBounds.map(bounds => [...bounds]) as
        [[number, number], [number, number], [number, number]];
      next[axis][end] = value;
      const revised = reviseVectorField3DWorkspace(document, { ...workspace, clipBounds: next });
      setDocument(revised);
      setIsosurface(null);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const setCameraPreset = (cameraPreset: VectorField3DCameraPreset) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), cameraPreset,
        cameraState: null }));
  };
  const setCameraState = (cameraState: VectorField3DCameraState) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), cameraState }));
  };
  const setViewsLinked = (viewsLinked: boolean) => {
    const next = reviseVectorField3DWorkspace(document, { ...workspace, viewsLinked,
      sliceCoordinates: viewsLinked && workspace.probe ? [...workspace.probe] as [number, number, number] :
        workspace.sliceCoordinates });
    setDocument(next);
    if (viewsLinked && workspace.probe) { setSlice(null); setLinkedSlices({});
      setOverlayVectorArrows({}); setOverlayVectorPlanes({}); setOverlayVectorSamples({}); setOverlayReadGeneration(0); }
    setError("");
  };
  const setScalarOverlay = (fieldId: string) => {
    const field = scalarOverlayChoices.find(item => item.source.reference.id === fieldId);
    const next: VectorField3DScalarOverlay | null = field ? {
      reference: field.source.reference, title: field.metadata.title,
      unit: field.source.quantity.unit, opacity: 0.85, visible: true } : null;
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
        scalarOverlay: next,
        complexOverlay: next && current.workspace?.complexOverlay?.visible &&
          current.workspace.complexOverlay.mode !== "phase-contours" ?
          { ...current.workspace.complexOverlay, visible: false } : current.workspace?.complexOverlay ?? null,
        selectedLayer: field && !["xy", "xz", "yz"].includes(
          (current.workspace ?? defaultVectorField3DWorkspace(current.source)).selectedLayer) ?
          "xy" : (current.workspace ?? defaultVectorField3DWorkspace(current.source)).selectedLayer }));
    setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
    setOverlayVectorSamples({}); setOverlayReadGeneration(0); setError("");
    if (field) { setReopenPreview(value => value + 1); onReturnToVectorLayer?.(); }
  };
  const setComplexOverlay = (fieldId: string) => {
    const field = complexOverlayChoices.find(item => item.source.reference.id === fieldId);
    const next: VectorField3DComplexOverlay | null = field?.source.paired ? {
      real: field.source.reference, imaginary: field.source.paired.imaginary,
      title: field.metadata.title, unit: field.source.quantity.unit,
      mode: scalarOverlay?.visible ? "phase-contours" : "magnitude",
      opacity: 0.85, visible: true } : null;
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
        complexOverlay: next,
        selectedLayer: field && !["xy", "xz", "yz"].includes(
          (current.workspace ?? defaultVectorField3DWorkspace(current.source)).selectedLayer) ?
          "xy" : (current.workspace ?? defaultVectorField3DWorkspace(current.source)).selectedLayer }));
    setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
    setOverlayVectorSamples({}); setOverlayReadGeneration(0); setError("");
    if (field) { setReopenPreview(value => value + 1); onReturnToVectorLayer?.(); }
  };
  const setLinkedLineProfile = (profile: VectorField3DLinkedLineProfile | null) => {
    setDocument(current => reviseVectorField3DWorkspace(current, {
      ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
      linkedLineProfile: profile }));
  };
  const setOverlayRegion = (region: VectorField3DOverlayRegion | null) => {
    setDocument(current => reviseVectorField3DWorkspace(current, {
      ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
      overlayRegion: region }));
  };
  const setViewZoom = (layer: "xy" | "xz" | "yz", zoom: number) => {
    setDocument(current => { const view = current.workspace ?? defaultVectorField3DWorkspace(current.source);
      const bounded = Math.max(1, Math.min(8, zoom));
      const edge = 0.5 / bounded;
      const center = view.viewCenter[layer].map(value => Math.max(edge, Math.min(1 - edge, value))) as
        [number, number];
      return reviseVectorField3DWorkspace(current, { ...view,
        viewZoom: { ...view.viewZoom, [layer]: bounded },
        viewCenter: { ...view.viewCenter, [layer]: center } }); });
  };
  const setViewCenter = (layer: "xy" | "xz" | "yz", center: readonly [number, number]) => {
    setDocument(current => { const view = current.workspace ?? defaultVectorField3DWorkspace(current.source);
      const edge = 0.5 / view.viewZoom[layer];
      const bounded = center.map(value => Math.max(edge, Math.min(1 - edge, value))) as
        [number, number];
      return reviseVectorField3DWorkspace(current, { ...view,
        viewCenter: { ...view.viewCenter, [layer]: bounded } }); });
  };
  const setLayout = (layout: typeof workspace.layout) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), layout }));
    setArtifact(null); setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
    setOverlayVectorSamples({});
    setSeedPlacementLayer(null); setSeedPlacement3DPlane(null); setSeedProposal(null); setError("");
  };
  const updateSource = (source: VectorField3DSource, options?: Readonly<{
    preserveSeedHistory?: boolean; seedSnapshot?: SeedEditSnapshot }>) => {
    probeEpoch.current++; previewEpoch.current++;
    invalidateVerifiedDerivedResults(document.identity.id);
    const activeGroups = new Set(source.seeds.map(seed => seed.group ?? "manual"));
    const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
    const prepared = reviseVectorField3DWorkspace(document, { ...view,
      hiddenSeedGroups: view.hiddenSeedGroups.filter(group => activeGroups.has(group)),
      seedGroupStyles: view.seedGroupStyles.filter(style => activeGroups.has(style.id)) });
    const revised = reviseVectorField3DDocument(prepared, source);
    const final = options?.seedSnapshot ? reviseVectorField3DWorkspace(revised, {
      ...(revised.workspace ?? defaultVectorField3DWorkspace(source)),
      hiddenSeedGroups: options.seedSnapshot.hiddenSeedGroups,
      seedGroupStyles: options.seedSnapshot.seedGroupStyles }) : revised;
    setDocument(final);
    if (!options?.preserveSeedHistory) setSeedHistory({ undo: [], redo: [] });
    setGroupNameDrafts({});
    setArtifact(null); setSlice(null); setOverlayVectorArrows({}); setOverlayVectorPlanes({}); setOverlayVectorSamples({});
    setLinkedSlices({});
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    setEquilibriumSearch(null); setSelectedEquilibrium(null); setIsosurface(null);
    setRunStatus(""); setSeedProgress(null);
    setSeedPlacementLayer(null); setSeedPlacement3DPlane(null);
    setSeedProposal(null); setSeedGroupChoice("manual");
  };
  const recordSeedEdit = () => setSeedHistory(current => ({
    undo: [...current.undo.slice(-63), captureSeedEdit(document)], redo: [] }));
  const editSeedSource = (seeds: VectorField3DSource["seeds"],
    seedSnapshot?: SeedEditSnapshot) => {
    updateSource({ ...document.source, seeds }, { preserveSeedHistory: true, seedSnapshot });
    recordSeedEdit();
  };
  const editSeedWorkspace = (change: (view: NonNullable<VectorField3DDocument["workspace"]>) =>
    NonNullable<VectorField3DDocument["workspace"]>) => {
    const next = reviseVectorField3DWorkspace(document, change(workspace));
    if (JSON.stringify(captureSeedEdit(next)) === JSON.stringify(captureSeedEdit(document))) return;
    setDocument(next); recordSeedEdit(); setError("");
  };
  const stepSeedHistory = (direction: "undo" | "redo") => {
    try {
      if (busy || lineBusy) return;
      const stack = seedHistory[direction];
      const target = stack.at(-1);
      if (!target) return;
      const current = captureSeedEdit(document);
      const seedsChanged = JSON.stringify(current.seeds) !== JSON.stringify(target.seeds);
      if (seedsChanged) updateSource({ ...document.source, seeds: target.seeds },
        { preserveSeedHistory: true, seedSnapshot: target });
      else {
        setDocument(restoreSeedEdit(document, target));
        setSeedProposal(null);
      }
      setSeedHistory(previous => direction === "undo" ? {
        undo: previous.undo.slice(0, -1), redo: [...previous.redo.slice(-63), current] } : {
        undo: [...previous.undo.slice(-63), current], redo: previous.redo.slice(0, -1) });
      setGroupNameDrafts({}); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const changeSeedGroupStyle = (id: string, name: string, color: string) => {
    const next: VectorField3DSeedGroupStyle = { id, name, color };
    editSeedWorkspace(view => ({ ...view, seedGroupStyles: [
      ...view.seedGroupStyles.filter(style => style.id !== id), next] }));
  };
  const renameSeedGroup = (id: string) => {
    try {
      const name = (groupNameDrafts[id] ?? seedGroupStyle(document, id).name).trim();
      if (!name || name.length > 64 || /[\x00-\x1f\x7f]/.test(name))
        throw new TypeError("Group name must have 1–64 printable characters.");
      if (seedGroups.some(group => group.id !== id &&
          seedGroupStyle(document, group.id).name.toLowerCase() === name.toLowerCase()))
        throw new TypeError("A seed group already has that name.");
      changeSeedGroupStyle(id, name, seedGroupStyle(document, id).color);
      setGroupNameDrafts(current => { const next = { ...current }; delete next[id]; return next; });
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const currentDocument = () => document.source.field.kind === "expressions" ?
    reviseVectorField3DDocument(document, { ...document.source, field: { kind: "expressions",
      components: expressions.map((source, index) => vectorField3DExpression(source,
        document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : "m/s")) as
        [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] } }) : document;
  const sampleSelectedSlice = (next: VectorField3DDocument, axis: 0 | 1 | 2,
    coordinate: number, scientific?: Parameters<typeof sampleVectorField3DSlice>[3]) => {
    const channel = next.workspace?.sliceChannel ?? "component";
    if (scientific && next.source.field.kind === "scientific-bundle")
      return cachedVerifiedVectorField3DSlice(next, axis, coordinate, channel, scientific);
    return channel === "component" ? sampleVectorField3DSlice(next, axis, coordinate, scientific) :
      sampleVectorField3DDerivedSlice(next, axis, coordinate, channel, scientific);
  };
  const isChunked = (manifestJson: string) =>
    ["scientific-scene/v2", "scientific-scene/v3"].includes(JSON.parse(manifestJson).schema);
  const sourceIndex = (next: VectorField3DDocument, axis: number, coordinate: number) => {
    if (next.source.field.kind !== "scientific-bundle") throw new TypeError("Expected scientific source.");
    const ref = next.source.field.references[0];
    return scientificCoordinateIndex({ ...ref.axes[axis]!, count: ref.shape[axis]! }, coordinate);
  };
  const componentNames = (next: VectorField3DDocument): [string, string, string] => {
    if (next.source.field.kind !== "scientific-bundle") throw new TypeError("Expected scientific source.");
    return next.source.field.references.map(ref => ref.component) as [string, string, string];
  };
  const render = async (openedDocument?: VectorField3DDocument) => {
    if (busy || lineBusy || overlayReading) return;
    const epoch = ++previewEpoch.current;
    setSeedPlacementLayer(null); setSeedPlacement3DPlane(null); setSeedProposal(null);
    setBusy(true); setBusyAction("render"); setArtifact(null); setSlice(null); setLinkedSlices({});
    setOverlayReadGeneration(0); setVerifiedScalarOverlay(null); setVerifiedComplexOverlay(null);
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    setEquilibriumSearch(null); setSelectedEquilibrium(null); setIsosurface(null);
    let fingerprint: string | null = null;
    let previewReady = false, overlayVisible = false;
    try {
      const next = openedDocument ?? currentDocument();
      overlayVisible = !!hasVisibleSliceOverlay(next.workspace);
      if (next.source.field.kind === "scientific-bundle") setSourceVerification("verifying");
      if (next.source.field.kind === "expressions") {
        setArtifact(sampleVectorField3DArrows(next));
        if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe));
        previewReady = true;
        setDocument(next); return;
      }
      const refs = next.source.field.references;
      const bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
        throw new Error("Scientific vector fields require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      const { artifact: result, volumes } = await previewVerifiedVectorField3D(next,
        opened.source.manifestJson, fingerprint, bridge, initial => {
          if (epoch === previewEpoch.current) { setArtifact(initial.artifact); setDocument(next); }
        }, () => new Promise(resolve => setTimeout(resolve, 120)));
      if (epoch !== previewEpoch.current) return;
      if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes }));
      setArtifact(result); setDocument(next); setSourceVerification("verified");
      previewReady = true;
    } catch (cause) { if (epoch === previewEpoch.current) {
      setArtifact(null); setSourceVerification("failed");
      setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (previewReady && epoch === previewEpoch.current && overlayVisible)
        setOverlayReadGeneration(value => value + 1);
      if (epoch === previewEpoch.current) { setBusy(false); setBusyAction(null); } }
  };
  const focusRequestsSlice = (candidate: VectorField3DDocument | null | undefined) =>
    !!candidate?.workspace && linkedRegionFocus?.documentId === candidate.identity.id &&
    linkedRegionFocus.sourceHash === candidate.identity.structuralHash &&
    !!candidate.workspace.overlayRegion &&
    canonicalJsonStringify(candidate.workspace.overlayRegion) ===
      canonicalJsonStringify(linkedRegionFocus.region);
  // A scientific field opens with a checked first preview; no button press is required.
  useEffect(() => {
    if (initialDocument?.source.field.kind === "scientific-bundle" &&
        !focusRequestsSlice(initialDocument) &&
        !(hasVisibleSliceOverlay(initialDocument.workspace) &&
          (initialDocument.workspace.layout === "split" || initialDocument.workspace.layout === "quad" ||
            ["xy", "xz", "yz"].includes(initialDocument.workspace.selectedLayer))))
      void render(initialDocument);
  }, []);
  const previewSlice = async () => {
    if (busy || lineBusy || overlayReading || normalAxis === undefined) return;
    const coordinate = workspace.sliceCoordinates[normalAxis];
    setSeedProposal(null);
    setBusy(true); setSlice(null); setOverlayVectorArrows({}); setOverlayVectorPlanes({}); setOverlayVectorSamples({});
    setOverlayReadGeneration(0); setVerifiedScalarOverlay(null); setVerifiedComplexOverlay(null);
    setProbeArtifact(null); setDifferential(null); setError("");
    let fingerprint: string | null = null;
    let previewReady = false, overlayVisible = false;
    try {
      const next = currentDocument();
      overlayVisible = !!hasVisibleSliceOverlay(next.workspace);
      if (next.source.field.kind === "expressions") {
        const result = sampleSelectedSlice(next, normalAxis, coordinate);
        if (hasVisibleSliceOverlay(next.workspace)) {
          const plane = sampleSliceOverlayVectorPlane(next, result);
          setOverlayVectorPlanes({ [next.workspace.selectedLayer]: plane });
          setOverlayVectorArrows({ [next.workspace.selectedLayer]:
            sliceOverlayArrowsFromPlane(result, plane) });
        }
        if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorSamples({
          [next.workspace.selectedLayer]: [] });
        setSlice(result);
        previewReady = true;
        if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe));
        setDocument(next); return;
      }
      const refs = next.source.field.references, bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
        throw new Error("Scientific slices require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      if (isChunked(opened.source.manifestJson)) {
        const channel = next.workspace?.sliceChannel ?? "component";
        const tiled = JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3";
        const samples = await bridge.previewVectorSamples({ fingerprint, datasetId: refs[0].datasetId,
          components: componentNames(next), selection: { kind: channel === "component" ? "slice" :
            tiled ? "source-stencil-slice" : "stencil-slice", normalAxis,
            fixedIndex: sourceIndex(next, normalAxis, coordinate) } });
        const scientific = { manifestJson: opened.source.manifestJson, fingerprint, samples };
        const result = cachedVerifiedVectorField3DSlice(next, normalAxis, coordinate, channel, scientific);
        if (hasVisibleSliceOverlay(next.workspace)) {
          const arrowSamples = samples.selection.kind === "slice" ? samples :
            await bridge.previewVectorSamples({ fingerprint, datasetId: refs[0].datasetId,
              components: componentNames(next), selection: { kind: "slice", normalAxis,
                fixedIndex: sourceIndex(next, normalAxis, coordinate) } });
          const plane = sampleSliceOverlayVectorPlane(next, result,
            { manifestJson: opened.source.manifestJson, fingerprint, samples: arrowSamples });
          setOverlayVectorPlanes({ [next.workspace.selectedLayer]: plane });
          setOverlayVectorArrows({ [next.workspace.selectedLayer]:
            sliceOverlayArrowsFromPlane(result, plane) });
          setOverlayVectorSamples({ [next.workspace.selectedLayer]: arrowSamples.components.map(part =>
            ({ name: part.name, sampleSha256: part.sampleSha256 })) });
        }
        setSlice(result);
        previewReady = true;
        if (next.workspace?.probe) {
          const position = next.workspace.probe;
          const probeSamples = await bridge.previewVectorSamples({ fingerprint, datasetId: refs[0].datasetId,
            components: componentNames(next), selection: { kind: "probe",
              indices: position.map((value, axis) => sourceIndex(next, axis, value)) as [number, number, number] } });
          setProbeArtifact(sampleVectorField3DSparseProbe(next, position,
            { manifestJson: opened.source.manifestJson, fingerprint, samples: probeSamples }));
        }
        setDocument(next); return;
      }
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
      const result = sampleSelectedSlice(next, normalAxis, coordinate, scientific);
      if (hasVisibleSliceOverlay(next.workspace)) {
        const plane = sampleSliceOverlayVectorPlane(next, result, scientific);
        setOverlayVectorPlanes({ [next.workspace.selectedLayer]: plane });
        setOverlayVectorArrows({ [next.workspace.selectedLayer]:
          sliceOverlayArrowsFromPlane(result, plane) });
      }
      if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorSamples({
        [next.workspace.selectedLayer]: volumes.map(part =>
          ({ name: part.component, sampleSha256: part.sampleSha256 })) });
      setSlice(result);
      previewReady = true;
      if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe,
        scientific));
      setDocument(next);
    } catch (cause) { previewReady = false; setSlice(null); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setOverlayVectorSamples({});
      setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (previewReady && overlayVisible)
        setOverlayReadGeneration(value => value + 1);
      setBusy(false); }
  };
  const previewLinkedViews = async (requested?: VectorField3DDocument) => {
    if (busy || lineBusy || overlayReading) return;
    const epoch = ++previewEpoch.current;
    setSeedProposal(null);
    setBusy(true); setArtifact(null); setSlice(null); setLinkedSlices({});
    setOverlayVectorArrows({}); setOverlayVectorPlanes({}); setOverlayVectorSamples({});
    setOverlayReadGeneration(0); setVerifiedScalarOverlay(null); setVerifiedComplexOverlay(null);
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    let fingerprint: string | null = null;
    let previewReady = false, overlayVisible = false;
    try {
      const next = requested ?? currentDocument();
      overlayVisible = !!hasVisibleSliceOverlay(next.workspace);
      const make = (scientific?: Parameters<typeof sampleVectorField3DSlice>[3]) => ({
        xy: sampleSelectedSlice(next, 2, next.workspace!.sliceCoordinates[2], scientific),
        xz: sampleSelectedSlice(next, 1, next.workspace!.sliceCoordinates[1], scientific),
        yz: sampleSelectedSlice(next, 0, next.workspace!.sliceCoordinates[0], scientific),
      });
      if (next.source.field.kind === "expressions") {
        const arrows = sampleVectorField3DArrows(next), views = make();
        const point = next.workspace?.probe ? sampleVectorField3DProbe(next, next.workspace.probe) : null;
        if (hasVisibleSliceOverlay(next.workspace)) {
          const planes = { xy: sampleSliceOverlayVectorPlane(next, views.xy),
            xz: sampleSliceOverlayVectorPlane(next, views.xz),
            yz: sampleSliceOverlayVectorPlane(next, views.yz) };
          setOverlayVectorPlanes(planes);
          setOverlayVectorArrows({
            xy: sliceOverlayArrowsFromPlane(views.xy, planes.xy),
            xz: sliceOverlayArrowsFromPlane(views.xz, planes.xz),
            yz: sliceOverlayArrowsFromPlane(views.yz, planes.yz) });
        }
        if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorSamples({
          xy: [], xz: [], yz: [] });
        setArtifact(arrows); setLinkedSlices(views); setProbeArtifact(point); setDocument(next);
        previewReady = true;
        return;
      }
      const refs = next.source.field.references, bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
        throw new Error("Linked scientific views require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      if (isChunked(opened.source.manifestJson)) {
        const channel = next.workspace?.sliceChannel ?? "component";
        const tiled = JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3";
        const axes = [2, 1, 0] as const;
        const slices = await Promise.all(axes.map(async axis => {
          const coordinate = next.workspace!.sliceCoordinates[axis];
          const samples = await bridge.previewVectorSamples({ fingerprint: fingerprint!, datasetId: refs[0].datasetId,
            components: componentNames(next), selection: { kind: channel === "component" ? "slice" :
              tiled ? "source-stencil-slice" : "stencil-slice", normalAxis: axis,
              fixedIndex: sourceIndex(next, axis, coordinate) } });
          const scientific = { manifestJson: opened.source.manifestJson, fingerprint: fingerprint!, samples };
          const slice = cachedVerifiedVectorField3DSlice(next, axis, coordinate, channel, scientific);
          const arrowSamples = hasVisibleSliceOverlay(next.workspace) && samples.selection.kind !== "slice" ?
            await bridge.previewVectorSamples({ fingerprint: fingerprint!, datasetId: refs[0].datasetId,
              components: componentNames(next), selection: { kind: "slice", normalAxis: axis,
                fixedIndex: sourceIndex(next, axis, coordinate) } }) : samples;
          const plane = hasVisibleSliceOverlay(next.workspace) ? sampleSliceOverlayVectorPlane(next,
            slice, { manifestJson: opened.source.manifestJson, fingerprint: fingerprint!,
              samples: arrowSamples }) : null;
          return { slice, plane, samples: arrowSamples.components.map(part =>
            ({ name: part.name, sampleSha256: part.sampleSha256 })),
            arrows: plane ? sliceOverlayArrowsFromPlane(slice, plane) : [] };
        }));
        if (epoch !== previewEpoch.current) return;
        setLinkedSlices({ xy: slices[0]!.slice, xz: slices[1]!.slice, yz: slices[2]!.slice });
        if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorArrows({
          xy: slices[0]!.arrows, xz: slices[1]!.arrows, yz: slices[2]!.arrows });
        if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorPlanes({
          xy: slices[0]!.plane!, xz: slices[1]!.plane!, yz: slices[2]!.plane! });
        if (hasVisibleSliceOverlay(next.workspace)) setOverlayVectorSamples({
          xy: slices[0]!.samples, xz: slices[1]!.samples, yz: slices[2]!.samples });
        setDocument(next);
        if (next.workspace?.probe) {
          const position = next.workspace.probe;
          const samples = await bridge.previewVectorSamples({ fingerprint, datasetId: refs[0].datasetId,
            components: componentNames(next), selection: { kind: "probe",
              indices: position.map((value, axis) => sourceIndex(next, axis, value)) as [number, number, number] } });
          if (epoch === previewEpoch.current) setProbeArtifact(sampleVectorField3DSparseProbe(next, position,
            { manifestJson: opened.source.manifestJson, fingerprint, samples }));
        }
        const { artifact: arrows } = await previewVerifiedVectorField3D(next,
          opened.source.manifestJson, fingerprint, bridge, initial => {
            if (epoch === previewEpoch.current) setArtifact(initial.artifact);
          }, () => new Promise(resolve => setTimeout(resolve, 120)));
        if (epoch === previewEpoch.current) setArtifact(arrows);
        previewReady = true;
        return;
      }
      const { artifact: arrows, volumes } = await previewVerifiedVectorField3D(next,
        opened.source.manifestJson, fingerprint, bridge, initial => {
          if (epoch === previewEpoch.current) { setArtifact(initial.artifact); setDocument(next); }
        }, () => new Promise(resolve => setTimeout(resolve, 120)));
      if (epoch !== previewEpoch.current) return;
      const scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
      const views = make(scientific);
      const point = next.workspace?.probe ? sampleVectorField3DProbe(next, next.workspace.probe,
        scientific) : null;
      if (hasVisibleSliceOverlay(next.workspace)) {
        const planes = { xy: sampleSliceOverlayVectorPlane(next, views.xy, scientific),
          xz: sampleSliceOverlayVectorPlane(next, views.xz, scientific),
          yz: sampleSliceOverlayVectorPlane(next, views.yz, scientific) };
        setOverlayVectorPlanes(planes);
        setOverlayVectorArrows({
          xy: sliceOverlayArrowsFromPlane(views.xy, planes.xy),
          xz: sliceOverlayArrowsFromPlane(views.xz, planes.xz),
          yz: sliceOverlayArrowsFromPlane(views.yz, planes.yz) });
      }
      if (hasVisibleSliceOverlay(next.workspace)) {
        const samples = volumes.map(part => ({ name: part.component,
          sampleSha256: part.sampleSha256 }));
        setOverlayVectorSamples({ xy: samples, xz: samples, yz: samples });
      }
      setArtifact(arrows); setLinkedSlices(views); setProbeArtifact(point); setDocument(next);
      previewReady = true;
    } catch (cause) { if (epoch === previewEpoch.current) {
      setArtifact(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setOverlayVectorSamples({});
      setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (previewReady && epoch === previewEpoch.current && overlayVisible)
        setOverlayReadGeneration(value => value + 1);
      setBusy(false); }
  };
  useEffect(() => {
    if (!initialDocument?.workspace ||
        !hasVisibleSliceOverlay(initialDocument.workspace) &&
        !focusRequestsSlice(initialDocument)) return;
    if (initialDocument.workspace.layout === "split" || initialDocument.workspace.layout === "quad")
      void previewLinkedViews(initialDocument);
    else if (["xy", "xz", "yz"].includes(initialDocument.workspace.selectedLayer))
      void previewSlice();
  }, []);
  useEffect(() => {
    if (!reopenPreview || !hasVisibleSliceOverlay(workspace) &&
        !focusRequestsSlice(document)) return;
    if (workspace.layout === "split" || workspace.layout === "quad") void previewLinkedViews();
    else if (["xy", "xz", "yz"].includes(workspace.selectedLayer)) void previewSlice();
  }, [reopenPreview]);
  const verifyProbe = async (next: VectorField3DDocument,
    position: readonly [number, number, number]) => {
    if (busy || lineBusy || overlayReading) return;
    const epoch = ++probeEpoch.current;
    setBusy(true); setProbeArtifact(null); setDifferential(null); setError("");
    let fingerprint: string | null = null;
    try {
      if (next.source.field.kind === "expressions") {
        const value = sampleVectorField3DProbe(next, position);
        if (epoch === probeEpoch.current) setProbeArtifact(value);
        return;
      }
      const refs = next.source.field.references, bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
        throw new Error("Scientific probes require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      if (isChunked(opened.source.manifestJson)) {
        const samples = await bridge.previewVectorSamples({ fingerprint, datasetId: refs[0].datasetId,
          components: componentNames(next), selection: { kind: "probe",
            indices: position.map((value, axis) => sourceIndex(next, axis, value)) as [number, number, number] } });
        const value = sampleVectorField3DSparseProbe(next, position,
          { manifestJson: opened.source.manifestJson, fingerprint, samples });
        if (epoch === probeEpoch.current) setProbeArtifact(value);
        return;
      }
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const value = sampleVectorField3DProbe(next, position,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes });
      if (epoch === probeEpoch.current) setProbeArtifact(value);
    } catch (cause) { if (epoch === probeEpoch.current) {
      setArtifact(null); setSlice(null); setLinkedSlices({});
      setDifferential(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (epoch === probeEpoch.current) setBusy(false); }
  };
  const analyzeDifferential = async (saved?: AnalysisResultEnvelope) => {
    if (busy || lineBusy) return;
    const recordedPosition = saved?.provenance.operation.parameters.position;
    const position = saved ? Array.isArray(recordedPosition) && recordedPosition.length === 3 &&
      recordedPosition.every(value => typeof value === "number" && Number.isFinite(value)) ?
      recordedPosition as unknown as [number, number, number] : null : workspace.probe;
    if (!position) { setError("Select a valid saved probe position."); return; }
    const epoch = ++probeEpoch.current, started = performance.now();
    setBusy(true); setDifferential(null); setPointResultId(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      const accept = (result: VectorField3DDifferentialArtifact) => {
        if (result.status !== "ready") throw new TypeError("Point calculus is unavailable at this probe.");
        if (saved) reverifyVectorField3DPointResult(saved, next, result);
        const record = saved ?? createVectorField3DPointResult(next, result, performance.now() - started);
        if (epoch === probeEpoch.current) {
          const view = next.workspace ?? defaultVectorField3DWorkspace(next.source);
          setDocument(reviseVectorField3DWorkspace(next, { ...view,
            probe: [...position] as [number, number, number] }));
          setDifferential(result); setPointResultId(saved || onSavePointResult ? record.resultId : null);
          if (!saved) onSavePointResult?.(next, record);
        }
      };
      if (next.source.field.kind === "expressions") {
        const result = analyzeVectorField3DDifferential(next, position);
        accept(result);
        return;
      }
      const refs = next.source.field.references, bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference)
        throw new Error("Scientific derived analysis requires the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      if (JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3") {
        if (!bridge.previewVectorSamples)
          throw new Error("Source-grid calculus requires the desktop tile verifier.");
        const samples = await bridge.previewVectorSamples({ fingerprint,
          datasetId: refs[0].datasetId, components: componentNames(next),
          selection: { kind: "source-stencil-probe", indices: position.map((value, axis) =>
            sourceIndex(next, axis, value)) as [number, number, number] } });
        const result = analyzeVectorField3DDifferential(next, position,
          { manifestJson: opened.source.manifestJson, fingerprint, samples });
        accept(result);
        return;
      }
      if (!bridge.previewVectorVolume)
        throw new Error("Scientific derived analysis requires the desktop source verifier.");
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const result = analyzeVectorField3DDifferential(next, position,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes });
      accept(result);
    } catch (cause) { if (epoch === probeEpoch.current) {
      setArtifact(null); setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setProbeArtifact(null);
      setEquilibriumSearch(null); setSelectedEquilibrium(null);
      setDifferential(null);
      setPointResultId(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (epoch === probeEpoch.current) setBusy(false); }
  };
  const selectProbe = async (position: readonly [number, number, number]) => {
    if (busy || lineBusy || overlayReading) return;
    setSeedProposal(null);
    try {
      const next = currentDocument();
      if (!scientificPointWithinBounds(position, next.source.axes))
        throw new RangeError("Probe is outside the field domain.");
      if (next.source.field.kind === "scientific-bundle" && position.some((coordinate, axis) =>
        !vectorField3DSliceCoordinates(next, axis as 0 | 1 | 2).some(sample =>
          Math.abs(sample - coordinate) < 1e-9)))
        throw new RangeError("Choose a physical coordinate on the bounded verified sample lattice.");
      const view = next.workspace ?? defaultVectorField3DWorkspace(next.source);
      const revised = reviseVectorField3DWorkspace(next,
        { ...view, probe: [...position] as [number, number, number],
          sliceCoordinates: view.viewsLinked ? [...position] as [number, number, number] :
            view.sliceCoordinates });
      if (slice && (slice.normalAxis === undefined ||
          Math.abs(slice.fixedCoordinate - position[slice.normalAxis]) > 1e-9 ||
          slice.source.structuralHash !== revised.identity.structuralHash)) setSlice(null);
      setDocument(revised); setProbeArtifact(null); setDifferential(null); setError("");
      changeLinkedProbe({ point: [...position] as [number, number, number],
        units: document.source.axes.map(axis => axis.unit) as [string, string, string] });
      if (multiView) await previewLinkedViews(revised);
      else await verifyProbe(revised, position);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const sendAnalyticLine = (component: "p" | "q" | "r" | "speed", varyingAxis: 0 | 1 | 2,
    point: readonly [number, number, number]) => {
    try {
      const next = currentDocument();
      if (next.identity.structuralHash !== document.identity.structuralHash)
        throw new Error("Preview the current formula before sending its line to Graphs.");
      const line = sampleVectorField3DAnalyticLine(next, component, varyingAxis, point);
      if (!onAddAnalyticLine) throw new Error("Graph authoring is unavailable.");
      onAddAnalyticLine(line);
      setError(""); setRunStatus(`Sent ${line.finiteCount} finite analytic line samples to Graphs.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const sendDerivedLine = async (sourceSlice: VectorField3DSliceArtifact,
    varyingAxis: 0 | 1 | 2, profileFixedCoordinate: number) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      const next = currentDocument();
      const preview = createVectorField3DDerivedLine(next, sourceSlice, varyingAxis,
        profileFixedCoordinate);
      const fresh = await reverifyVectorField3DDerivedLine(preview.origin);
      if (!onAddDerivedLine) throw new Error("Graph authoring is unavailable.");
      onAddDerivedLine(fresh);
      setRunStatus(`Sent ${fresh.rows.length} verified ${fresh.origin.operation} samples to Graphs.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLineBusy(false); }
  };
  const sendLinkedLine = async (line: LinkedOverlayLineProfile,
    profile: VectorField3DLinkedLineProfile, samples: readonly OverlaySampleDigest[]) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onAddLinkedOverlayLine) throw new TypeError("Graph authoring is unavailable.");
      const pair = linkedOverlayGraphPair(document, profile, line, samples,
        !document.workspace?.scalarOverlay?.visible && document.workspace?.complexOverlay?.visible ?
          `${document.workspace.complexOverlay.title} ${document.workspace.complexOverlay.mode}` :
          document.workspace?.scalarOverlay?.title ?? "Scalar field");
      await reverifyLinkedOverlayGraphPair(pair[0].origin, pair[1].origin);
      onAddLinkedOverlayLine(pair);
      setRunStatus(`Sent ${line.rows.length} aligned vector and ${
        pair[1].origin.series} samples to Graphs.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLineBusy(false); }
  };
  const sendLinkedRegion = async (region: VectorField3DOverlayRegion,
    summary: OverlayRegionSummary, vectorSamples: readonly OverlaySampleDigest[],
    overlaySamples: readonly OverlaySampleDigest[]) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onAddLinkedOverlayLine) throw new TypeError("Graph authoring is unavailable.");
      const pair = linkedOverlayRegionGraphPair(document, region, summary,
        vectorSamples, overlaySamples,
        !document.workspace?.scalarOverlay?.visible && document.workspace?.complexOverlay?.visible ?
          `${document.workspace.complexOverlay.title} ${document.workspace.complexOverlay.mode}` :
          document.workspace?.scalarOverlay?.title ?? "Scalar field");
      await reverifyLinkedOverlayRegionGraphPair(pair[0].origin, pair[1].origin);
      onAddLinkedOverlayLine(pair);
      setRunStatus("Sent 17 aligned region mean samples per field to Graphs.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLineBusy(false); }
  };
  const sendCombinedRegion = async (region: VectorField3DOverlayRegion,
    inspection: CombinedRegionInspection, vectorSamples: readonly OverlaySampleDigest[],
    scalarSampleSha256: string, realSampleSha256: string,
    imaginarySampleSha256: string, profileAxis: 0 | 1 = 0) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onAddLinkedOverlayLine) throw new TypeError("Graph authoring is unavailable.");
      const group = profileAxis === 1 ?
        linkedCombinedRegionGraphs(document, region, inspection, vectorSamples,
          scalarSampleSha256, realSampleSha256, imaginarySampleSha256, 1) :
        await (async () => {
          const derived = await verifiedCombinedDerivedRegionProfiles(document, region);
          return linkedCombinedRegionGraphsWithCurl(document, region, inspection,
            vectorSamples, scalarSampleSha256, realSampleSha256, imaginarySampleSha256,
            { ...derived.divergence, samples: derived.samples }, derived.curlMagnitude);
        })();
      const session = createCombinedRegionVerificationSession();
      const statuses = await Promise.all(group.map(series =>
        checkCombinedRegionGraphSeries(series.origin, undefined, session)));
      if (statuses.some(status => status !== "current"))
        throw new TypeError(`Combined region source checks: ${statuses.join(", ")}.`);
      onAddLinkedOverlayLine(group);
      setRunStatus(profileAxis === 1 ?
        "Sent vector speed, scalar Q, complex magnitude and phase row profiles to Graphs." :
        "Sent vector speed, scalar Q, complex magnitude, phase, divergence and curl magnitude profiles to Graphs.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLineBusy(false); }
  };
  const publishCombinedRegion = async (region: VectorField3DOverlayRegion,
    inspection: CombinedRegionInspection, vectorSamples: readonly OverlaySampleDigest[],
    scalarSampleSha256: string, realSampleSha256: string,
    imaginarySampleSha256: string) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onSaveRegionResult) throw new TypeError("Project result saving is unavailable.");
      const derived = await verifiedCombinedDerivedRegionProfiles(document, region);
      const result = createCombinedVectorField3DRegionResultWithCurl(document,
        region, { ...inspection.summary,
          divergence: { count: derived.divergence.count, gaps: derived.divergence.gaps,
            mean: derived.divergence.mean, min: derived.divergence.min,
            max: derived.divergence.max },
          divergenceUnit: derived.divergence.unit,
          curlMagnitude: { count: derived.curlMagnitude.count,
            gaps: derived.curlMagnitude.gaps, mean: derived.curlMagnitude.mean,
            min: derived.curlMagnitude.min, max: derived.curlMagnitude.max },
          curlMagnitudeUnit: derived.curlMagnitude.unit }, vectorSamples,
        scalarSampleSha256, realSampleSha256, imaginarySampleSha256, derived.samples);
      onSaveRegionResult(document, result);
      setRunStatus("Published vector, scalar, complex, divergence and curl magnitude region statistics to Project.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause));
      throw cause; }
    finally { setLineBusy(false); }
  };
  const verifiedVectorDerivedRegion = async (region: VectorField3DOverlayRegion) => {
    const speed = await verifiedVectorRegionProfile(document, region);
    const derived = await verifiedCombinedDerivedRegionProfiles(document, region);
    return { speed, derived };
  };
  const publishVectorDerivedRegion = async (region: VectorField3DOverlayRegion) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onSaveRegionResult) throw new TypeError("Project result saving is unavailable.");
      const { speed, derived } = await verifiedVectorDerivedRegion(region);
      const result = createVectorDerivedRegionResult(document, region, {
        sampleCount: 289, vector: speed.statistics,
        divergence: { count: derived.divergence.count,
          gaps: derived.divergence.gaps, mean: derived.divergence.mean,
          min: derived.divergence.min, max: derived.divergence.max },
        curlMagnitude: { count: derived.curlMagnitude.count,
          gaps: derived.curlMagnitude.gaps, mean: derived.curlMagnitude.mean,
          min: derived.curlMagnitude.min, max: derived.curlMagnitude.max },
        vectorUnit: speed.unit, divergenceUnit: derived.divergence.unit,
        curlMagnitudeUnit: derived.curlMagnitude.unit }, speed.samples,
        derived.samples);
      onSaveRegionResult(document, result);
      setRunStatus("Published vector speed, divergence and curl magnitude region statistics to Project.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause));
      throw cause; }
    finally { setLineBusy(false); }
  };
  const sendVectorDerivedRegion = async (region: VectorField3DOverlayRegion) => {
    if (lineBusy || busy) return;
    setLineBusy(true); setError("");
    try {
      if (!onAddLinkedOverlayLine) throw new TypeError("Graph authoring is unavailable.");
      const { speed, derived } = await verifiedVectorDerivedRegion(region);
      const group = linkedVectorDerivedRegionGraphs(document, region, speed, derived);
      const session: VectorDerivedRegionVerificationSession = {};
      for (const series of group) {
        const status = await checkVectorDerivedRegionGraphSeries(series.origin,
          undefined, session);
        if (status !== "current") throw new TypeError(`Vector-derived ${series.origin.series} source ${status}.`);
      }
      onAddLinkedOverlayLine(group);
      setRunStatus("Sent 17 aligned vector speed, divergence and curl magnitude column means to Graphs.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause));
      throw cause; }
    finally { setLineBusy(false); }
  };
  const addSeed = () => {
    try {
      const position = seedDraft.map(Number) as [number, number, number];
      if (seedDraft.some(value => !value.trim()) ||
          !scientificPointWithinBounds(position, document.source.axes))
        throw new TypeError("Seed must lie inside all three axis bounds.");
      const nextIndex = document.source.seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      editSeedSource([...document.source.seeds, { id: `seed-${nextIndex}`, position }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const addSeedPreset = (kind: "ring-8" | "line-5" | "plane-9") => {
    try {
      const positions = vectorField3DSeedPreset(document.source, kind);
      if (document.source.seeds.length + positions.length > 32)
        throw new RangeError(`The ${positions.length}-seed batch exceeds the 32-seed limit.`);
      let nextIndex = document.source.seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      const prefix = kind.split("-")[0]!;
      const used = new Set(document.source.seeds.map(seed => seed.group ?? "manual"));
      let groupNumber = 1;
      while (used.has(`${prefix}-${groupNumber}`)) groupNumber++;
      const group = `${prefix}-${groupNumber}`;
      const seeds = positions.map(position => ({ id: `seed-${nextIndex++}`, position, group }));
      editSeedSource([...document.source.seeds, ...seeds]);
      setRunStatus(`Added ${seeds.length} seeds in ${group}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const addSpatialSeedPattern = () => {
    try {
      if (spatialCenter.some(value => !value.trim()) || !spatialRadius.trim() ||
          !spatialCount.trim() ||
          (spatialSeedKind === "random" && !spatialRandomSeed.trim()))
        throw new TypeError("Enter a physical center, radius, count, and random seed when needed.");
      const count = Number(spatialCount);
      if (!Number.isInteger(count) || count < 1 || count > 32)
        throw new RangeError("Spatial seed count must be between 1 and 32.");
      if (document.source.seeds.length + count > 32)
        throw new RangeError(`The ${count}-seed batch exceeds the 32-seed limit.`);
      const positions = vectorField3DSpatialSeedPattern(document.source, {
        kind: spatialSeedKind, center: spatialCenter.map(Number) as [number, number, number],
        radius: Number(spatialRadius), count,
        randomSeed: spatialSeedKind === "random" ? Number(spatialRandomSeed) : 1 });
      let nextIndex = document.source.seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      const used = new Set(document.source.seeds.map(seed => seed.group ?? "manual"));
      let groupNumber = 1;
      while (used.has(`${spatialSeedKind}-${groupNumber}`)) groupNumber++;
      const group = `${spatialSeedKind}-${groupNumber}`;
      const seeds = positions.map(position => ({ id: `seed-${nextIndex++}`, position, group }));
      editSeedSource([...document.source.seeds, ...seeds]);
      setRunStatus(`Added ${seeds.length} ${spatialSeedKind} seeds in ${group}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const toggleSliceSeedPlacement = (layer: SeedSliceLayer) => {
    if (busy || lineBusy || document.source.seeds.length >= 32) return;
    setSeedPlacementLayer(current => current === layer ? null : layer);
    setSeedPlacement3DPlane(null);
    setSeedProposal(null); setError("");
  };
  const select3DSeedPlane = (plane: SeedPlane3D | null) => {
    if (busy || lineBusy || document.source.seeds.length >= 32) return;
    setSeedPlacement3DPlane(plane); setSeedPlacementLayer(null);
    setSeedProposal(null); setError("");
  };
  const set3DSeedCoordinate = (axis: 0 | 1 | 2, coordinate: number) => {
    try {
      const bounds = document.source.axes[axis]!;
      if (coordinate < bounds.min || coordinate > bounds.max)
        throw new RangeError("The selected seed plane is outside the field domain.");
      setDocument(current => {
        const view = current.workspace ?? defaultVectorField3DWorkspace(current.source);
        const sliceCoordinates = [...view.sliceCoordinates] as [number, number, number];
        sliceCoordinates[axis] = coordinate;
        return reviseVectorField3DWorkspace(current, { ...view, sliceCoordinates });
      });
      setSeedProposal(null); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const propose3DSeed = (point: readonly [number, number, number] | null,
    reason: string | null) => {
    try {
      const plane = seedPlacement3DPlane;
      if (!plane) return;
      if (document.source.seeds.length >= 32) throw new RangeError("The 32-seed limit is full.");
      if (artifact?.source.revision !== document.identity.revision ||
          artifact.source.structuralHash !== document.identity.structuralHash)
        throw new TypeError("Preview the current 3D field before placing a seed.");
      if (!point || !scientificPointWithinBounds(point, document.source.axes))
        throw new RangeError(reason === "parallel" ? "Camera ray misses the selected seed plane." :
          reason === "behind" ? "The selected seed plane is behind the camera." :
            "Seed is outside the field domain on the selected plane.");
      const fixedCoordinate = workspace.sliceCoordinates[seedPlaneNormalAxis(plane)];
      if (point[seedPlaneNormalAxis(plane)] !== fixedCoordinate)
        throw new TypeError("The selected seed plane changed; click again.");
      setSeedProposal({ view: "3d", layer: plane, position: point, fixedCoordinate,
        sourceRevision: artifact.source.revision,
        sourceStructuralHash: artifact.source.structuralHash });
      setError("");
    } catch (cause) {
      setSeedProposal(null); setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const proposeSliceSeed = (layer: SeedSliceLayer, shown: VectorField3DSliceArtifact,
    position: readonly [number, number, number] | null) => {
    try {
      if (seedPlacementLayer !== layer) return;
      if (!position) throw new RangeError("Click inside the displayed slice plot to place a seed.");
      if (document.source.seeds.length >= 32) throw new RangeError("The 32-seed limit is full.");
      if (shown.source.structuralHash !== document.identity.structuralHash ||
          shown.source.revision !== document.identity.revision ||
          shown.normalAxis !== (layer === "xy" ? 2 : layer === "xz" ? 1 : 0))
        throw new TypeError("Preview the current slice before placing a seed.");
      if (!scientificPointWithinBounds(position, document.source.axes))
        throw new RangeError("Seed is outside the field domain.");
      setSeedProposal({ view: "slice", layer, position, fixedCoordinate: shown.fixedCoordinate,
        sourceRevision: shown.source.revision,
        sourceStructuralHash: shown.source.structuralHash });
      setError("");
    } catch (cause) {
      setSeedProposal(null); setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const addProposedSeed = () => {
    try {
      if (!seedProposal) throw new TypeError("Propose a seed before adding it.");
      if (document.source.seeds.length >= 32) throw new RangeError("The 32-seed limit is full.");
      if (seedProposal.view === "slice") {
        const shown = multiView ? linkedSlices[seedProposal.layer] : slice;
        if (!shown || shown.source.revision !== seedProposal.sourceRevision ||
            shown.source.structuralHash !== seedProposal.sourceStructuralHash ||
            shown.normalAxis !== seedPlaneNormalAxis(seedProposal.layer) ||
            shown.fixedCoordinate !== seedProposal.fixedCoordinate)
          throw new TypeError("The slice changed; propose the seed again from the current preview.");
      } else if (!artifact || seedPlacement3DPlane !== seedProposal.layer ||
          artifact.source.revision !== seedProposal.sourceRevision ||
          artifact.source.structuralHash !== seedProposal.sourceStructuralHash ||
          workspace.sliceCoordinates[seedPlaneNormalAxis(seedProposal.layer)] !==
            seedProposal.fixedCoordinate) {
        throw new TypeError("The 3D seed plane or preview changed; propose the seed again.");
      }
      if (document.identity.revision !== seedProposal.sourceRevision ||
          document.identity.structuralHash !== seedProposal.sourceStructuralHash)
        throw new TypeError("The field changed; propose the seed again.");
      if (!scientificPointWithinBounds(seedProposal.position, document.source.axes))
        throw new RangeError("Seed is outside the field domain.");
      let group: string | undefined;
      if (seedGroupChoice === "") {
        const used = new Set(document.source.seeds.map(seed => seed.group ?? "manual"));
        const prefix = seedProposal.view === "3d" ? "3d" : "slice";
        let groupNumber = 1;
        while (used.has(`${prefix}-${groupNumber}`)) groupNumber++;
        group = `${prefix}-${groupNumber}`;
      } else if (seedGroupChoice !== "manual") {
        if (!seedGroups.some(item => item.id === seedGroupChoice))
          throw new TypeError("Choose an existing seed group or create a new one.");
        group = seedGroupChoice;
      }
      const nextIndex = document.source.seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      editSeedSource([...document.source.seeds,
        { id: `seed-${nextIndex}`, position: seedProposal.position, ...(group ? { group } : {}) }]);
      setRunStatus(`Added seed-${nextIndex} at the ${seedProposal.layer.toUpperCase()} ${seedProposal.view} point` +
        ` to ${group ?? "manual"}. Preview the revised field before tracing it.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const runTrajectories = async () => {
    if (busy || lineBusy) return;
    cancelRequested.current = false;
    setSeedPlacementLayer(null); setSeedPlacement3DPlane(null); setSeedProposal(null);
    setBusy(true); setBusyAction("trajectory"); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    setRunStatus("Verifying source and preparing trajectory worker…");
    setSeedProgress({ completed: 0, total: document.source.seeds.length });
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (!next.source.seeds.length) throw new TypeError("Add at least one seed before integrating trajectories.");
      const solve = (scientific?: { manifestJson: string; fingerprint: string;
        volumes?: Parameters<typeof integrateVectorField3DScientificTrajectories>[3]; tileMode?: boolean }) =>
        new Promise<VectorField3DTrajectoryArtifact>((resolve, reject) => {
          if (cancelRequested.current) { reject(new Error("Trajectory integration cancelled.")); return; }
          const worker = new Worker(new URL("./trajectoryWorker.ts", import.meta.url), { type: "module" });
          let finished = false;
          const finish = () => { finished = true; worker.terminate(); cancelRunRef.current = null; };
          cancelRunRef.current = () => { finish(); reject(new Error("Trajectory integration cancelled.")); };
          worker.onmessage = (event: MessageEvent<{ tileRequest: { indices: [number, number, number] } } |
            { progress: { completed: number; total: number;
            seedId: string; stopReason: string } } | { ok: true; result: VectorField3DTrajectoryArtifact } |
            { ok: false; error: string }>) => {
            if ("tileRequest" in event.data) {
              const refs = next.source.field.kind === "scientific-bundle" ? next.source.field.references : null;
              if (!scientific || !refs || !window.scientificScenes?.previewVectorTile) {
                finish(); reject(new Error("Verified source tile service is unavailable.")); return;
              }
              void window.scientificScenes.previewVectorTile({ fingerprint: scientific.fingerprint,
                datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
                  [string, string, string], indices: event.data.tileRequest.indices })
                .then(tile => { if (!finished) worker.postMessage({ tileResponse: tile },
                  tileTransferBuffers([tile])); })
                .catch(cause => { if (!finished) { finish(); reject(cause); } });
              return;
            }
            if ("progress" in event.data) {
              const { completed, total, seedId, stopReason } = event.data.progress;
              setSeedProgress({ completed, total });
              setRunStatus(`Integrated ${completed}/${total} seeds · ${seedId}: ${stopReason}. Cancel is available.`);
              return;
            }
            finish(); if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error));
          };
          worker.onerror = (event) => { finish(); reject(new Error(event.message || "Trajectory worker failed.")); };
          setRunStatus("Integrating trajectories… Cancel is available.");
          worker.postMessage({ document: next, direction, scientific });
        });
      if (next.source.field.kind === "expressions") {
        const arrows = sampleVectorField3DArrows(next);
        const paths = await solve();
        if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe));
        setDocument(next); setArtifact(arrows); setTrajectories(paths); return;
      }
      const refs = next.source.field.references;
      const bridge = window.scientificScenes;
      if (!bridge?.openGraphDatasetReference)
        throw new Error("Scientific vector trajectories require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
      if (JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3") {
        if (!bridge.previewVectorTile) throw new Error("Verified source tile service is unavailable.");
        const paths = await solve({ manifestJson: opened.source.manifestJson, fingerprint,
          tileMode: true });
        if (cancelRequested.current) throw new Error("Trajectory integration cancelled.");
        const pathOnly: VectorField3DArrowArtifact = { source: paths.source,
          verifiedSamples: null, density: next.source.display.density, evaluated: 0, accepted: 0,
          rejected: 0, stationary: 0, arrows: [],
          coordinateUnits: next.source.axes.map(axis => axis.unit) as [string, string, string],
          componentUnits: next.source.field.componentUnits, timeUnit: next.source.timeUnit,
          magnitudeScale: next.source.display.magnitudeScale, colorBy: next.source.display.colorBy };
        setDocument(next); setArtifact(pathOnly); setTrajectories(paths);
        return;
      }
      if (!bridge.previewVectorVolume)
        throw new Error("Scientific vector trajectories require the desktop source verifier.");
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      if (cancelRequested.current) throw new Error("Trajectory integration cancelled.");
      const arrows = sampleVectorField3DScientificArrows(next, opened.source.manifestJson, fingerprint, volumes);
      const paths = await solve({ manifestJson: opened.source.manifestJson, fingerprint, volumes });
      if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes }));
      setDocument(next); setArtifact(arrows); setTrajectories(paths);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (cancelRequested.current) setRunStatus("Trajectory integration cancelled; no partial result was published.");
      else setError(message);
    }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null); if (!cancelRequested.current) setRunStatus(""); }
  };
  const findEquilibria = async () => {
    if (busy || lineBusy) return;
    cancelRequested.current = false;
    setBusy(true); setBusyAction("equilibrium"); setError("");
    setEquilibriumSearch(null); setSelectedEquilibrium(null);
    setRunStatus("Verifying source before bounded equilibrium search…");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      let scientific: { manifestJson: string; fingerprint: string;
        volumes?: Parameters<typeof integrateVectorField3DScientificTrajectories>[3];
        tileMode?: boolean } | undefined;
      if (next.source.field.kind === "scientific-bundle") {
        const refs = next.source.field.references, bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference)
          throw new Error("Equilibrium search requires the desktop source verifier.");
        const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
          sceneFingerprint: refs[0].sceneFingerprint });
        if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        if (JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3") {
          if (!bridge.previewVectorTiles) throw new Error("Verified source tile service is unavailable.");
          scientific = { manifestJson: opened.source.manifestJson, fingerprint, tileMode: true };
        } else {
          if (!bridge.previewVectorVolume)
            throw new Error("Equilibrium search requires the desktop source verifier.");
          const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
            components: refs.map(ref => ref.component) as [string, string, string] });
          scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
        }
      }
      if (cancelRequested.current) throw new Error("Equilibrium search cancelled.");
      const result = await new Promise<VectorField3DEquilibriumSearch>((resolve, reject) => {
        const workerStarted = performance.now();
        let tileRoundTripMs = 0, rendererForwardMs = 0;
        const worker = new Worker(new URL("./equilibriumWorker.ts", import.meta.url), { type: "module" });
        let finished = false;
        const finish = () => { finished = true; worker.terminate(); cancelRunRef.current = null; };
        cancelRunRef.current = () => { finish(); reject(new Error("Equilibrium search cancelled.")); };
        worker.onmessage = (event: MessageEvent<{ tileRequests: { indices: readonly (readonly [number, number, number])[] } } |
          { ok: true; result: VectorField3DEquilibriumSearch } |
          { ok: false; error: string }>) => {
          if ("tileRequests" in event.data) {
            const refs = next.source.field.kind === "scientific-bundle" ? next.source.field.references : null;
            if (!scientific || !refs || !window.scientificScenes?.previewVectorTiles) {
              finish(); reject(new Error("Verified source tile service is unavailable.")); return;
            }
            const readStarted = performance.now();
            void window.scientificScenes.previewVectorTiles({ fingerprint: scientific.fingerprint,
              datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
                [string, string, string], indicesBatch: event.data.tileRequests.indices.map(point =>
                  [...point] as [number, number, number]) })
              .then(tiles => {
                tileRoundTripMs += performance.now() - readStarted;
                if (!finished) {
                  const forwardStarted = performance.now();
                  worker.postMessage({ tilesResponse: tiles }, tileTransferBuffers(tiles));
                  rendererForwardMs += performance.now() - forwardStarted;
                }
              })
              .catch(cause => { if (!finished) { finish(); reject(cause); } });
            return;
          }
          const totalWorkerWallMs = performance.now() - workerStarted;
          finish();
          if (event.data.ok) {
            const profile = event.data.result.profile;
            resolve(profile ? { ...event.data.result, profile: { ...profile,
              tileRoundTripMs, rendererForwardMs, totalWorkerWallMs } } : event.data.result);
          } else reject(new Error(event.data.error));
        };
        worker.onerror = event => { finish(); reject(new Error(event.message || "Equilibrium worker failed.")); };
        setRunStatus("Searching bounded seeds… Cancel is available.");
        worker.postMessage({ document: next, scientific });
      });
      if (cancelRequested.current) return;
      setDocument(next); setEquilibriumSearch(result);
    } catch (cause) {
      if (!cancelRequested.current) {
        setArtifact(null); setSlice(null); setLinkedSlices({}); setProbeArtifact(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null);
      setRunStatus(cancelRequested.current ? "Equilibrium search cancelled; no partial result was published." : "");
    }
  };
  const runIsosurface = async () => {
    if (busy || lineBusy) return;
    const level = Number(isosurfaceLevelDraft);
    if (!Number.isFinite(level) || level < 0 || level > 1e9 || !isosurfaceLevelDraft.trim()) {
      setError("Enter a nonnegative finite speed level."); return;
    }
    cancelRequested.current = false;
    setBusy(true); setBusyAction("isosurface"); setError(""); setIsosurface(null);
    setRunStatus("Verifying source before bounded isosurface extraction…");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      const view = next.workspace ?? defaultVectorField3DWorkspace(next.source);
      let scientific: { manifestJson: string; fingerprint: string;
        volumes?: Parameters<typeof integrateVectorField3DScientificTrajectories>[3];
        tileMode?: boolean } | undefined;
      if (next.source.field.kind === "scientific-bundle") {
        const refs = next.source.field.references, bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference)
          throw new Error("Isosurface extraction requires the desktop source verifier.");
        const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
          sceneFingerprint: refs[0].sceneFingerprint });
        if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        if (JSON.parse(opened.source.manifestJson).schema === "scientific-scene/v3") {
          if (!bridge.previewVectorTiles) throw new Error("Verified source tile service is unavailable.");
          scientific = { manifestJson: opened.source.manifestJson, fingerprint, tileMode: true };
        } else {
          if (!bridge.previewVectorVolume) throw new Error("Verified source volume service is unavailable.");
          const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
            components: refs.map(ref => ref.component) as [string, string, string] });
          scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
        }
      }
      if (cancelRequested.current) throw new Error("Isosurface extraction cancelled.");
      const result = await new Promise<VectorField3DIsosurface>((resolve, reject) => {
        const worker = new Worker(new URL("./isosurfaceWorker.ts", import.meta.url), { type: "module" });
        let finished = false;
        const finish = () => { finished = true; worker.terminate(); cancelRunRef.current = null; };
        cancelRunRef.current = () => { finish(); reject(new Error("Isosurface extraction cancelled.")); };
        worker.onmessage = (event: MessageEvent<{ tileRequests: { indices: readonly (readonly [number, number, number])[] } } |
          { ok: true; result: VectorField3DIsosurface } | { ok: false; error: string }>) => {
          if ("tileRequests" in event.data) {
            const refs = next.source.field.kind === "scientific-bundle" ? next.source.field.references : null;
            if (!scientific || !refs || !window.scientificScenes?.previewVectorTiles) {
              finish(); reject(new Error("Verified source tile service is unavailable.")); return;
            }
            void window.scientificScenes.previewVectorTiles({ fingerprint: scientific.fingerprint,
              datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
                [string, string, string], indicesBatch: event.data.tileRequests.indices.map(point =>
                  [...point] as [number, number, number]) })
              .then(tiles => { if (!finished) worker.postMessage({ tilesResponse: tiles },
                tileTransferBuffers(tiles)); })
              .catch(cause => { if (!finished) { finish(); reject(cause); } });
            return;
          }
          finish();
          if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error));
        };
        worker.onerror = event => { finish(); reject(new Error(event.message || "Isosurface worker failed.")); };
        setRunStatus("Extracting speed isosurface… Cancel is available.");
        worker.postMessage({ document: next, clipBounds: view.clipBounds, level,
          triangleBudget: view.isosurfaceTriangleBudget, scientific });
      });
      if (cancelRequested.current) return;
      setDocument(reviseVectorField3DWorkspace(next, { ...view, isosurfaceLevel: level }));
      setIsosurface(result);
      if (next.source.field.kind === "expressions") setArtifact(sampleVectorField3DArrows(next));
      else {
        const componentUnits = next.source.field.componentUnits;
        setArtifact(previous => previous ?? {
          source: result.source, verifiedSamples: null, density: next.source.display.density,
          evaluated: 0, accepted: 0, rejected: 0, stationary: 0, arrows: [],
          coordinateUnits: next.source.axes.map(axis => axis.unit) as [string, string, string],
          componentUnits, timeUnit: next.source.timeUnit,
          magnitudeScale: next.source.display.magnitudeScale, colorBy: next.source.display.colorBy });
      }
    } catch (cause) {
      if (!cancelRequested.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null);
      setRunStatus(cancelRequested.current ? "Isosurface extraction cancelled; no partial mesh was published." : "");
    }
  };
  const downloadIsosurface = () => {
    if (!isosurface) return;
    try {
      const content = exportVectorField3DIsosurfaceGltf(isosurface);
      const url = URL.createObjectURL(new Blob([content], { type: "model/gltf+json" }));
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = "math3d-speed-isosurface.gltf";
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const saveEquilibrium = async (index: number) => {
    const candidate = equilibriumSearch?.candidates[index];
    if (!candidate || !equilibriumSearch || busy || lineBusy ||
        candidate.residual > equilibriumSearch.residualTolerance) return;
    setBusy(true);
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.identity.structuralHash !== equilibriumSearch.source.structuralHash ||
          next.identity.revision !== equilibriumSearch.source.revision)
        throw new Error("Field source changed since the search. Search again before saving.");
      if (next.source.field.kind === "scientific-bundle") {
        const refs = next.source.field.references, bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
          throw new Error("Saving this equilibrium requires the desktop source verifier.");
        const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
          sceneFingerprint: refs[0].sceneFingerprint });
        if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string] });
        verifyVectorField3DVolumes(next, opened.source.manifestJson, fingerprint, volumes);
      }
      const view = next.workspace ?? defaultVectorField3DWorkspace(next.source);
      if (view.equilibriumConstructions.length >= 32) throw new Error("The 32-construction budget is full.");
      if (view.equilibriumConstructions.some(item => item.sourceStructuralHash === next.identity.structuralHash &&
          Math.hypot(...item.position.map((value, axis) => value - candidate.position[axis])) < 1e-4))
        throw new Error("This equilibrium is already saved for this field revision.");
      const id = `equilibrium-${crypto.randomUUID()}`;
      setDocument(reviseVectorField3DWorkspace(next, { ...view,
        equilibriumConstructions: [...view.equilibriumConstructions, { id,
          position: candidate.position, residual: candidate.residual,
          classification: candidate.classification, sourceRevision: next.identity.revision,
          sourceStructuralHash: next.identity.structuralHash, sourceHash: equilibriumSearch.sourceHash }] }));
      setSaveStatus("Equilibrium linked to this field revision. Save the Project to retain it.");
      setError("");
    } catch (cause) {
      setEquilibriumSearch(null); setSelectedEquilibrium(null); setIsosurface(null);
      setArtifact(null); setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setProbeArtifact(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false);
    }
  };
  const save = () => {
    try { const current = currentDocument();
      const next = reviseVectorField3DWorkspace(current, {
        ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
        linkedProbe });
      onSaveDocument?.(next);
      try { window.localStorage.setItem(storageKey, serializeVectorField3DDocument(next)); }
      catch (cause) { if (!onSaveDocument) throw cause; }
      setDocument(next); setError("");
      setSaveStatus(onSaveDocument ? "Field included in the Project workspace. Save the Project to retain it in the library." : "Field saved locally."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const reopen = () => {
    try { const saved = savedDocument ?? window.localStorage.getItem(storageKey);
      if (!saved) throw new Error("No saved 3D vector-field document.");
      const next = typeof saved === "string" ? parseVectorField3DDocument(saved) :
        parseVectorField3DDocument(serializeVectorField3DDocument(saved));
      probeEpoch.current++;
      setDocument(next); setExpressions(next.source.field.kind === "expressions" ?
        next.source.field.components.map(component => component.source) as [string, string, string] : ["-y", "x", "0"]);
      onLinkedProbeChange?.(next.workspace?.linkedProbe ?? null);
      setSeedDraft(next.source.axes.map(axis => String((axis.min + axis.max) / 2)) as [string, string, string]);
      setSpatialCenter(next.source.axes.map(axis => String((axis.min + axis.max) / 2)) as
        [string, string, string]);
      setSpatialRadius(String(Math.min(...next.source.axes.map(axis => axis.max - axis.min)) / 4));
      setSpatialCount("8"); setSpatialRandomSeed("1"); setSpatialSeedKind("shell");
      setSeedPlacementLayer(null); setSeedPlacement3DPlane(null);
      setSeedProposal(null); setSeedGroupChoice("manual");
      setGroupNameDrafts({}); setSeedHistory({ undo: [], redo: [] });
      setArtifact(null); setSlice(null); setLinkedSlices({}); setOverlayVectorArrows({}); setOverlayVectorPlanes({});
      setOverlayVectorSamples({});
      setProbeArtifact(null);
      setDifferential(null);
      setEquilibriumSearch(null); setSelectedEquilibrium(null); setIsosurface(null);
      setTrajectories(null); setError(""); setRunStatus(""); setSaveStatus("");
      setOverlayReadGeneration(0); setVerifiedScalarOverlay(null); setVerifiedComplexOverlay(null);
      setOverlayRecheck(value => value + 1);
      if (next.source.field.kind === "scientific-bundle") {
        setSourceVerification("pending");
        if (hasVisibleSliceOverlay(next.workspace) &&
            (next.workspace.layout === "split" || next.workspace.layout === "quad" ||
              ["xy", "xz", "yz"].includes(next.workspace.selectedLayer)))
          setReopenPreview(value => value + 1);
        else void render(next);
      } }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return createPortal(<div className="scientific-field-explorer" role="region"
    aria-label="Scientific Field Explorer" data-testid="scientific-field-explorer"
    data-layout={workspace.layout} data-field-layer={fieldLayer ?
      fieldLayer.source.paired ? "complex" : "scalar" : undefined}>
    <div
      ref={dialogRef} onKeyDown={onDialogKey}
      className="graph2d-scientific-import vector-field3d-editor scientific-field-explorer-content"
      data-testid="vector-field-3d-editor"
      onPointerDown={event => event.stopPropagation()}>
    <header className="scientific-field-explorer-header"><div><h3>Scientific Field Explorer · {
      fieldLayer?.metadata.title ?? document.metadata.title}</h3>
    <p>{fieldLayer ? "Verified scalar or complex field layer." :
      "Independent 3D document · bounded arrows and adaptive numerical trajectories."}</p>
    <details className="scientific-field-explorer-overlay-guide" aria-label="Field overlay guide">
      <summary>How the field overlays relate</summary>
      <p>With a scalar heatmap and Phase contours selected, background color shows a real
        scalar field, contour lines show equal phase from a complex field, and white
        arrows show the vector field.
        Each layer is sampled at the same physical x, y, z position.</p>
      <p>Built-in example: choose Swirling flow and an XY slice, add Quadratic potential with
        “Show this scalar as overlay on vector slices”, then add Complex wave with
        “Show this complex field as overlay on vector slices”. In the right Inspector,
        choose Phase contours and Preview slice.</p>
      <p>Quadratic potential is Q = x² + y² + z² (V). Complex wave is a separate,
        dimensionless complex field with magnitude A = exp[−(x² + y²)/18 − z²/12]
        and phase φ = 1.3x + 0.8y + 0.65z + 0.25 sin(y). Numerically, on z = 0,
        |f| = exp(−Q/18), but Q alone does not determine the phase.
        Field Explorer aligns and verifies the sources; it does not calculate one from the other.</p>
      <p>A selected rectangle can send six aligned column means to Graphs and publish
        six compact statistics to the Project. Divergence measures local spreading;
        curl magnitude measures local rotation. Both use 1/s and the same verified
        neighboring vector samples, independently of Q and Complex wave. Empty
        source coverage stays a gap, and Project reopen recalculates both derived values.</p>
    </details>
    {seedProgress && <label role="status">Trajectory seeds {seedProgress.completed}/{seedProgress.total}
      <progress aria-label="Trajectory seed progress" value={seedProgress.completed}
        max={Math.max(1, seedProgress.total)} /></label>}</div>
    <div><button type="button" disabled={busy} onClick={() =>
      setLayout(workspace.layout === "viewer-focus" ? "three-pane" : "viewer-focus")}>{
        workspace.layout === "viewer-focus" ? "Show three panes" : "Focus viewer"}</button>
    {" "}<button type="button" disabled={busy} aria-pressed={workspace.layout === "split"}
      onClick={() => setLayout("split")}>Split views</button>
    {" "}<button type="button" disabled={busy} aria-pressed={workspace.layout === "quad"}
      onClick={() => setLayout("quad")}>Quad views</button>
    {multiView && <button type="button" disabled={busy} onClick={() => setLayout("three-pane")}>Single view</button>}
    {" "}<button type="button" aria-controls="field-equilibria" onClick={() => {
      equilibriaButtonRef.current?.scrollIntoView({ block: "center" });
      equilibriaButtonRef.current?.focus({ preventScroll: true });
    }}>Equilibria</button>
    {" "}<button type="button" onClick={onClose}>Back to Graphs</button></div></header>
    <div className="scientific-field-explorer-controls" aria-label="Field controls">
    <section className="scientific-field-explorer-library" aria-label="Dataset library"
      data-testid="scientific-field-explorer-library">
      <h4>Dataset library</h4>
      <p>Project scene references and saved fields. Scene sources are checked when a Project opens; field values are verified when viewed. Save the Project to keep additions.</p>
      {onOpenLibraryExample && <section aria-label="Built-in scientific scenes"
        className="scientific-field-explorer-examples">
        <h5>Built-in scenes</h5>
        <div>{BUILTIN_EXPLORER_SCENES.map(example => <button type="button" key={example.id}
          disabled={busy || libraryBusy} onClick={() => onOpenLibraryExample(example.id)}>
          {example.title}<small>{example.detail}</small></button>)}</div>
      </section>}
      {fieldLayer && <button type="button" onClick={onReturnToVectorLayer}>
        Back to vector layer</button>}
      {fieldLayer && scalarOverlayChoices.some(item =>
        item.source.reference.id === fieldLayer.source.reference.id) &&
        <button type="button" disabled={busy}
          onClick={() => setScalarOverlay(fieldLayer.source.reference.id)}>
          Show this scalar as overlay on vector slices</button>}
      {fieldLayer?.source.paired && <button type="button" disabled={busy}
        onClick={() => setComplexOverlay(fieldLayer.source.reference.id)}>
        Show this complex field as overlay on vector slices</button>}
      {onBrowseLibraryScene && <button type="button" disabled={busy || libraryBusy}
        onClick={onBrowseLibraryScene}>Browse scientific scene</button>}
      {libraryBusy && <p role="status">Reading scene metadata…</p>}
      {libraryError && <p role="alert">{libraryError}</p>}
      <label>Search datasets <input type="search" aria-label="Search dataset library"
        value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /></label>
      <small role="status">{matchingLibraryEntries.length} of {libraryEntries.length} datasets</small>
      {matchingLibraryEntries.length ? <ul>{matchingLibraryEntries.map(entry => <li key={entry.id}
        aria-current={entry.documentId === fieldLayer?.identity.id ? "true" : undefined}>
        <div><strong>{entry.title}</strong> <span>{entry.kind} · {entry.sceneKey ?
          `Project scene: ${entry.sceneTitle}` : entry.origin}</span></div>
        <small>{entry.datasetId} · {entry.shape.join(" × ")} · {entry.unit}</small>
        <small role={entry.sourceStatus === "missing" || entry.sourceStatus === "changed" ||
          entry.sourceStatus === "error" ? "alert" : undefined}>{entry.reason}</small>
        <button type="button" disabled={busy || libraryBusy || !entry.ready || currentLibraryVector(entry)}
          onClick={() => onOpenLibraryEntry?.(entry)} aria-label={`Open ${entry.title} from dataset library`}>
          {currentLibraryVector(entry) ? "Current field" :
            entry.kind === "vector" ? "Open in Explorer" : "Open verified layer"}</button>
        {entry.sceneKey && <><button type="button" disabled={libraryBusy}
          onClick={() => onRecheckLibraryScene?.(entry)}
          aria-label={`Recheck ${entry.sceneTitle} source`}>Recheck source</button>
          <button type="button" disabled={libraryBusy}
            onClick={() => onRemoveLibraryScene?.(entry)}
            aria-label={`Remove ${entry.sceneTitle} from Project library`}>Remove scene</button></>}
      </li>)}</ul> : <p>{libraryEntries.length ? "No datasets match your search." :
        "Open a scientific scene or save a field in the Project to add it here."}</p>}
    </section>
    <fieldset className="vector-field3d-form" disabled={busy || overlayReading}>
    {document.source.field.kind === "expressions" ?
      <div role="group" aria-label="Vector components" className="vector-field3d-controls">
        {(["P(x,y,z)", "Q(x,y,z)", "R(x,y,z)"] as const).map((label, index) => <label key={label}>
          {label} ({document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : ""})
          <input aria-label={label} value={expressions[index]} onChange={event => {
            probeEpoch.current++;
            const next = [...expressions] as [string, string, string]; next[index] = event.target.value;
            setExpressions(next); setArtifact(null); setSlice(null); setProbeArtifact(null);
            setDifferential(null); setEquilibriumSearch(null); setSelectedEquilibrium(null);
            setIsosurface(null);
            setTrajectories(null); setError(""); }} />
        </label>)}
      </div> : <p>Manifest-linked bundle: {document.source.field.references[0].sceneId} · dataset
        {" "}{document.source.field.references[0].datasetId} · components
        {" "}{document.source.field.references.map(ref => `${ref.component} (${ref.resourceSha256.slice(0, 12)}…)`).join(" / ")}
        {" "}· shape {document.source.field.references[0].shape.join(" × ")}</p>}
    <div role="group" aria-label="Arrow sampling controls" className="vector-field3d-controls">
      {([0, 1, 2] as const).map(axis => <label key={axis}>Density {document.source.axes[axis].label}
        <input type="number" min={2} max={16} aria-label={`Density ${document.source.axes[axis].label}`}
          value={document.source.display.density[axis]} onChange={event => {
            const density = [...document.source.display.density] as [number, number, number];
            density[axis] = Number(event.target.value);
            try { updateSource({ ...document.source, display: { ...document.source.display, density } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} />
      </label>)}
      <label>Arrow scale <input type="number" min="0.01" max="100" step="0.1"
        aria-label="Arrow scale" value={document.source.display.magnitudeScale} onChange={event => {
          try { updateSource({ ...document.source, display: { ...document.source.display,
            magnitudeScale: Number(event.target.value) } }); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        }} /></label>
      <label>Color by <select aria-label="Color by" value={document.source.display.colorBy}
        onChange={event => updateSource({ ...document.source, display: { ...document.source.display,
          colorBy: event.target.value as VectorField3DSource["display"]["colorBy"] } })}>
        <option value="speed">Magnitude</option><option value="p">P</option><option value="q">Q</option>
        <option value="r">R</option></select></label>
    </div>
    <p>Domain: {document.source.axes.map(axis => `${axis.label} ${axis.min}…${axis.max} ${axis.unit}`).join(" · ")}.
      Maximum {document.source.display.maxGlyphs} glyphs.</p>
    <section aria-label="3D trajectory seeds">
      <h4>Trajectory seeds ({document.source.seeds.length}/32)</h4>
      <div className="vector-field3d-seed-history" role="group" aria-label="Seed edit history">
        <button type="button" disabled={busy || lineBusy || !seedHistory.undo.length}
          onClick={() => stepSeedHistory("undo")}>Undo seed edit</button>{" "}
        <button type="button" disabled={busy || lineBusy || !seedHistory.redo.length}
          onClick={() => stepSeedHistory("redo")}>Redo seed edit</button>
      </div>
      <div className="vector-field3d-controls">
        {([0, 1, 2] as const).map(axis => <label key={axis}>Seed {document.source.axes[axis].label}
          <input type="number" step="any" aria-label={`Seed ${document.source.axes[axis].label}`}
            value={seedDraft[axis]} onChange={event => { const next = [...seedDraft] as [string, string, string];
              next[axis] = event.target.value; setSeedDraft(next); }} />
        </label>)}
        <button type="button" disabled={busy || document.source.seeds.length >= 32} onClick={addSeed}>
          Add seed</button>
      </div>
      <div className="vector-field3d-seed-presets">
        <button type="button" disabled={busy || document.source.seeds.length >= 32}
          onClick={() => addSeedPreset("ring-8")}>Add ring (8)</button>{" "}
        <button type="button" disabled={busy || document.source.seeds.length >= 32}
          onClick={() => addSeedPreset("line-5")}>Add line (5)</button>{" "}
        <button type="button" disabled={busy || document.source.seeds.length >= 32}
          onClick={() => addSeedPreset("plane-9")}>Add plane grid (9)</button>
      </div>
      <details aria-label="3D spatial seed patterns" className="vector-field3d-spatial-seeds">
        <summary>Sphere, shell, and seeded random patterns</summary>
        <div className="vector-field3d-controls">
          <label>Pattern <select aria-label="Spatial seed pattern" value={spatialSeedKind}
            disabled={busy || lineBusy}
            onChange={event => setSpatialSeedKind(event.target.value as
              VectorField3DSpatialSeedPattern["kind"])}>
            <option value="sphere">Sphere volume</option>
            <option value="shell">Spherical shell</option>
            <option value="random">Seeded random volume</option>
          </select></label>
          {([0, 1, 2] as const).map(axis => <label key={axis}>
            Center {document.source.axes[axis].label} ({document.source.axes[axis].unit})
            <input type="number" step="any" aria-label={`Spatial center ${document.source.axes[axis].label}`}
              value={spatialCenter[axis]} disabled={busy || lineBusy}
              onChange={event => { const next = [...spatialCenter] as [string, string, string];
                next[axis] = event.target.value; setSpatialCenter(next); }} />
          </label>)}
          <label>Radius ({document.source.axes[0].unit})
            <input type="number" step="any" min="0" aria-label="Spatial seed radius"
              value={spatialRadius} disabled={busy || lineBusy}
              onChange={event => setSpatialRadius(event.target.value)} /></label>
          <label>Count
            <input type="number" step="1" min="1" max="32" aria-label="Spatial seed count"
              value={spatialCount} disabled={busy || lineBusy}
              onChange={event => setSpatialCount(event.target.value)} /></label>
          <label>Random seed
            <input type="number" step="1" min="0" max="4294967295"
              aria-label="Spatial random seed" value={spatialRandomSeed}
              disabled={busy || lineBusy || spatialSeedKind !== "random"}
              onChange={event => setSpatialRandomSeed(event.target.value)} /></label>
        </div>
        <button type="button" disabled={busy || lineBusy || document.source.seeds.length >= 32}
          onClick={addSpatialSeedPattern}>Add spatial seed group</button>
        <p>The complete sphere must fit inside all three physical axis bounds.</p>
      </details>
      {(seedPlacementLayer || seedPlacement3DPlane) && !seedProposal &&
        <p role="status" data-testid="vector-field3d-seed-placement-hint">
        {seedPlacement3DPlane ? `Click the 3D view on the ${seedPlacement3DPlane.toUpperCase()} plane` :
          `Click inside the ${seedPlacementLayer!.toUpperCase()} slice map`}
        {" "}to propose a physical seed point.
      </p>}
      {seedProposal && <section className="vector-field3d-seed-proposal"
        aria-label="Proposed field seed" data-testid="vector-field3d-seed-proposal">
        <p>Proposed {seedProposal.view === "3d" ? "3D" : "slice"} {seedProposal.layer.toUpperCase()} seed:
          {" "}{seedProposal.position.map((value, axis) =>
          `${document.source.axes[axis].label} = ${value.toPrecision(8)} ${document.source.axes[axis].unit}`)
          .join(" · ")}.</p>
        <label>Seed group <select aria-label="Proposed seed group" value={seedGroupChoice}
          onChange={event => setSeedGroupChoice(event.target.value)}>
          <option value="manual">Manual</option>
          {seedGroups.filter(group => group.id !== "manual").map(group =>
            <option key={group.id} value={group.id}>
              {seedGroupStyle(document, group.id).name}</option>)}
          <option value="">New {seedProposal.view === "3d" ? "3D" : "slice"} group</option>
        </select></label>
        <button type="button" disabled={busy || document.source.seeds.length >= 32}
          onClick={addProposedSeed}>Add proposed seed</button>{" "}
        <button type="button" onClick={() => setSeedProposal(null)}>Cancel proposal</button>
      </section>}
      {seedGroups.map(group => <section key={group.id} className="vector-field3d-seed-group"
        aria-label={`Seed group ${group.id}`}>
        <label><input type="checkbox" aria-label={`Show ${group.id} seed group`}
          checked={!workspace.hiddenSeedGroups.includes(group.id)}
          style={{ accentColor: seedGroupStyle(document, group.id).color }}
          onChange={event => { const show = event.currentTarget.checked;
            editSeedWorkspace(view => {
            const hiddenSeedGroups = show ?
              view.hiddenSeedGroups.filter(id => id !== group.id) :
              [...view.hiddenSeedGroups, group.id];
            return { ...view, hiddenSeedGroups };
          }); }} />Show {seedGroupStyle(document, group.id).name} ({group.seeds.length})</label>
        <div className="vector-field3d-seed-group-tools">
          <label>Name <input type="text" maxLength={64} aria-label={`Name ${group.id} seed group`}
            disabled={busy || lineBusy}
            value={groupNameDrafts[group.id] ?? seedGroupStyle(document, group.id).name}
            onChange={event => setGroupNameDrafts(current =>
              ({ ...current, [group.id]: event.target.value }))} /></label>
          <button type="button" disabled={busy || lineBusy}
            onClick={() => renameSeedGroup(group.id)}>Rename {group.id} group</button>
          <label>Color <input type="color" aria-label={`Color ${group.id} seed group`}
            disabled={busy || lineBusy} value={seedGroupStyle(document, group.id).color}
            onChange={event => changeSeedGroupStyle(group.id,
              seedGroupStyle(document, group.id).name, event.target.value)} /></label>
          <button type="button" disabled={busy || lineBusy}
            onClick={() => editSeedSource(document.source.seeds.filter(seed =>
              (seed.group ?? "manual") !== group.id))}>Delete {group.id} group</button>
        </div>
        <ul>{group.seeds.map(seed => <li key={seed.id}>
          {seed.id}: ({seed.position.join(", ")}) {document.source.axes[0].unit}
          {" "}<button type="button" disabled={busy} aria-label={`Remove ${seed.id}`}
            onClick={() => editSeedSource(document.source.seeds.filter(item =>
              item.id !== seed.id))}>Remove</button>
        </li>)}</ul>
      </section>)}
    </section>
    <details open aria-label="3D trajectory solver">
      <summary>Advanced trajectory solver</summary>
      <div className="vector-field3d-controls">
        <label>Trajectory mode <select aria-label="Trajectory mode"
          value={document.source.solver.mode ?? "time-trajectory"}
          onChange={event => updateSource({ ...document.source, solver: { ...document.source.solver,
            mode: event.target.value as "time-trajectory" | "normalized-field-line" } })}>
          <option value="time-trajectory">Time trajectory · dx/dt = F</option>
          <option value="normalized-field-line">Normalized field line · dx/ds = F/|F|</option>
        </select></label>
        <label>Method <select aria-label="Trajectory solver method"
          value={document.source.solver.method ?? "rk4-step-doubling"}
          onChange={event => updateSource({ ...document.source, solver: { ...document.source.solver,
            method: event.target.value as "rk4-step-doubling" | "rk45" } })}>
          <option value="rk4-step-doubling">RK4 step doubling</option>
          <option value="rk45">Dormand–Prince RK45</option>
        </select></label>
        <label>Tolerance preset <select aria-label="Trajectory tolerance preset"
          value={vectorField3DTolerancePresetOf(document.source.solver)}
          onChange={event => {
            const name = event.target.value as VectorField3DTolerancePreset | "custom";
            if (name === "custom") return;
            updateSource({ ...document.source, solver: { ...document.source.solver,
              ...vectorField3DTolerancePresets[name] } });
          }}>
          <option value="exploratory">Exploratory · 1e-4</option>
          <option value="balanced">Balanced · 1e-6</option>
          <option value="precise">Precise · 1e-8</option>
          <option value="custom">Custom</option>
        </select></label>
        <label>Direction <select aria-label="Trajectory direction" value={direction}
          onChange={event => { setDirection(event.target.value as "forward" | "backward");
            setTrajectories(null); }}>
          <option value="forward">Forward</option><option value="backward">Backward</option>
        </select></label>
        <label>Max steps <input type="number" min={1} max={100000} aria-label="Trajectory max steps"
          value={document.source.solver.maxSteps} onChange={event => {
            try { updateSource({ ...document.source, solver: { ...document.source.solver,
              maxSteps: Number(event.target.value) } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} /></label>
        {(document.source.solver.mode ?? "time-trajectory") === "time-trajectory" ?
        <label>Max time ({document.source.timeUnit}) <input type="number" min="0.000001" step="any"
          aria-label="Trajectory max time" value={document.source.solver.maxTime} onChange={event => {
            try { updateSource({ ...document.source, solver: { ...document.source.solver,
              maxTime: Number(event.target.value) } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} /></label> :
        <label>Max line length ({document.source.axes[0].unit})
          <input type="number" min="0.000001" step="any" aria-label="Max normalized line length"
            value={document.source.solver.maxLineLength ?? 20} onChange={event => {
              try { updateSource({ ...document.source, solver: { ...document.source.solver,
                maxLineLength: Number(event.target.value) } }); }
              catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            }} /></label>}
        <label>Max arc length ({document.source.axes[0].unit})
          <input type="number" min="0.000001" step="any" aria-label="Trajectory max arc length"
            value={document.source.solver.maxArcLength ?? 1e6} onChange={event => {
              try { updateSource({ ...document.source, solver: { ...document.source.solver,
                maxArcLength: Number(event.target.value) } }); }
              catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
            }} /></label>
        <label>Absolute tolerance <input type="number" min="1e-12" max="1" step="any"
          aria-label="Trajectory absolute tolerance" value={document.source.solver.absoluteTolerance}
          onChange={event => {
            try { updateSource({ ...document.source, solver: { ...document.source.solver,
              absoluteTolerance: Number(event.target.value) } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} /></label>
        <label>Relative tolerance <input type="number" min="1e-12" max="1" step="any"
          aria-label="Trajectory relative tolerance" value={document.source.solver.relativeTolerance}
          onChange={event => {
            try { updateSource({ ...document.source, solver: { ...document.source.solver,
              relativeTolerance: Number(event.target.value) } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} /></label>
      </div>
      <p>{document.source.solver.method === "rk45" ? "Adaptive Dormand–Prince RK45" :
        "Adaptive RK4 step doubling"} · at most 2,048 attempted steps per seed in this preview.
        {" "}{document.source.solver.mode === "normalized-field-line" ?
          "Line parameter measures distance, not physical time." : "Time parameter uses the field time unit."}
        {" "}The tolerance controls integration error, not the resolution of sampled source data.
        {" "}Each trace reports its stop reason; a numerical trace does not certify topology.</p>
    </details>
    </fieldset>
    <VectorField3DGraphLinePanel key={document.identity.structuralHash} document={document}
      probe={workspace.probe} disabled={busy}
      onBusyChange={setLineBusy} onAddGraphLine={onAddGraphLine} isGraphLineImported={isGraphLineImported} />
    </div>
    <div className="scientific-field-explorer-inspector" aria-label="Field status and actions">
    {fieldLayer && <section className="scientific-explorer-field-inspector">
      <h4>{fieldLayer.metadata.title}</h4>
      <p>{fieldLayer.source.paired ? "Complex pair" : "Scalar field"} ·
        {" "}{fieldLayer.source.reference.shape.join(" × ")} source grid ·
        {" "}{fieldLayer.source.quantity.name} ({fieldLayer.source.quantity.unit}).</p>
      <p>Source {fieldLayer.source.reference.sceneId} · dataset
        {" "}{fieldLayer.source.reference.datasetId}.</p>
      <p>Displayed samples are verified again on each opening.</p>
      <button type="button" onClick={onOpenFieldDetails}>Open field controls</button>
    </section>}
    <h4>Inspector</h4>
    <p>Selected layer: {workspace.selectedLayer === "arrows" ? "3D arrows" :
      workspace.selectedLayer === "trajectories" ? "Trajectories" : `${workspace.selectedLayer.toUpperCase()} slice`}.</p>
    <nav aria-label="Field layers" className="vector-field3d-layers">
      {([ ["arrows", "3D arrows"], ["trajectories", "Trajectories"],
        ["xy", "XY slice"], ["xz", "XZ slice"], ["yz", "YZ slice"] ] as const).map(([layer, label]) =>
        <button type="button" key={layer} disabled={busy} aria-pressed={workspace.selectedLayer === layer}
          onClick={() => selectLayer(layer)}>{label}</button>)}
    </nav>
    {sliceControlAxis !== undefined && <section aria-label="Slice controls"
      className="scientific-explorer-slice-workflow">
      <h5>{normalAxis === undefined ? "XY" : workspace.selectedLayer.toUpperCase()} slice</h5>
      <label>Fixed {document.source.axes[sliceControlAxis].label} ({document.source.axes[sliceControlAxis].unit})
        {document.source.field.kind === "scientific-bundle" ?
          <select aria-label="Slice physical coordinate" value={workspace.sliceCoordinates[sliceControlAxis]}
            disabled={busy} onChange={event => setSliceCoordinate(sliceControlAxis, Number(event.target.value))}>
            {sliceOptions.map(coordinate => <option key={coordinate} value={coordinate}>
              {coordinate} {document.source.axes[sliceControlAxis].unit}</option>)}
          </select> : <input type="number" step="any" aria-label="Slice physical coordinate"
            min={document.source.axes[sliceControlAxis].min} max={document.source.axes[sliceControlAxis].max}
            value={workspace.sliceCoordinates[sliceControlAxis]} disabled={busy}
            onChange={event => { try { setSliceCoordinate(sliceControlAxis, Number(event.target.value)); }
              catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }} />}
      </label>
      <button type="button" disabled={busy || lineBusy} onClick={() => void (multiView ?
        previewLinkedViews() : previewSlice())}>{multiView ? "Preview all views" : "Preview slice"}</button>
      {complexOverlay && <label>Complex display <select aria-label="Complex overlay mode"
        value={complexOverlay.mode} onChange={event => setDocument(current =>
          reviseVectorField3DWorkspace(current, {
            ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
            complexOverlay: { ...complexOverlay,
              mode: event.target.value as VectorField3DComplexOverlay["mode"] },
            scalarOverlay: event.target.value !== "phase-contours" && scalarOverlay?.visible ?
              { ...scalarOverlay, visible: false } : scalarOverlay }))}>
        <option value="magnitude">Magnitude heatmap</option><option value="phase">Phase heatmap</option>
        <option value="phase-contours">Phase contours</option>
      </select></label>}
      {workspace.probe && (slice || Object.keys(linkedSlices).length > 0) &&
        <button type="button" onClick={() => dialogRef.current?.querySelector(
          '.scientific-field-explorer-viewer .vector-field3d-line-profile')?.scrollIntoView(
            { behavior: "smooth", block: "nearest" })}>Show line profile through point</button>}
    </section>}
    <section aria-label="Linked probe controls" className="scientific-explorer-linked-probe-actions">
      <h5>Linked probe</h5>
      <label><input type="checkbox" aria-label="Link slice planes to probe"
        checked={workspace.viewsLinked} disabled={busy || lineBusy}
        onChange={event => setViewsLinked(event.target.checked)} /> Link slice planes to probe</label>
      {!workspace.probe ? <button type="button" disabled={busy || lineBusy}
        onClick={() => void selectProbe(workspace.sliceCoordinates)}>Place probe at selected coordinates</button> :
        <button type="button" onClick={() => dialogRef.current?.querySelector(
          '[aria-label="Linked field probe"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Edit probe coordinates</button>}
    </section>
    <section aria-label="Cross-layer physical probe"
      className="vector-field3d-probe scientific-explorer-linked-inspector"
      data-testid="scientific-explorer-cross-layer-probe">
      <h5>Cross-layer physical probe</h5>
      <p>One physical point follows the selected dataset. Values are shown only after source verification.</p>
      <button type="button" onClick={() => changeLinkedProbe({
        point: linkedAxes.map(axis => (axis.min + axis.max) / 2) as [number, number, number],
        units: linkedUnits })}>Place at this field center</button>
      {linkedProbe && <><div className="vector-field3d-probe-coordinates">
        {([0, 1, 2] as const).map(axis => <label key={axis}>
          Linked probe {linkedAxes[axis]!.label} ({linkedProbe.units[axis]})
          <input type="number" step="any" aria-label={`Linked probe ${linkedAxes[axis]!.label}`}
            value={linkedProbe.point[axis]} onChange={event => {
              const value = Number(event.target.value);
              if (!event.target.value.trim() || !Number.isFinite(value)) return;
              const point = [...linkedProbe.point] as [number, number, number];
              point[axis] = value; changeLinkedProbe({ ...linkedProbe, point });
            }} />
        </label>)}</div>
        <p>Physical point: {linkedProbe.point.map((value, axis) =>
          `${value} ${linkedProbe.units[axis]}`).join(" · ")}.</p>
        <button type="button" onClick={() => changeLinkedProbe(null)}>Clear linked point</button>
        {!fieldLayer && <LinkedExplorerVectorProbe document={document} linkedProbe={linkedProbe} />}
        {!fieldLayer && <CombinedOverlayProbe document={document} probe={linkedProbe}
          scalarVolume={linkedProfileScalarVolume} complexVolumes={linkedRegionComplexVolumes}
          scalarStatus={scalarOverlayStatus} complexStatus={complexOverlayStatus} />}
      </>}
    </section>
    <LinkedRegionBoundsEditor region={workspace.overlayRegion}
      axes={document.source.axes} onChange={setOverlayRegion} />
    {workspace.overlayRegion?.visible && scalarOverlay?.visible && complexOverlay?.visible &&
      !visibleRegionSlice && <section aria-label="Combined field rectangle inspection"
        className="vector-field3d-probe">
        <CombinedOverlayRegionReadout document={document} region={workspace.overlayRegion}
          scalarVolume={linkedProfileScalarVolume}
          complexVolumes={linkedRegionComplexVolumes} vectorStatus={linkedVectorStatus}
          scalarStatus={scalarOverlayStatus} complexStatus={complexOverlayStatus} />
      </section>}
    <section aria-label="Display clipping box" className="vector-field3d-view-controls">
      <h5>Display clipping box</h5>
      <p>Hide samples outside these bounds. Field values, probes and saved source data stay unchanged.</p>
      <div className="vector-field3d-clip-grid">{([0, 1, 2] as const).map(axis =>
        ([0, 1] as const).map(end => <label key={`${axis}-${end}`}>
          {document.source.axes[axis].label} {end === 0 ? "min" : "max"} ({document.source.axes[axis].unit})
          <input type="number" step="any" aria-label={`Clip ${document.source.axes[axis].label} ${end === 0 ? "min" : "max"}`}
            value={workspace.clipBounds[axis][end]} disabled={busy}
            onChange={event => setClipBound(axis, end, Number(event.target.value))} />
        </label>))}</div>
      {/clip/i.test(error) && <p className="vector-field3d-clip-error">{error}</p>}
      <button type="button" disabled={busy} onClick={() => {
        setDocument(current => reviseVectorField3DWorkspace(current,
          { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
            clipBounds: current.source.axes.map(axis => [axis.min, axis.max]) as
              unknown as VectorField3DClipBounds }));
        setIsosurface(null);
        setError("");
      }}>Reset clipping</button>
      <label>3D camera preset <select aria-label="3D camera preset" value={workspace.cameraPreset}
        disabled={busy} onChange={event => setCameraPreset(event.target.value as VectorField3DCameraPreset)}>
        <option value="perspective">Perspective</option><option value="xy">Orthographic XY (look along z)</option>
        <option value="xz">Orthographic XZ (look along y)</option>
        <option value="yz">Orthographic YZ (look along x)</option>
      </select></label>
    </section>
    <section aria-label="Linked field probe" className="vector-field3d-probe">
      <h5>Linked physical-point probe</h5>
      <p>{workspace.viewsLinked ? "A selected point moves all three slice planes to its physical coordinates." :
        "Slice planes keep independent fixed coordinates; selecting a point still updates the probe."}</p>
      {workspace.probe && <>
        <div className="vector-field3d-probe-coordinates">
          {([0, 1, 2] as const).map(axis => <label key={axis}>
            Probe {document.source.axes[axis].label} ({document.source.axes[axis].unit})
            {document.source.field.kind === "scientific-bundle" ?
              <select aria-label={`Probe ${document.source.axes[axis].label}`}
                value={workspace.probe![axis]} disabled={busy || lineBusy}
                onChange={event => { const next = [...workspace.probe!] as [number, number, number];
                  next[axis] = Number(event.target.value); void selectProbe(next); }}>
                {vectorField3DSliceCoordinates(document, axis).map(coordinate =>
                  <option key={coordinate} value={coordinate}>{coordinate} {document.source.axes[axis].unit}</option>)}
              </select> : <input type="number" step="any" aria-label={`Probe ${document.source.axes[axis].label}`}
                min={document.source.axes[axis].min} max={document.source.axes[axis].max}
                value={workspace.probe![axis]} disabled={busy || lineBusy}
                onChange={event => { const next = [...workspace.probe!] as [number, number, number];
                  next[axis] = Number(event.target.value); void selectProbe(next); }} />}
          </label>)}</div>
        <div><button type="button" disabled={busy || lineBusy} onClick={() => {
          const next = currentDocument(); setDocument(next);
          void verifyProbe(next, workspace.probe!);
        }}>Reverify probe</button>{" "}<button type="button" disabled={busy || lineBusy} onClick={() => {
          setDocument(current => reviseVectorField3DWorkspace(current,
            { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), probe: null }));
          setProbeArtifact(null); setDifferential(null);
        }}>Clear probe</button></div>
        {probeArtifact && <div role="status" data-testid="vector-field3d-probe-values">
          <p>Source revision {probeArtifact.source.revision}; point {probeArtifact.position.map((value, axis) =>
            `${document.source.axes[axis].label} = ${value} ${probeArtifact.coordinateUnits[axis]}`).join(" · ")}.</p>
          <p>{probeArtifact.vector.map((value, index) =>
            `${document.source.field.kind === "scientific-bundle" ?
              document.source.field.references[index].component : ["P", "Q", "R"][index]} = ${value.toPrecision(5)} ${probeArtifact.componentUnits[index]}`).join(" · ")}.</p>
          <p>Magnitude {probeArtifact.magnitude.toPrecision(5)} {probeArtifact.componentUnits[0]}.
            {probeArtifact.sourceHash && ` Source ${probeArtifact.sourceHash}; view ${probeArtifact.viewHash}.`}</p>
          {probeArtifact.verifiedSamples && <p>{probeArtifact.verifiedSamples.map(part =>
            `${part.name}: ${part.verifiedTiles !== undefined ?
              `${part.verifiedTiles}/${part.totalTiles} source tiles` :
              part.verifiedChunks !== undefined ?
                `${part.verifiedChunks}/${part.totalChunks} source chunks` :
                "complete source resource"} verified; sample ${part.sampleSha256}`).join(" · ")}.</p>}
        </div>}
        {!probeArtifact && <p role="status">Probe values require a fresh source verification.</p>}
      </>}
    </section>
    <section aria-label="Field calculus at probe" className="vector-field3d-probe">
      <h5>Field calculus at probe</h5>
      <button type="button" disabled={!workspace.probe || busy || lineBusy}
        onClick={() => void analyzeDifferential()}>Analyze field calculus</button>
      {savedPointResults.filter(result => result.provenance.source.documentId === document.identity.id).length > 0 &&
        <div aria-label="Saved point calculus results">
          <p>Saved Project results require fresh source verification before their values are shown.</p>
          <ul>{savedPointResults.filter(result => result.provenance.source.documentId === document.identity.id)
            .map(result => <li key={result.resultId}>
              Probe {JSON.stringify(result.provenance.operation.parameters.position)} ·
              {" "}<button type="button" disabled={busy || lineBusy}
                onClick={() => void analyzeDifferential(result)}>Reverify saved Inspector result</button>
              {" "}<code>{result.resultId}</code>
            </li>)}</ul>
        </div>}
      {!workspace.probe && <p>Place a physical-point probe to analyze this field.</p>}
      {workspace.probe && !differential && <p>Run a local analysis. Scientific bundles are
        reverified before each result.</p>}
      {differential && <div role="status" data-testid="vector-field3d-differential">
        {pointResultId && <p>Project result <code>{pointResultId}</code>
          {onOpenProjectResults && <> · <button type="button" onClick={() => {
            onClose(); onOpenProjectResults(pointResultId);
          }}>Open Project result graph</button></>}
        </p>}
        <p>Approximate · {differential.method}{differential.stencilGrid === "source" ? " on the source grid" : ""} · source revision {differential.source.revision}
          {differential.sourceHash && ` · source ${differential.sourceHash}`}.</p>
        {differential.status === "ready" ? <>
          <p>Divergence {differential.divergence!.toPrecision(6)} {differential.divergenceUnit}.</p>
          <p>{differential.curl ? `Curl (${differential.curl.map(value => value.toPrecision(6)).join(", ")}) ${differential.curlUnit}.` :
            "Curl unavailable for differing coordinate units."}</p>
          <details aria-label="Jacobian and eigenvalues" data-testid="vector-field3d-eigen-panel">
            <summary>Jacobian: matrix and eigenvalues · {differential.eigenanalysis.status}</summary>
            <p>Derivative method: {differential.method}{differential.stencilGrid === "source" ?
              " on the source grid" : ""}. Local structure: {differential.localStructure ?? "unavailable"}.</p>
            {differential.jacobian && <table>
              <caption>Jacobian ∂(P, Q, R)/∂(x, y, z)</caption>
              <thead><tr><th scope="col">Component</th>{["x", "y", "z"].map(axis =>
                <th scope="col" key={axis}>∂/{axis}</th>)}</tr></thead>
              <tbody>{differential.jacobian.map((row, index) => <tr key={index}>
                <th scope="row">{["P", "Q", "R"][index]}</th>
                {row.map((value, axis) => <td key={axis}>{value.toPrecision(6)}
                  {" "}{differential.jacobianUnits[index]?.[axis]}</td>)}
              </tr>)}</tbody>
            </table>}
            {differential.eigenanalysis.eigenvalues ? <ol aria-label="Jacobian eigenvalues">
              {differential.eigenanalysis.eigenvalues.map((value, index) => <li key={index}>
                λ{index + 1} = {value.real.toPrecision(6)}
                {value.imaginary !== 0 && ` ${value.imaginary > 0 ? "+" : "−"} ${Math.abs(value.imaginary).toPrecision(6)}i`}
                {" "}{differential.eigenanalysis.unit}
              </li>)}</ol> : <p>Eigenvalues unavailable for these units.</p>}
            <p>Jacobian condition estimate: {differential.eigenanalysis.conditionEstimate?.toPrecision(4) ??
              "undefined"}. {differential.eigenanalysis.status === "uncertain" ?
              "Eigenvalues uncertain." : differential.eigenanalysis.status === "resolved" ?
                "Eigenvalues resolved at this stencil precision." : "Eigenvalues unavailable."}</p>
            {differential.eigenanalysis.diagnostics.map((message, index) =>
              <p key={index}>{message}</p>)}
          </details>
          <p>Gradient |F|: {differential.magnitudeGradient ?
            `(${differential.magnitudeGradient.map(value => value.toPrecision(5)).join(", ")}) ${differential.magnitudeGradientUnit}` :
            "unavailable at this point"}; Laplacian |F|: {differential.magnitudeLaplacian !== null ?
            `${differential.magnitudeLaplacian.toPrecision(5)} ${differential.magnitudeLaplacianUnit}` :
            "unavailable at this point"}.</p>
        </> : <p>Numerical result unavailable at this point.</p>}
        <p>{differential.evaluations} verified field evaluations.
          {" "}Stencils: {differential.stencils.map(item =>
            `${item.axis} ${item.method} (${item.coordinates.map(value => value.toPrecision(5)).join(", ")} ${item.coordinateUnit})`).join(" · ")}.</p>
        {differential.verifiedSamples && <details aria-label="Field calculus sample provenance">
          <summary>Verified calculus samples</summary>
          <ul>{differential.verifiedSamples.map(part => <li key={part.name}>{part.name}:
            {" "}<code>{part.sampleSha256}</code> · {part.verifiedTiles !== undefined ?
              `${part.verifiedTiles} of ${part.totalTiles} source tiles verified` :
              part.verifiedChunks !== undefined ?
                `${part.verifiedChunks} of ${part.totalChunks} source chunks verified` :
                "complete source resource verified"}</li>)}</ul>
        </details>}
        {differential.diagnostics.map((message, index) => <p key={index}>{message}</p>)}
      </div>}
    </section>
    <section aria-label="Speed isosurface" className="vector-field3d-probe">
      <h5>Speed isosurface · bounded extraction</h5>
      <p>Extract |F| within the physical clipping box above. The saved level and clip can be
        regenerated after Project reopen; source values are verified again.</p>
      <label>Speed level ({document.source.field.kind === "scientific-bundle" ?
        document.source.field.componentUnits[0] : document.source.field.components[0].unit})
        <input type="number" min="0" step="any" aria-label="Isosurface speed level"
          value={isosurfaceLevelDraft} disabled={busy}
          onChange={event => { setIsosurfaceLevelDraft(event.target.value);
            setIsosurface(null); }} /></label>
      <label>Triangle budget
        <input type="number" min="1" max="100000" step="1" aria-label="Isosurface triangle budget"
          value={workspace.isosurfaceTriangleBudget} disabled={busy}
          onChange={event => { try {
            setDocument(current => reviseVectorField3DWorkspace(current,
              { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
                isosurfaceTriangleBudget: Number(event.target.value) }));
            setIsosurface(null); setError("");
          } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }} /></label>
      <button type="button" disabled={busy || lineBusy} onClick={() => void runIsosurface()}>
        Extract speed isosurface</button>
      {busyAction === "isosurface" && <button type="button" onClick={() => {
        cancelRequested.current = true; cancelRunRef.current?.();
        setRunStatus("Cancelling isosurface extraction…"); }}>Cancel isosurface</button>}
      {isosurface && <div role="status" data-testid="vector-field3d-isosurface">
        <p>{isosurface.triangleCount.toLocaleString()} triangles of
          {" "}{isosurface.triangleBudget.toLocaleString()} budget ·
          {" "}{isosurface.complete ? "complete within budget" : "incomplete: triangle budget reached"} ·
          {" "}{isosurface.clipped ? "opened by the physical clipping box" :
            "no open boundary at the clipping box"}.</p>
        <p>Indexed mesh: {isosurface.vertexCount.toLocaleString()} shared vertices ·
          {" "}{isosurface.topology.connectedComponents} connected component(s) ·
          {" "}{isosurface.topology.boundaryEdgeCount} boundary edges
          {" "}({isosurface.topology.clipBoundaryEdgeCount} on clip planes) ·
          {" "}{isosurface.topology.nonManifoldEdgeCount} nonmanifold edges ·
          {" "}{isosurface.topology.watertight ? "watertight" : "open or incomplete"}.</p>
        <p>Grid {isosurface.gridShape.join(" × ")} · {isosurface.sampledPoints.toLocaleString()} verified
          {" "}or evaluated points · level {isosurface.level} {isosurface.unit} · vertex normals toward increasing speed.</p>
        <p>Physical mesh bounds: {isosurface.bounds ? isosurface.bounds.map((bounds, axis) =>
          document.source.axes[axis].label + " " + bounds[0].toPrecision(5) + "…" +
          bounds[1].toPrecision(5) + " " + document.source.axes[axis].unit).join(" · ") : "no crossing"}.</p>
        <p>Source revision {isosurface.source.revision} · structure <code>{isosurface.source.structuralHash}</code>
          {isosurface.sourceHash && <> · source <code>{isosurface.sourceHash}</code></>}.</p>
        {isosurface.verifiedTiles && <p>Verified source tiles: {isosurface.verifiedTiles.map(part =>
          part.name + " " + part.verifiedTiles + "/" + part.totalTiles + " (" + part.tileSetSha256 + ")").join(" · ")}.
          {" "}Resident cache {isosurface.residentTileBytes} bytes.</p>}
        <button type="button" disabled={isosurface.triangleCount === 0} onClick={downloadIsosurface}>
          Export mesh with provenance (.gltf)</button>
        {onPromoteIsosurface && <button type="button" disabled={isosurface.triangleCount === 0}
          onClick={() => { try { onPromoteIsosurface(document, isosurface); setError("");
            setRunStatus("Source-linked Mesh added to the Project."); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>
          Add source-linked Mesh to Project</button>}
      </div>}
    </section>
    <section id="field-equilibria" aria-label="Field equilibria" className="vector-field3d-probe">
      <h5>Equilibria · bounded search</h5>
      <p>Searches a 5×5×5 seed grid and saved seeds. Results are local candidates, never a complete count.</p>
      <button ref={equilibriaButtonRef} type="button" disabled={busy || lineBusy}
        onClick={() => void findEquilibria()}>
        Find equilibria</button>
      {equilibriumSearch && <div role="status" data-testid="vector-field3d-equilibria"
        data-equilibrium-profile={equilibriumSearch.profile ?
          JSON.stringify(equilibriumSearch.profile) : undefined}>
        <p>{equilibriumSearch.status === "budget-reached" ? "Partial scan · budget reached" :
          "Bounded scan · coverage incomplete"} · {equilibriumSearch.candidates.length} candidates ·
          {" "}{equilibriumSearch.attemptedSeeds} seeds · {equilibriumSearch.evaluations}/
          {equilibriumSearch.maxEvaluations} evaluations · {equilibriumSearch.rejectedSeeds} rejected seeds.</p>
        <p>Residual threshold {equilibriumSearch.residualTolerance.toPrecision(3)} {document.source.field.kind ===
          "scientific-bundle" ? document.source.field.componentUnits[0] :
            document.source.field.components[0].unit}. Source revision {equilibriumSearch.source.revision}
          {equilibriumSearch.sourceHash && ` · hash ${equilibriumSearch.sourceHash}`}.</p>
        {equilibriumSearch.verifiedTiles && <p>Verified source tiles: {equilibriumSearch.verifiedTiles.map(part =>
          `${part.name} ${part.verifiedTiles}/${part.totalTiles} (${part.tileSetSha256})`).join(" · ")}.
          Resident cache {equilibriumSearch.residentTileBytes} bytes.
          Batched tile reads: {equilibriumSearch.tileBatchRequests}; prefetched tiles:
          {" "}{equilibriumSearch.prefetchedTiles ?? 0}; completed seeds kept:
          {" "}{equilibriumSearch.completedSeedsKept}.</p>}
        {equilibriumSearch.diagnostics.map((message, index) => <p key={index}>{message}</p>)}
        <ol>{equilibriumSearch.candidates.map((candidate, index) => <li key={index}>
          <button type="button" aria-pressed={selectedEquilibrium === index}
            onClick={() => setSelectedEquilibrium(index)}>
            {candidate.classification} at ({candidate.position.map(value => value.toPrecision(5)).join(", ")})
          </button>{" "}<button type="button" disabled={busy || lineBusy ||
            document.identity.structuralHash !== equilibriumSearch.source.structuralHash}
            onClick={() => void saveEquilibrium(index)}>Save construction</button>
          {selectedEquilibrium === index && <p>Residual {candidate.residual.toExponential(2)};
            {" "}Jacobian condition estimate {candidate.conditionEstimate?.toPrecision(4) ?? "unavailable"};
            {" "}eigenvalues {candidate.eigenvalues?.map((root, rootIndex) =>
              `λ${rootIndex + 1} = ${root.real.toPrecision(5)}${root.imaginary ?
                ` ${root.imaginary > 0 ? "+" : "−"} ${Math.abs(root.imaginary).toPrecision(5)}i` : ""}`)
              .join(" · ") ?? "unavailable"} {candidate.eigenvalueUnit ?? ""}.
            {" "}{candidate.diagnostics.join(" ")}</p>}
        </li>)}</ol>
      </div>}
      {workspace.equilibriumConstructions.length > 0 && <details>
        <summary>Saved linked equilibria ({workspace.equilibriumConstructions.length}/32)</summary>
        <ul>{workspace.equilibriumConstructions.map(item => <li key={item.id}>
          {item.classification} at ({item.position.map(value => value.toPrecision(5)).join(", ")}) ·
          {" "}residual {item.residual.toExponential(2)} · source revision {item.sourceRevision} ·
          {" "}{item.sourceStructuralHash === document.identity.structuralHash ?
            "linked; reverify before new analysis" : "stale field revision"}
        </li>)}</ul>
      </details>}
    </section>
    {normalAxis !== undefined && <section aria-label="Slice appearance and verification">
      <h5>Slice appearance and verification</h5>
      <section aria-label="Scalar overlay" data-testid="scientific-scalar-overlay-controls">
        <h6>Scalar heatmap + vector arrows</h6>
        <label>Scalar source <select aria-label="Scalar overlay source"
          value={scalarOverlay?.reference.id ?? ""} disabled={busy}
          onChange={event => setScalarOverlay(event.target.value)}>
          <option value="">No scalar overlay</option>
          {scalarOverlay && !scalarOverlayChoices.some(field =>
            field.source.reference.id === scalarOverlay.reference.id) &&
            <option value={scalarOverlay.reference.id}>{scalarOverlay.title} · saved source</option>}
          {scalarOverlayChoices.map(field => <option key={field.source.reference.id}
            value={field.source.reference.id}>{field.metadata.title}</option>)}
        </select></label>
        {scalarOverlay && <><label><input type="checkbox" aria-label="Show scalar overlay"
          checked={scalarOverlay.visible} disabled={busy}
          onChange={event => setDocument(current => reviseVectorField3DWorkspace(current,
            { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
              scalarOverlay: { ...scalarOverlay, visible: event.target.checked },
              complexOverlay: event.target.checked && complexOverlay?.visible &&
                complexOverlay.mode !== "phase-contours" ?
                { ...complexOverlay, visible: false } : complexOverlay }))} />
          Show overlay</label>
          <label>Heatmap opacity <input type="range" min="0.1" max="1" step="0.05"
            aria-label="Scalar overlay opacity" value={scalarOverlay.opacity}
            onChange={event => setDocument(current => reviseVectorField3DWorkspace(current,
              { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
                scalarOverlay: { ...scalarOverlay, opacity: Number(event.target.value) } }))} /></label>
          <p role="status" data-testid="scientific-scalar-overlay-status">{scalarOverlayStatus ||
            "Overlay hidden; source will be reverified when shown."}</p></>}
      </section>
      <section aria-label="Complex overlay" data-testid="scientific-complex-overlay-controls">
        <h6>Complex magnitude, phase, or phase contours + vector arrows</h6>
        <label>Complex source <select aria-label="Complex overlay source"
          value={complexOverlay?.real.id ?? ""} disabled={busy}
          onChange={event => setComplexOverlay(event.target.value)}>
          <option value="">No complex overlay</option>
          {complexOverlay && !complexOverlayChoices.some(field =>
            field.source.reference.id === complexOverlay.real.id) &&
            <option value={complexOverlay.real.id}>{complexOverlay.title} · saved source</option>}
          {complexOverlayChoices.map(field => <option key={field.source.reference.id}
            value={field.source.reference.id}>{field.metadata.title}</option>)}
        </select></label>
        {complexOverlay && <>
          <label><input type="checkbox" aria-label="Show complex overlay"
            checked={complexOverlay.visible} disabled={busy}
            onChange={event => setDocument(current => reviseVectorField3DWorkspace(current,
              { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
                complexOverlay: { ...complexOverlay, visible: event.target.checked },
                scalarOverlay: event.target.checked && complexOverlay.mode !== "phase-contours" &&
                  scalarOverlay?.visible ? { ...scalarOverlay, visible: false } : scalarOverlay }))} />
            Show overlay</label>
          <label>{complexOverlay.mode === "phase-contours" ? "Contour" : "Heatmap"} opacity <input type="range" min="0.1" max="1" step="0.05"
            aria-label="Complex overlay opacity" value={complexOverlay.opacity}
            onChange={event => setDocument(current => reviseVectorField3DWorkspace(current,
              { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
                complexOverlay: { ...complexOverlay, opacity: Number(event.target.value) } }))} /></label>
          <p role="status" data-testid="scientific-complex-overlay-status">{complexOverlayStatus ||
            "Overlay hidden; both components will be reverified when shown."}</p>
        </>}
      </section>
      <label>Displayed field <select aria-label="Slice displayed field"
        value={workspace.sliceChannel} disabled={busy}
        onChange={event => {
          setDocument(current => reviseVectorField3DWorkspace(current,
            { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
              sliceChannel: event.target.value as typeof workspace.sliceChannel }));
          setSlice(null); setLinkedSlices({}); setError("");
          setSeedProposal(null);
        }}>
        <option value="component">Magnitude or selected component</option>
        <option value="divergence">Divergence</option>
        <option value="curl-magnitude">Curl magnitude</option>
        <option value="curl-x">Curl x</option>
        <option value="curl-y">Curl y</option>
        <option value="curl-z">Curl z</option>
        <option value="grad-speed-magnitude">Gradient |F| magnitude</option>
        <option value="grad-speed-x">Gradient |F| x</option>
        <option value="grad-speed-y">Gradient |F| y</option>
        <option value="grad-speed-z">Gradient |F| z</option>
        <option value="laplacian-speed">Laplacian |F|</option>
      </select></label>
      <p>Each preview checks the displayed bytes from all three source components. The map uses at most 1,024 samples.</p>
      {slice && <p role="status">{slice.shape.join(" × ")} samples; {slice.rejected} invalid;
        {" "}{slice.channel} {slice.min.toPrecision(4)}–{slice.max.toPrecision(4)} {slice.unit}.
        {slice.method && ` ${slice.method}; ${slice.boundarySamples} boundary stencils with reduced accuracy.`}</p>}
    </section>}
    <p>{datasetLink ? "Manifest-pinned dataset link" : "Expression field"} ·
      {datasetLink ? ` ${datasetLink.shape.join(" × ")} samples` : " bounded authored domain"}</p>
    {datasetLink && <p role="status" aria-live="polite" data-testid="vector-field3d-source-verification">
      Scene {datasetLink.sceneId} · dataset {datasetLink.datasetId}: {sourceVerification === "verified" ?
        "verified source samples for the current 3D preview" : sourceVerification === "failed" ?
        "verification failed; repair or relink the source" : sourceVerification === "verifying" ?
        "verifying source data for the first 3D preview…" : "source verification pending"}.
    </p>}
    {datasetLink && <details aria-label="Dataset provenance"><summary>Dataset provenance</summary>
      <p>Source hash <code>{datasetLink.sourceHash}</code></p>
      <p>Scene {datasetLink.sceneId} · dataset {datasetLink.datasetId}</p>
      <ul>{datasetLink.components.map(component => <li key={component.name}>
        {component.name}: <code>{component.resourceSha256}</code></li>)}</ul>
      <p>Axes: {datasetLink.axes.map(axis => `${axis.name} (${axis.unit})`).join(" · ")}</p>
    </details>}
    <div><button type="button" disabled={busy || lineBusy} onClick={() => void (multiView ?
      previewLinkedViews() : render())}>{busy ? "Verifying…" :
        multiView ? "Preview all views" : "Verify & render arrows"}</button>
      {" "}<button type="button" disabled={busy} onClick={save}>Save document</button>
      {" "}<button type="button" disabled={busy || lineBusy || !document.source.seeds.length}
        onClick={() => void runTrajectories()}>{busy ? "Integrating…" : "Run trajectories"}</button>
      {busyAction === "trajectory" && <button type="button" onClick={() => { cancelRequested.current = true;
        cancelRunRef.current?.(); setRunStatus("Cancelling trajectory integration…"); }}>Cancel run</button>}
      {busyAction === "equilibrium" && <button type="button" onClick={() => { cancelRequested.current = true;
        cancelRunRef.current?.(); setRunStatus("Cancelling equilibrium search…"); }}>Cancel search</button>}
      {" "}<button type="button" disabled={busy || lineBusy} onClick={reopen}>Open saved document</button>
      {" "}<button type="button" onClick={onClose}>Close</button></div>
    {runStatus && <p role="status" aria-live="polite" data-testid="vector-field3d-run-status">{runStatus}</p>}
    {saveStatus && <p role="status" data-testid="vector-field3d-save-status">{saveStatus}</p>}
    {artifact && artifact.evaluated > 0 && <p role="status" aria-live="polite" data-testid="vector-field3d-render-status">
      Rendered {artifact.accepted} of {artifact.evaluated} 3D samples; {artifact.stationary} stationary,
      {" "}{artifact.rejected} rejected. Source revision {artifact.source.revision}.
      Coordinate units {artifact.coordinateUnits.join(", ")}; vector units {artifact.componentUnits.join(", ")}.
    </p>}
    {trajectories && <div role="status" aria-live="polite" data-testid="vector-field3d-trajectory-status">
      <p>Showing {visibleTrajectories?.trajectories.length ?? 0}/{trajectories.trajectories.length}
        {" "}trajectory results.</p>
      {visibleTrajectories?.trajectories.map(path => <p key={path.seedId}
        data-seed-outcome={trajectoryHasError(path.stopReason) ? "error" : "result"}>
        {path.seedId}: {trajectoryHasError(path.stopReason) ? "error" : "result"} ·
        {" "}{path.stopReason} after {path.acceptedSteps} accepted and
        {" "}{path.rejectedSteps} rejected steps; {path.evaluations} evaluations;
          {" "}{trajectories.solver.mode === "normalized-field-line" ? "line parameter" : "time"}
          {" "}{path.points.at(-1)?.time.toPrecision(5)} {trajectories.solver.parameterUnit},
        {" "}arc {path.points.at(-1)?.arcLength.toPrecision(5)} {document.source.axes[0].unit}.
          {" "}Largest estimated local error {path.maxEstimatedLocalError.toPrecision(3)}
          {" "}{document.source.axes[0].unit}. {path.stopDetail}
      </p>)}
      <small>{trajectories.solver.method} · numerical approximation ·
        {" "}absolute tolerance {trajectories.solver.absoluteTolerance},
        relative tolerance {trajectories.solver.relativeTolerance}.</small>
      {trajectories.verifiedTiles && <p>Verified source tiles: {trajectories.verifiedTiles.map(part =>
        `${part.name} ${part.verifiedTiles}/${part.totalTiles} (${part.tileSetSha256})`).join(" · ")}.
        Resident cache {trajectories.residentTileBytes} bytes; source {trajectories.sourceHash}.</p>}
    </div>}
    </div>
    <div className="scientific-field-explorer-viewer" aria-label="3D field viewer"
      data-multiview={multiView ? workspace.layout : undefined}>
      {fieldLayer ? <ScientificExplorerFieldLayer
        key={`${fieldLayer.identity.id}:${fieldLayer.identity.structuralHash}`} document={fieldLayer}
        linkedProbe={linkedProbe} linkedRegion={workspace.overlayRegion}
        vectorAxes={document.source.axes} linkedVectorReady={linkedVectorReady}
        linkedVectorStatus={linkedVectorStatus}
        onOpenDetails={() => onOpenFieldDetails?.()} /> : <>
      {error && <div role="alert" className="scientific-field-explorer-viewer-error"
        data-testid="vector-field3d-viewer-error">{error}</div>}
      {multiView ? <div className={`vector-field3d-linked-grid vector-field3d-linked-grid-${workspace.layout}`}>
        <div className="vector-field3d-linked-cell">{artifact ?
          <VectorField3DArrowView document={document} artifact={artifact} isosurface={isosurface}
            trajectories={visibleTrajectories} probe={selectedEquilibrium !== null ?
              equilibriumSearch?.candidates[selectedEquilibrium]?.position ?? workspace.probe : workspace.probe}
            onCameraStateChange={setCameraState} seedPlane={seedPlacement3DPlane}
            onSeedPlaneChange={select3DSeedPlane}
            onSeedFixedCoordinateChange={set3DSeedCoordinate} onSeedPropose={propose3DSeed}
            proposedSeed={seedProposal?.view === "3d" ? seedProposal.position : null}
            seedPlacementDisabled={busy || lineBusy || document.source.seeds.length >= 32} /> :
          <p role="status">Preview all views to show the bounded 3D field.</p>}</div>
        {(workspace.layout === "quad" ? ["xy", "xz", "yz"] as const :
          [normalAxis === 1 ? "xz" : normalAxis === 0 ? "yz" : "xy"] as const).map(layer =>
          <div className="vector-field3d-linked-cell" key={layer}>{linkedSlices[layer] ?
            <VectorField3DSliceView document={document} slice={linkedSlices[layer]!}
              clipBounds={workspace.clipBounds} probe={sharedProfileProbe}
              scalarOverlay={overlayForSlice(linkedSlices[layer]!, layer).sample}
              contourOverlay={contourForSlice(linkedSlices[layer]!, layer).sample}
              contourStatus={contourForSlice(linkedSlices[layer]!, layer).status}
              scalarStatus={scalarOverlayStatus} complexStatus={complexOverlayStatus}
              vectorStatus={linkedVectorStatus}
              overlayArrows={overlayVectorArrows[layer]}
              overlayVectorPlane={overlayVectorPlanes[layer]}
              scalarOverlayVolume={linkedProfileScalarVolume}
              complexOverlayVolumes={linkedRegionComplexVolumes}
              linkedLineProfile={workspace.linkedLineProfile}
              overlayRegion={workspace.overlayRegion}
              linkedRegionFocus={linkedRegionFocus}
              savedRegionResults={savedRegionResults}
              regionResultStatuses={regionResultStatuses}
              onSaveRegionResult={onSaveRegionResult ? result => onSaveRegionResult(document, result) : undefined}
              onOverlayRegionChange={setOverlayRegion}
              linkedProfileMismatch={sharedProfileMismatch}
              onLinkedLineProfileChange={setLinkedLineProfile}
              onSendLinkedLineToGraphs={sendLinkedLine} linkedLineBusy={lineBusy || busy}
              onSendRegionToGraphs={sendLinkedRegion}
              onSendCombinedRegionToGraphs={sendCombinedRegion} regionBusy={lineBusy || busy}
              onPublishCombinedRegion={publishCombinedRegion}
              onPublishVectorDerivedRegion={publishVectorDerivedRegion}
              onSendVectorDerivedToGraphs={sendVectorDerivedRegion}
              onFocusRegionInGraphs={onFocusRegionInGraphs ? (region, physical, axis) =>
                onFocusRegionInGraphs(document, region, physical, axis) : undefined}
              overlayVectorSamples={overlayVectorSamples[layer]}
              overlayStatus={overlayForSlice(linkedSlices[layer]!, layer).status}
              seedPlacementActive={seedPlacementLayer === layer}
              seedPlacementDisabled={busy || lineBusy || document.source.seeds.length >= 32}
              onSeedPlacementToggle={() => toggleSliceSeedPlacement(layer)}
              onSeedPropose={point => proposeSliceSeed(layer, linkedSlices[layer]!, point)}
              proposedSeed={seedProposal?.layer === layer ? seedProposal.position : null}
              zoom={workspace.viewZoom[layer]} onZoomChange={zoom => setViewZoom(layer, zoom)}
              center={workspace.viewCenter[layer]}
              onCenterChange={center => setViewCenter(layer, center)}
              onSendLineToGraphs={sendAnalyticLine}
              onSendDerivedLineToGraphs={sendDerivedLine} derivedLineBusy={lineBusy || busy}
              onProbeSelect={point => void selectProbe(point)} /> :
            <p role="status">{busy ? "Verifying" : "Preview all views to show"}
              {" "}the {layer.toUpperCase()} slice.</p>}</div>)}</div> :
      normalAxis !== undefined ? slice ? <VectorField3DSliceView document={document} slice={slice}
        clipBounds={workspace.clipBounds} probe={sharedProfileProbe}
        scalarOverlay={overlayForSlice(slice, workspace.selectedLayer as SeedSliceLayer).sample}
        contourOverlay={contourForSlice(slice, workspace.selectedLayer as SeedSliceLayer).sample}
        contourStatus={contourForSlice(slice, workspace.selectedLayer as SeedSliceLayer).status}
        scalarStatus={scalarOverlayStatus} complexStatus={complexOverlayStatus}
        vectorStatus={linkedVectorStatus}
        overlayArrows={overlayVectorArrows[workspace.selectedLayer as SeedSliceLayer]}
        overlayVectorPlane={overlayVectorPlanes[workspace.selectedLayer as SeedSliceLayer]}
        scalarOverlayVolume={linkedProfileScalarVolume}
        complexOverlayVolumes={linkedRegionComplexVolumes}
        linkedLineProfile={workspace.linkedLineProfile}
        overlayRegion={workspace.overlayRegion}
        linkedRegionFocus={linkedRegionFocus}
        savedRegionResults={savedRegionResults}
        regionResultStatuses={regionResultStatuses}
        onSaveRegionResult={onSaveRegionResult ? result => onSaveRegionResult(document, result) : undefined}
        onOverlayRegionChange={setOverlayRegion}
        linkedProfileMismatch={sharedProfileMismatch}
        onLinkedLineProfileChange={setLinkedLineProfile}
        onSendLinkedLineToGraphs={sendLinkedLine} linkedLineBusy={lineBusy || busy}
        onSendRegionToGraphs={sendLinkedRegion}
        onSendCombinedRegionToGraphs={sendCombinedRegion} regionBusy={lineBusy || busy}
        onPublishCombinedRegion={publishCombinedRegion}
        onPublishVectorDerivedRegion={publishVectorDerivedRegion}
        onSendVectorDerivedToGraphs={sendVectorDerivedRegion}
        onFocusRegionInGraphs={onFocusRegionInGraphs ? (region, physical, axis) =>
          onFocusRegionInGraphs(document, region, physical, axis) : undefined}
        overlayVectorSamples={overlayVectorSamples[workspace.selectedLayer as SeedSliceLayer]}
        overlayStatus={overlayForSlice(slice, workspace.selectedLayer as SeedSliceLayer).status}
        seedPlacementActive={seedPlacementLayer === workspace.selectedLayer}
        seedPlacementDisabled={busy || lineBusy || document.source.seeds.length >= 32}
        onSeedPlacementToggle={() => toggleSliceSeedPlacement(workspace.selectedLayer as SeedSliceLayer)}
        onSeedPropose={point => proposeSliceSeed(workspace.selectedLayer as SeedSliceLayer, slice, point)}
        proposedSeed={seedProposal?.layer === workspace.selectedLayer ? seedProposal.position : null}
        zoom={workspace.viewZoom[workspace.selectedLayer as "xy" | "xz" | "yz"]}
        onZoomChange={zoom => setViewZoom(workspace.selectedLayer as "xy" | "xz" | "yz", zoom)}
        center={workspace.viewCenter[workspace.selectedLayer as "xy" | "xz" | "yz"]}
        onCenterChange={center => setViewCenter(workspace.selectedLayer as "xy" | "xz" | "yz", center)}
        onSendLineToGraphs={sendAnalyticLine}
        onSendDerivedLineToGraphs={sendDerivedLine} derivedLineBusy={lineBusy || busy}
        onProbeSelect={point => void selectProbe(point)} /> :
        <div role="status" className="scientific-field-explorer-empty">Choose a physical coordinate and preview this slice.
          Saved scientific bundles are reverified before values appear.</div> :
        artifact ? <VectorField3DArrowView document={document} artifact={artifact} isosurface={isosurface}
          trajectories={visibleTrajectories} probe={selectedEquilibrium !== null ?
            equilibriumSearch?.candidates[selectedEquilibrium]?.position ?? workspace.probe : workspace.probe}
          onCameraStateChange={setCameraState} seedPlane={seedPlacement3DPlane}
          onSeedPlaneChange={select3DSeedPlane}
          onSeedFixedCoordinateChange={set3DSeedCoordinate} onSeedPropose={propose3DSeed}
          proposedSeed={seedProposal?.view === "3d" ? seedProposal.position : null}
          seedPlacementDisabled={busy || lineBusy || document.source.seeds.length >= 32} /> :
        <div role="status" className="scientific-field-explorer-empty">Verify the field to display bounded 3D arrows.
          Saved scientific bundles are reread before any field values appear.</div>}</>}
    </div>
    </div>
  </div>, mount ?? globalThis.document.body);
}
