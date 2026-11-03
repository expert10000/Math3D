import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Math3DProject, ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import { comparableSavedMeshResults, compareSavedMeshResults, savedMeshResultComparisonHtml } from "../projects/projectSavedMeshResultComparison";
import { downloadStudyBlob } from "../projects/studyComparisonExport";
import { compareSavedMeshTrendPoints, type SavedMeshTrendComparison } from "../projects/projectSavedMeshTrendPoint";
import { inspectSavedMeshPinnedComparison } from "../projects/projectSavedMeshPinnedComparison";

export function ProjectSavedMeshResultComparisonView({ project, readResource, onClose, trendSelection, savedReference, onReturnToTrend, onSavePinned }: {
  project: Math3DProject; readResource: ProjectResourceReader; onClose: () => void;
  trendSelection?: SavedMeshTrendComparison | null; savedReference?: ProjectSavedMeshComparison | null;
  onReturnToTrend?: () => void; onSavePinned?: (selection: SavedMeshTrendComparison, title: string) => Promise<boolean>;
}) {
  const choices = useMemo(() => comparableSavedMeshResults(project), [project]);
  const [aId, setAId] = useState(savedReference?.a.resultId ?? trendSelection?.a.resultId ?? choices[0]?.resultId ?? ""),
    [bId, setBId] = useState(savedReference?.b.resultId ?? trendSelection?.b.resultId ?? choices[1]?.resultId ?? "");
  const [message, setMessage] = useState("");
  const [pinnedTitle, setPinnedTitle] = useState("Saved Mesh A/B comparison");
  useEffect(() => { setAId(savedReference?.a.resultId ?? trendSelection?.a.resultId ?? choices[0]?.resultId ?? "");
    setBId(savedReference?.b.resultId ?? trendSelection?.b.resultId ?? choices[1]?.resultId ?? ""); setMessage(""); }, [project.identity.id, choices, trendSelection, savedReference]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") (onReturnToTrend ?? onClose)(); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [onClose, onReturnToTrend]);
  let evidence: ReturnType<typeof compareSavedMeshResults> | null = null, error = "";
  if (aId && bId) try { evidence = savedReference ? inspectSavedMeshPinnedComparison(project, savedReference, readResource) : trendSelection ? compareSavedMeshTrendPoints(project, trendSelection, readResource) :
    compareSavedMeshResults(project, aId, bId, readResource); }
  catch (failure) { error = (failure as Error).message; }
  const label = (id: string) => {
    const result = choices.find(item => item.resultId === id);
    if (!result) return `Missing saved result · ${id}`;
    return `${result.provenance.operation.type.replace("mesh.saved.", "")} · ${result.provenance.source.documentId} r${result.provenance.source.revision} · ${id.slice(-12)}`;
  };
  const exportEvidence = () => {
    try {
      const checked = savedReference ? inspectSavedMeshPinnedComparison(project, savedReference, readResource) : trendSelection ? compareSavedMeshTrendPoints(project, trendSelection, readResource) :
        compareSavedMeshResults(project, aId, bId, readResource);
      downloadStudyBlob(new Blob([savedMeshResultComparisonHtml(checked)], { type: "text/html" }), "math3d-saved-mesh-results-comparison.html");
      setMessage("Verified stored-result report downloaded.");
    } catch (failure) { setMessage(`Export refused: ${(failure as Error).message}`); }
  };
  return createPortal(<div className="project-gallery-preview-backdrop" data-testid="project-mesh-result-comparison" style={{ zIndex: trendSelection ? 10001 : 10000 }}>
    <div className="project-gallery-preview-sheet" role="dialog" aria-modal="true" aria-label="Compare saved Mesh analysis results" style={{ maxWidth: 1100, width: "min(95vw,1100px)", maxHeight: "90vh", overflow: "auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h2>{savedReference ? savedReference.title : trendSelection ? "Compare pinned trend points" : "Compare saved Mesh analysis"}</h2><p>Stored quality or curvature summaries, with exact result and Mesh source provenance. No analysis is rerun.</p></div><button type="button" data-testid="project-mesh-result-return" onClick={onReturnToTrend ?? onClose}>{trendSelection ? "Return to trend" : "Close"}</button></div>
      {trendSelection && <p data-testid="project-mesh-result-trend-source">From saved trend · {trendSelection.study.metricPath} · Mesh {trendSelection.study.sourceDocumentId}. A and B stay pinned to their exact results.</p>}
      {savedReference && <p data-testid="project-mesh-pinned-reference">Saved pinned pair · {savedReference.metricPath} · exact result and Mesh hashes reverified on open and export.</p>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {([0, 1] as const).map(slot => <label key={slot} style={{ flex: "1 1 320px" }}>{slot ? "B" : "A"} saved result
          <select data-testid={`project-mesh-result-${slot}`} value={slot ? bId : aId} disabled={!!trendSelection || !!savedReference} onChange={event => { slot ? setBId(event.target.value) : setAId(event.target.value); setMessage(""); }} style={{ display: "block", maxWidth: "100%", width: "100%" }}>
            <option value="">Choose result</option>{choices.map(item => <option key={item.resultId} value={item.resultId}>{label(item.resultId)}</option>)}
          </select></label>)}
      </div>
      {choices.length < 2 && <p>Save two Mesh quality or curvature results in the Mesh workspace, then save the Project.</p>}
      {error && <p role="alert" data-testid="project-mesh-result-refusal">Comparison refused: {error}</p>}
      {evidence && <>
        <p data-testid="project-mesh-result-status">{evidence.compatible ? "Operation and algorithm compatible" : evidence.reason} · differences appear only for matching, known metric units.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
          {([evidence.a, evidence.b] as const).map((side, index) => <section key={side.resultId} aria-label={`${index ? "B" : "A"} saved result`} style={{ border: "1px solid #94a3b8", borderRadius: 8, padding: 12, overflowWrap: "anywhere" }}>
            <h3>{index ? "B" : "A"} · {side.result.provenance.operation.type}</h3>
            <p>Result {side.resultId}<br />Hash {side.resultHash}<br />Mesh {side.sourceId} · r{side.sourceRevision} · {side.generation}<br />Source hash {side.sourceHash}<br />Length unit {side.lengthUnit ?? "not declared"}</p>
            <p>Algorithm {side.result.provenance.operation.algorithm} v{side.result.provenance.operation.algorithmVersion}<br />Engine {side.result.provenance.engine.name} v{side.result.provenance.engine.version}<br />Status {side.result.status}</p>
            <details><summary>Exact stored summary</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(side.result.summary, null, 2)}</pre></details>
          </section>)}
        </div>
        <h3>Stored scalar metrics</h3><div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Unit</th><th>B − A</th></tr></thead><tbody>{evidence.metrics.map(metric => <tr key={metric.path}><th>{metric.path}</th><td>{metric.a}</td><td>{metric.b}</td><td>{metric.unit ?? "unqualified"}</td><td>{metric.difference ?? metric.reason}</td></tr>)}</tbody></table></div>
        <p>{evidence.qualification}</p>
        <button type="button" data-testid="project-mesh-result-export" onClick={exportEvidence}>Export checked HTML report</button>
        {trendSelection && onSavePinned && !savedReference && <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <label>Comparison name <input data-testid="project-mesh-pinned-title" value={pinnedTitle} maxLength={160} onChange={event => setPinnedTitle(event.target.value)} /></label>
          <button type="button" data-testid="project-mesh-pinned-save" disabled={!pinnedTitle.trim()} onClick={() => { void onSavePinned(trendSelection, pinnedTitle).then(ok => {
            setMessage(ok ? "Pinned A/B comparison saved to this Project." : "Pinned comparison save refused; check the Project status.");
          }); }}>Save pinned comparison</button>
        </div>}
      </>}
      {message && <p role="status">{message}</p>}
    </div>
  </div>, document.body);
}
