import React, { useState } from "react";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";
import { surfaceResolutionReport } from "./surfaceResolutionStudy";
import { downloadStudyBlob } from "./studyComparisonExport";

export const SavedResolutionComparison = ({ meshes, onSelect }: { meshes: readonly SavedMeshChoice[]; onSelect: (id: string) => void }) => {
  const [selected, setSelected] = useState("");
  const groups = [...new Set(meshes.flatMap(mesh => mesh.resolutionStudy ? [mesh.resolutionStudy.studyId] : []))];
  const group = groups.includes(selected) ? selected : groups.at(-1);
  if (!group) return null;
  let report: ReturnType<typeof surfaceResolutionReport>;
  try { report = surfaceResolutionReport(meshes, group); } catch (failure) { return <p role="status">Resolution study unavailable: {(failure as Error).message}</p>; }
  const number = (value: number | null) => value === null ? "unavailable" : value.toPrecision(6);
  return <details data-testid="project-resolution-results" open style={{ margin: "8px 0" }}>
    <summary>Saved resolution comparisons</summary>
    <label>Source snapshot <select data-testid="project-resolution-choice" value={group} onChange={event => setSelected(event.target.value)} style={{ maxWidth: "100%" }}>{groups.map(id => {
      const mesh = meshes.find(item => item.resolutionStudy?.studyId === id)!;
      return <option key={id} value={id}>Surface r{mesh.surfaceGeneration?.revision} · {mesh.current ? "current" : "historical"} · {id.slice(-6)}</option>;
    })}</select></label>
    <div style={{ overflowX: "auto", maxWidth: "100%" }}><table data-testid="project-resolution-table"><thead><tr><th>Sampling</th><th>Vertices</th><th>Interior / excluded</th><th>Mean |H|</th><th>Average K</th><th>Study</th></tr></thead>
      <tbody>{report.runs.map(run => <tr key={run.meshSource.documentId}><td>{run.samplesPerAxis}/axis</td><td>{run.vertexCount}</td><td>{run.interior.count} / {run.interior.excluded}</td><td>{number(run.interior.averageAbsH)}</td><td>{number(run.interior.averageK)}</td><td><button onClick={() => onSelect(run.meshSource.documentId)}>{run.title}</button>{!run.current && <small> · historical</small>}</td></tr>)}</tbody></table></div>
    {report.excludedRuns.length > 0 && <p>{report.excludedRuns.length} excluded run(s): {report.excludedRuns.map(run => `${run.title}: ${run.reason}`).join("; ")}</p>}
    <p style={{ margin: "5px 0" }}>Length units: {report.lengthUnits}. Surface r{report.surfaceSource.revision}. {report.qualification}</p>
    <button data-testid="project-resolution-export-json" onClick={() => downloadStudyBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "math3d-resolution-comparison.json")}>Export resolution JSON</button>
  </details>;
};
