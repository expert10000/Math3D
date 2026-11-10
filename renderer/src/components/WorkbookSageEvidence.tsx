import React from "react";
import { resolveWorkbookSageFreshness, type WorkbookSageEvidence, type WorkbookSageFreshness } from "@math3d/workbook";
import { ResultPublicationActions } from "../results/ResultPublicationActions";
import { workbookSageEvidenceCsv, workbookSageEvidenceJson,
  workbookSagePublication } from "../workbook/workbookSagePublication";

export const WorkbookSageEvidenceView: React.FC<{
  evidence: WorkbookSageEvidence;
  currentSource: WorkbookSageEvidence["source"] | null;
  freshnessOverride?: WorkbookSageFreshness;
}> = ({ evidence, currentSource, freshnessOverride }) => {
  const freshness = freshnessOverride ?? resolveWorkbookSageFreshness(evidence.source, currentSource);
  const publication = workbookSagePublication(evidence, freshness);
  const recorded = publication.assessment.status === "recorded";
  const exportEvidence = (format: "json" | "csv") => {
    const content = format === "json" ? workbookSageEvidenceJson(evidence, freshness)
      : workbookSageEvidenceCsv(evidence, freshness);
    const url = URL.createObjectURL(new Blob([content],
      { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `workbook-sage-${publication.resultId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 70)}.${format}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <><section data-testid="workbook-sage-evidence" style={{ border: "1px solid #b9d6ea", borderRadius: 7, padding: 9, fontSize: 11, display: "grid", gap: 5 }}>
    <strong>{evidence.source.id.startsWith("sage-input:") ? "Freeform input saved with this result" : freshness === "current" ? "Source current" : freshness === "stale" ? "Source changed — rerun required" : "Source unavailable — verify before reuse"}</strong>
    <span>Source: {evidence.source.module} / {evidence.source.id} / revision {evidence.source.revision}</span>
    <span>Backend: {evidence.engine.backend === "local" ? "Local WSL" : evidence.engine.backend === "docker" ? "Docker" : "Private gateway"} · SageMath {evidence.engine.version}</span>
    <span>Operation: {evidence.request.operation} · {new Date(evidence.savedAt).toLocaleString()}</span>
    <span style={{ color: recorded ? "#17603c" : "#b42318" }}>
      Outcome: {recorded ? "Recorded Sage result" : publication.assessment.reason}
    </span>
    <details><summary>Exact request, response, and diagnostics</summary>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto" }}>{workbookSageEvidenceJson(evidence, freshness)}</pre>
    </details>
  </section><ResultPublicationActions publication={publication} onExport={exportEvidence} /></>;
};
