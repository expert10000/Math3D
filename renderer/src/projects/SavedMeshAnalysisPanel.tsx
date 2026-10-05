import React, { useEffect, useMemo, useState } from "react";
import type { AnalysisResultEnvelope } from "@math3d/core";
import { savedMeshAnalysisLabel, type SavedMeshAnalysisKind } from "./savedMeshAnalysis";
import { SAVED_MESH_STUDIES, studyEndpoints } from "./savedMeshStudies";
import { SURFACE_STUDY_PRESETS, type SurfaceStudyPresetId } from "./surfaceStudyPresets";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { savedMeshCurvatureMap, CURVATURE_MAP_COLOURS, type CurvatureMapField } from "./savedMeshExploration";
import { SavedMeshStudyView } from "./SavedMeshStudyView";
import "./savedMeshExploration.css";

export type SavedMeshChoice = { id: string; title: string; revision: number; structuralHash: string; vertexCount: number; sourceRevision?: number; current: boolean; results: readonly AnalysisResultEnvelope[] };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toPrecision(6) : "unavailable";
const resultDescription = (result: AnalysisResultEnvelope) => {
  const s = result.summary as Record<string, any>;
  if (result.provenance.operation.type === "mesh.saved.quality") return `${s.faceCount ?? "Unknown"} triangles · boundary edges ${s.topology?.boundaryEdgeCount ?? "unknown"} · degenerate faces ${s.topology?.degenerateFaceCount ?? "unknown"} · max aspect ${number(s.metrics?.aspectRatio?.max)}`;
  if (result.provenance.operation.type === "mesh.saved.curvature") return `Gaussian K average ${number(s.gaussian?.avg)} · mean H average ${number(s.mean?.avg)} · valid vertices ${s.counts?.validVertexCount ?? "unknown"} · boundary vertices ${s.counts?.boundaryVertexCount ?? "unknown"}`;
  if (result.provenance.operation.type === "mesh.saved.edge-path") return `Length ${number(s.length)} · ${Array.isArray(s.vertexIndices) ? s.vertexIndices.length : "unknown"} path vertices`;
  return result.provenance.operation.type;
};
export const SavedMeshAnalysisPanel = ({ meshes, onCreate, onOpen, onAnalyze, onApplyStudyPreset, readMesh, initialStudyPreset = "helicoid", creationHint = "Uses the applied surface. Apply formula changes first." }: { meshes: readonly SavedMeshChoice[]; onCreate?: () => string; onOpen?: (id: string) => void; onAnalyze: (id: string, kind: SavedMeshAnalysisKind, endpoints?: { start: number; end: number }) => void; onApplyStudyPreset?: (id: SurfaceStudyPresetId, value: number) => void; readMesh?: (id: string) => SurfaceMeshData; initialStudyPreset?: SurfaceStudyPresetId; creationHint?: string }) => {
  const [selected, setSelected] = useState(""), [start, setStart] = useState("0"), [end, setEnd] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [studyId, setStudyId] = useState<SavedMeshAnalysisKind>("curvature");
  const [presetId, setPresetId] = useState<SurfaceStudyPresetId>(initialStudyPreset), [presetValue, setPresetValue] = useState(String(SURFACE_STUDY_PRESETS.find(item => item.id === initialStudyPreset)!.value));
  const preset = SURFACE_STUDY_PRESETS.find(item => item.id === presetId)!;
  const study = SAVED_MESH_STUDIES.find(item => item.id === studyId)!;
  const mesh = meshes.find(choice => choice.id === selected) ?? meshes.at(-1);
  const [viewOpen, setViewOpen] = useState(false), [mapField, setMapField] = useState<CurvatureMapField | "none">("none");
  const [pickTarget, setPickTarget] = useState<"start" | "end" | null>(null), [endpointsChosen, setEndpointsChosen] = useState(false);
  useEffect(() => { setPickTarget(null); setEndpointsChosen(false); setStart("0"); setEnd(""); }, [mesh?.id, mesh?.revision, mesh?.structuralHash]);
  const viewData = useMemo(() => mesh && readMesh ? readMesh(mesh.id) : null, [mesh?.id, mesh?.revision, mesh?.structuralHash, readMesh]);
  const savedPath = mesh?.results.filter(result => result.provenance.operation.type === "mesh.saved.edge-path" && result.provenance.source.revision === mesh.revision && result.provenance.source.structuralHash === mesh.structuralHash).at(-1)?.summary as { vertexIndices?: number[] } | undefined;
  const colourMap = useMemo(() => {
    try { return { map: viewData && mapField !== "none" && viewOpen ? savedMeshCurvatureMap(viewData, mapField) : null, error: "" }; }
    catch (failure) { return { map: null, error: (failure as Error).message }; }
  }, [viewData, mapField, viewOpen]);
  const run = (action: () => void) => { try { action(); setError(""); } catch (failure) { setError((failure as Error).message); } };
  const analyze = (kind: SavedMeshAnalysisKind) => run(() => {
    if (!mesh) throw new TypeError("Create a Mesh first.");
    if (kind === "edge-path" && (!start.trim() || !(end || String(mesh.vertexCount - 1)).trim())) throw new TypeError("Enter start and end vertex indices.");
    onAnalyze(mesh.id, kind, kind === "edge-path" ? { start: Number(start), end: Number(end || mesh.vertexCount - 1) } : undefined);
    if (kind === "edge-path") { setEndpointsChosen(true); setViewOpen(true); setPickTarget(null); }
    setMessage(`${savedMeshAnalysisLabel(kind)} saved in the workspace. Projects → Save project keeps it.`);
  });
  const runStudy = () => run(() => {
    setMessage("");
    if (studyId === "edge-path" && !mesh) throw new TypeError("Create Mesh first to choose start and end vertices.");
    const endpoints = studyId === "edge-path" ? studyEndpoints(start, end, mesh!.vertexCount) : undefined;
    const id = studyId === "edge-path" ? mesh!.id : onCreate ? onCreate() : mesh?.id;
    if (!id) throw new TypeError("Open a saved Mesh or Surface first.");
    onAnalyze(id, studyId, endpoints);
    setSelected(id);
    if (studyId === "curvature") { setViewOpen(true); setMapField("K"); }
    if (studyId === "edge-path") { setEndpointsChosen(true); setViewOpen(true); setPickTarget(null); }
    setMessage(`${study.label} saved. Repeated runs reuse an unchanged result. Projects → Save project keeps it.`);
  });
  return <section data-testid="project-saved-mesh-workflow" style={{ padding: "0 10px 10px", borderTop: "1px solid #cbd5e1", maxWidth: "100%", overflowWrap: "anywhere" }}>
    <details data-testid="project-analysis-studies" style={{ padding: "8px 0" }}>
      <summary>Guided analysis studies</summary>
      {onApplyStudyPreset && <fieldset style={{ margin: "8px 0", minWidth: 0 }} data-testid="project-surface-study-presets">
        <legend>Surface study setup</legend>
        <label>Preset <select data-testid="project-surface-study-preset" value={presetId} onChange={event => { const id = event.target.value as SurfaceStudyPresetId; setPresetId(id); setPresetValue(String(SURFACE_STUDY_PRESETS.find(item => item.id === id)!.value)); }}>{SURFACE_STUDY_PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label style={{ display: "block" }}>{preset.parameter} <input data-testid="project-surface-study-parameter" type="number" min="0.001" max="100" step="any" value={presetValue} onChange={event => setPresetValue(event.target.value)} style={{ width: 90 }} /></label>
        <small>{preset.ranges}. Replaces the current coordinate formulas and ranges; Undo document restores them. Existing Meshes and results remain historical.</small>
        <button data-testid="project-surface-study-apply" onClick={() => run(() => { onApplyStudyPreset(presetId, Number(presetValue)); setMessage(`${preset.label} applied. Choose a study and run it to measure the new source.`); })}>Apply suggested setup</button>
        <ul>{preset.questions.map(question => <li key={question}>{question}</li>)}</ul>
      </fieldset>}
      <label>Study <select data-testid="project-analysis-study" value={studyId} onChange={event => { setStudyId(event.target.value as SavedMeshAnalysisKind); setMessage(""); setError(""); }}>{SAVED_MESH_STUDIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button data-testid="project-analysis-run-study" onClick={runStudy} disabled={!onCreate && !mesh || studyId === "edge-path" && !mesh}>Run study</button>
      <div>{study.purpose}</div><small>{study.qualification}</small>
      {onCreate && <div><small>Curvature/quality create or reuse the current Surface's Mesh and retain earlier results. Edge paths use the selected saved Mesh, including historical snapshots.</small></div>}
      {studyId === "edge-path" && !mesh && <div><small>Create Mesh first to choose vertex indices.</small></div>}
    </details>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0" }}>
      {onCreate && <><button data-testid="project-surface-create-mesh" onClick={() => run(() => { const id = onCreate(); setSelected(id); setMessage("Mesh ready. Its source revision is recorded; Projects → Save project keeps it."); })}>Create Mesh</button><small>{creationHint}</small></>}
      {mesh && <><label style={{ maxWidth: "100%" }}>Saved Mesh <select style={{ maxWidth: "100%" }} data-testid="project-saved-mesh-choice" value={mesh.id} onChange={event => { setSelected(event.target.value); setMessage(""); setError(""); }}>{meshes.map(choice => <option key={choice.id} value={choice.id}>{choice.title}{choice.current ? "" : " · historical"}</option>)}</select></label>
        {onOpen && <button data-testid="project-saved-mesh-open" onClick={() => run(() => onOpen(mesh.id))}>Open Mesh</button>}
        <span data-testid="project-saved-mesh-freshness">{mesh.vertexCount} vertices · {mesh.current ? "Current source" : "Historical source or edited Mesh; create a new Mesh from the Surface to refresh"}{mesh.sourceRevision !== undefined ? ` · surface r${mesh.sourceRevision}` : ""}</span>
      </>}
    </div>
    {mesh && <>
      {viewData && <details className="saved-mesh-visual-study" data-testid="project-study-visuals" open={viewOpen} onToggle={event => setViewOpen(event.currentTarget.open)} style={{ marginBottom: 10, maxWidth: 760 }}>
        <summary>Saved Mesh visual study</summary>
        <div>{mesh.title} · Mesh r{mesh.revision} · {mesh.current ? "current source" : "historical source"}</div>
        <label>Colour map <select data-testid="project-curvature-map" value={mapField} onChange={event => setMapField(event.target.value as CurvatureMapField | "none")}><option value="none">Solid</option><option value="K">Gaussian K</option><option value="H">Mean H</option></select></label>
        {colourMap.map && <div data-testid="project-curvature-legend" data-source-id={mesh.id} data-source-revision={mesh.revision} data-field={mapField}>
          <div style={{ height: 12, maxWidth: 320, background: `linear-gradient(to right, ${CURVATURE_MAP_COLOURS.negative}, ${CURVATURE_MAP_COLOURS.zero}, ${CURVATURE_MAP_COLOURS.positive})` }} />
          {number(colourMap.map.range.min)} · 0 · {number(colourMap.map.range.max)} · auto symmetric scale
          <div>Interior range {number(colourMap.map.min)} to {number(colourMap.map.max)} · {colourMap.map.count} coloured vertices · {colourMap.map.excluded} boundary/invalid vertices in grey.</div>
          <small>{mapField === "K" ? "Gaussian K: inverse length squared." : "Signed mean H: inverse length; input winding for open meshes, outward orientation for closed meshes."} Numerical estimates on this saved Mesh; colour maps do not prove minimality.</small>
        </div>}
        {colourMap.error && <div role="alert">{colourMap.error}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          <button data-testid="project-path-pick-start" aria-pressed={pickTarget === "start"} onClick={() => { setViewOpen(true); setPickTarget("start"); }}>Pick start on Mesh</button>
          <button data-testid="project-path-pick-end" aria-pressed={pickTarget === "end"} onClick={() => { setViewOpen(true); setPickTarget("end"); }}>Pick end on Mesh</button>
          {pickTarget && <button onClick={() => setPickTarget(null)}>Cancel picking</button>}
        </div>
        <div role="status" data-testid="project-path-selection" data-picked-start={endpointsChosen ? start : ""} data-picked-end={endpointsChosen ? end : ""}>
          {pickTarget ? `Click the saved Mesh to choose ${pickTarget}. Picks snap to a vertex of the hit triangle; drag still orbits. Escape cancels.` : "Pick start, then end; save the shortest edge path below. Green = start, purple = end, yellow = last saved path (shown through the Mesh)."}
        </div>
        {viewOpen && <SavedMeshStudyView mesh={viewData} colors={colourMap.map?.colors} picking={!!pickTarget} onCancelPick={() => setPickTarget(null)}
          start={endpointsChosen ? Number(start) : undefined} end={endpointsChosen && end ? Number(end) : endpointsChosen ? mesh.vertexCount - 1 : undefined} path={savedPath?.vertexIndices}
          onPick={index => { if (pickTarget === "start") { setStart(String(index)); setPickTarget("end"); } else if (pickTarget === "end") { setEnd(String(index)); setPickTarget(null); } setEndpointsChosen(true); setError(""); }} />}
      </details>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button data-testid="project-saved-mesh-quality" onClick={() => analyze("quality")}>Save mesh quality</button>
        <button data-testid="project-saved-mesh-curvature" onClick={() => analyze("curvature")}>Save discrete curvature</button>
        <label>Start vertex <input data-testid="project-saved-mesh-path-start" type="number" step="1" min="0" max={mesh.vertexCount - 1} value={start} onChange={event => { setStart(event.target.value); setEndpointsChosen(true); setPickTarget(null); }} style={{ width: 75 }} /></label>
        <label>End vertex <input data-testid="project-saved-mesh-path-end" type="number" step="1" min="0" max={mesh.vertexCount - 1} value={end || String(mesh.vertexCount - 1)} onChange={event => { setEnd(event.target.value); setEndpointsChosen(true); setPickTarget(null); }} style={{ width: 75 }} /></label>
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
