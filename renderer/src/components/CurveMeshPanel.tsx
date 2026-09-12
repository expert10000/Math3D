import React, { useMemo, useState } from "react";
import type { AnyCurve } from "@math3d/core";
import type { CanonicalCurveDefinition } from "../curveAnalysis/contracts";
import {
  DEFAULT_CURVE_MESH_SETTINGS,
  createCurveMeshRecord,
  createDerivedCurveMesh,
  detachCurveMeshRecord,
  extractMeshCurves,
  fitExtractedMeshCurve,
  freezeCurveMeshRecord,
  mapCurveSelectionToMesh,
  mapMeshSelectionToCurve,
  markCurveMeshStale,
  regenerateCurveMeshRecord,
  type CurveMeshOutputMode,
  type CurveMeshSettings,
  type DerivedCurveMeshRecord,
  type ExtractedMeshCurve,
  type MeshCurveExtractionKind,
} from "../curveAnalysis/curveMesh";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type CurveMeshPanelProps = {
  curve: AnyCurve | null;
  definition: CanonicalCurveDefinition;
  mesh: SurfaceMeshData | null;
  selectedEdges?: ReadonlyArray<readonly [number, number]>;
  onOpenCurveSource: () => void;
  onOpenMesh: (record: DerivedCurveMeshRecord, role: "live" | "snapshot" | "detached") => void;
  onOpenExtractedCurve: (curve: ExtractedMeshCurve) => void;
};

const OUTPUTS: Array<{ id: CurveMeshOutputMode; label: string }> = [
  { id: "points", label: "Points" }, { id: "polyline", label: "Polyline" }, { id: "tube", label: "Tube" },
  { id: "ribbon", label: "Ribbon" }, { id: "swept-profile", label: "Swept profile" }, { id: "frame-glyphs", label: "Frame glyphs" },
];
const EXTRACTIONS: Array<{ id: MeshCurveExtractionKind; label: string }> = [
  { id: "boundary-loops", label: "Boundary loops" }, { id: "cross-section", label: "Cross-section z = 0" },
  { id: "feature-edge-chains", label: "Feature-edge chains" }, { id: "selected-edge-chain", label: "Selected edge chain" }, { id: "polylines", label: "Mesh polylines" },
];

const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

