import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createVectorField3DDocument, defaultVectorField3DWorkspace,
  parseVectorField3DDocument, reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  createScientificDatasetLink,
  sampleVectorField3DArrows, sampleVectorField3DScientificArrows, serializeVectorField3DDocument,
  sampleVectorField3DSlice, sampleVectorField3DProbe, vectorField3DSliceCoordinates,
  sampleVectorField3DSparseSlice, sampleVectorField3DSparseProbe,
  analyzeVectorField3DDifferential, sampleVectorField3DDerivedSlice,
  verifyVectorField3DVolumes,
  type VectorField3DDifferentialArtifact,
  type VectorField3DEquilibriumSearch,
  sampleVectorField3DAnalyticLine, type VectorField3DAnalyticLine,
  createVectorField3DDerivedLine, type VectorField3DDerivedLine,
  integrateVectorField3DScientificTrajectories,
  vectorField3DSeedPreset, vectorField3DTolerancePresets, vectorField3DTolerancePresetOf,
  type VectorField3DTolerancePreset,
  scientificPointWithinBounds,
  scientificCoordinateIndex,
  vectorField3DExpression, type VectorField3DArrowArtifact, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DExpression, type VectorField3DTrajectoryArtifact,
  type Graph2DScientificDatasetPreview, type VectorField3DLayer,
  type VectorField3DSliceArtifact, type VectorField3DProbeArtifact,
  type VectorField3DClipBounds, type VectorField3DCameraPreset } from "@math3d/core";
import type { VectorField3DCameraState } from "@math3d/core";
import { VectorField3DArrowView } from "./VectorField3DArrowView";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { VectorField3DGraphLinePanel } from "./VectorField3DGraphLinePanel";
import { previewVerifiedVectorField3D } from "./previewVerifiedVectorField3D";
import type { VectorField3DGraphLineSelection } from "./reverifyVectorField3DGraphLine";
import { reverifyVectorField3DDerivedLine } from "./reverifyVectorField3DDerivedLine";

