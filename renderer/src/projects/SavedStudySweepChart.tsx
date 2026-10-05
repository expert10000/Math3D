import React, { useState } from "react";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";

export const SavedStudySweepChart = ({ meshes, onSelect }: { meshes: readonly SavedMeshChoice[]; onSelect: (id: string) => void }) => {
  const [selected, setSelected] = useState(""), [metric, setMetric] = useState<"averageK" | "averageAbsH">("averageAbsH");
  const available = meshes.filter(mesh => mesh.studyRun && mesh.results.some(result => result.resultId === mesh.studyRun!.resultId && result.provenance.source.revision === mesh.revision && result.provenance.source.structuralHash === mesh.structuralHash));
  const groups = [...new Set(available.map(mesh => mesh.studyRun!.sweepId))];
  const group = groups.includes(selected) ? selected : groups.at(-1);
  const points = available.filter(mesh => mesh.studyRun!.sweepId === group).sort((a, b) => a.studyRun!.value - b.studyRun!.value);
  if (!points.length) return null;
  const run = points[0].studyRun!, values = points.map(mesh => mesh.studyRun!.interior[metric]);
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const low = Math.min(0, ...finite), high = Math.max(0, ...finite), span = high - low || 1;
  const x0 = points[0].studyRun!.value, x1 = points.at(-1)!.studyRun!.value;
  const x = (value: number) => 65 + (value - x0) / (x1 - x0 || 1) * 530;
  const y = (value: number) => 220 - (value - low) / span * 175;
  const label = metric === "averageAbsH" ? "Mean |H|" : "Average Gaussian K";
  return <details data-testid="project-study-sweep-results" open className="saved-study-sweep">
    <summary>Saved parameter sweeps</summary>
    <label>Sweep <select data-testid="project-study-sweep-choice" value={group} onChange={event => setSelected(event.target.value)}>{groups.map(id => {
      const first = available.find(mesh => mesh.studyRun!.sweepId === id)!.studyRun!;
      return <option key={id} value={id}>{first.presetId} · {first.resolution}/axis · source r{first.baseSource.revision} · {id.slice(-6)}</option>;
    })}</select></label>
    <label>Measurement <select data-testid="project-study-sweep-metric" value={metric} onChange={event => setMetric(event.target.value as typeof metric)}><option value="averageAbsH">Mean |H|</option><option value="averageK">Average Gaussian K</option></select></label>
    <svg data-testid="project-study-sweep-chart" viewBox="0 0 650 280" role="img" aria-label={`${label} by ${run.presetId === "helicoid" ? "pitch" : "waist radius"}`} style={{ width: "100%", maxWidth: 760, background: "#f8fafc", borderRadius: 8 }}>
      <title>{label} across saved {run.presetId} variants</title>
      <desc>Interior discrete Mesh estimates. The table below provides exact values and links to every run.</desc>
      <path d="M65 35V220H615" fill="none" stroke="#64748b" />
      <text x="65" y="22" fontSize="13">{label}</text><text x="315" y="270" fontSize="13">{run.presetId === "helicoid" ? "Pitch per radian" : "Waist radius"}</text>
      <text x="4" y="48" fontSize="11">{high.toPrecision(3)}</text><text x="4" y="225" fontSize="11">{low.toPrecision(3)}</text>
      <polyline points={points.flatMap((mesh, index) => values[index] === null ? [] : [`${x(mesh.studyRun!.value)},${y(values[index]!)}`]).join(" ")} fill="none" stroke="#2563eb" strokeWidth="2" />
      {points.map((mesh, index) => <g key={mesh.id}>{values[index] !== null && <circle cx={x(mesh.studyRun!.value)} cy={y(values[index]!)} r="5" fill="#2563eb"><title>{mesh.title}: {values[index]}</title></circle>}<text x={x(mesh.studyRun!.value)} y="243" textAnchor="middle" fontSize="12">{mesh.studyRun!.value}</text></g>)}
    </svg>
    <div style={{ maxWidth: "100%", overflowX: "auto" }}><table data-testid="project-study-sweep-table"><thead><tr><th>Run</th><th>Parameter</th><th>Mean |H|</th><th>Average K</th><th>Interior / excluded</th></tr></thead><tbody>{points.map(mesh => {
      const run = mesh.studyRun!, stats = run.interior;
      return <tr key={mesh.id}><td><button onClick={() => onSelect(mesh.id)}>{mesh.title}</button>{!mesh.current && <small> · historical source</small>}</td><td>{run.value}</td><td>{stats.averageAbsH?.toPrecision(6) ?? "unavailable"}</td><td>{stats.averageK?.toPrecision(6) ?? "unavailable"}</td><td>{stats.count} / {stats.excluded}</td></tr>;
    })}</tbody></table></div>
    <small>Length units: {points[0].units ?? "unknown"}. Same sampling size, separate source variants. Boundary/invalid vertices are excluded; these are sampled averages, not error bounds or proof of minimality. Catenoid axial ranges scale with waist radius. Save project to retain every source, Mesh, result and chart.</small>
  </details>;
};
