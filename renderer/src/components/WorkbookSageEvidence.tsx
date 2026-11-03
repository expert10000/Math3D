import React from "react";
import { resolveWorkbookSageFreshness, type WorkbookSageEvidence } from "@math3d/workbook";

export const WorkbookSageEvidenceView: React.FC<{
  evidence: WorkbookSageEvidence;
  currentSource: WorkbookSageEvidence["source"] | null;
}> = ({ evidence, currentSource }) => {
  const freshness = resolveWorkbookSageFreshness(evidence.source, currentSource);
  return <section data-testid="workbook-sage-evidence" style={{ border: "1px solid #b9d6ea", borderRadius: 7, padding: 9, fontSize: 11, display: "grid", gap: 5 }}>
    <strong>{evidence.source.id.startsWith("sage-input:") ? "Freeform input saved with this result" : freshness === "current" ? "Source current" : freshness === "stale" ? "Source changed — rerun required" : "Source unavailable — verify before reuse"}</strong>
    <span>Source: {evidence.source.module} / {evidence.source.id} / revision {evidence.source.revision}</span>
    <span>Backend: {evidence.engine.backend === "local" ? "Local WSL" : evidence.engine.backend === "docker" ? "Docker" : "Private gateway"} · SageMath {evidence.engine.version}</span>
    <span>Operation: {evidence.request.operation} · {new Date(evidence.savedAt).toLocaleString()}</span>
    <span style={{ color: evidence.response.success ? "#17603c" : "#b42318" }}>
      Outcome: {evidence.response.success ? "Exact" : `Failed · ${evidence.response.error ?? "SageMath operation failed."}`}
    </span>
    <details><summary>Exact request, response, and diagnostics</summary>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto" }}>{JSON.stringify({ source: evidence.source, request: evidence.request, engine: evidence.engine, response: evidence.response, diagnostics: evidence.diagnostics }, null, 2)}</pre>
    </details>
  </section>;
};
