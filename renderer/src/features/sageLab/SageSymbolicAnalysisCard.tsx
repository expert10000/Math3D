import React from "react";
import katex from "katex";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";
import { sageResultActions, sageResultDiagnostics, sageResultKind, type SageSourceStatus } from "./sageResultPresentation";
import type { SageViewerProvenance } from "./sageViewerArtifact";

const labelFor = (operation: string) => ({
  "sage.symbolic.gradient": "Gradient",
  "sage.symbolic.hessian": "Hessian",
  "sage.symbolic.singularities": "Singularities",
  "sage.symbolic.solve": "Solutions",
  "sage.symbolic.factor": "Factored expression",
  "sage.symbolic.simplify": "Simplified expression",
  "sage.symbolic.expand": "Expanded expression",
  "sage.matrix.eigen_exact": "Exact eigenvalues",
  "sage.matrix.charpoly": "Characteristic polynomial",
  "sage.polynomial.factor": "Polynomial factorization",
  "sage.polynomial.roots_exact": "Exact roots",
  "sage.groebner.compute": "Gröbner basis",
  "sage.numberTheory.gcd": "Greatest common divisor",
  "sage.numberTheory.modInverse": "Modular inverse",
}[operation] ?? "Symbolic result");

export const SageSymbolicAnalysisCard: React.FC<{
  record: SymbolicResultRecord;
  sourceStatus: SageSourceStatus;
  onPreviewVector?: () => void;
  onCommitVector?: () => void;
  onPreviewGeometry?: () => void;
  onCommitGeometry?: () => void;
  onDiscardPreview?: () => void;
  previewKind?: "vector" | "geometry" | null;
  viewerProvenance?: SageViewerProvenance | null;
  onSaveWorkbook?: () => void;
  actionStatus?: string | null;
}> = ({ record, sourceStatus, onPreviewVector, onCommitVector, onPreviewGeometry, onCommitGeometry,
  onDiscardPreview, previewKind, viewerProvenance, onSaveWorkbook, actionStatus }) => {
  const { response, expression, backend } = record;
  const kind = sageResultKind(response);
  const actions = sageResultActions(response, sourceStatus);
  const math = response.success && response.latex && response.latex.length < 4000
    ? katex.renderToString(response.latex, { displayMode: true, throwOnError: false, trust: false, strict: "ignore" })
    : null;
  const text = typeof response.result.text === "string" ? response.result.text
    : typeof response.result.value === "string" ? response.result.value : JSON.stringify(response.result);
  const diagnostics = sageResultDiagnostics(response);
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const solutionItems = list(response.result.solutions).length ? list(response.result.solutions)
    : list(response.result.points).length ? list(response.result.points) : list(response.result.roots);
  const sourceLabel = ({ current: "Source current", stale: "Source changed — rerun required",
    unavailable: "Source unavailable — verify before reuse", unlinked: "Freeform input — no saved source link" } as const)[sourceStatus];
  return <section data-testid="sage-analysis-result" aria-label="Symbolic result"
    style={{ border: "1px solid #b9d6ea", borderRadius: 10, background: "#f4faff", padding: 12, marginBottom: 12, display: "grid", gap: 9, fontSize: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <strong style={{ fontSize: 14 }}>Symbolic result · {labelFor(response.operation)}</strong>
      <span style={{ color: response.success ? "#17603c" : "#b42318" }}>{response.success ? "Exact" : "Failed"} · SageMath ({backend === "local" ? "Local WSL" : backend === "docker" ? "Docker" : "Private gateway"})</span>
    </div>
    <div><strong>Version:</strong> {response.engineVersion ?? "Not reported"} · <strong>Source:</strong> <span role="status">{sourceLabel}</span>
      {record.source && !record.source.id.startsWith("sage-input:") && <> · <strong>Revision:</strong> {record.source.revision}</>}
    </div>
    <div style={{ color: "#526477", overflowWrap: "anywhere" }}>Input = <code>{expression}</code></div>
    {sourceStatus === "stale" && <div style={{ color: "#9a3412" }}>Run the operation again before using the result.</div>}
    <div data-testid={`sage-result-kind-${kind}`} style={{ display: "grid", gap: 6, overflowWrap: "anywhere" }}>
      {kind === "error" ? <div role="alert" style={{ color: "#b42318" }}>
        {response.errorCode && <strong>{response.errorCode}: </strong>}{response.error ?? "SageMath operation failed."}</div> : <>
        {math && <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: math }} />}
        {kind === "expression" && <code style={{ whiteSpace: "pre-wrap" }}>{text}</code>}
        {kind === "vector" && <div>Components: <code>{list(response.result.components).map(String).join(" ; ") || text}</code></div>}
        {kind === "matrix" && <>
          {Array.isArray(response.result.matrix) ? <table style={{ borderCollapse: "collapse", width: "max-content" }}><tbody>
            {response.result.matrix.map((row, index) => <tr key={index}>{list(row).map((value, column) =>
              <td key={column} style={{ border: "1px solid #cbd5e1", padding: "3px 7px" }}><code>{String(value)}</code></td>)}</tr>)}
          </tbody></table> : null}
          {Array.isArray(response.result.eigenvalues) && <div>Eigenvalues: <code>{response.result.eigenvalues.map(String).join(" ; ")}</code></div>}
          {typeof response.result.charpoly === "string" && <div>Characteristic polynomial: <code>{response.result.charpoly}</code></div>}
          {typeof response.result.text === "string" && <code>{response.result.text}</code>}
        </>}
        {kind === "solution" && <>
          {response.operation === "sage.symbolic.singularities" && <div>{list(response.result.points).length} singular points found for F = 0 and ∇F = 0.</div>}
          {solutionItems.length ? <ol style={{ margin: 0, paddingLeft: 20 }}>{solutionItems.map((item, index) =>
            <li key={index}><code>{typeof item === "string" ? item : JSON.stringify(item)}</code></li>)}</ol>
            : <div>No solutions reported.</div>}
        </>}
      </>}
    </div>
    {response.warnings.length > 0 && <div role="status" style={{ color: "#9a3412" }}><strong>Warnings:</strong> {response.warnings.join(" · ")}</div>}
    {diagnostics.length > 0 && <details><summary>Diagnostics ({diagnostics.length})</summary><ul>{diagnostics.map((entry, index) => <li key={index}>{entry}</li>)}</ul></details>}
    {viewerProvenance && <div data-testid="sage-viewer-provenance" style={{ color: "#334155" }}>
      Viewer artifact · SageMath {viewerProvenance.engineVersion} ({viewerProvenance.backend === "local" ? "Local WSL" : viewerProvenance.backend === "docker" ? "Docker" : "Private gateway"}) ·
      source {viewerProvenance.sourceId} r{viewerProvenance.sourceRevision} · job {viewerProvenance.jobId}
    </div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {kind === "vector" && onPreviewVector && <button type="button" onClick={onPreviewVector} disabled={!actions.visualize}>Preview vector field</button>}
      {kind === "vector" && onCommitVector && <button type="button" onClick={onCommitVector} disabled={!actions.visualize || previewKind !== "vector"}>Commit vector overlay</button>}
      {kind === "expression" && onPreviewGeometry && <button type="button" onClick={onPreviewGeometry} disabled={!actions.createGeometry}>Preview geometry</button>}
      {kind === "expression" && onCommitGeometry && <button type="button" onClick={onCommitGeometry} disabled={!actions.createGeometry || previewKind !== "geometry"}>Commit geometry</button>}
      {previewKind && onDiscardPreview && <button type="button" onClick={onDiscardPreview}>Discard preview</button>}
      {onSaveWorkbook && actions.saveWorkbook && <button type="button" onClick={onSaveWorkbook}>Save to Workbook</button>}
    </div>
    {actionStatus && <div role="status">{actionStatus}</div>}
  </section>;
};
