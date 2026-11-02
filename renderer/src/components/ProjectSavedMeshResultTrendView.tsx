import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { structuralHash, type Math3DProject } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import { comparableSavedMeshResults } from "../projects/projectSavedMeshResultComparison";
import { buildSavedMeshResultTrend, savedMeshResultTrendHtml, savedMeshTrendMetricChoices } from "../projects/projectSavedMeshResultTrend";
import { downloadStudyBlob } from "../projects/studyComparisonExport";
import { resolveSavedMeshTrendPoint, type SavedMeshTrendTarget } from "../projects/projectSavedMeshTrendPoint";

export function ProjectSavedMeshResultTrendView({ project, readResource, onClose, onOpenResult }: {
  project: Math3DProject; readResource: ProjectResourceReader; onClose: () => void;
  onOpenResult: (target: SavedMeshTrendTarget) => void;
}) {
  const choices = useMemo(() => comparableSavedMeshResults(project), [project]);
  const [anchorId, setAnchorId] = useState(choices[0]?.resultId ?? "");
  const paths = useMemo(() => savedMeshTrendMetricChoices(project, anchorId), [project, anchorId]);
  const [metricPath, setMetricPath] = useState("");
  const activeMetric = paths.includes(metricPath) ? metricPath :
    paths.includes("metrics.aspectRatio.avg") ? "metrics.aspectRatio.avg" : paths.includes("faceCount") ? "faceCount" : paths[0] ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null), [message, setMessage] = useState("");
  useEffect(() => { setAnchorId(choices[0]?.resultId ?? ""); setMetricPath(""); setSelectedId(null); setMessage(""); }, [project.identity.id, choices]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  const resolved = useMemo(() => {
    if (!anchorId || !activeMetric) return { study: null, error: "Choose a saved result and recorded metric." };
    try { return { study: buildSavedMeshResultTrend(project, anchorId, activeMetric, readResource), error: "" }; }
    catch (error) { return { study: null, error: (error as Error).message }; }
  }, [project, anchorId, activeMetric, readResource]);
  const study = resolved.study, available = study?.rows.filter(row => row.status === "available") ?? [];
  const selected = available.find(row => row.resultId === selectedId) ?? available[0] ?? null;
  const xMin = Math.min(...available.map(row => row.revision)), xMax = Math.max(...available.map(row => row.revision));
  const yMin = Math.min(...available.map(row => row.value!)), yMax = Math.max(...available.map(row => row.value!));
  const xAt = (revision: number) => 70 + (xMax === xMin ? 0.5 : (revision - xMin) / (xMax - xMin)) * 680;
  const yAt = (value: number) => 215 - (yMax === yMin ? 0.5 : (value - yMin) / (yMax - yMin)) * 170;
  const exportTrend = () => {
    try {
      if (!study) throw new TypeError("Choose a recorded trend first.");
      const checked = buildSavedMeshResultTrend(project, anchorId, activeMetric, readResource);
      if (structuralHash(checked) !== structuralHash(study)) throw new TypeError("The selected saved sources changed. Refresh the view before exporting.");
      downloadStudyBlob(new Blob([savedMeshResultTrendHtml(checked)], { type: "text/html" }), "math3d-saved-mesh-analysis-trend.html");
      setMessage("Verified saved-result trend report downloaded.");
    } catch (error) { setMessage(`Trend export refused: ${(error as Error).message}`); }
  };
  const openResult = () => {
    try {
      if (!study || !selected?.resultId) throw new TypeError("Select a verified recorded point.");
      onOpenResult(resolveSavedMeshTrendPoint(project, study, selected.resultId, readResource));
    } catch (error) { setMessage(`Saved result opening refused: ${(error as Error).message}`); }
  };
  return createPortal(<div className="project-gallery-preview-backdrop" data-testid="project-mesh-result-trend" style={{ zIndex: 10000 }}>
    <div className="project-gallery-preview-sheet" role="dialog" aria-modal="true" aria-label="Saved Mesh analysis trend" style={{ width: "min(96vw,1100px)", maxWidth: 1100, maxHeight: "90vh", overflow: "auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><div><h2>Saved Mesh analysis trend</h2><p>One point per recorded result. Retained generations without results stay visible as gaps; no analysis or interpolation runs here.</p></div><button type="button" onClick={onClose}>Close</button></header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <label style={{ flex: "1 1 350px" }}>Method and Mesh source
          <select data-testid="project-mesh-trend-anchor" value={anchorId} onChange={event => { setAnchorId(event.target.value); setMetricPath(""); setSelectedId(null); setMessage(""); }} style={{ display: "block", width: "100%" }}>
            {choices.map(result => <option key={result.resultId} value={result.resultId}>{result.provenance.operation.type.replace("mesh.saved.", "")} · {result.provenance.source.documentId} · {result.provenance.operation.algorithm} v{result.provenance.operation.algorithmVersion}</option>)}
          </select></label>
        <label style={{ flex: "1 1 260px" }}>Stored scalar metric
          <select data-testid="project-mesh-trend-metric" value={activeMetric} onChange={event => { setMetricPath(event.target.value); setSelectedId(null); setMessage(""); }} style={{ display: "block", width: "100%" }}>
            {paths.map(path => <option key={path} value={path}>{path}</option>)}
          </select></label>
      </div>
      {resolved.error && <p role="alert">Trend unavailable: {resolved.error}</p>}
      {study && <>
        <p data-testid="project-mesh-trend-status">{study.operation} · {study.algorithm} v{study.algorithmVersion} · {activeMetric} · unit {study.unit ?? "unqualified"}. {available.length} verified recorded points; {study.rows.length - available.length} gaps or unavailable points.</p>
        {available.length > 0 && <svg data-testid="project-mesh-trend-plot" viewBox="0 0 800 260" width="100%" role="img" aria-label={`Stored ${activeMetric} by Mesh revision; points are not connected`} style={{ background: "#f7fafc", border: "1px solid #cbd5e1", borderRadius: 8 }}>
          <path d="M70 30V215H750" stroke="#64748b" fill="none" strokeWidth="2" />
          <text x="70" y="248" fontSize="14" fill="#334155">Mesh source revision →</text>
          <text x="12" y="26" fontSize="13" fill="#334155">{study.unit ?? "unit"}</text>
          <text x="28" y="45" fontSize="12" fill="#334155">{yMax}</text><text x="28" y="215" fontSize="12" fill="#334155">{yMin}</text>
          {available.map(row => <g key={row.resultId} role="button" tabIndex={0} data-testid={`project-mesh-trend-point-${row.resultId}`}
            aria-label={`Mesh revision ${row.revision}, stored value ${row.value} ${row.unit}, result ${row.resultId}`}
            onClick={() => setSelectedId(row.resultId)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(row.resultId); } }}>
            <circle cx={xAt(row.revision)} cy={yAt(row.value!)} r={selected?.resultId === row.resultId ? 9 : 7} fill={selected?.resultId === row.resultId ? "#c15d16" : "#2265b1"} stroke="white" strokeWidth="2" style={{ cursor: "pointer" }}><title>r{row.revision} · {row.value} {row.unit}</title></circle>
            <text x={xAt(row.revision)} y="234" textAnchor="middle" fontSize="12" fill="#334155" pointerEvents="none">r{row.revision}</text>
          </g>)}
        </svg>}
        {selected && <section data-testid="project-mesh-trend-selection" aria-label="Selected stored result" style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, overflowWrap: "anywhere", marginTop: 12 }}>
          <strong>r{selected.revision} · {selected.value} {selected.unit}</strong><p>Result {selected.resultId}<br />Result hash {selected.resultHash}<br />Mesh {study.sourceDocumentId} · source hash {selected.sourceHash}<br />{selected.generation} source</p>
          <button type="button" data-testid="project-mesh-trend-open-result" onClick={openResult}>Open saved result</button>
        </section>}
        <h3>Exact saved generations</h3><div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr><th>Revision</th><th>Stored value</th><th>Unit</th><th>Status</th><th>Result</th><th>Source hash</th></tr></thead><tbody>
          {study.rows.map(row => <tr key={`${row.revision}:${row.sourceHash}:${row.resultId ?? "none"}`} data-testid={`project-mesh-trend-row-${row.revision}`}>
            <th>r{row.revision} · {row.generation}</th><td>{row.status === "available" ? row.value : "—"}</td><td>{row.unit ?? "—"}</td><td>{row.status}{row.reason ? ` · ${row.reason}` : ""}</td><td>{row.resultId ?? "No saved result"}{row.resultHash && <><br />{row.resultHash}</>}</td><td style={{ overflowWrap: "anywhere" }}>{row.sourceHash}</td>
          </tr>)}
        </tbody></table></div>
        <p>{study.qualification}</p><button type="button" data-testid="project-mesh-trend-export" onClick={exportTrend}>Export checked HTML trend</button>
      </>}
      {message && <p role="status">{message}</p>}
    </div>
  </div>, document.body);
}
