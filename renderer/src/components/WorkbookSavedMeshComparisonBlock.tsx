import React, { useEffect, useState } from "react";
import { parseMath3DProject, type Math3DProject } from "@math3d/core";
import { createWorkbookSavedMeshComparisonReference, inspectWorkbookSavedMeshComparisonReference,
  type WorkbookSavedMeshComparisonReference } from "@math3d/workbook";
import type { ProjectResourceReader } from "../projects/projectResources";
import { loadProjectResources } from "../projects/projectResourceArchive";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
import { inspectWorkbookSavedMeshComparison, resolveWorkbookSavedMeshComparisonTarget } from "../projects/projectSavedMeshWorkbookComparison";
import { savedMeshResultComparisonHtml } from "../projects/projectSavedMeshResultComparison";
import type { SavedMeshTrendTarget } from "../projects/projectSavedMeshTrendPoint";
import { downloadStudyBlob } from "../projects/studyComparisonExport";

export const WorkbookSavedMeshComparisonEditor: React.FC<{
  project: Math3DProject | null; reference?: WorkbookSavedMeshComparisonReference;
  readResource?: ProjectResourceReader; readOnly: boolean;
  onChange: (reference: WorkbookSavedMeshComparisonReference | undefined) => void;
}> = ({ project, reference, readResource, readOnly, onChange }) => {
  const [message, setMessage] = useState("");
  return <div style={{ display: "grid", gap: 5 }}>
    <label>Saved Mesh A/B comparison <select data-testid="workbook-saved-mesh-comparison-select"
      value={reference?.comparisonId ?? ""} disabled={readOnly || !project || !readResource}
      onChange={event => {
        try {
          const saved = project?.savedMeshComparisons?.find(item => item.id === event.target.value);
          if (!saved) { onChange(undefined); setMessage("Saved Mesh comparison link removed."); return; }
          if (!project || !readResource) throw new TypeError("Open the saved Project and its resources first.");
          const linked = createWorkbookSavedMeshComparisonReference(project, saved);
          const inspected = inspectWorkbookSavedMeshComparison(project, linked, readResource);
          if (inspected.status !== "current") throw new TypeError(inspected.reason);
          onChange(linked); setMessage("Exact A/B evidence linked. Save the Workbook in Projects to retain it.");
        } catch (error) { setMessage(`Link refused: ${(error as Error).message}`); }
      }}>
      <option value="">No pinned comparison linked</option>
      {project?.savedMeshComparisons?.map(item => <option key={item.id} value={item.id}>{item.title} · {item.metricPath}</option>)}
    </select></label>
    {!project?.savedMeshComparisons?.length && <small>Save a pinned A/B pair in Projects first.</small>}
    {message && <small role={message.includes("refused") ? "alert" : "status"}>{message}</small>}
  </div>;
};

