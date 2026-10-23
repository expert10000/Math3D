import { useState } from "react";
import { createVectorField3DDocument, parseVectorField3DDocument, reviseVectorField3DDocument,
  sampleVectorField3DArrows, sampleVectorField3DScientificArrows, serializeVectorField3DDocument,
  vectorField3DExpression, type VectorField3DArrowArtifact, type VectorField3DDocument,
  type VectorField3DSource, type VectorField3DExpression } from "@math3d/core";
import { VectorField3DArrowView } from "./VectorField3DArrowView";

const storageKey = "math3d.vector-field3d.document.v1";
export function createDefaultVectorField3DDocument(): VectorField3DDocument {
  const axes = (["x", "y", "z"] as const).map(role => ({ role, label: role, unit: "m", min: -4, max: 4 })) as
    unknown as VectorField3DSource["axes"];
  return createVectorField3DDocument({ axes, timeUnit: "s", field: { kind: "expressions",
    components: [vectorField3DExpression("-y", "m/s"), vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s")] }, seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512,
      magnitudeScale: 1, colorBy: "speed" }, solver: { absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6, maxSteps: 10000, maxTime: 20 } },
  { stableKey: "graphs-vector-field-3d", title: "3D vector field" });
}

export function VectorField3DPanel({ initialDocument, onClose }: {
  initialDocument?: VectorField3DDocument; onClose: () => void;
}) {
  const [document, setDocument] = useState(initialDocument ?? createDefaultVectorField3DDocument);
  const [expressions, setExpressions] = useState<[string, string, string]>(document.source.field.kind === "expressions" ?
    document.source.field.components.map(component => component.source) as [string, string, string] : ["-y", "x", "0"]);
  const [artifact, setArtifact] = useState<VectorField3DArrowArtifact | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const updateSource = (source: VectorField3DSource) => {
    setDocument(reviseVectorField3DDocument(document, source)); setArtifact(null); setError("");
  };
  const currentDocument = () => document.source.field.kind === "expressions" ?
    reviseVectorField3DDocument(document, { ...document.source, field: { kind: "expressions",
      components: expressions.map((source, index) => vectorField3DExpression(source,
        document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : "m/s")) as
        [VectorField3DExpression, VectorField3DExpression, VectorField3DExpression] } }) : document;
  const render = async () => {
    if (busy) return;
    setBusy(true); setArtifact(null); setError("");
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
      setBusy(false); }
  };
  const save = () => {
    try { const next = currentDocument(); window.localStorage.setItem(storageKey,
      serializeVectorField3DDocument(next)); setDocument(next); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const reopen = () => {
    try { const saved = window.localStorage.getItem(storageKey);
      if (!saved) throw new Error("No saved 3D vector-field document.");
      const next = parseVectorField3DDocument(saved);
      setDocument(next); setExpressions(next.source.field.kind === "expressions" ?
        next.source.field.components.map(component => component.source) as [string, string, string] : ["-y", "x", "0"]);
      setArtifact(null); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div role="dialog" aria-modal="true" aria-label="3D vector field editor"
    className="graph2d-scientific-import vector-field3d-editor" data-testid="vector-field-3d-editor"
    onPointerDown={event => event.stopPropagation()}
    style={{ width: "min(900px, 92vw)", maxHeight: "85vh", overflowY: "auto", zIndex: 35 }}>
    <h3>3D vector field · {document.metadata.title}</h3>
    <p>Independent 3D document · bounded arrow preview · trajectories follow after renderer validation.</p>
    {document.source.field.kind === "expressions" ?
      <div role="group" aria-label="Vector components" className="vector-field3d-controls">
        {(["P(x,y,z)", "Q(x,y,z)", "R(x,y,z)"] as const).map((label, index) => <label key={label}>
          {label} ({document.source.field.kind === "expressions" ? document.source.field.components[index]!.unit : ""})
          <input aria-label={label} value={expressions[index]} onChange={event => {
            const next = [...expressions] as [string, string, string]; next[index] = event.target.value;
            setExpressions(next); setArtifact(null); setError(""); }} />
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
    <div><button type="button" disabled={busy} onClick={() => void render()}>{busy ? "Verifying…" :
      "Verify & render arrows"}</button> <button type="button" onClick={save}>Save document</button>
      {" "}<button type="button" onClick={reopen}>Open saved document</button>
      {" "}<button type="button" onClick={onClose}>Close</button></div>
    {error && <p role="alert">{error}</p>}
    {artifact && <VectorField3DArrowView document={document} artifact={artifact} />}
  </div>;
}
