import { useState } from "react";
import { computeVectorField3DPoincareReturnMap, computeVectorField3DLyapunov,
  computeVectorField3DLocalManifoldPatch, projectPoincareReturnStatus,
  projectLyapunovStatus, projectLocalManifoldPatchStatus,
  projectVectorField3DTopologyStatus, type AnalysisResultEnvelope,
  type LocalManifoldPatch, type LyapunovStudy, type Math3DProject,
  type PoincareReturnStudy, type VectorField3DDocument } from "@math3d/core";

export function VectorField3DAdvancedTopologyPanel({ document, project,
  onSaveReturn, onOpenReturn, onSaveLyapunov, onPromoteManifold }: {
  document: VectorField3DDocument; project?: Math3DProject | null;
  onSaveReturn?: (study: PoincareReturnStudy) => void;
  onOpenReturn?: (result: AnalysisResultEnvelope) => void;
  onSaveLyapunov?: (study: LyapunovStudy) => void;
  onPromoteManifold?: (patch: LocalManifoldPatch) => void;
}) {
  const axes = document.source.axes;
  const center = axes.map(axis => (axis.min + axis.max) / 2);
  const span = Math.min(...axes.map(axis => axis.max - axis.min));
  const [sectionId, setSectionId] = useState("");
  const [returnStudy, setReturnStudy] = useState<PoincareReturnStudy | null>(null);
  const [seed, setSeed] = useState<[number, number, number]>(
    [center[0]! + span / 16, center[1]! + span / 16, center[2]!]);
  const [interval, setInterval] = useState(2);
  const [perturbation, setPerturbation] = useState(span * .001);
  const [lyapunov, setLyapunov] = useState<LyapunovStudy | null>(null);
  const [constructionId, setConstructionId] = useState("");
  const [branch, setBranch] = useState<"stable" | "unstable">("stable");
  const [manifold, setManifold] = useState<LocalManifoldPatch | null>(null);
  const [message, setMessage] = useState("");
  const run = (task: () => void) => {
    try { setMessage(""); task(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };
  const sections = project?.workspace.results.filter(result =>
    result.provenance.operation.type === "vector3d.poincare-section" &&
    result.provenance.source.documentId === document.identity.id &&
    projectVectorField3DTopologyStatus(project, result).status === "current") ?? [];
  const saved = project?.workspace.results.filter(result =>
    ["vector3d.poincare-return-map", "vector3d.lyapunov-finite-time",
      "vector3d.local-manifold-patch"].includes(result.provenance.operation.type) &&
    result.provenance.source.documentId === document.identity.id) ?? [];
  const constructions = document.workspace?.equilibriumConstructions ?? [];
  return <section aria-label="Advanced local topology" data-gf06-section="analyze"
    data-testid="gf44-gf46-advanced-topology">
    <h5>Return maps, finite-time growth and local manifold patches</h5>
    <p>Bounded analytic gates. Source-linked results are withheld after the field changes.</p>
    <div data-testid="gf44-return-controls">
      <h6>Poincaré return map</h6>
      <label>Saved oriented section <select value={sectionId}
        onChange={event => setSectionId(event.target.value)}>
        <option value="">Choose a saved GF-42 section</option>
        {sections.map(item => <option key={item.resultId} value={item.resultId}>
          {item.resultId.slice(-12)} · {String(item.summary.crossingCount)} crossings
        </option>)}
      </select></label>
      <button type="button" disabled={!project || !sectionId} onClick={() => run(() =>
        setReturnStudy(computeVectorField3DPoincareReturnMap(project!, sectionId)))}>
        Compute bounded return pairs</button>
      {returnStudy && <p role="status" data-testid="gf44-return-status">
        {returnStudy.status === "ready" ?
          `${returnStudy.rows.length} ordered pairs · refinement difference ${returnStudy.maxRefinementDifference.toPrecision(3)}` :
          `Return map unavailable: ${returnStudy.reason}`}
      </p>}
      {returnStudy?.status === "ready" && <button type="button"
        disabled={!onSaveReturn} onClick={() => run(() => {
          onSaveReturn?.(returnStudy); setMessage("Return-map recipe saved in Project.");
        })}>Save return map</button>}
    </div>
    <div data-testid="gf45-lyapunov-controls">
      <h6>Finite-time directional Lyapunov estimate</h6>
      {seed.map((value, axis) => <label key={axis}>Seed {axes[axis]!.label}
        <input type="number" step="any" value={value} onChange={event =>
          setSeed(previous => previous.map((item, i) => i === axis ?
            Number(event.target.value) : item) as [number, number, number])} />
      </label>)}
      <label>Interval ({document.source.timeUnit}) <input type="number" step="any"
        value={interval} onChange={event => setInterval(Number(event.target.value))} /></label>
      <label>Perturbation ({axes[0].unit}) <input type="number" step="any"
        value={perturbation} onChange={event =>
          setPerturbation(Number(event.target.value))} /></label>
      <button type="button" onClick={() => run(() => setLyapunov(
        computeVectorField3DLyapunov(document, { seed, direction: [1, 0, 0],
          perturbation, interval, solver: { method: "rk4-step-doubling",
            maxSteps: 256, maxTime: interval, absoluteTolerance: 1e-5,
            relativeTolerance: 1e-5 } })))}>
        Estimate finite-time growth</button>
      {lyapunov && <p role="status" data-testid="gf45-lyapunov-status">
        {lyapunov.status === "resolved" ?
          `Finite-time estimate ${lyapunov.estimate!.toPrecision(5)} ± ${lyapunov.uncertainty!.toPrecision(3)} 1/${document.source.timeUnit}; ${lyapunov.evaluations} evaluations.` :
          `Estimate unavailable: ${lyapunov.reason}; stops ${lyapunov.stopReasons.join(", ")}.`}
      </p>}
      {lyapunov?.status === "resolved" && <button type="button"
        disabled={!onSaveLyapunov} onClick={() => run(() => {
          onSaveLyapunov?.(lyapunov); setMessage("Finite-time recipe saved in Project.");
        })}>Save finite-time estimate</button>}
    </div>
    <div data-testid="gf46-manifold-controls">
      <h6>Local 3D manifold patch</h6>
      <label>Saved equilibrium <select value={constructionId}
        onChange={event => setConstructionId(event.target.value)}>
        <option value="">Choose a saved equilibrium</option>
        {constructions.map(item => <option key={item.id} value={item.id}>
          {item.id} · {item.classification}</option>)}
      </select></label>
      <label>Branch <select value={branch} onChange={event =>
        setBranch(event.target.value as "stable" | "unstable")}>
        <option value="stable">Stable</option><option value="unstable">Unstable</option>
      </select></label>
      <button type="button" disabled={!constructionId} onClick={() => run(() =>
        setManifold(computeVectorField3DLocalManifoldPatch(document, {
          constructionId, branch, offsetFraction: .01, seedCount: 8,
          rings: 5, timeLimit: 1, solver: { method: "rk4-step-doubling",
            maxSteps: 256, absoluteTolerance: 1e-5,
            relativeTolerance: 1e-5 } })))}>
        Build bounded local patch</button>
      {manifold && <p role="status" data-testid="gf46-manifold-status">
        {manifold.status === "resolved" ?
          `Local ${branch} patch · ${manifold.vertices.length} vertices · ${manifold.triangles.length} triangles · stops ${manifold.stopReasons.join(", ")}.` :
          `Patch unavailable: ${manifold.reason}; stops ${manifold.stopReasons.join(", ")}.`}
      </p>}
      {manifold?.status === "resolved" && <button type="button"
        disabled={!onPromoteManifold} onClick={() => run(() => {
          onPromoteManifold?.(manifold); setMessage("Local patch saved as a source-linked Mesh.");
        })}>Save local patch as Mesh</button>}
    </div>
    {!!message && <p role="status">{message}</p>}
    {saved.map(result => {
      const type = result.provenance.operation.type;
      const status = type === "vector3d.poincare-return-map" ?
        projectPoincareReturnStatus(project!, result) :
        type === "vector3d.lyapunov-finite-time" ?
          projectLyapunovStatus(project!, result) :
          projectLocalManifoldPatchStatus(project!, result);
      return <div key={result.resultId} data-testid="gf44-gf46-saved-result">
        {type} · {status.status === "current" ? "current" :
          `values withheld: ${status.reason}`}
        {type === "vector3d.poincare-return-map" &&
          <button type="button" disabled={status.status !== "current" ||
            !onOpenReturn} onClick={() => onOpenReturn?.(result)}>
            Open return map in Graphs</button>}
      </div>;
    })}
  </section>;
}
