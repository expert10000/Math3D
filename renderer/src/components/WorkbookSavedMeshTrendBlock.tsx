import React, { useState } from "react";
import type { Math3DProject } from "@math3d/core";
import { inspectWorkbookSavedMeshTrendReference, type WorkbookSavedMeshTrendReference } from "@math3d/workbook";
import type { ProjectResourceReader } from "../projects/projectResources";
import { comparableSavedMeshResults } from "../projects/projectSavedMeshResultComparison";
import { savedMeshTrendMetricChoices } from "../projects/projectSavedMeshResultTrend";
import { createWorkbookSavedMeshTrendReference, inspectWorkbookSavedMeshTrend } from "../projects/projectSavedMeshWorkbookTrend";

export const WorkbookSavedMeshTrendEditor: React.FC<{
  project: Math3DProject | null; reference?: WorkbookSavedMeshTrendReference; readResource?: ProjectResourceReader;
  readOnly: boolean; onChange: (reference: WorkbookSavedMeshTrendReference | undefined) => void;
}> = ({ project, reference, readResource, readOnly, onChange }) => {
  const choices = project ? comparableSavedMeshResults(project) : [];
  const [anchorId, setAnchorId] = useState(reference?.results[0]?.resultId ?? choices[0]?.resultId ?? "");
  const selectedAnchor = choices.some(item => item.resultId === anchorId) ? anchorId : choices[0]?.resultId ?? "";
  const paths = project && selectedAnchor ? savedMeshTrendMetricChoices(project, selectedAnchor) : [];
  const [metricPath, setMetricPath] = useState(reference?.metricPath ?? "");
  const selectedMetric = paths.includes(metricPath) ? metricPath : paths.includes("faceCount") ? "faceCount" : paths[0] ?? "";
  const [message, setMessage] = useState("");
  return <div style={{ display: "grid", gap: 6, border: "1px solid #cbd5e1", borderRadius: 8, padding: 8 }}>
    <strong>Saved Mesh trend</strong>
    <small>Link exact saved results and source hashes. No Mesh calculation runs in this block.</small>
    <label>Mesh and saved method <select data-testid="workbook-mesh-trend-anchor" value={selectedAnchor} disabled={readOnly || !project} onChange={event => { setAnchorId(event.target.value); setMetricPath(""); setMessage(""); }}>
      {!choices.length && <option value="">No saved Mesh analysis results</option>}
      {choices.map(item => <option key={item.resultId} value={item.resultId}>{item.provenance.source.documentId} · {item.provenance.operation.type} · {item.provenance.operation.algorithm} v{item.provenance.operation.algorithmVersion}</option>)}
    </select></label>
    <label>Recorded scalar <select data-testid="workbook-mesh-trend-metric" value={selectedMetric} disabled={readOnly || !selectedAnchor} onChange={event => { setMetricPath(event.target.value); setMessage(""); }}>
      {!paths.length && <option value="">No recorded scalar</option>}
      {paths.map(path => <option key={path} value={path}>{path}</option>)}
    </select></label>
    <div style={{ display: "flex", gap: 8 }}><button type="button" data-testid="workbook-mesh-trend-attach" disabled={readOnly || !project || !readResource || !selectedAnchor || !selectedMetric}
      onClick={() => { try { onChange(createWorkbookSavedMeshTrendReference(project!, selectedAnchor, selectedMetric, readResource!)); setMessage("Exact trend linked. Save the Workbook in Projects to retain it."); }
        catch (error) { setMessage(`Trend link refused: ${(error as Error).message}`); } }}>Link verified trend</button>
      {reference && <button type="button" disabled={readOnly} onClick={() => { onChange(undefined); setMessage("Trend link removed from this block."); }}>Remove link</button>}</div>
    {message && <small role="status">{message}</small>}
  </div>;
};

