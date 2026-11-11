import { useRef, useState, type FormEvent } from "react";
import { algebraicLocusGeometryDocument, buildSageAlgebraicLocusScene, canonicalJsonStringify,
  sampleSageAlgebraicLocus, sampledAlgebraicLocusGeometryDocument,
  analyzeSageAlgebraicSingularity, algebraicSingularityGeometryDocument,
  projectAlgebraCasHandoff, projectAlgebraOpenInActions, resolveProjectAlgebraCasHandoff,
  resolveProjectAlgebraOpenIn, resolveProjectAlgebraPreparedLocus,
  type ProjectAlgebraCasHandoff, type ProjectAlgebraOpenInAction,
  type AlgebraObjectRef, type Math3DProject, type SageAlgebraicLocusScene,
  type SageAlgebraicLocusSample, type SageAlgebraicSingularityScene } from "@math3d/core";
import SageAlgebraicLocusPlot from "./SageAlgebraicLocusPlot";
import SageAlgebraicSingularityView from "./SageAlgebraicSingularityView";
import { sageExecutionRegistry, type SageBackend,
  type SageOperationHandle } from "../../services/sageOperationExecution";
import type { SageRunResponse } from "../../integrations/sage/sageSchemas";

type Props = { project: Math3DProject; target: AlgebraObjectRef;
  onSave: (scene: SageAlgebraicLocusScene) => void | Promise<void>;
  onSaveSample: (sample: SageAlgebraicLocusSample) => void | Promise<void>;
  onOpenGeometry?: (documentId: string) => void | Promise<void>;
  onSaveSingularity: (analysis: SageAlgebraicSingularityScene) => void | Promise<void>;
  onSaveSageEvidence?: (scene: SageAlgebraicLocusScene, response: SageRunResponse,
    backend: SageBackend) => void | Promise<void> };
