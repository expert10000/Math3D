import { useState } from "react";
import { compareVectorField3D, createVectorField3DComparisonResult,
  projectVectorField3DComparisonStatus, VECTOR_FIELD3D_COMPARISON_RESULT_TYPE,
  type AnalysisResultEnvelope, type Math3DProject, type VectorField3DDocument } from "@math3d/core";

export function VectorField3DComparisonPanel({ document, project, onSave }: {
  document: VectorField3DDocument; project: Math3DProject | null | undefined;
  onSave?: (result: AnalysisResultEnvelope) => void;
}) {
  const sources = project?.workspace.entries.filter(entry => entry.module === "vector3d" &&
    entry.expected.id !== document.identity.id).map(entry => entry.checkpoint as VectorField3DDocument) ?? [];
  const [secondId, setSecondId] = useState("");
  const [resolution, setResolution] = useState(9);
  const [result, setResult] = useState<AnalysisResultEnvelope | null>(null);
  const [error, setError] = useState("");
  const compare = () => {
    setResult(null); setError("");
    try {
      const second = sources.find(source => source.identity.id === secondId);
      if (!second) throw new TypeError("Choose a second saved Project field.");
      setResult(createVectorField3DComparisonResult(compareVectorField3D(document, second, {
        frame: "cartesian-identical", grid: [resolution, resolution, resolution],
        units: "identical", interpolation: "analytic-direct", coverage: "complete-or-withhold" })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const status = result && project ? projectVectorField3DComparisonStatus(project, result) : null;
  const saved = project?.workspace.results.filter(item =>
    item.provenance.operation.type === VECTOR_FIELD3D_COMPARISON_RESULT_TYPE &&
    item.provenance.source.documentId === document.identity.id) ?? [];
  return <section aria-label="Field comparison" data-testid="gf18-field-comparison">
    <h5>Field comparison</h5>
    <p>Cartesian frame, identical axes and component units, direct analytic interpolation,
      complete coverage required. Grid is capped at 4096 samples.</p>
    <label>Second saved field <select value={secondId} onChange={event => {
      setSecondId(event.target.value); setResult(null); }}>
      <option value="">Choose source</option>
      {sources.map(source => <option key={source.identity.id} value={source.identity.id}>
        {source.metadata.title} · revision {source.identity.revision}</option>)}
    </select></label>
    <label>Points per axis <select value={resolution} onChange={event => {
      setResolution(Number(event.target.value)); setResult(null); }}>
      {[5, 9, 13, 16].map(n => <option key={n} value={n}>{n}</option>)}
    </select></label>
    <button type="button" disabled={!secondId} onClick={compare}>Compare fields</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>Source A {result.provenance.source.documentId} · revision {result.provenance.source.revision}
        {" "}· {result.provenance.source.structuralHash}</p>
      <p>Source B {String((result.provenance.operation.parameters.secondSource as
        { documentId: string }).documentId)} ·
        {" "}{String((result.provenance.operation.parameters.secondSource as
          { revision: number }).revision)} ·
        {" "}{String((result.provenance.operation.parameters.secondSource as
          { structuralHash: string }).structuralHash)}</p>
      <p>Coverage {String(result.summary.valid)}/{String(result.summary.sampled)};
        {" "}angular undefined {String(result.summary.angularUndefined)}.
        {" "}{status?.status === "withheld" ? `Values withheld: ${status.reason}.` :
          `Mean vector difference ${String((result.summary.vectorDifference as { mean: number }).mean)}; ` +
          `mean magnitude difference ${String((result.summary.scalarMagnitudeDifference as { mean: number }).mean)}; ` +
          `mean angular error ${String((result.summary.angularError as { meanRadians: number }).meanRadians)} rad.`}</p>
      <button type="button" disabled={!onSave || status?.status !== "current"}
        onClick={() => { try { onSave?.(result); setError(""); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>
        Save comparison in Project</button>
    </div>}
    {saved.length > 0 && <details><summary>Saved comparisons ({saved.length})</summary>
      <ul>{saved.map(item => {
        const savedStatus = projectVectorField3DComparisonStatus(project!, item);
        return <li key={item.resultId}>Source pair {item.provenance.source.documentId} /
          {String((item.provenance.operation.parameters.secondSource as { documentId: string }).documentId)}:
          {" "}{savedStatus.status === "current" ? "current" : `withheld (${savedStatus.reason})`}</li>;
      })}</ul></details>}
  </section>;
}
