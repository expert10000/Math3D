import React, { useState } from "react";
import type { AnalysisResultEnvelope } from "@math3d/core";
import { savedMeshAnalysisLabel, type SavedMeshAnalysisKind } from "./savedMeshAnalysis";

export type SavedMeshChoice = { id: string; title: string; revision: number; structuralHash: string; vertexCount: number; sourceRevision?: number; current: boolean; results: readonly AnalysisResultEnvelope[] };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toPrecision(6) : "unavailable";
const resultDescription = (result: AnalysisResultEnvelope) => {
  const s = result.summary as Record<string, any>;
  if (result.provenance.operation.type === "mesh.saved.quality") return `${s.faceCount ?? "Unknown"} triangles · boundary edges ${s.topology?.boundaryEdgeCount ?? "unknown"} · degenerate faces ${s.topology?.degenerateFaceCount ?? "unknown"} · max aspect ${number(s.metrics?.aspectRatio?.max)}`;
  if (result.provenance.operation.type === "mesh.saved.curvature") return `Gaussian K average ${number(s.gaussian?.avg)} · mean H average ${number(s.mean?.avg)} · valid vertices ${s.counts?.validVertexCount ?? "unknown"} · boundary vertices ${s.counts?.boundaryVertexCount ?? "unknown"}`;
  if (result.provenance.operation.type === "mesh.saved.edge-path") return `Length ${number(s.length)} · ${Array.isArray(s.vertexIndices) ? s.vertexIndices.length : "unknown"} path vertices`;
  return result.provenance.operation.type;
};
export const SavedMeshAnalysisPanel = ({ meshes, onCreate, onOpen, onAnalyze, creationHint = "Uses the applied surface. Apply formula changes first." }: { meshes: readonly SavedMeshChoice[]; onCreate?: () => string; onOpen?: (id: string) => void; onAnalyze: (id: string, kind: SavedMeshAnalysisKind, endpoints?: { start: number; end: number }) => void; creationHint?: string }) => {
  const [selected, setSelected] = useState(""), [start, setStart] = useState("0"), [end, setEnd] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const mesh = meshes.find(choice => choice.id === selected) ?? meshes.at(-1);
  const run = (action: () => void) => { try { action(); setError(""); } catch (failure) { setError((failure as Error).message); } };
  const analyze = (kind: SavedMeshAnalysisKind) => run(() => {
    if (!mesh) throw new TypeError("Create a Mesh first.");
    if (kind === "edge-path" && (!start.trim() || !(end || String(mesh.vertexCount - 1)).trim())) throw new TypeError("Enter start and end vertex indices.");
    onAnalyze(mesh.id, kind, kind === "edge-path" ? { start: Number(start), end: Number(end || mesh.vertexCount - 1) } : undefined);
    setMessage(`${savedMeshAnalysisLabel(kind)} saved in the workspace. Projects → Save project keeps it.`);
  });
  return <section data-testid="project-saved-mesh-workflow" style={{ padding: "0 10px 10px", borderTop: "1px solid #cbd5e1", maxWidth: "100%", overflowWrap: "anywhere" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0" }}>
      {onCreate && <><button data-testid="project-surface-create-mesh" onClick={() => run(() => { const id = onCreate(); setSelected(id); setMessage("Mesh ready. Its source revision is recorded; Projects → Save project keeps it."); })}>Create Mesh</button><small>{creationHint}</small></>}
      {mesh && <><label style={{ maxWidth: "100%" }}>Saved Mesh <select style={{ maxWidth: "100%" }} data-testid="project-saved-mesh-choice" value={mesh.id} onChange={event => { setSelected(event.target.value); setMessage(""); setError(""); }}>{meshes.map(choice => <option key={choice.id} value={choice.id}>{choice.title}{choice.current ? "" : " · historical"}</option>)}</select></label>
        {onOpen && <button data-testid="project-saved-mesh-open" onClick={() => run(() => onOpen(mesh.id))}>Open Mesh</button>}
        <span data-testid="project-saved-mesh-freshness">{mesh.vertexCount} vertices · {mesh.current ? "Current source" : "Historical source or edited Mesh; create a new Mesh from the Surface to refresh"}{mesh.sourceRevision !== undefined ? ` · surface r${mesh.sourceRevision}` : ""}</span>
      </>}
    </div>
    {mesh && <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button data-testid="project-saved-mesh-quality" onClick={() => analyze("quality")}>Save mesh quality</button>
        <button data-testid="project-saved-mesh-curvature" onClick={() => analyze("curvature")}>Save discrete curvature</button>
        <label>Start vertex <input data-testid="project-saved-mesh-path-start" type="number" step="1" min="0" max={mesh.vertexCount - 1} value={start} onChange={event => setStart(event.target.value)} style={{ width: 75 }} /></label>
        <label>End vertex <input data-testid="project-saved-mesh-path-end" type="number" step="1" min="0" max={mesh.vertexCount - 1} value={end || String(mesh.vertexCount - 1)} onChange={event => setEnd(event.target.value)} style={{ width: 75 }} /></label>
        <button data-testid="project-saved-mesh-path" onClick={() => analyze("edge-path")}>Save shortest edge path</button>
      </div>
      <small>Numerical mesh estimates. The path follows mesh edges; continuous surface geodesics and analytic minimality are not certified.</small>
      {!!mesh.results.length && <details data-testid="project-saved-mesh-results" open><summary>Saved analysis ({mesh.results.length})</summary>
        {mesh.results.map(result => <article key={result.resultId} style={{ padding: "6px 0" }} data-testid={`project-saved-mesh-result-${result.resultId}`}>
          <strong>{savedMeshAnalysisLabel(result.provenance.operation.type.replace("mesh.saved.", ""))}</strong> · {result.status} · {mesh.current && result.provenance.source.revision === mesh.revision && result.provenance.source.structuralHash === mesh.structuralHash ? "current" : "historical"} · mesh r{result.provenance.source.revision}
          <div>{resultDescription(result)}</div>
          <details><summary>Measurements and method</summary><div>{result.provenance.operation.algorithm}</div>{result.warnings.map(warning => <p key={warning}>{warning}</p>)}<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result.summary, null, 2)}</pre></details>
        </article>)}
      </details>}
    </>}
    {message && <div role="status" data-testid="project-saved-mesh-message">{message}</div>}
    {error && <div role="alert">{error}</div>}
  </section>;
};