const axisNames = ["x", "y", "z"];
const download = (name: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function SageAlgebraicLocusBuilder({ project, target, onSave, onSaveSample,
  onOpenGeometry, onSaveSingularity, onSaveSageEvidence }: Props) {
  const record = project.algebraObjects?.find((entry) => entry.id === target.objectId)?.revisions[target.revision - 1];
  const ambientRef = record?.definition.kind === "ideal" ? record.definition.ambientRing : null;
  const ambient = ambientRef
    ? project.algebraObjects?.find((entry) => entry.id === ambientRef.objectId)
      ?.revisions[ambientRef.revision - 1]
    : record?.definition.kind === "polynomial-ring" ? record : null;
  const variables = ambient?.definition.kind === "polynomial-ring" ? ambient.definition.variables : [];
  const [polynomial, setPolynomial] = useState(() => `${variables.map((variable) => `${variable}^2`).join("+")}-1`);
  const [bounds, setBounds] = useState([{ min: "-2", max: "2" }, { min: "-2", max: "2" },
    { min: "-2", max: "2" }]);
  const [tolerance, setTolerance] = useState("0.001");
  const [maxSamples, setMaxSamples] = useState("50000");
  const [preview, setPreview] = useState<{ signature: string; scene: SageAlgebraicLocusScene;
    choice: ProjectAlgebraCasHandoff } | null>(null);
  const [sampled, setSampled] = useState<{ signature: string; sample: SageAlgebraicLocusSample } | null>(null);
  const [point, setPoint] = useState(["0", "0", "0"]);
  const [inspected, setInspected] = useState<{ signature: string; analysis: SageAlgebraicSingularityScene } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sageBackend, setSageBackend] = useState<SageBackend>("local");
  const [sageMessage, setSageMessage] = useState("");
  const [sageRunning, setSageRunning] = useState(false);
  const sageHandle = useRef<SageOperationHandle | null>(null);
  const handoff = projectAlgebraCasHandoff(project, target);
  const signature = JSON.stringify({ projectId: project.identity.id, target, polynomial,
    bounds: bounds.slice(0, variables.length), tolerance, maxSamples });
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const scene = preview?.signature === signature ? preview.scene : null;
  const sample = sampled?.signature === signature ? sampled.sample : null;
  const analysisSignature = `${signature}/${JSON.stringify(point.slice(0, variables.length))}`;
  const analysis = inspected?.signature === analysisSignature ? inspected.analysis : null;
  const openInActions = projectAlgebraOpenInActions(project, target, scene, sample);
  const qualifiedScene = (() => {
    if (!scene || !preview) return null;
    try { return resolveProjectAlgebraPreparedLocus(project, target, scene, preview.choice); }
    catch { return null; }
  })();
  const requireQualifiedScene = () => {
    if (!scene || !preview) throw new TypeError("Validate a bounded real locus first.");
    return resolveProjectAlgebraPreparedLocus(project, target, scene, preview.choice);
  };
  const prepare = (event: FormEvent) => {
    event.preventDefault(); setMessage(""); setPreview(null); setSampled(null); setInspected(null);
    try {
      resolveProjectAlgebraCasHandoff(project, target, handoff);
      const prepared = buildSageAlgebraicLocusScene(project, target, {
        ...(record?.definition.kind === "polynomial-ring" ? { polynomial } : {}),
        bounds: bounds.slice(0, variables.length).map((item) => ({ min: Number(item.min), max: Number(item.max) })),
        tolerance: Number(tolerance), maxSamples: Number(maxSamples) });
      setPreview({ signature, scene: prepared, choice: handoff });
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const openInGeometry = async (choice: ProjectAlgebraOpenInAction) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const qualified = resolveProjectAlgebraOpenIn(project, target, scene, sample, choice);
      if (qualified.format === "math3d.sage-algebraic-locus-scene") {
        await onSave(qualified);
        setMessage("Saved uncomputed real-locus Geometry contract to Project.");
        await onOpenGeometry?.(algebraicLocusGeometryDocument(qualified).identity.id);
      } else {
        await onSaveSample(qualified);
        setMessage("Saved bounded real-locus sample to Project Geometry.");
        await onOpenGeometry?.(sampledAlgebraicLocusGeometryDocument(qualified).identity.id);
      }
    }
    catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  const render = () => {
    if (!scene || busy) return;
    setMessage("");
    try { setSampled({ signature, sample: sampleSageAlgebraicLocus(requireQualifiedScene()) }); }
    catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const inspect = () => {
    if (!scene || busy) return;
    setMessage(""); setInspected(null);
    try { setInspected({ signature: analysisSignature,
      analysis: analyzeSageAlgebraicSingularity(requireQualifiedScene(), point.slice(0, variables.length)) }); }
    catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const saveAnalysis = async () => {
    if (!analysis || busy) return;
    setBusy(true); setMessage("");
    try {
      if (analysis.scene.sceneHash !== requireQualifiedScene().sceneHash)
        throw new TypeError("The tangent analysis no longer matches the prepared locus.");
      await onSaveSingularity(analysis);
      setMessage("Saved exact tangent and singular-locus view to Project Geometry.");
    }
    catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  const runSageSingularities = async () => {
    if (busy || sageRunning || !onSaveSageEvidence) return;
    const requestedSignature = signature;
    setSageRunning(true); setSageMessage("Running supported Sage symbolic singularities job…");
    try {
      const qualified = requireQualifiedScene();
      if (qualified.source.equations.length !== 1)
        throw new TypeError("Sage symbolic singularities accepts one polynomial; this ideal has multiple generators.");
      const handle = sageExecutionRegistry.run({ operation: "sage.symbolic.singularities",
        jobId: crypto.randomUUID(), backend: sageBackend,
        params: { expression: qualified.source.equations[0],
          variables: qualified.domain.bounds.map(bound => bound.variable) } });
      sageHandle.current = handle;
      const { response } = await handle.promise;
      if (!response.success) throw new TypeError(response.error ?? "Sage singularities did not complete.");
      if (currentSignature.current !== requestedSignature)
        throw new TypeError("Locus source or bounds changed during the Sage job; result was not saved.");
      await onSaveSageEvidence(qualified, response, sageBackend);
      setSageMessage("Saved Sage singularity result with its exact locus source in Project.");
    } catch (error) { setSageMessage(`Sage locus result withheld: ${(error as Error).message}`); }
    finally { sageHandle.current = null; setSageRunning(false); }
  };
  if (!record || (record.definition.kind !== "ideal" && record.definition.kind !== "polynomial-ring")) return null;
  return <section data-testid="cas-locus-builder" style={{ display: "grid", gap: 8,
    border: "1px solid #c7d9ed", borderRadius: 8, padding: 10, maxWidth: 720 }}>
    <strong>Real-locus scene contract and plot</strong>
    <div style={{ fontSize: 12 }}>Keep exact equations and source revisions with a bounded numerical curve or surface sample.</div>
    <form onSubmit={prepare} className="sage-structure-grid">
      {record.definition.kind === "polynomial-ring" && <label style={{ gridColumn: "1 / -1" }}>
        Polynomial equation = 0<input aria-label="Locus polynomial" value={polynomial}
          onChange={(event) => setPolynomial(event.target.value)} maxLength={256} required /></label>}
      {variables.map((variable, index) => <div key={variable} style={{ display: "flex", gap: 6 }}>
        <label>{axisNames[index]} axis ({variable}) min<input aria-label={`${variable} bound min`} type="number" step="any"
          value={bounds[index].min} onChange={(event) => setBounds((current) => current.map((item, at) =>
            at === index ? { ...item, min: event.target.value } : item))} required /></label>
        <label>max<input aria-label={`${variable} bound max`} type="number" step="any"
          value={bounds[index].max} onChange={(event) => setBounds((current) => current.map((item, at) =>
            at === index ? { ...item, max: event.target.value } : item))} required /></label>
      </div>)}
      <label>Tolerance<input aria-label="Locus tolerance" type="number" step="any" min="0.000001" max="0.1"
        value={tolerance} onChange={(event) => setTolerance(event.target.value)} required /></label>
      <label>Sample cap<input aria-label="Locus sample cap" type="number" step="1" min="1000" max="200000"
        value={maxSamples} onChange={(event) => setMaxSamples(event.target.value)} required /></label>
      <button type="submit" disabled={busy || !handoff.enabled}
        title={handoff.disabledReason ?? undefined}>Validate & preview locus</button>
    </form>
    {handoff.disabledReason && <div role="status">{handoff.disabledReason} Saved evidence remains available for inspection.</div>}
    <div data-testid="cas-open-in-geometry" role="group" aria-label="Open in Geometry destinations"
      style={{ display: "grid", gap: 5, border: "1px solid #dbe2ea", borderRadius: 6, padding: 8 }}>
      <strong>Open in…</strong>
      {openInActions.map(action => <div key={action.id}>
        <button type="button" disabled={busy || !action.enabled} title={action.disabledReason ?? action.preview}
          onClick={() => { void openInGeometry(action); }}>{action.label}</button>
        <small style={{ display: "block" }}>{action.disabledReason ?? action.preview}</small>
      </div>)}
    </div>
    {message && <div role={message.startsWith("Saved") ? "status" : "alert"}>{message}</div>}
    {scene && <div data-testid="cas-locus-preview" style={{ display: "grid", gap: 5,
      borderTop: "1px solid #dbe2ea", paddingTop: 8, fontSize: 12 }}>
      <div><strong>Exact source:</strong> {scene.source.target.label}@{scene.source.target.revision} · {scene.source.target.contentHash}</div>
      <div><strong>Equations:</strong> {scene.source.equations.map((item) => `${item}=0`).join("; ")}</div>
      <div><strong>Domain:</strong> real Cartesian · {scene.domain.bounds.map((item) =>
        `${item.axis}(${item.variable})∈[${item.min}, ${item.max}]`).join(" · ")}</div>
      <div><strong>Precision:</strong> tolerance {scene.precision.tolerance}; sample cap {scene.precision.maxSamples}</div>
      <div><strong>Rendering:</strong> uncomputed · completeness unknown</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" disabled={busy || !qualifiedScene} onClick={render}>Render bounded real locus</button>
        <button type="button" onClick={() => download(`math3d-locus-${scene.source.target.revision}.json`,
          canonicalJsonStringify(scene))}>Export scene JSON</button>
        <button type="button" onClick={() => download(`math3d-locus-geometry-${scene.source.target.revision}.json`,
          canonicalJsonStringify(algebraicLocusGeometryDocument(scene)))}>Export Geometry JSON</button>
      </div>
      {onSaveSageEvidence && <div data-testid="cas-locus-sage" style={{ display: "grid", gap: 5 }}>
        <strong>Sage symbolic singularities · one polynomial</strong>
        <label>Backend <select aria-label="Locus Sage backend" value={sageBackend}
          disabled={sageRunning} onChange={event => setSageBackend(event.target.value as SageBackend)}>
          <option value="local">Local WSL</option><option value="docker">Docker service</option>
        </select></label>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" data-testid="cas-locus-run-sage" disabled={busy || sageRunning ||
            !qualifiedScene || qualifiedScene.source.equations.length !== 1}
            onClick={() => { void runSageSingularities(); }}>Run Sage singularities and save result</button>
          {sageRunning && <button type="button" data-testid="cas-locus-cancel-sage"
            onClick={() => { sageHandle.current?.cancel(); setSageMessage("Cancelling Sage locus job…"); }}>Cancel Sage job</button>}
        </div>
        {sageMessage && <p role="status" data-testid="cas-locus-sage-status">{sageMessage}</p>}
      </div>}
      {sample && <div data-testid="cas-locus-sample" style={{ display: "grid", gap: 6 }}>
        <SageAlgebraicLocusPlot sample={sample} />
        <div>Exact source: {sample.scene.source.target.label}@{sample.scene.source.target.revision} · {sample.scene.sceneHash}</div>
        <div>{sample.warnings.join(" ")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => download(`math3d-locus-sample-${scene.source.target.revision}.json`,
            canonicalJsonStringify(sample))}>Export sample JSON</button>
          <button type="button" onClick={() => download(`math3d-locus-sampled-geometry-${scene.source.target.revision}.json`,
            canonicalJsonStringify(sampledAlgebraicLocusGeometryDocument(sample)))}>Export sampled Geometry JSON</button>
        </div>
      </div>}
      <div style={{ display: "grid", gap: 5, borderTop: "1px solid #dbe2ea", paddingTop: 8 }}>
        <strong>Exact tangent and singular-locus inspection</strong>
        <div>Inspect one rational point. The hypersurface Jacobian equations remain unsolved globally.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {variables.map((variable, index) => <label key={variable}>{variable} point
            <input aria-label={`${variable} inspection point`} value={point[index]}
              onChange={(event) => setPoint((current) => current.map((item, at) =>
                at === index ? event.target.value : item))} style={{ width: 75 }} /></label>)}
          <button type="button" disabled={busy || !qualifiedScene} onClick={inspect}>Inspect tangent and singular locus</button>
        </div>
        {analysis && <div style={{ display: "grid", gap: 6 }}>
          <SageAlgebraicSingularityView analysis={analysis} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" disabled={busy || !qualifiedScene}
              onClick={() => { void saveAnalysis(); }}>Save tangent view to Project</button>
            <button type="button" onClick={() => download(`math3d-locus-tangent-${scene.source.target.revision}.json`,
              canonicalJsonStringify(analysis))}>Export tangent scene JSON</button>
            <button type="button" onClick={() => download(`math3d-locus-tangent-geometry-${scene.source.target.revision}.json`,
              canonicalJsonStringify(algebraicSingularityGeometryDocument(analysis)))}>Export tangent Geometry JSON</button>
          </div>
        </div>}
      </div>
    </div>}
  </section>;
}
