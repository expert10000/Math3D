import React, { useEffect, useMemo, useState } from "react";
import type { AnalysisResultEnvelope, CanonicalJsonValue, ScientificSourceGeneration } from "@math3d/core";
import { savedMeshAnalysisLabel, type SavedMeshAnalysisKind } from "./savedMeshAnalysis";
import { SAVED_MESH_STUDIES, studyEndpoints } from "./savedMeshStudies";
import { SURFACE_STUDY_PRESETS, type SurfaceStudyPresetId } from "./surfaceStudyPresets";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { savedMeshCurvatureMap, savedMeshCurvatureReport, savedMeshVertexInspection, CURVATURE_MAP_COLOURS, type CurvatureMapField } from "./savedMeshExploration";
import { SavedMeshStudyView } from "./SavedMeshStudyView";
import "./savedMeshExploration.css";
import { SURFACE_STUDY_RESOLUTIONS, type SurfaceStudyResolution } from "./surfaceStudyResolution";
import { parseSweepValues, type SurfaceStudyRun } from "./surfaceStudySweep";
import { SavedStudySweepChart } from "./SavedStudySweepChart";
import type { savedMeshSurfaceSource } from "./savedSurfaceMesh";
import { SavedMeshComparison } from "./SavedMeshComparison";
import { SavedResolutionComparison } from "./SavedResolutionComparison";
import type { SurfaceResolutionRun } from "./surfaceResolutionRun";

