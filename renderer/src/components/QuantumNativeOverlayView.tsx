import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { readProjectCoordinateFrame, type Math3DProject, type ProjectQuantumSceneReference } from "@math3d/core";
import { buildGeometryRenderData } from "../geometry/render";
import type { ProjectResourceReader } from "../projects/projectResources";
import { resolveProjectCompositionMember } from "./ProjectCompositionView";
import { GeometryViewer } from "./GeometryViewer";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";
import { clipOverlayLines, clipOverlayMesh, clipOverlayPoints, qualifyQuantumNativeOverlay,
  type QuantumOverlayCoordinates } from "../projects/quantumNativeOverlay";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
export function QuantumNativeOverlayView({ project, reference, readResource, onClose, onOpenQuantum, onOpenNative }: {
  project: Math3DProject; reference: ProjectQuantumSceneReference; readResource: ProjectResourceReader;
  onClose: () => void; onOpenQuantum: () => void; onOpenNative: (id: string, module: "mesh" | "geometry") => void;
}) {
  const candidates = project.workspace.entries.filter(entry => entry.module === "mesh" || entry.module === "geometry");
  const [nativeId, setNativeId] = useState<string>(candidates[0]?.expected.id ?? "");
  const [frame, setFrame] = useState(() => candidates[0] ? readProjectCoordinateFrame(candidates[0].checkpoint).value?.frame ?? "" : "");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState<[boolean, boolean]>([true, true]);
  const [opacity, setOpacity] = useState<[number, number]>([0.8, 0.75]);
  const [minimum, setMinimum] = useState(-1e6), [maximum, setMaximum] = useState(1e6);
  const [pick, setPick] = useState("");
  useEffect(() => {
    let active = true;
    if (!window.quantumScenes?.openReference) { setError("Verified quantum opening requires the desktop importer."); return; }
    void window.quantumScenes.openReference({ directory: reference.directory, sceneFingerprint: reference.sceneFingerprint })
      .then(result => { if (!active) return; if (result.ok) setOpened(result);
        else setError(result.canceled ? "Scene opening was cancelled." : result.error); })
      .catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [reference.directory, reference.sceneFingerprint]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  const resolved = useMemo(() => {
    if (!opened || !nativeId) return null;
    try {
      const entry = candidates.find(item => item.expected.id === nativeId);
      if (!entry) throw new TypeError("Choose a saved Mesh or Geometry source.");
      const native = resolveProjectCompositionMember(project, { documentId: nativeId, expected: entry.expected,
        visible: true, color: "#f18f45", opacity: opacity[1] }, readResource);
      const extension = opened.document.extensions["quantum-scene/v2"] ?? opened.document.extensions["quantum-scene/v1"];
      const coordinates = (extension as { scene?: { coordinates?: QuantumOverlayCoordinates } })?.scene?.coordinates;
      if (!coordinates) throw new TypeError("Quantum coordinate declaration is missing.");
      const qualification = qualifyQuantumNativeOverlay(coordinates, native.coordinates, frame);
      if (!qualification.ok) throw new TypeError(qualification.reason);
      const quantum = buildGeometryRenderData(opened.document.geometry, { label: opened.document.title });
      const count = (quantum.mesh?.positions.length ?? 0) / 3 + native.meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
      if (count > 500_000) throw new TypeError("Overlay exceeds the 500,000-vertex preview limit.");
      const meshes = [
        ...(visible[0] && quantum.mesh ? [{ ...clipOverlayMesh(quantum.mesh, minimum, maximum), id: `quantum:${reference.sceneFingerprint}`, color: 0x3d86d1, opacity: opacity[0] }] : []),
        ...(visible[1] ? native.meshes.map(mesh => ({ ...clipOverlayMesh(mesh, minimum, maximum), opacity: opacity[1] })) : []),
      ];
      const points = clipOverlayPoints([...(visible[0] ? quantum.overlayPointSets : []), ...(visible[1] ? native.points : [])], minimum, maximum);
      const lines = clipOverlayLines([...(visible[0] ? quantum.overlayPolylineGroups : []), ...(visible[1] ? native.lines : [])], minimum, maximum);
      return { native, qualification, meshes, points, lines, error: "" };
    } catch (cause) { return { error: (cause as Error).message }; }
  }, [opened, project, nativeId, frame, opacity, visible, minimum, maximum, readResource]);
  const selected = candidates.find(item => item.expected.id === nativeId);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Quantum and native document overlay" data-testid="quantum-native-overlay"
    style={{ position: "fixed", inset: 16, zIndex: 10001, background: "#f8fafc", color: "#18243a", padding: 16, borderRadius: 12,
      overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
    <header style={{ display: "flex", justifyContent: "space-between" }}><div><small>PROJECT / QI-34</small><h2>Quantum + native overlay</h2>
      <p>Verified read-only layers. Identity transform only; axes, units and handedness must match.</p></div><button onClick={onClose}>Close</button></header>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <label>Native source <select value={nativeId} onChange={event => { setNativeId(event.target.value); setPick("");
        const next = candidates.find(entry => entry.expected.id === event.target.value);
        setFrame(next ? readProjectCoordinateFrame(next.checkpoint).value?.frame ?? "" : ""); }}>
        {candidates.map(entry => <option key={entry.expected.id} value={entry.expected.id}>{project.metadata.documents?.[entry.expected.id]?.title ?? entry.expected.id} · {entry.module}</option>)}</select></label>
      <label>Shared frame assertion <input value={frame} onChange={event => setFrame(event.target.value)} maxLength={80} placeholder="Native frame name" /></label>
      <label>Z minimum <input type="number" value={minimum} onChange={event => setMinimum(Number(event.target.value))} /></label>
      <label>Z maximum <input type="number" value={maximum} onChange={event => setMaximum(Number(event.target.value))} /></label>
    </div>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>{([0, 1] as const).map(index => <div key={index}>
      <strong>{index === 0 ? "Quantum" : "Native"}</strong> <label><input type="checkbox" checked={visible[index]}
        onChange={event => setVisible(current => current.map((value, slot) => slot === index ? event.target.checked : value) as [boolean, boolean])} />Visible</label>
      <label>Opacity <input type="range" min="0" max="1" step="0.05" value={opacity[index]}
        onChange={event => setOpacity(current => current.map((value, slot) => slot === index ? Number(event.target.value) : value) as [number, number])} /></label></div>)}</div>
    {!opened && !error && <p role="status">Verifying quantum source…</p>}
    {(error || resolved?.error) && <p role="alert">{error || resolved?.error}</p>}
    {resolved && !resolved.error && "meshes" in resolved && <><div style={{ height: "min(68vh, 690px)", minHeight: 330 }}>
      <GeometryViewer scene={{}} meshOverrides={resolved.meshes} extraOverlayPointSets={resolved.points} extraOverlayPolylineGroups={resolved.lines}
        pickEnabled onPick={hit => setPick(`${hit.meshKey?.startsWith("quantum:") ? "Quantum" : "Native"} · ${hit.meshKey ?? "surface"} · face ${hit.faceIndex ?? "—"} · (${hit.point.x.toPrecision(5)}, ${hit.point.y.toPrecision(5)}, ${hit.point.z.toPrecision(5)}) ${resolved.qualification!.unit}`)} /></div>
      <p role="status">Frame {resolved.qualification!.frame} · {resolved.qualification!.unit}. Z slab clips triangles and line segments; point layers outside it are hidden.</p></>}
    <footer><strong>Source links</strong> · <button onClick={onOpenQuantum}>Open quantum scene</button>
      <button disabled={!selected} onClick={() => selected && onOpenNative(selected.expected.id, selected.module as "mesh" | "geometry")}>Open native document</button>
      <p>Quantum SHA-256 {reference.sceneFingerprint}; native {selected?.expected.id} r{selected?.expected.revision} · {selected?.expected.structuralHash}.</p>
      {pick && <p data-testid="quantum-native-overlay-pick">Selection: {pick}</p>}</footer>
  </div>, document.body);
}