const storageKey = "math3d.vector-field3d.document.v1";
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
  onAddGraphLine, isGraphLineImported, onAddAnalyticLine, onAddDerivedLine }: {
  initialDocument?: VectorField3DDocument; savedDocument?: VectorField3DDocument | null;
  onSaveDocument?: (document: VectorField3DDocument) => void; onClose: () => void;
  mount?: HTMLElement;
  onAddGraphLine?: (preview: Graph2DScientificDatasetPreview, selection: VectorField3DGraphLineSelection) => void;
  isGraphLineImported?: (selection: VectorField3DGraphLineSelection, document: VectorField3DDocument) => boolean;
  onAddAnalyticLine?: (line: VectorField3DAnalyticLine) => void;
  onAddDerivedLine?: (line: VectorField3DDerivedLine) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const equilibriaButtonRef = useRef<HTMLButtonElement>(null);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const cancelRequested = useRef(false);
  const probeEpoch = useRef(0);
  const previewEpoch = useRef(0);
  useEffect(() => {
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
  const [probeArtifact, setProbeArtifact] = useState<VectorField3DProbeArtifact | null>(null);
  const [differential, setDifferential] = useState<VectorField3DDifferentialArtifact | null>(null);
  const [equilibriumSearch, setEquilibriumSearch] = useState<VectorField3DEquilibriumSearch | null>(null);
  const [selectedEquilibrium, setSelectedEquilibrium] = useState<number | null>(null);
  const [trajectories, setTrajectories] = useState<VectorField3DTrajectoryArtifact | null>(null);
  const [seedDraft, setSeedDraft] = useState<[string, string, string]>(document.source.axes.map(axis =>
    String((axis.min + axis.max) / 2)) as [string, string, string]);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"render" | "trajectory" | "equilibrium" | null>(null);
  const [runStatus, setRunStatus] = useState("");
  const [seedProgress, setSeedProgress] = useState<{ completed: number; total: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const datasetLink = document.source.field.kind === "scientific-bundle" ?
    createScientificDatasetLink(document.source.field.references) : null;
  const workspace = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const multiView = workspace.layout === "split" || workspace.layout === "quad";
  const normalAxis = ({ xy: 2, xz: 1, yz: 0 } as const)[workspace.selectedLayer as "xy" | "xz" | "yz"];
  const sliceOptions = normalAxis === undefined ? [] :
    vectorField3DSliceCoordinates(document, normalAxis);
  const selectLayer = (selectedLayer: VectorField3DLayer) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), selectedLayer }));
    if (!multiView) setSlice(null);
    setError("");
  };
  const setSliceCoordinate = (axis: 0 | 1 | 2, coordinate: number) => {
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
    setSlice(null); setLinkedSlices({}); setError("");
  };
  const setClipBound = (axis: 0 | 1 | 2, end: 0 | 1, value: number) => {
    try {
      const next = workspace.clipBounds.map(bounds => [...bounds]) as
        [[number, number], [number, number], [number, number]];
      next[axis][end] = value;
      const revised = reviseVectorField3DWorkspace(document, { ...workspace, clipBounds: next });
      setDocument(revised);
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
    if (viewsLinked && workspace.probe) { setSlice(null); setLinkedSlices({}); }
    setError("");
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
    setArtifact(null); setSlice(null); setLinkedSlices({}); setError("");
  };
  const updateSource = (source: VectorField3DSource) => {
    probeEpoch.current++; previewEpoch.current++;
    setDocument(reviseVectorField3DDocument(document, source)); setArtifact(null); setSlice(null);
    setLinkedSlices({});
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    setEquilibriumSearch(null); setSelectedEquilibrium(null);
    setRunStatus(""); setSeedProgress(null);
  };
  const currentDocument = () => document.source.field.kind === "expressions" ?
    reviseVectorField3DDocument(document, { ...document.source, field: { kind: "expressions",
      components: expressions.map((source, index) => vectorField3DExpression(source,
        document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : "m/s")) as
        [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] } }) : document;
  const sampleSelectedSlice = (next: VectorField3DDocument, axis: 0 | 1 | 2,
    coordinate: number, scientific?: Parameters<typeof sampleVectorField3DSlice>[3]) => {
    const channel = next.workspace?.sliceChannel ?? "component";
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
  const render = async () => {
    if (busy || lineBusy) return;
    const epoch = ++previewEpoch.current;
    setBusy(true); setBusyAction("render"); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    setEquilibriumSearch(null); setSelectedEquilibrium(null);
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.source.field.kind === "expressions") {
        setArtifact(sampleVectorField3DArrows(next));
        if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe));
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
      setArtifact(result); setDocument(next);
    } catch (cause) { if (epoch === previewEpoch.current) {
      setArtifact(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null); }
  };
  const previewSlice = async () => {
    if (busy || lineBusy || normalAxis === undefined) return;
    const coordinate = workspace.sliceCoordinates[normalAxis];
    setBusy(true); setSlice(null); setProbeArtifact(null); setDifferential(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.source.field.kind === "expressions") {
        setSlice(sampleSelectedSlice(next, normalAxis, coordinate));
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
        setSlice(channel === "component" ? sampleVectorField3DSparseSlice(next, normalAxis, coordinate, scientific) :
          sampleVectorField3DDerivedSlice(next, normalAxis, coordinate, channel, scientific));
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
      setSlice(sampleSelectedSlice(next, normalAxis, coordinate,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes }));
      if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes }));
      setDocument(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); }
  };
  const previewLinkedViews = async (requested?: VectorField3DDocument) => {
    if (busy || lineBusy) return;
    const epoch = ++previewEpoch.current;
    setBusy(true); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setDifferential(null); setTrajectories(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = requested ?? currentDocument();
      const make = (scientific?: Parameters<typeof sampleVectorField3DSlice>[3]) => ({
        xy: sampleSelectedSlice(next, 2, next.workspace!.sliceCoordinates[2], scientific),
        xz: sampleSelectedSlice(next, 1, next.workspace!.sliceCoordinates[1], scientific),
        yz: sampleSelectedSlice(next, 0, next.workspace!.sliceCoordinates[0], scientific),
      });
      if (next.source.field.kind === "expressions") {
        const arrows = sampleVectorField3DArrows(next), views = make();
        const point = next.workspace?.probe ? sampleVectorField3DProbe(next, next.workspace.probe) : null;
        setArtifact(arrows); setLinkedSlices(views); setProbeArtifact(point); setDocument(next);
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
          return channel === "component" ? sampleVectorField3DSparseSlice(next, axis, coordinate, scientific) :
            sampleVectorField3DDerivedSlice(next, axis, coordinate, channel, scientific);
        }));
        if (epoch !== previewEpoch.current) return;
        setLinkedSlices({ xy: slices[0]!, xz: slices[1]!, yz: slices[2]! }); setDocument(next);
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
      setArtifact(arrows); setLinkedSlices(views); setProbeArtifact(point); setDocument(next);
    } catch (cause) { if (epoch === previewEpoch.current) {
      setArtifact(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); }
  };
  const verifyProbe = async (next: VectorField3DDocument,
    position: readonly [number, number, number]) => {
    if (busy || lineBusy) return;
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
  const analyzeDifferential = async () => {
    if (!workspace.probe || busy || lineBusy) return;
    const epoch = ++probeEpoch.current, position = workspace.probe;
    setBusy(true); setDifferential(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.source.field.kind === "expressions") {
        const result = analyzeVectorField3DDifferential(next, position);
        if (epoch === probeEpoch.current) { setDocument(next); setDifferential(result); }
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
        if (epoch === probeEpoch.current) { setDocument(next); setDifferential(result); }
        return;
      }
      if (!bridge.previewVectorVolume)
        throw new Error("Scientific derived analysis requires the desktop source verifier.");
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const result = analyzeVectorField3DDifferential(next, position,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes });
      if (epoch === probeEpoch.current) { setDocument(next); setDifferential(result); }
    } catch (cause) { if (epoch === probeEpoch.current) {
      setArtifact(null); setSlice(null); setLinkedSlices({}); setProbeArtifact(null);
      setEquilibriumSearch(null); setSelectedEquilibrium(null);
      setDifferential(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      if (epoch === probeEpoch.current) setBusy(false); }
  };
  const selectProbe = async (position: readonly [number, number, number]) => {
    if (busy || lineBusy) return;
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
  const addSeed = () => {
    try {
      const position = seedDraft.map(Number) as [number, number, number];
      if (seedDraft.some(value => !value.trim()) ||
          !scientificPointWithinBounds(position, document.source.axes))
        throw new TypeError("Seed must lie inside all three axis bounds.");
      const nextIndex = document.source.seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      updateSource({ ...document.source, seeds: [...document.source.seeds,
        { id: `seed-${nextIndex}`, position }] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const addSeedPreset = (kind: "ring-8" | "plane-9") => {
    try {
      const seeds = [...document.source.seeds];
      let nextIndex = seeds.reduce((highest, seed) =>
        Math.max(highest, Number(seed.id.replace(/^seed-/, "")) || 0), 0) + 1;
      for (const position of vectorField3DSeedPreset(document.source, kind)) {
        if (seeds.length >= 32) break;
        if (seeds.some(seed => Math.hypot(...seed.position.map((value, axis) =>
          value - position[axis]!)) < 1e-8)) continue;
        seeds.push({ id: `seed-${nextIndex++}`, position });
      }
      const added = seeds.length - document.source.seeds.length;
      if (!added) throw new Error("All preset seeds are already present or the 32-seed limit is full.");
      updateSource({ ...document.source, seeds });
      setRunStatus(`Added ${added} bounded ${kind === "ring-8" ? "ring" : "plane-grid"} seeds.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const runTrajectories = async () => {
    if (busy || lineBusy) return;
    cancelRequested.current = false;
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
                .then(tile => { if (!finished) worker.postMessage({ tileResponse: tile }); })
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
            void window.scientificScenes.previewVectorTiles({ fingerprint: scientific.fingerprint,
              datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
                [string, string, string], indicesBatch: event.data.tileRequests.indices.map(point =>
                  [...point] as [number, number, number]) })
              .then(tiles => { if (!finished) worker.postMessage({ tilesResponse: tiles }); })
              .catch(cause => { if (!finished) { finish(); reject(cause); } });
            return;
          }
          finish(); if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error));
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
      setEquilibriumSearch(null); setSelectedEquilibrium(null);
      setArtifact(null); setSlice(null); setLinkedSlices({}); setProbeArtifact(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false);
    }
  };
  const save = () => {
    try { const next = currentDocument(); onSaveDocument?.(next);
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
      setSeedDraft(next.source.axes.map(axis => String((axis.min + axis.max) / 2)) as [string, string, string]);
      setArtifact(null); setSlice(null); setLinkedSlices({}); setProbeArtifact(null);
      setDifferential(null);
      setEquilibriumSearch(null); setSelectedEquilibrium(null);
      setTrajectories(null); setError(""); setRunStatus(""); setSaveStatus(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return createPortal(<div className="scientific-field-explorer" role="region"
    aria-label="Scientific Field Explorer" data-testid="scientific-field-explorer"
    data-layout={workspace.layout}>
    <div
      ref={dialogRef} onKeyDown={onDialogKey}
      className="graph2d-scientific-import vector-field3d-editor scientific-field-explorer-content"
      data-testid="vector-field-3d-editor"
      onPointerDown={event => event.stopPropagation()}>
    <header className="scientific-field-explorer-header"><div><h3>Scientific Field Explorer · {document.metadata.title}</h3>
    <p>Independent 3D document · bounded arrows and adaptive numerical trajectories.</p>
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
    <nav aria-label="Field layers" className="vector-field3d-layers">
      {([ ["arrows", "3D arrows"], ["trajectories", "Trajectories"],
        ["xy", "XY slice"], ["xz", "XZ slice"], ["yz", "YZ slice"] ] as const).map(([layer, label]) =>
        <button type="button" key={layer} disabled={busy} aria-pressed={workspace.selectedLayer === layer}
          onClick={() => selectLayer(layer)}>{label}</button>)}
    </nav>
    <fieldset className="vector-field3d-form" disabled={busy}>
    {document.source.field.kind === "expressions" ?
      <div role="group" aria-label="Vector components" className="vector-field3d-controls">
        {(["P(x,y,z)", "Q(x,y,z)", "R(x,y,z)"] as const).map((label, index) => <label key={label}>
          {label} ({document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : ""})
          <input aria-label={label} value={expressions[index]} onChange={event => {
            probeEpoch.current++;
            const next = [...expressions] as [string, string, string]; next[index] = event.target.value;
            setExpressions(next); setArtifact(null); setSlice(null); setProbeArtifact(null);
            setDifferential(null); setEquilibriumSearch(null); setSelectedEquilibrium(null);
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
          onClick={() => addSeedPreset("plane-9")}>Add plane grid (9)</button>
      </div>
      {document.source.seeds.length > 0 && <ul>{document.source.seeds.map(seed => <li key={seed.id}>
        {seed.id}: ({seed.position.join(", ")}) {document.source.axes[0].unit}
        {" "}<button type="button" disabled={busy} aria-label={`Remove ${seed.id}`}
          onClick={() => updateSource({ ...document.source,
            seeds: document.source.seeds.filter(item => item.id !== seed.id) })}>Remove</button>
      </li>)}</ul>}
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
    <h4>Inspector</h4>
    <p>Selected layer: {workspace.selectedLayer === "arrows" ? "3D arrows" :
      workspace.selectedLayer === "trajectories" ? "Trajectories" : `${workspace.selectedLayer.toUpperCase()} slice`}.</p>
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
      <label><input type="checkbox" aria-label="Link slice planes to probe"
        checked={workspace.viewsLinked} disabled={busy || lineBusy}
        onChange={event => setViewsLinked(event.target.checked)} /> Link slice planes to probe</label>
      <p>{workspace.viewsLinked ? "A selected point moves all three slice planes to its physical coordinates." :
        "Slice planes keep independent fixed coordinates; selecting a point still updates the probe."}</p>
      {!workspace.probe ? <button type="button" disabled={busy || lineBusy}
        onClick={() => void selectProbe(workspace.sliceCoordinates)}>Place probe at selected coordinates</button> : <>
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
      {!workspace.probe && <p>Place a physical-point probe to analyze this field.</p>}
      {workspace.probe && !differential && <p>Run a local analysis. Scientific bundles are
        reverified before each result.</p>}
      {differential && <div role="status" data-testid="vector-field3d-differential">
        <p>Approximate · {differential.method}{differential.stencilGrid === "source" ? " on the source grid" : ""} · source revision {differential.source.revision}
          {differential.sourceHash && ` · source ${differential.sourceHash}`}.</p>
        {differential.status === "ready" ? <>
          <p>Divergence {differential.divergence!.toPrecision(6)} {differential.divergenceUnit}.</p>
          <p>{differential.curl ? `Curl (${differential.curl.map(value => value.toPrecision(6)).join(", ")}) ${differential.curlUnit}.` :
            "Curl unavailable for differing coordinate units."}</p>
          <p>Jacobian: {differential.jacobian?.map((row, index) =>
            `${["P", "Q", "R"][index]} [${row.map((value, axis) =>
              `${value.toPrecision(5)} ${differential.jacobianUnits[index]?.[axis]}`).join(", ")}]`).join(" · ")}.
            {" "}Local structure: {differential.localStructure ?? "unavailable"}.</p>
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
    <section id="field-equilibria" aria-label="Field equilibria" className="vector-field3d-probe">
      <h5>Equilibria · bounded search</h5>
      <p>Searches a 5×5×5 seed grid and saved seeds. Results are local candidates, never a complete count.</p>
      <button ref={equilibriaButtonRef} type="button" disabled={busy || lineBusy}
        onClick={() => void findEquilibria()}>
        Find equilibria</button>
      {equilibriumSearch && <div role="status" data-testid="vector-field3d-equilibria">
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
            {" "}eigenvalue real parts {candidate.eigenvalueRealParts?.map(value => value.toPrecision(4)).join(", ") ??
              "unavailable"}. {candidate.diagnostics.join(" ")}</p>}
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
    {normalAxis !== undefined && <section aria-label="Slice controls">
      <h5>{workspace.selectedLayer.toUpperCase()} slice</h5>
      <label>Displayed field <select aria-label="Slice displayed field"
        value={workspace.sliceChannel} disabled={busy}
        onChange={event => {
          setDocument(current => reviseVectorField3DWorkspace(current,
            { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)),
              sliceChannel: event.target.value as typeof workspace.sliceChannel }));
          setSlice(null); setLinkedSlices({}); setError("");
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
      <label>Fixed {document.source.axes[normalAxis].label} ({document.source.axes[normalAxis].unit})
        {document.source.field.kind === "scientific-bundle" ?
          <select aria-label="Slice physical coordinate" value={workspace.sliceCoordinates[normalAxis]}
            disabled={busy} onChange={event => setSliceCoordinate(normalAxis, Number(event.target.value))}>
            {sliceOptions.map(coordinate => <option key={coordinate} value={coordinate}>
              {coordinate} {document.source.axes[normalAxis].unit}</option>)}
          </select> : <input type="number" step="any" aria-label="Slice physical coordinate"
            min={document.source.axes[normalAxis].min} max={document.source.axes[normalAxis].max}
            value={workspace.sliceCoordinates[normalAxis]} disabled={busy}
            onChange={event => { try { setSliceCoordinate(normalAxis, Number(event.target.value)); }
              catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }} />}
      </label>
      <button type="button" disabled={busy || lineBusy} onClick={() => void (multiView ?
        previewLinkedViews() : previewSlice())}>{multiView ? "Preview all views" : "Preview slice"}</button>
      {workspace.probe && (slice || Object.keys(linkedSlices).length > 0) &&
        <button type="button" onClick={() => dialogRef.current?.querySelector(
          '.scientific-field-explorer-viewer .vector-field3d-line-profile')?.scrollIntoView(
            { behavior: "smooth", block: "nearest" })}>Show line profile through point</button>}
      <p>Each preview checks the displayed bytes from all three source components. The map uses at most 1,024 samples.</p>
      {slice && <p role="status">{slice.shape.join(" × ")} samples; {slice.rejected} invalid;
        {" "}{slice.channel} {slice.min.toPrecision(4)}–{slice.max.toPrecision(4)} {slice.unit}.
        {slice.method && ` ${slice.method}; ${slice.boundarySamples} boundary stencils with reduced accuracy.`}</p>}
    </section>}
    <p>{datasetLink ? "Manifest-pinned dataset link" : "Expression field"} ·
      {datasetLink ? ` ${datasetLink.shape.join(" × ")} samples` : " bounded authored domain"}</p>
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
      {trajectories.trajectories.map(path => <p key={path.seedId}>
        {path.seedId}: {path.stopReason} after {path.acceptedSteps} accepted and
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
      {error && <div role="alert" className="scientific-field-explorer-viewer-error"
        data-testid="vector-field3d-viewer-error">{error}</div>}
      {multiView ? <div className={`vector-field3d-linked-grid vector-field3d-linked-grid-${workspace.layout}`}>
        <div className="vector-field3d-linked-cell">{artifact ?
          <VectorField3DArrowView document={document} artifact={artifact}
            trajectories={trajectories} probe={selectedEquilibrium !== null ?
              equilibriumSearch?.candidates[selectedEquilibrium]?.position ?? workspace.probe : workspace.probe}
            onCameraStateChange={setCameraState} /> :
          <p role="status">Preview all views to show the bounded 3D field.</p>}</div>
        {(workspace.layout === "quad" ? ["xy", "xz", "yz"] as const :
          [normalAxis === 1 ? "xz" : normalAxis === 0 ? "yz" : "xy"] as const).map(layer =>
          <div className="vector-field3d-linked-cell" key={layer}>{linkedSlices[layer] ?
            <VectorField3DSliceView document={document} slice={linkedSlices[layer]!}
              clipBounds={workspace.clipBounds} probe={workspace.probe}
              zoom={workspace.viewZoom[layer]} onZoomChange={zoom => setViewZoom(layer, zoom)}
              center={workspace.viewCenter[layer]}
              onCenterChange={center => setViewCenter(layer, center)}
              onSendLineToGraphs={sendAnalyticLine}
              onSendDerivedLineToGraphs={sendDerivedLine} derivedLineBusy={lineBusy || busy}
              onProbeSelect={point => void selectProbe(point)} /> :
            <p role="status">{busy ? "Verifying" : "Preview all views to show"}
              {" "}the {layer.toUpperCase()} slice.</p>}</div>)}</div> :
      normalAxis !== undefined ? slice ? <VectorField3DSliceView document={document} slice={slice}
        clipBounds={workspace.clipBounds} probe={workspace.probe}
        zoom={workspace.viewZoom[workspace.selectedLayer as "xy" | "xz" | "yz"]}
        onZoomChange={zoom => setViewZoom(workspace.selectedLayer as "xy" | "xz" | "yz", zoom)}
        center={workspace.viewCenter[workspace.selectedLayer as "xy" | "xz" | "yz"]}
        onCenterChange={center => setViewCenter(workspace.selectedLayer as "xy" | "xz" | "yz", center)}
        onSendLineToGraphs={sendAnalyticLine}
        onSendDerivedLineToGraphs={sendDerivedLine} derivedLineBusy={lineBusy || busy}
        onProbeSelect={point => void selectProbe(point)} /> :
        <div role="status" className="scientific-field-explorer-empty">Choose a physical coordinate and preview this slice.
          Saved scientific bundles are reverified before values appear.</div> :
        artifact ? <VectorField3DArrowView document={document} artifact={artifact}
          trajectories={trajectories} probe={selectedEquilibrium !== null ?
            equilibriumSearch?.candidates[selectedEquilibrium]?.position ?? workspace.probe : workspace.probe}
          onCameraStateChange={setCameraState} /> :
        <div role="status" className="scientific-field-explorer-empty">Verify the field to display bounded 3D arrows.
          Saved scientific bundles are reread before any field values appear.</div>}
    </div>
    </div>
  </div>, mount ?? globalThis.document.body);
}