export type SavedMeshChoice = { id: string; title: string; revision: number; structuralHash: string; vertexCount: number; meshGeneration?: ScientificSourceGeneration; sourceRevision?: number; surfaceGeneration?: ScientificSourceGeneration; samplingSize?: number; sampling?: CanonicalJsonValue; units?: string; current: boolean; results: readonly AnalysisResultEnvelope[]; studyRun?: SurfaceStudyRun; resolutionStudy?: SurfaceResolutionRun };
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toPrecision(6) : "unavailable";
const resultDescription = (result: AnalysisResultEnvelope) => {
  const s = result.summary as Record<string, any>;
  if (result.provenance.operation.type === "mesh.saved.quality") return `${s.faceCount ?? "Unknown"} triangles · boundary edges ${s.topology?.boundaryEdgeCount ?? "unknown"} · degenerate faces ${s.topology?.degenerateFaceCount ?? "unknown"} · max aspect ${number(s.metrics?.aspectRatio?.max)}`;
  if (result.provenance.operation.type === "mesh.saved.curvature") return `Gaussian K average ${number(s.gaussian?.avg)} · mean H average ${number(s.mean?.avg)} · valid vertices ${s.counts?.validVertexCount ?? "unknown"} · boundary vertices ${s.counts?.boundaryVertexCount ?? "unknown"}`;
  if (result.provenance.operation.type === "mesh.saved.edge-path") return `Length ${number(s.length)} · ${Array.isArray(s.vertexIndices) ? s.vertexIndices.length : "unknown"} path vertices`;
  return result.provenance.operation.type;
};
export type SavedMeshViewportState = { mesh: SurfaceMeshData; colors?: Float32Array | null; inspected?: number; picking: boolean; onInspect: (index: number) => void; onPick: (index: number) => void; onCancelPick: () => void; start?: number; end?: number; path?: readonly number[] };
export const SavedMeshAnalysisPanel = ({ renderWorkspace, meshes, onCreate, onOpen, onNameStudy, onOpenSource, sourceInfo, onSweep, onResolutionCompare, onAnalyze, onApplyStudyPreset, readMesh, resolutionSupported = false, initialStudyPreset = "helicoid", creationHint = "Uses the applied surface. Apply formula changes first." }: { renderWorkspace?: (controls: React.ReactNode, viewport: SavedMeshViewportState | null) => React.ReactNode; meshes: readonly SavedMeshChoice[]; onNameStudy?: (id: string, name: string) => void; onOpenSource?: (id: string) => void; sourceInfo?: ReturnType<typeof savedMeshSurfaceSource>; onResolutionCompare?: () => Promise<string[]>; onSweep?: (id: SurfaceStudyPresetId, values: readonly number[], resolution: SurfaceStudyResolution) => Promise<string[]>; onCreate?: (resolution?: SurfaceStudyResolution) => string; onOpen?: (id: string) => void; onAnalyze: (id: string, kind: SavedMeshAnalysisKind, endpoints?: { start: number; end: number }) => void; onApplyStudyPreset?: (id: SurfaceStudyPresetId, value: number) => void; readMesh?: (id: string) => SurfaceMeshData; resolutionSupported?: boolean; initialStudyPreset?: SurfaceStudyPresetId; creationHint?: string }) => {
  const [selected, setSelected] = useState(""), [start, setStart] = useState("0"), [end, setEnd] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [studyId, setStudyId] = useState<SavedMeshAnalysisKind>("curvature");
  const [studyName, setStudyName] = useState(""), [sweepValues, setSweepValues] = useState("0.5, 1, 1.5"), [sweepBusy, setSweepBusy] = useState(false);
  const [resolution, setResolution] = useState<SurfaceStudyResolution>(33);
  const [presetId, setPresetId] = useState<SurfaceStudyPresetId>(initialStudyPreset), [presetValue, setPresetValue] = useState(String(SURFACE_STUDY_PRESETS.find(item => item.id === initialStudyPreset)!.value));
  const preset = SURFACE_STUDY_PRESETS.find(item => item.id === presetId)!;
  const study = SAVED_MESH_STUDIES.find(item => item.id === studyId)!;
  const mesh = meshes.find(choice => choice.id === selected) ?? meshes.at(-1);
  const [viewOpen, setViewOpen] = useState(Boolean(renderWorkspace)), [mapField, setMapField] = useState<CurvatureMapField | "none">(() => {
    try {
      const saved = mesh && JSON.parse(localStorage.getItem(`math3d.mesh-field.v1.${mesh.id}`) ?? "null");
      if (renderWorkspace && saved?.revision === mesh?.revision && saved?.hash === mesh?.structuralHash && ["none", "K", "H"].includes(saved?.field)) return saved.field;
    } catch { /* Recover optional appearance preferences. */ }
    return renderWorkspace && mesh?.results.some(result => result.provenance.operation.type === "mesh.saved.curvature" && result.provenance.source.revision === mesh.revision && result.provenance.source.structuralHash === mesh.structuralHash) ? "K" : "none";
  });
  useEffect(() => {
    if (!renderWorkspace || !mesh) return;
    try { localStorage.setItem(`math3d.mesh-field.v1.${mesh.id}`, JSON.stringify({ revision: mesh.revision, hash: mesh.structuralHash, field: mapField })); } catch { /* Optional UI state. */ }
  }, [Boolean(renderWorkspace), mesh?.id, mesh?.revision, mesh?.structuralHash, mapField]);
  const [pickTarget, setPickTarget] = useState<"start" | "end" | null>(null), [endpointsChosen, setEndpointsChosen] = useState(false);
  useEffect(() => { setStudyName(mesh?.title ?? ""); }, [mesh?.id, mesh?.title]);
  const meshKey = mesh ? `${mesh.id}:${mesh.revision}:${mesh.structuralHash}` : "";
  const [inspection, setInspection] = useState<{ key: string; index: number } | null>(null);
  const inspected = inspection?.key === meshKey ? inspection.index : undefined;
  const setInspected = (index: number | undefined) => setInspection(index === undefined ? null : { key: meshKey, index });
  useEffect(() => { setPickTarget(null); setEndpointsChosen(false); setStart("0"); setEnd(""); setInspected(undefined); }, [mesh?.id, mesh?.revision, mesh?.structuralHash]);
  // A collapsed study must not decode and verify a large Mesh during Surface
  // navigation. The saved buffer is opened only when the study is expanded.
  const viewData = useMemo(() => viewOpen && mesh && readMesh ? readMesh(mesh.id) : null, [viewOpen, mesh?.id, mesh?.revision, mesh?.structuralHash, readMesh]);
  const savedPath = mesh?.results.filter(result => result.provenance.operation.type === "mesh.saved.edge-path" && result.provenance.source.revision === mesh.revision && result.provenance.source.structuralHash === mesh.structuralHash).at(-1)?.summary as { vertexIndices?: number[] } | undefined;
  const curvature = useMemo(() => {
    try { return { report: viewData && viewOpen ? savedMeshCurvatureReport(viewData) : null, error: "" }; }
    catch (failure) { return { report: null, error: (failure as Error).message }; }
  }, [viewData, viewOpen]);
  const colourMap = useMemo(() => ({ map: viewData && mapField !== "none" && curvature.report ? savedMeshCurvatureMap(viewData, mapField, undefined, curvature.report) : null, error: curvature.error }), [viewData, mapField, curvature]);
  const probe = viewData && curvature.report && inspected !== undefined ? savedMeshVertexInspection(viewData, curvature.report, inspected) : null;
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
    const id = studyId === "edge-path" ? mesh!.id : onCreate ? onCreate(resolution) : mesh?.id;
    if (!id) throw new TypeError("Open a saved Mesh or Surface first.");
    onAnalyze(id, studyId, endpoints);
    setSelected(id);
    if (studyId === "curvature") { setViewOpen(true); setMapField("K"); }
    if (studyId === "edge-path") { setEndpointsChosen(true); setViewOpen(true); setPickTarget(null); }
    setMessage(`${study.label} saved. Repeated runs reuse an unchanged result. Projects → Save project keeps it.`);
  });
  const runSweep = async () => {
    try {
      if (!onSweep) return;
      const values = parseSweepValues(sweepValues);
      setSweepBusy(true); setError(""); setMessage(`Preparing ${values.length} independent variants…`);
      const ids = await onSweep(presetId, values, resolution);
      setSelected(ids.at(-1)!); setViewOpen(true); setMapField("K");
      setMessage(`${ids.length} named curvature studies retained. The open Surface is unchanged. Projects → Save project keeps the sweep.`);
    } catch (failure) { setError((failure as Error).message); setMessage(""); }
    finally { setSweepBusy(false); }
  };
  const runResolutionComparison = async () => {
    try {
      if (!onResolutionCompare) return;
      setSweepBusy(true); setError(""); setMessage("Preparing Coarse, Medium and Fine snapshots…");
      const ids = await onResolutionCompare();
      setSelected(ids.at(-1)!); setViewOpen(true); setMapField("K");
      setMessage("Three resolution studies retained from the same Surface generation. Projects → Save project keeps them.");
    } catch (failure) { setError((failure as Error).message); setMessage(""); } finally { setSweepBusy(false); }
  };
  const controls = <section data-testid="project-saved-mesh-workflow" style={{ padding: "0 10px 10px", borderTop: "1px solid #cbd5e1", maxWidth: "100%", overflowWrap: "anywhere" }}>
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
      {onSweep && <fieldset data-testid="project-study-sweep" disabled={sweepBusy} style={{ margin: "8px 0", minWidth: 0 }}><legend>Parameter sweep</legend>
        <label>{preset.parameter} values <input data-testid="project-study-sweep-values" value={sweepValues} onChange={event => setSweepValues(event.target.value)} placeholder="0.5, 1, 1.5" style={{ maxWidth: "100%" }} /></label>
        <button data-testid="project-study-sweep-run" onClick={() => void runSweep()}>Run {presetId} sweep</button>
        <small style={{ display: "block" }}>2–5 distinct positive values up to 100. Uses Analysis resolution below; retains separate Surface variants, named Meshes and curvature results. Your current formulas stay unchanged.</small>
      </fieldset>}
      {onResolutionCompare && resolutionSupported && <fieldset disabled={sweepBusy} style={{ margin: "8px 0", minWidth: 0 }}>
        <legend>Resolution comparison</legend><button data-testid="project-resolution-run" onClick={() => void runResolutionComparison()}>Compare Coarse, Medium and Fine</button>
        <small style={{ display: "block" }}>Keeps the same applied Surface source. Retains three sampled Meshes and numerical curvature results; sampling differences are not certified error bounds.</small>
      </fieldset>}
      <label>Study <select data-testid="project-analysis-study" value={studyId} onChange={event => { setStudyId(event.target.value as SavedMeshAnalysisKind); setMessage(""); setError(""); }}>{SAVED_MESH_STUDIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button data-testid="project-analysis-run-study" onClick={runStudy} disabled={sweepBusy || !onCreate && !mesh || studyId === "edge-path" && !mesh}>Run study</button>
      <div>{study.purpose}</div><small>{study.qualification}</small>
      {onCreate && <div><small>Curvature/quality create or reuse the current Surface's Mesh and retain earlier results. Edge paths use the selected saved Mesh, including historical snapshots.</small></div>}
      {studyId === "edge-path" && !mesh && <div><small>Create Mesh first to choose vertex indices.</small></div>}
    </details>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0" }}>
      {onCreate && <>{resolutionSupported && <label>Analysis resolution <select data-testid="project-analysis-resolution" value={resolution} onChange={event => setResolution(Number(event.target.value) as SurfaceStudyResolution)}>{SURFACE_STUDY_RESOLUTIONS.map(item => <option key={item.size} value={item.size}>{item.label}</option>)}</select></label>}<button data-testid="project-surface-create-mesh" disabled={sweepBusy} onClick={() => run(() => { const id = onCreate(resolution); setSelected(id); setMessage("Mesh ready. Its source revision and sampling are recorded; Projects → Save project keeps it."); })}>Create Mesh</button><small>{creationHint}</small></>}
      {mesh && <><label style={{ maxWidth: "100%" }}>Saved Mesh <select style={{ maxWidth: "100%" }} data-testid="project-saved-mesh-choice" value={mesh.id} onChange={event => { setSelected(event.target.value); setMessage(""); setError(""); }}>{meshes.map(choice => <option key={choice.id} value={choice.id}>{choice.title}{choice.current ? "" : " · historical"}</option>)}</select></label>
        {onOpen && <button data-testid="project-saved-mesh-open" onClick={() => run(() => onOpen(mesh.id))}>Open Mesh</button>}
        <span data-testid="project-saved-mesh-freshness">{mesh.vertexCount} vertices{mesh.samplingSize ? ` · ${mesh.samplingSize} samples/axis` : ""} · {mesh.current ? "Current source" : "Historical source or edited Mesh; create a new Mesh from the Surface to refresh"}{mesh.sourceRevision !== undefined ? ` · surface r${mesh.sourceRevision}` : ""}</span>
      </>}
    </div>
    {meshes.some(choice => choice.studyRun) && <SavedStudySweepChart meshes={meshes} onSelect={id => { setSelected(id); setViewOpen(true); setMapField("K"); }} />}
    {meshes.some(choice => choice.resolutionStudy) && <SavedResolutionComparison meshes={meshes} onSelect={id => { setSelected(id); setViewOpen(true); setMapField("K"); }} />}
    {mesh && <>
      {onNameStudy && <div className="saved-study-name"><label>Study name <input data-testid="project-study-name" maxLength={160} value={studyName} onChange={event => setStudyName(event.target.value)} /></label><button data-testid="project-study-name-save" disabled={!studyName.trim() || sweepBusy} onClick={() => run(() => { onNameStudy(mesh.id, studyName); setMessage("Study name saved in the workspace. Geometry and result generations are unchanged. Projects → Save project retains the name."); })}>Save study name</button></div>}
      {onOpenSource && <div data-testid="project-study-source">
        <button data-testid="project-study-open-source" disabled={!mesh.surfaceGeneration || sourceInfo === null || sourceInfo !== undefined && !sourceInfo.document} onClick={() => run(() => onOpenSource(mesh.id))}>Open source Surface</button>
        <small> {mesh.surfaceGeneration ? `Snapshot from Surface r${mesh.surfaceGeneration.revision}. ` : "This Mesh has no retained Surface lineage. "}{sourceInfo?.document && !sourceInfo.current ? `Opens the current source r${sourceInfo.document.identity.revision}; the Mesh retains its historical snapshot. ` : ""}{!mesh.surfaceGeneration ? "Its sampling comes from the saved buffer; no source Surface resolution control is available." : sourceInfo !== undefined && !sourceInfo?.document ? "The source Surface is unavailable in this project. The saved snapshot and measurements remain retained." : !onCreate ? "Analysis resolution is set on the source Surface. Create a new Mesh there; the saved Mesh keeps its existing sampling." : "Return here to set analysis resolution and create a new snapshot."}</small>
      </div>}
      {readMesh && <details className="saved-mesh-visual-study" data-testid="project-study-visuals" open={viewOpen} onToggle={event => setViewOpen(event.currentTarget.open)} style={{ marginBottom: 10, maxWidth: 760 }}>
        <summary>Saved Mesh visual study</summary>
        {viewData && <>
        <div>{mesh.title} · Mesh r{mesh.revision} · {mesh.current ? "current source" : "historical source"}</div>
        <label>Colour map <select data-testid="project-curvature-map" value={mapField} onChange={event => setMapField(event.target.value as CurvatureMapField | "none")}><option value="none">Solid</option><option value="K">Gaussian K</option><option value="H">Mean H</option></select></label>
        {colourMap.map && <div data-testid="project-curvature-legend" data-source-id={mesh.id} data-source-revision={mesh.revision} data-source-hash={mesh.structuralHash} data-field={mapField}>
          <div style={{ height: 12, maxWidth: 320, background: `linear-gradient(to right, ${CURVATURE_MAP_COLOURS.negative}, ${CURVATURE_MAP_COLOURS.zero}, ${CURVATURE_MAP_COLOURS.positive})` }} />
          {number(colourMap.map.range.min)} · 0 · {number(colourMap.map.range.max)} · auto symmetric scale
          <div>Interior range {number(colourMap.map.min)} to {number(colourMap.map.max)} · {colourMap.map.count} coloured vertices · {colourMap.map.excluded} boundary/invalid vertices in grey.</div>
          <small>{mapField === "K" ? "Gaussian K: inverse length squared." : "Signed mean H: inverse length; input winding for open meshes, outward orientation for closed meshes."} Numerical estimates on this saved Mesh; colour maps do not prove minimality.</small>
        </div>}
        {colourMap.error && <div role="alert">{colourMap.error}</div>}
        <div style={{ margin: "8px 0" }}>
          Click the Mesh to inspect a vertex; cyan marks the inspected point. Endpoint picking takes priority when armed.
          <label style={{ display: "block" }}>Inspect vertex <input data-testid="project-inspect-vertex" type="number" min="0" max={mesh.vertexCount - 1} step="1" value={inspected ?? ""} onChange={event => run(() => { const text = event.target.value; if (!text) { setInspected(undefined); return; } const index = Number(text); if (!viewData || !curvature.report) throw new TypeError("Open the saved Mesh view first."); savedMeshVertexInspection(viewData, curvature.report, index); setInspected(index); })} style={{ width: 85 }} /></label>
          {probe && <div data-testid="project-vertex-inspection" data-vertex={probe.index} data-source-id={mesh.id} data-source-revision={mesh.revision} data-valid={String(probe.valid)} data-boundary={String(probe.boundary)}>
            <strong>Vertex {probe.index} · Mesh r{mesh.revision} · {mesh.current ? "current" : "historical"}</strong>
            <div>Coordinates: {probe.coordinates.map(number).join(", ")}</div>
            <div>K: {probe.valid ? number(probe.K) : "unavailable"} · H: {probe.valid ? number(probe.H) : "unavailable"}</div>
            <div>Normal: {probe.valid ? probe.normal.map(number).join(", ") : "unavailable"}</div>
            <small>{probe.valid ? probe.boundary ? "Boundary estimate; excluded from interior colour maps." : "Valid discrete estimate." : "Invalid neighborhood; curvature and normal are unavailable."} K has inverse-length-squared units; H has inverse-length units and follows the displayed orientation convention.</small>
            {probe.warnings.map(warning => <div key={warning}>{warning}</div>)}
          </div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          <button data-testid="project-path-pick-start" aria-pressed={pickTarget === "start"} onClick={() => { setViewOpen(true); setPickTarget("start"); }}>Pick start on Mesh</button>
          <button data-testid="project-path-pick-end" aria-pressed={pickTarget === "end"} onClick={() => { setViewOpen(true); setPickTarget("end"); }}>Pick end on Mesh</button>
          {pickTarget && <button onClick={() => setPickTarget(null)}>Cancel picking</button>}
        </div>
        <div role="status" data-testid="project-path-selection" data-picked-start={endpointsChosen ? start : ""} data-picked-end={endpointsChosen ? end : ""}>
          {pickTarget ? `Click the saved Mesh to choose ${pickTarget}. Picks snap to a vertex of the hit triangle; drag still orbits. Escape cancels.` : "Pick start, then end; save the shortest edge path below. Green = start, purple = end, yellow = last saved path (shown through the Mesh)."}
        </div>
        {viewOpen && !renderWorkspace && <SavedMeshStudyView mesh={viewData} colors={colourMap.map?.colors} inspected={inspected} onInspect={setInspected} picking={!!pickTarget} onCancelPick={() => setPickTarget(null)}
          start={endpointsChosen ? Number(start) : undefined} end={endpointsChosen && end ? Number(end) : endpointsChosen ? mesh.vertexCount - 1 : undefined} path={savedPath?.vertexIndices}
          onPick={index => { if (pickTarget === "start") { setStart(String(index)); setPickTarget("end"); } else if (pickTarget === "end") { setEnd(String(index)); setPickTarget(null); } setEndpointsChosen(true); setError(""); }} />}
        </>}
      </details>}
      {readMesh && meshes.length > 1 && <SavedMeshComparison key={`${mesh.id}:${mesh.revision}:${mesh.structuralHash}`} choices={meshes} initialLeft={mesh.id} readMesh={readMesh} />}
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
  return renderWorkspace ? renderWorkspace(controls, viewData && mesh ? { mesh: viewData, colors: colourMap.map?.colors, inspected, picking: Boolean(pickTarget),
    onInspect: setInspected, onCancelPick: () => setPickTarget(null),
    start: endpointsChosen ? Number(start) : undefined, end: endpointsChosen ? Number(end || mesh.vertexCount - 1) : undefined, path: savedPath?.vertexIndices,
    onPick: index => { if (pickTarget === "start") { setStart(String(index)); setPickTarget("end"); } else if (pickTarget === "end") { setEnd(String(index)); setPickTarget(null); } setEndpointsChosen(true); setError(""); }
  } : null) : controls;
};
