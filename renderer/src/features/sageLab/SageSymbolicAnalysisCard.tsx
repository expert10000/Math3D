import React from "react";
import katex from "katex";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";

const labelFor = (operation: string) => ({
  "sage.symbolic.gradient": "Gradient",
  "sage.symbolic.hessian": "Hessian",
  "sage.symbolic.singularities": "Singularities",
  "sage.symbolic.solve": "Solutions",
  "sage.symbolic.factor": "Factored expression",
  "sage.symbolic.simplify": "Simplified expression",
  "sage.symbolic.expand": "Expanded expression",
}[operation] ?? "Symbolic result");

export const SageSymbolicAnalysisCard: React.FC<{
  record: SymbolicResultRecord;
  stale: boolean;
  onVisualize?: () => void;
  onCreateGeometry?: () => void;
  onSaveWorkbook?: () => void;
  actionStatus?: string | null;
}> = ({ record, stale, onVisualize, onCreateGeometry, onSaveWorkbook, actionStatus }) => {
  const { response, expression, backend } = record;
  const math = response.latex && response.latex.length < 4000
    ? katex.renderToString(response.latex, { displayMode: true, throwOnError: false, trust: false, strict: "ignore" })
    : null;
  const text = typeof response.result.text === "string" ? response.result.text : JSON.stringify(response.result);
  return <section data-testid="sage-analysis-result" aria-label="Symbolic result"
    style={{ border: "1px solid #b9d6ea", borderRadius: 10, background: "#f4faff", padding: 12, marginBottom: 12, display: "grid", gap: 9, fontSize: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <strong style={{ fontSize: 14 }}>Symbolic result · {labelFor(response.operation)}</strong>
      <span style={{ color: "#17603c" }}>Exact · SageMath ({backend === "local" ? "Local WSL" : "Docker"})</span>
    </div>
    <div style={{ color: "#526477", overflowWrap: "anywhere" }}>From F = <code>{expression}</code></div>
    {stale && <div role="status" style={{ color: "#9a3412" }}>The surface equation changed after this run. Run the operation again before using the result.</div>}
    {math ? <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: math }} /> : <code style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</code>}
    {Array.isArray(response.result.components) && <div>Components: <code>{response.result.components.map(String).join(" ; ")}</code></div>}
    {Array.isArray(response.result.points) && <div>{response.result.points.length} singular point{response.result.points.length === 1 ? "" : "s"} found for F = 0 and ∇F = 0.</div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {onVisualize && <button type="button" onClick={onVisualize} disabled={stale}>Visualize vector field</button>}
      {onCreateGeometry && <button type="button" onClick={onCreateGeometry} disabled={stale}>Create geometry</button>}
      {onSaveWorkbook && <button type="button" onClick={onSaveWorkbook}>Save to Workbook</button>}
    </div>
    {actionStatus && <div role="status">{actionStatus}</div>}
  </section>;
};