export const WorkbookSavedMeshComparisonBlock: React.FC<{
  project: Math3DProject | null; reference: WorkbookSavedMeshComparisonReference;
  readResource?: ProjectResourceReader; onOpenResult?: (target: SavedMeshTrendTarget) => void;
}> = ({ project, reference, readResource, onOpenResult }) => {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  const [archive, setArchive] = useState<VerifiedProjectResources | null>(null);
  const savedProject = (() => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
      const saved = raw ? parseMath3DProject(raw) : null;
      return saved?.identity.id === project?.identity.id ? saved : project;
    } catch { return project; }
  })();
  let status: ReturnType<typeof inspectWorkbookSavedMeshComparisonReference> | "invalid";
  try { status = inspectWorkbookSavedMeshComparisonReference(savedProject, reference); }
  catch { status = "invalid"; }
  const archived = savedProject && archive?.verifiedFor(savedProject) ? archive : null;
  const checkedReader: ProjectResourceReader | undefined = archived ? item => archived.bytes(item) : readResource;
  const inspected = open ? inspectWorkbookSavedMeshComparison(savedProject, reference, checkedReader) : null;
  useEffect(() => {
    if (!open || !savedProject || status !== "current") return;
    const initial = inspectWorkbookSavedMeshComparison(savedProject, reference, readResource);
    if (initial.status === "current" || !/source bytes are missing|resource bytes are unavailable/i.test(initial.reason)) return;
    let cancelled = false;
    void loadProjectResources(savedProject).then(resources => {
      if (!cancelled) setArchive(resources);
    }).catch(error => { if (!cancelled) setMessage(`Comparison unavailable: ${(error as Error).message}`); });
    return () => { cancelled = true; };
  }, [open, savedProject?.identity.id, savedProject?.identity.structuralHash, reference.comparisonHash, status]);
  const evidence = inspected?.status === "current" ? inspected.evidence : null;
  const selected = evidence?.metrics.find(metric => metric.path === reference.metricPath);
  const navigate = (slot: "a" | "b") => {
    try {
      if (!savedProject || !checkedReader || !onOpenResult) throw new TypeError("The saved Project or result navigation is unavailable.");
      onOpenResult(resolveWorkbookSavedMeshComparisonTarget(savedProject, reference, slot, checkedReader));
    } catch (error) { setMessage(`Opening refused: ${(error as Error).message}`); }
  };
  const exportHtml = () => {
    try {
      const checked = inspectWorkbookSavedMeshComparison(savedProject, reference, checkedReader);
      if (checked.status !== "current" || !checked.evidence) throw new TypeError(checked.reason);
      downloadStudyBlob(new Blob([savedMeshResultComparisonHtml(checked.evidence)], { type: "text/html" }), "math3d-workbook-saved-mesh-comparison.html");
      setMessage("Verified saved Mesh comparison report downloaded.");
    } catch (error) { setMessage(`Export refused: ${(error as Error).message}`); }
  };
  if (status === "invalid") return <p role="alert">Invalid saved Mesh comparison reference.</p>;
  return <section data-testid="workbook-saved-mesh-comparison" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, minWidth: 0, overflowWrap: "anywhere" }}>
    <strong>Saved Mesh comparison · {project?.savedMeshComparisons?.find(item => item.id === reference.comparisonId)?.title ?? reference.comparisonId}</strong>
    <p role={status === "current" ? "status" : "alert"}>{status === "current" ? "Exact saved pair linked; open to verify both Mesh sidecars." :
      `Comparison ${status}: the saved pair or one of its results changed or is unavailable.`}</p>
    <small>Project {reference.projectId} · comparison {reference.comparisonHash} · metric {reference.metricPath}</small>
    {status === "current" && <details onToggle={event => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) setArchive(null); setMessage(""); }}>
      <summary>Show embedded saved Mesh comparison</summary>
      {open && inspected?.status !== "current" && <p role="alert">Comparison unavailable: {inspected?.reason}</p>}
      {evidence && <div data-testid="workbook-saved-mesh-comparison-evidence" style={{ display: "grid", gap: 8, paddingTop: 8 }}>
        <p>{evidence.operation} · {evidence.a.result.provenance.operation.algorithm} v{evidence.a.result.provenance.operation.algorithmVersion}. Stored scalar values only; no Mesh analysis runs.</p>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Unit</th><th>B − A</th></tr></thead><tbody>
          {evidence.metrics.map(metric => <tr key={metric.path}><th>{metric.path}</th><td>{metric.a}</td><td>{metric.b}</td><td>{metric.unit ?? "unqualified"}</td><td>{metric.difference ?? metric.reason}</td></tr>)}
        </tbody></table></div>
        {selected && <p data-testid="workbook-saved-mesh-comparison-selected">Pinned {reference.metricPath}: A {selected.a}, B {selected.b} {selected.unit ?? "unqualified"}; B − A {selected.difference ?? selected.reason}</p>}
        {(["a", "b"] as const).map(slot => { const side = evidence[slot]; return <div key={slot}>
          <strong>{slot.toUpperCase()} · Mesh r{side.sourceRevision} · {side.generation}</strong><br />
          Result {side.resultId} · hash {side.resultHash}<br />Source {side.sourceId} · hash {side.sourceHash}<br />
          <button type="button" data-testid={`workbook-saved-mesh-comparison-open-${slot}`} disabled={!onOpenResult} onClick={() => navigate(slot)}>Open {slot.toUpperCase()} saved result</button>
        </div>; })}
        <p>{evidence.qualification}</p>
        <button type="button" data-testid="workbook-saved-mesh-comparison-export" onClick={exportHtml}>Export checked HTML report</button>
      </div>}
    </details>}
    {message && <p role={message.includes("refused") ? "alert" : "status"}>{message}</p>}
  </section>;
};
