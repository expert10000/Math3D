import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createVectorField3DDocument, defaultVectorField3DWorkspace,
  parseVectorField3DDocument, reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  createScientificDatasetLink,
  sampleVectorField3DArrows, sampleVectorField3DScientificArrows, serializeVectorField3DDocument,
  sampleVectorField3DSlice, sampleVectorField3DProbe, vectorField3DSliceCoordinates,
  integrateVectorField3DScientificTrajectories,
  scientificPointWithinBounds,
  vectorField3DExpression, type VectorField3DArrowArtifact, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DExpression, type VectorField3DTrajectoryArtifact,
  type Graph2DScientificDatasetPreview, type VectorField3DLayer,
  type VectorField3DSliceArtifact, type VectorField3DProbeArtifact,
  type VectorField3DClipBounds, type VectorField3DCameraPreset } from "@math3d/core";
import { VectorField3DArrowView } from "./VectorField3DArrowView";
import { VectorField3DSliceView } from "./VectorField3DSliceView";
import { VectorField3DGraphLinePanel } from "./VectorField3DGraphLinePanel";
import type { VectorField3DGraphLineSelection } from "./reverifyVectorField3DGraphLine";

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
  onAddGraphLine, isGraphLineImported }: {
  initialDocument?: VectorField3DDocument; savedDocument?: VectorField3DDocument | null;
  onSaveDocument?: (document: VectorField3DDocument) => void; onClose: () => void;
  mount?: HTMLElement;
  onAddGraphLine?: (preview: Graph2DScientificDatasetPreview, selection: VectorField3DGraphLineSelection) => void;
  isGraphLineImported?: (selection: VectorField3DGraphLineSelection, document: VectorField3DDocument) => boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRunRef = useRef<(() => void) | null>(null);
  const cancelRequested = useRef(false);
  const probeEpoch = useRef(0);
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { cancelRunRef.current?.(); probeEpoch.current++; previous?.focus(); };
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
  const [artifact, setArtifact] = useState<VectorField3DArrowArtifact | null>(null);
  const [slice, setSlice] = useState<VectorField3DSliceArtifact | null>(null);
  const [linkedSlices, setLinkedSlices] = useState<Partial<Record<"xy" | "xz" | "yz",
    VectorField3DSliceArtifact>>>({});
  const [probeArtifact, setProbeArtifact] = useState<VectorField3DProbeArtifact | null>(null);
  const [trajectories, setTrajectories] = useState<VectorField3DTrajectoryArtifact | null>(null);
  const [seedDraft, setSeedDraft] = useState<[string, string, string]>(document.source.axes.map(axis =>
    String((axis.min + axis.max) / 2)) as [string, string, string]);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"render" | "trajectory" | null>(null);
  const [runStatus, setRunStatus] = useState("");
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
    if (workspace.probe) {
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
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), cameraPreset }));
  };
  const setLayout = (layout: typeof workspace.layout) => {
    setDocument(current => reviseVectorField3DWorkspace(current,
      { ...(current.workspace ?? defaultVectorField3DWorkspace(current.source)), layout }));
    setArtifact(null); setSlice(null); setLinkedSlices({}); setError("");
  };
  const updateSource = (source: VectorField3DSource) => {
    probeEpoch.current++;
    setDocument(reviseVectorField3DDocument(document, source)); setArtifact(null); setSlice(null);
    setLinkedSlices({});
    setProbeArtifact(null); setTrajectories(null); setError(""); setRunStatus("");
  };
  const currentDocument = () => document.source.field.kind === "expressions" ?
    reviseVectorField3DDocument(document, { ...document.source, field: { kind: "expressions",
      components: expressions.map((source, index) => vectorField3DExpression(source,
        document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : "m/s")) as
        [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] } }) : document;
  const render = async () => {
    if (busy || lineBusy) return;
    setBusy(true); setBusyAction("render"); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setTrajectories(null); setError("");
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
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const result = sampleVectorField3DScientificArrows(next, opened.source.manifestJson, fingerprint, volumes);
      if (next.workspace?.probe) setProbeArtifact(sampleVectorField3DProbe(next, next.workspace.probe,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes }));
      setArtifact(result); setDocument(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null); }
  };
  const previewSlice = async () => {
    if (busy || lineBusy || normalAxis === undefined) return;
    const coordinate = workspace.sliceCoordinates[normalAxis];
    setBusy(true); setSlice(null); setProbeArtifact(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.source.field.kind === "expressions") {
        setSlice(sampleVectorField3DSlice(next, normalAxis, coordinate));
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
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      setSlice(sampleVectorField3DSlice(next, normalAxis, coordinate,
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
    setBusy(true); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setTrajectories(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = requested ?? currentDocument();
      const make = (scientific?: Parameters<typeof sampleVectorField3DSlice>[3]) => ({
        xy: sampleVectorField3DSlice(next, 2, next.workspace!.sliceCoordinates[2], scientific),
        xz: sampleVectorField3DSlice(next, 1, next.workspace!.sliceCoordinates[1], scientific),
        yz: sampleVectorField3DSlice(next, 0, next.workspace!.sliceCoordinates[0], scientific),
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
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const scientific = { manifestJson: opened.source.manifestJson, fingerprint, volumes };
      const arrows = sampleVectorField3DScientificArrows(next, scientific.manifestJson,
        fingerprint, volumes);
      const views = make(scientific);
      const point = next.workspace?.probe ? sampleVectorField3DProbe(next, next.workspace.probe,
        scientific) : null;
      setArtifact(arrows); setLinkedSlices(views); setProbeArtifact(point); setDocument(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); }
  };
  const verifyProbe = async (next: VectorField3DDocument,
    position: readonly [number, number, number]) => {
    if (busy || lineBusy) return;
    const epoch = ++probeEpoch.current;
    setBusy(true); setProbeArtifact(null); setError("");
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
      const volumes = await bridge.previewVectorVolume({ fingerprint, datasetId: refs[0].datasetId,
        components: refs.map(ref => ref.component) as [string, string, string] });
      const value = sampleVectorField3DProbe(next, position,
        { manifestJson: opened.source.manifestJson, fingerprint, volumes });
      if (epoch === probeEpoch.current) setProbeArtifact(value);
    } catch (cause) { if (epoch === probeEpoch.current) {
      setArtifact(null); setSlice(null); setLinkedSlices({});
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
          sliceCoordinates: [...position] as [number, number, number] });
      if (slice && (slice.normalAxis === undefined ||
          Math.abs(slice.fixedCoordinate - position[slice.normalAxis]) > 1e-9 ||
          slice.source.structuralHash !== revised.identity.structuralHash)) setSlice(null);
      setDocument(revised); setProbeArtifact(null); setError("");
      if (multiView) await previewLinkedViews(revised);
      else await verifyProbe(revised, position);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
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
  const runTrajectories = async () => {
    if (busy || lineBusy) return;
    cancelRequested.current = false;
    setBusy(true); setBusyAction("trajectory"); setArtifact(null); setSlice(null); setLinkedSlices({});
    setProbeArtifact(null); setTrajectories(null); setError(""); setRunStatus("Verifying source and preparing trajectory worker…");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (!next.source.seeds.length) throw new TypeError("Add at least one seed before integrating trajectories.");
      const solve = (scientific?: { manifestJson: string; fingerprint: string;
        volumes: Parameters<typeof integrateVectorField3DScientificTrajectories>[3] }) =>
        new Promise<VectorField3DTrajectoryArtifact>((resolve, reject) => {
          if (cancelRequested.current) { reject(new Error("Trajectory integration cancelled.")); return; }
          const worker = new Worker(new URL("./trajectoryWorker.ts", import.meta.url), { type: "module" });
          const finish = () => { worker.terminate(); cancelRunRef.current = null; };
          cancelRunRef.current = () => { finish(); reject(new Error("Trajectory integration cancelled.")); };
          worker.onmessage = (event: MessageEvent<{ ok: true; result: VectorField3DTrajectoryArtifact } | { ok: false; error: string }>) => {
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
      if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
        throw new Error("Scientific vector trajectories require the desktop source verifier.");
      const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
        sceneFingerprint: refs[0].sceneFingerprint });
      if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
      fingerprint = opened.source.fingerprint;
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
    <p>Independent 3D document · bounded arrows and adaptive numerical trajectories.</p></div>
    <div><button type="button" disabled={busy} onClick={() =>
      setLayout(workspace.layout === "viewer-focus" ? "three-pane" : "viewer-focus")}>{
        workspace.layout === "viewer-focus" ? "Show three panes" : "Focus viewer"}</button>
    {" "}<button type="button" disabled={busy} aria-pressed={workspace.layout === "split"}
      onClick={() => setLayout("split")}>Split views</button>
    {" "}<button type="button" disabled={busy} aria-pressed={workspace.layout === "quad"}
      onClick={() => setLayout("quad")}>Quad views</button>
    {multiView && <button type="button" disabled={busy} onClick={() => setLayout("three-pane")}>Single view</button>}
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
            setTrajectories(null); setError(""); }} />
        </label>)}
      </div> : <p>Verified bundle: {document.source.field.references[0].sceneId} · dataset
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
        <label>Max time ({document.source.timeUnit}) <input type="number" min="0.000001" step="any"
          aria-label="Trajectory max time" value={document.source.solver.maxTime} onChange={event => {
            try { updateSource({ ...document.source, solver: { ...document.source.solver,
              maxTime: Number(event.target.value) } }); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }} /></label>
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
      <p>Adaptive RK4 step doubling · at most 2,048 attempted steps per seed in this preview.
        Each trace reports its stop reason; a numerical trace does not certify topology.</p>
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
          setProbeArtifact(null);
        }}>Clear probe</button></div>
        {probeArtifact && <div role="status" data-testid="vector-field3d-probe-values">
          <p>Source revision {probeArtifact.source.revision}; point {probeArtifact.position.map((value, axis) =>
            `${document.source.axes[axis].label} = ${value} ${probeArtifact.coordinateUnits[axis]}`).join(" · ")}.</p>
          <p>{probeArtifact.vector.map((value, index) =>
            `${document.source.field.kind === "scientific-bundle" ?
              document.source.field.references[index].component : ["P", "Q", "R"][index]} = ${value.toPrecision(5)} ${probeArtifact.componentUnits[index]}`).join(" · ")}.</p>
          <p>Magnitude {probeArtifact.magnitude.toPrecision(5)} {probeArtifact.componentUnits[0]}.
            {probeArtifact.sourceHash && ` Source ${probeArtifact.sourceHash}; view ${probeArtifact.viewHash}.`}</p>
        </div>}
        {!probeArtifact && <p role="status">Probe values require a fresh source verification.</p>}
      </>}
    </section>
    {normalAxis !== undefined && <section aria-label="Slice controls">
      <h5>{workspace.selectedLayer.toUpperCase()} slice</h5>
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
        previewLinkedViews() : previewSlice())}>{multiView ? "Preview linked views" : "Preview slice"}</button>
      {workspace.probe && (slice || Object.keys(linkedSlices).length > 0) &&
        <button type="button" onClick={() => dialogRef.current?.querySelector(
          '.scientific-field-explorer-viewer .vector-field3d-line-profile')?.scrollIntoView(
            { behavior: "smooth", block: "nearest" })}>Show line profile through point</button>}
      <p>Each preview checks the current three-component source. The map uses at most 1,024 samples.</p>
      {slice && <p role="status">{slice.shape.join(" × ")} samples; {slice.rejected} invalid;
        {" "}{slice.channel} {slice.min.toPrecision(4)}–{slice.max.toPrecision(4)} {slice.unit}.</p>}
    </section>}
    <p>{datasetLink ? "Verified dataset link" : "Expression field"} ·
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
        multiView ? "Preview linked views" : "Verify & render arrows"}</button>
      {" "}<button type="button" disabled={busy} onClick={save}>Save document</button>
      {" "}<button type="button" disabled={busy || lineBusy || !document.source.seeds.length}
        onClick={() => void runTrajectories()}>{busy ? "Integrating…" : "Run trajectories"}</button>
      {busyAction === "trajectory" && <button type="button" onClick={() => { cancelRequested.current = true;
        cancelRunRef.current?.(); setRunStatus("Cancelling trajectory integration…"); }}>Cancel run</button>}
      {" "}<button type="button" disabled={busy || lineBusy} onClick={reopen}>Open saved document</button>
      {" "}<button type="button" onClick={onClose}>Close</button></div>
    {runStatus && <p role="status" aria-live="polite" data-testid="vector-field3d-run-status">{runStatus}</p>}
    {saveStatus && <p role="status" data-testid="vector-field3d-save-status">{saveStatus}</p>}
    {error && <p role="alert">{error}</p>}
    {artifact && <p role="status" aria-live="polite" data-testid="vector-field3d-render-status">
      Rendered {artifact.accepted} of {artifact.evaluated} 3D samples; {artifact.stationary} stationary,
      {" "}{artifact.rejected} rejected. Source revision {artifact.source.revision}.
      Coordinate units {artifact.coordinateUnits.join(", ")}; vector units {artifact.componentUnits.join(", ")}.
    </p>}
    {trajectories && <div role="status" aria-live="polite" data-testid="vector-field3d-trajectory-status">
      {trajectories.trajectories.map(path => <p key={path.seedId}>
        {path.seedId}: {path.stopReason} after {path.acceptedSteps} accepted and
        {" "}{path.rejectedSteps} rejected steps; {path.evaluations} evaluations;
        {" "}time {path.points.at(-1)?.time.toPrecision(5)} {document.source.timeUnit},
        {" "}arc {path.points.at(-1)?.arcLength.toPrecision(5)} {document.source.axes[0].unit}.
      </p>)}
      <small>Numerical approximation · absolute tolerance {trajectories.solver.absoluteTolerance},
        relative tolerance {trajectories.solver.relativeTolerance}.</small>
    </div>}
    </div>
    <div className="scientific-field-explorer-viewer" aria-label="3D field viewer"
      data-multiview={multiView ? workspace.layout : undefined}>
      {multiView ? <div className={`vector-field3d-linked-grid vector-field3d-linked-grid-${workspace.layout}`}>
        <div className="vector-field3d-linked-cell">{artifact ?
          <VectorField3DArrowView document={document} artifact={artifact}
            trajectories={trajectories} probe={workspace.probe} /> :
          <p role="status">Preview linked views to show the bounded 3D field.</p>}</div>
        {(workspace.layout === "quad" ? ["xy", "xz", "yz"] as const :
          [normalAxis === 1 ? "xz" : normalAxis === 0 ? "yz" : "xy"] as const).map(layer =>
          <div className="vector-field3d-linked-cell" key={layer}>{linkedSlices[layer] ?
            <VectorField3DSliceView document={document} slice={linkedSlices[layer]!}
              clipBounds={workspace.clipBounds} probe={workspace.probe}
              onProbeSelect={point => void selectProbe(point)} /> :
            <p role="status">Preview linked views to show the {layer.toUpperCase()} slice.</p>}</div>)}</div> :
      normalAxis !== undefined ? slice ? <VectorField3DSliceView document={document} slice={slice}
        clipBounds={workspace.clipBounds} probe={workspace.probe}
        onProbeSelect={point => void selectProbe(point)} /> :
        <div role="status" className="scientific-field-explorer-empty">Choose a physical coordinate and preview this slice.
          The current source is verified before scientific values appear.</div> :
        artifact ? <VectorField3DArrowView document={document} artifact={artifact}
          trajectories={trajectories} probe={workspace.probe} /> :
        <div role="status" className="scientific-field-explorer-empty">Verify the field to display bounded 3D arrows.
          Saved scientific bundles are reread before any field values appear.</div>}
    </div>
    </div>
  </div>, mount ?? globalThis.document.body);
}