/** Read-only embedded evidence; source bytes are reverified whenever the view opens. */
export const WorkbookSavedMeshTrendBlock: React.FC<{ project: Math3DProject | null;
  reference: WorkbookSavedMeshTrendReference; readResource?: ProjectResourceReader }> = ({ project, reference, readResource }) => {
  const [open, setOpen] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null);
  let inspected: ReturnType<typeof inspectWorkbookSavedMeshTrend>;
  try { inspected = open ? inspectWorkbookSavedMeshTrend(project, reference, readResource) :
    { status: inspectWorkbookSavedMeshTrendReference(project, reference), study: null, reason: "Open to verify exact source bytes." }; }
  catch { return <p role="alert">Invalid saved Mesh trend reference.</p>; }
  const study = inspected.study, points = study?.rows.filter(row => row.status === "available") ?? [];
  const selected = points.find(row => row.resultId === selectedId) ?? points[0] ?? null;
  const xMin = Math.min(...points.map(row => row.revision)), xMax = Math.max(...points.map(row => row.revision));
  const yMin = Math.min(...points.map(row => row.value!)), yMax = Math.max(...points.map(row => row.value!));
  const xAt = (revision: number) => 50 + (xMin === xMax ? 0.5 : (revision - xMin) / (xMax - xMin)) * 620;
  const yAt = (value: number) => 175 - (yMin === yMax ? 0.5 : (value - yMin) / (yMax - yMin)) * 130;
  return <section data-testid="workbook-mesh-trend-link" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, minWidth: 0 }}>
    <strong>Saved Mesh trend · {reference.metricPath}</strong>
    <div role={inspected.status === "current" ? "status" : "alert"}>
      {inspected.status === "current" ? `${points.length} exact saved results verified; open to inspect.` :
        `Trend ${inspected.status}: ${inspected.reason}`}
    </div>
    <small>Project {reference.projectId} · Mesh {reference.meshId} · {reference.algorithm} v{reference.algorithmVersion} · source arrays stay in Project resources.</small>
    {inspected.status === "current" && <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Show embedded trend</summary>
      {open && study && <div data-testid="workbook-mesh-trend-preview" style={{ display: "grid", gap: 8, paddingTop: 8 }}>
        <p>{study.metricPath} · {study.unit ?? "unqualified"}. One independent dot per verified result; no interpolation or recalculation.</p>
        <svg viewBox="0 0 720 215" width="100%" role="img" aria-label="Saved Mesh metric by source revision, separate points" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
          <path d="M50 25V175H670" stroke="#64748b" fill="none" /><text x="50" y="205" fontSize="12">Mesh revision →</text>
          {points.map(row => <g key={row.resultId} role="button" tabIndex={0} data-testid={`workbook-mesh-trend-point-${row.resultId}`}
            aria-label={`Revision ${row.revision}, saved value ${row.value} ${row.unit}`}
            onClick={() => setSelectedId(row.resultId)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(row.resultId); } }}>
            <circle cx={xAt(row.revision)} cy={yAt(row.value!)} r={selected?.resultId === row.resultId ? 8 : 6} fill="#2265b1" style={{ cursor: "pointer" }} />
            <text x={xAt(row.revision)} y="194" fontSize="11" textAnchor="middle" pointerEvents="none">r{row.revision}</text>
          </g>)}
        </svg>
        {selected && <div data-testid="workbook-mesh-trend-selection" style={{ overflowWrap: "anywhere" }}>r{selected.revision} · {selected.value} {selected.unit}<br />Result {selected.resultId} · {selected.resultHash}<br />Source {selected.sourceHash}</div>}
        <table><thead><tr><th>Revision</th><th>Recorded value</th><th>Status</th><th>Result</th></tr></thead><tbody>{study.rows.map(row =>
          <tr key={`${row.revision}:${row.resultId ?? "gap"}`}><td>r{row.revision}</td><td>{row.status === "available" ? `${row.value} ${row.unit}` : "—"}</td><td>{row.status}{row.reason ? ` · ${row.reason}` : ""}</td><td>{row.resultId ?? "No saved result"}</td></tr>)}</tbody></table>
      </div>}
    </details>}
  </section>;
};