export const CurveMeshPanel: React.FC<CurveMeshPanelProps> = ({ curve, definition, mesh, selectedEdges, onOpenCurveSource, onOpenMesh, onOpenExtractedCurve }) => {
  const [settings, setSettings] = useState<CurveMeshSettings>({ ...DEFAULT_CURVE_MESH_SETTINGS, profile: [...DEFAULT_CURVE_MESH_SETTINGS.profile] });
  const [record, setRecord] = useState<DerivedCurveMeshRecord | null>(null);
  const [extractionKind, setExtractionKind] = useState<MeshCurveExtractionKind>("boundary-loops");
  const [extracted, setExtracted] = useState<ExtractedMeshCurve | null>(null);
  const [fitTolerance, setFitTolerance] = useState(0.001);
  const [status, setStatus] = useState("Choose a CurveMesh output and generate it.");

  const mappedSelection = useMemo(() => {
    if (!record) return null;
    const parameter = record.payload.correspondence.sourceParameters[Math.floor(record.payload.correspondence.sourceParameters.length / 2)];
    const toMesh = mapCurveSelectionToMesh(record.payload.correspondence, [parameter]);
    return { parameter, toMesh, back: mapMeshSelectionToCurve(record.payload.correspondence, toMesh.meshVertexIndices) };
  }, [record]);

  const generate = () => {
    if (!curve) return;
    const next = createCurveMeshRecord(createDerivedCurveMesh({ definition, curve, settings }), `${definition.identity.label} · ${settings.outputMode}`);
    setRecord(next);
    setStatus(`Generated ${settings.outputMode}: ${next.payload.vertexCount} vertices · ${next.payload.faceCount} faces.`);
  };
  const regenerate = () => {
    if (!record || !curve) return;
    const next = regenerateCurveMeshRecord(record, definition, curve, settings);
    setRecord(next); setStatus(`Regenerated revision ${next.identity.meshRevision}.`);
  };
  const update = <K extends keyof CurveMeshSettings>(key: K, value: CurveMeshSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (record) setRecord(markCurveMeshStale(record, definition, next));
  };
  const extract = () => {
    if (!mesh) return;
    const options = extractionKind === "cross-section" ? { crossSection: { normal: { x: 0, y: 0, z: 1 } } } : extractionKind === "selected-edge-chain" ? { selectedEdges } : {};
    const branches = extractMeshCurves({ mesh, kind: extractionKind, ...options });
    setExtracted(branches[0] ?? null);
    setStatus(branches.length ? `Extracted ${branches.length} ${extractionKind} branch${branches.length === 1 ? "" : "es"} as explicit polylines.` : `No ${extractionKind} found in the active Mesh.`);
  };
  const fit = () => {
    if (!extracted) return;
    const result = fitExtractedMeshCurve(extracted, { tolerance: fitTolerance, degree: Math.min(3, extracted.points.length - 1) });
    setStatus(`Spline fit ${result.accepted ? "accepted" : "exceeds tolerance"}: max residual ${result.maximumResidual.toPrecision(4)} (tolerance ${result.tolerance}).`);
  };

  return <div data-testid="curve-mesh-workflow" style={{ display: "grid", gap: 7, fontSize: 11 }}>
    <strong>Curve → CurveMesh</strong>
    <label>Output<select data-testid="curve-mesh-output" value={settings.outputMode} onChange={(event) => update("outputMode", event.target.value as CurveMeshOutputMode)} style={fieldStyle}>{OUTPUTS.map((output) => <option key={output.id} value={output.id}>{output.label}</option>)}</select></label>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
      <label>Longitudinal<input aria-label="Longitudinal resolution" type="number" min={2} max={4096} value={settings.longitudinalResolution} onChange={(event) => update("longitudinalResolution", Number(event.target.value))} style={fieldStyle} /></label>
      <label>Radial<input aria-label="Radial resolution" type="number" min={3} max={256} value={settings.radialResolution} onChange={(event) => update("radialResolution", Number(event.target.value))} style={fieldStyle} /></label>
      <label>Tube radius<input aria-label="Tube radius" type="number" min={0.000001} step={0.01} value={settings.tubeRadius} onChange={(event) => update("tubeRadius", Number(event.target.value))} style={fieldStyle} /></label>
      <label>Ribbon width<input aria-label="Ribbon width" type="number" min={0.000001} step={0.01} value={settings.ribbonWidth} onChange={(event) => update("ribbonWidth", Number(event.target.value))} style={fieldStyle} /></label>
      <label>Twist (rad)<input aria-label="Twist" type="number" step={0.1} value={settings.twist} onChange={(event) => update("twist", Number(event.target.value))} style={fieldStyle} /></label>
      <label>Frames<select aria-label="Frame policy" value={settings.framePolicy} onChange={(event) => update("framePolicy", event.target.value as CurveMeshSettings["framePolicy"])} style={fieldStyle}><option value="bishop">Bishop</option><option value="frenet">Frenet</option></select></label>
      <label>Ribbon axis<select aria-label="Ribbon orientation" value={settings.ribbonOrientation} onChange={(event) => update("ribbonOrientation", event.target.value as CurveMeshSettings["ribbonOrientation"])} style={fieldStyle}><option value="normal">Normal</option><option value="binormal">Binormal</option></select></label>
      <label>Seam<select aria-label="Seam policy" value={settings.seamPolicy} onChange={(event) => update("seamPolicy", event.target.value as CurveMeshSettings["seamPolicy"])} style={fieldStyle}><option value="weld">Weld</option><option value="duplicate">Duplicate</option></select></label>
      <label>Profile<select aria-label="Sweep profile" value={settings.profile.length === 3 ? "triangle" : settings.profile.length === 4 && settings.profile[0]?.[0] === 1 ? "diamond" : "square"} onChange={(event) => update("profile", event.target.value === "triangle" ? [[0, 1], [-0.866, -0.5], [0.866, -0.5]] : event.target.value === "square" ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : [[1, 0], [0, 1], [-1, 0], [0, -1]])} style={fieldStyle}><option value="diamond">Diamond</option><option value="square">Square</option><option value="triangle">Triangle</option></select></label>
    </div>
    <div style={{ display: "flex", gap: 6 }}><label><input type="checkbox" checked={settings.caps} onChange={(event) => update("caps", event.target.checked)} /> end caps</label><label><input type="checkbox" checked={settings.boundaryPolicy === "cap"} onChange={(event) => update("boundaryPolicy", event.target.checked ? "cap" : "open")} /> cap boundary</label></div>
    <button data-testid="curve-mesh-generate" type="button" disabled={!curve} onClick={generate}>Generate CurveMesh</button>
    {record && <div data-testid="curve-mesh-result" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 6, padding: 6, display: "grid", gap: 2 }}>
      <strong>{record.identity.variant} · {record.identity.state} · mesh r{record.identity.meshRevision}</strong>
      <span>Curve {record.identity.sourceCurveId} r{record.identity.sourceCurveRevision} · {record.identity.sourceFidelity}</span>
      <span>{record.payload.vertexCount} vertices · {record.payload.faceCount} faces · map {record.payload.correspondence.state}</span>
      <span>{record.identity.settings.framePolicy} frames · {record.identity.sourceUnits.position} / {record.identity.sourceUnits.parameter}</span>
    </div>}
    {mappedSelection && <div data-testid="curve-mesh-map">Selection map: t={mappedSelection.parameter.toFixed(4)} → vertex {mappedSelection.toMesh.meshVertexIndices[0]} → t={mappedSelection.back.curveParameters[0].toFixed(4)} ({mappedSelection.back.state})</div>}
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      <button data-testid="curve-mesh-live" type="button" disabled={!record} onClick={() => record && onOpenMesh(record, "live")}>Mesh (live)</button>
      <button data-testid="curve-mesh-bake" type="button" disabled={!record} onClick={() => { if (!record) return; const next = freezeCurveMeshRecord(record); setRecord(next); onOpenMesh(next, "snapshot"); }}>Bake to Mesh</button>
      <button data-testid="curve-mesh-analysis" type="button" disabled={!record} onClick={() => record && onOpenMesh(record, record.identity.state === "detached" ? "detached" : "live")}>Open in Mesh Analysis</button>
      <button type="button" onClick={onOpenCurveSource}>Open Curve Source</button>
      <button type="button" disabled={!record || !curve} onClick={regenerate}>Regenerate</button>
      <button data-testid="curve-mesh-stale" type="button" disabled={!record} onClick={() => record && setRecord(markCurveMeshStale(record, { ...definition, identity: { ...definition.identity, curveRevision: definition.identity.curveRevision + 1 } }, settings))}>Simulate source revision</button>
      <button type="button" disabled={!record} onClick={() => record && setRecord(freezeCurveMeshRecord(record))}>Freeze</button>
      <button type="button" disabled={!record} onClick={() => record && setRecord(detachCurveMeshRecord(record))}>Detach</button>
      <button type="button" disabled={!record} onClick={() => { setRecord(null); setStatus("Deleted CurveMesh record."); }}>Delete</button>
    </div>
    <strong style={{ borderTop: "1px solid #d6deea", paddingTop: 7 }}>Mesh → Curves</strong>
    <div style={{ display: "flex", gap: 4 }}><select data-testid="mesh-curve-extraction-kind" value={extractionKind} onChange={(event) => setExtractionKind(event.target.value as MeshCurveExtractionKind)} style={{ ...fieldStyle, flex: 1 }}>{EXTRACTIONS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><button data-testid="mesh-curve-extract" type="button" disabled={!mesh} onClick={extract}>Extract</button></div>
    {extracted && <div data-testid="mesh-curve-extracted" style={{ display: "grid", gap: 4 }}><span>{extracted.kind} branch {extracted.branch} · {extracted.points.length} points · polyline approximation</span><button type="button" onClick={() => onOpenExtractedCurve(extracted)}>Open in Curves</button><div style={{ display: "flex", gap: 4 }}><input aria-label="Spline fit tolerance" type="number" min={0} step={0.0001} value={fitTolerance} onChange={(event) => setFitTolerance(Number(event.target.value))} style={{ width: 95 }} /><button data-testid="mesh-curve-fit" type="button" onClick={fit}>Fit spline explicitly</button></div></div>}
    <div data-testid="curve-mesh-status" style={{ color: status.includes("exceeds") || status.startsWith("No ") ? "#9a3412" : "#334155" }}>{status}</div>
  </div>;
};
