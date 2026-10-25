import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createVectorField3DDocument, parseVectorField3DDocument, reviseVectorField3DDocument,
  createScientificDatasetLink,
  sampleVectorField3DArrows, sampleVectorField3DScientificArrows, serializeVectorField3DDocument,
  integrateVectorField3DScientificTrajectories,
  scientificPointWithinBounds,
  vectorField3DExpression, type VectorField3DArrowArtifact, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DExpression, type VectorField3DTrajectoryArtifact,
  type Graph2DScientificDatasetPreview } from "@math3d/core";
import { VectorField3DArrowView } from "./VectorField3DArrowView";
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
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { cancelRunRef.current?.(); previous?.focus(); };
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
  const updateSource = (source: VectorField3DSource) => {
    setDocument(reviseVectorField3DDocument(document, source)); setArtifact(null); setTrajectories(null); setError(""); setRunStatus("");
  };
  const currentDocument = () => document.source.field.kind === "expressions" ?
    reviseVectorField3DDocument(document, { ...document.source, field: { kind: "expressions",
      components: expressions.map((source, index) => vectorField3DExpression(source,
        document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : "m/s")) as
        [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] } }) : document;
  const render = async () => {
    if (busy || lineBusy) return;
    setBusy(true); setBusyAction("render"); setArtifact(null); setTrajectories(null); setError("");
    let fingerprint: string | null = null;
    try {
      const next = currentDocument();
      if (next.source.field.kind === "expressions") {
        setArtifact(sampleVectorField3DArrows(next)); setDocument(next); return;
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
      setArtifact(result); setDocument(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      setBusy(false); setBusyAction(null); }
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
    setBusy(true); setBusyAction("trajectory"); setArtifact(null); setTrajectories(null); setError(""); setRunStatus("Verifying source and preparing trajectory worker…");
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
      setDocument(next); setExpressions(next.source.field.kind === "expressions" ?
        next.source.field.components.map(component => component.source) as [string, string, string] : ["-y", "x", "0"]);
      setSeedDraft(next.source.axes.map(axis => String((axis.min + axis.max) / 2)) as [string, string, string]);
      setArtifact(null); setTrajectories(null); setError(""); setRunStatus(""); setSaveStatus(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return createPortal(<div className="scientific-field-explorer" role="region"
    aria-label="Scientific Field Explorer" data-testid="scientific-field-explorer">
    <div
      ref={dialogRef} onKeyDown={onDialogKey}
      className="graph2d-scientific-import vector-field3d-editor scientific-field-explorer-content"
      data-testid="vector-field-3d-editor"
      onPointerDown={event => event.stopPropagation()}>
    <header className="scientific-field-explorer-header"><div><h3>Scientific Field Explorer · {document.metadata.title}</h3>
    <p>Independent 3D document · bounded arrows and adaptive numerical trajectories.</p></div>
    <button type="button" onClick={onClose}>Back to Graphs</button></header>
    <div className="scientific-field-explorer-controls" aria-label="Field controls">
    <fieldset className="vector-field3d-form" disabled={busy}>
    {document.source.field.kind === "expressions" ?
      <div role="group" aria-label="Vector components" className="vector-field3d-controls">
        {(["P(x,y,z)", "Q(x,y,z)", "R(x,y,z)"] as const).map((label, index) => <label key={label}>
          {label} ({document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : ""})
          <input aria-label={label} value={expressions[index]} onChange={event => {
            const next = [...expressions] as [string, string, string]; next[index] = event.target.value;
            setExpressions(next); setArtifact(null); setTrajectories(null); setError(""); }} />
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
    <VectorField3DGraphLinePanel key={document.identity.structuralHash} document={document} disabled={busy}
      onBusyChange={setLineBusy} onAddGraphLine={onAddGraphLine} isGraphLineImported={isGraphLineImported} />
    </div>
    <div className="scientific-field-explorer-inspector" aria-label="Field status and actions">
    <h4>Inspector</h4>
    <p>{datasetLink ? "Verified dataset link" : "Expression field"} ·
      {datasetLink ? ` ${datasetLink.shape.join(" × ")} samples` : " bounded authored domain"}</p>
    {datasetLink && <details aria-label="Dataset provenance"><summary>Dataset provenance</summary>
      <p>Source hash <code>{datasetLink.sourceHash}</code></p>
      <p>Scene {datasetLink.sceneId} · dataset {datasetLink.datasetId}</p>
      <ul>{datasetLink.components.map(component => <li key={component.name}>
        {component.name}: <code>{component.resourceSha256}</code></li>)}</ul>
      <p>Axes: {datasetLink.axes.map(axis => `${axis.name} (${axis.unit})`).join(" · ")}</p>
    </details>}
    <div><button type="button" disabled={busy || lineBusy} onClick={() => void render()}>{busy ? "Verifying…" :
      "Verify & render arrows"}</button> <button type="button" disabled={busy} onClick={save}>Save document</button>
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
    <div className="scientific-field-explorer-viewer" aria-label="3D field viewer">
      {artifact ? <VectorField3DArrowView document={document} artifact={artifact} trajectories={trajectories} /> :
        <div role="status" className="scientific-field-explorer-empty">Verify the field to display bounded 3D arrows.
          Saved scientific bundles are reread before any field values appear.</div>}
    </div>
    </div>
  </div>, mount ?? globalThis.document.body);
}
