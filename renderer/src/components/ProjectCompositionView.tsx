import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  inspectProjectComposition, type GeometryDocument, type GeometryScene, type Math3DProject,
  type MeshDocument, type SurfaceDocument, type ProjectComposition, type ProjectCompositionMember,
} from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { projectResourceInventory, type ProjectResourceReader } from "../projects/projectResources";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import { buildSurfaceMeshFromGeometry, type SurfaceMeshData } from "../mesh/surfaceMesh";
import { GEOMETRY_OBJECT_REGISTRY } from "../geometry/proceduralObjects";
import { buildGeometryRenderData } from "../geometry/render";
import { GeometryViewer } from "./GeometryViewer";
import { ParamSurfaceViewer } from "./ParamSurfaceViewer";
import { surfaceDocumentBinding, type SurfaceDocumentBinding } from "../workspace/surfaceDocumentBinding";
import type { OverlayPointSet, OverlayPolylineGroup } from "./SurfaceViewer";

type RenderMesh = SurfaceMeshData & { id: string; color: number; opacity: number; transform?: {
  position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number };
} };
type RenderMember = { id: string; title: string; revision: number; hash: string; meshes: RenderMesh[]; points: OverlayPointSet[]; lines: OverlayPolylineGroup[];
  param?: { binding?: SurfaceDocumentBinding; x?: string; y?: string; z?: string; domain?: { uMin: number; uMax: number; vMin: number; vMax: number }; unit: string; opacity: number } };
type Pick = { memberId: string; meshKey?: string; faceIndex?: number; point: { x: number; y: number; z: number } };
const colors = ["#3976d7", "#e8793a"] as const;
const supported = (project: Math3DProject) => project.workspace.entries.filter(entry => ["mesh", "geometry", "surface"].includes(entry.module));
const titleOf = (project: Math3DProject, id: string): string => {
  const chosen = project.metadata.documents?.[id]?.title;
  if (chosen) return chosen;
  const entry = project.workspace.entries.find(item => item.expected.id === id);
  if (entry?.module === "geometry" && entry.checkpoint.format === "math3d.geometry-document") return entry.checkpoint.metadata.title;
  if (entry?.module === "mesh" && entry.checkpoint.format === "math3d.mesh-document") return entry.checkpoint.metadata.label;
  if (entry?.module === "surface" && entry.checkpoint.format === "math3d.surface-document") return entry.checkpoint.metadata.title;
  return id;
};

export const resolveProjectCompositionMember = (project: Math3DProject, member: ProjectCompositionMember, read: ProjectResourceReader): RenderMember => {
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry || entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash)
    throw new TypeError("The selected source is missing or has a different saved revision. Recreate the composition from current documents.");
  const document = verifyMixedWorkspaceReplay(project.workspace).get(member.documentId);
  if (!document || document.identity.revision !== member.expected.revision || document.identity.structuralHash !== member.expected.structuralHash)
    throw new TypeError("The selected source did not pass replay verification.");
  const color = Number.parseInt(member.color.slice(1), 16), meshes: RenderMesh[] = [];
  const points: OverlayPointSet[] = [], lines: OverlayPolylineGroup[] = [];
  let param: RenderMember["param"];
  if (entry.module === "mesh" && document.format === "math3d.mesh-document") {
    const source = (document as MeshDocument).source;
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.id === source.resource.id);
    const bytes = requirement ? read(requirement) : null;
    if (!bytes) throw new TypeError("The saved Mesh buffer is unavailable.");
    const store = new MeshResourceStore();
    store.import(source.resource, bytes);
    const decoded = store.resolve(source.resource);
    if (!decoded) throw new TypeError("The saved Mesh buffer failed verification.");
    meshes.push({ ...decoded, label: document.metadata.label, source: source.origin as SurfaceMeshData["source"], id: member.documentId, color, opacity: member.opacity });
  } else if (entry.module === "geometry" && document.format === "math3d.geometry-document") {
    const source = (document as GeometryDocument).source;
    const primitive = buildGeometryRenderData(source.geometry ?? {});
    if (primitive.mesh) meshes.push({ ...primitive.mesh, id: `${member.documentId}/primitives`, color, opacity: member.opacity });
    points.push(...primitive.overlayPointSets.map(item => ({ ...item, color, opacity: member.opacity })));
    lines.push(...primitive.overlayPolylineGroups.map(item => ({ ...item, color, opacity: member.opacity })));
    for (const object of source.objects) {
      if (document.display.objects[object.id]?.visible === false) continue;
      const definition = GEOMETRY_OBJECT_REGISTRY[object.type];
      if (!definition) throw new TypeError(`Unsupported Geometry object ${object.type}.`);
      const geometry = definition.build(object.params);
      try {
        const mesh = buildSurfaceMeshFromGeometry(geometry, object.id, { kind: "proceduralObjects" }, { mergeVertices: false });
        meshes.push({ ...mesh, id: `${member.documentId}/${object.id}`, color, opacity: member.opacity,
          transform: object.transform });
      } finally { geometry.dispose(); }
    }
  } else if (entry.module === "surface" && document.format === "math3d.surface-document") {
    const surface = document as SurfaceDocument;
    const binding = surfaceDocumentBinding(surface);
    const source = surface.source;
    if (binding) param = { binding, unit: String((source.units as { length: string }).length), opacity: member.opacity };
    else if (source.representation === "parametric" && source.definition.expressions?.x && source.definition.expressions.y && source.definition.expressions.z) {
      const domain = source.domain as { u?: { min?: number; max?: number }; v?: { min?: number; max?: number } };
      if (![domain.u?.min, domain.u?.max, domain.v?.min, domain.v?.max].every(value => typeof value === "number" && Number.isFinite(value)) ||
        domain.u!.min! >= domain.u!.max! || domain.v!.min! >= domain.v!.max!) throw new TypeError("Saved parametric Surface has no bounded domain.");
      param = { x: source.definition.expressions.x, y: source.definition.expressions.y, z: source.definition.expressions.z,
        domain: { uMin: domain.u!.min!, uMax: domain.u!.max!, vMin: domain.v!.min!, vMax: domain.v!.max! }, unit: String((source.units as { length: string }).length), opacity: member.opacity };
    } else throw new TypeError("This Surface family has no read-only comparison adapter yet.");
  } else throw new TypeError("Only saved Mesh, Geometry and bounded parametric Surface documents are available in this comparison viewer.");
  if (!meshes.length && !points.length && !lines.length && !param) throw new TypeError("The selected document has no bounded geometry to display.");
  const vertices = meshes.reduce((total, mesh) => total + mesh.positions.length / 3, 0);
  if (vertices > 500_000) throw new TypeError("This composition exceeds the 500,000-vertex preview limit; the source remains unchanged.");
  return { id: member.documentId, title: titleOf(project, member.documentId), revision: document.identity.revision,
    hash: document.identity.structuralHash, meshes, points, lines, ...(param ? { param } : {}) };
};

const ComparisonPane: React.FC<{ members: RenderMember[]; label: string; onPick: (pick: Pick) => void }> = ({ members, label, onPick }) => {
  const meshes = useMemo(() => members.flatMap(member => member.meshes), [members]);
  const points = useMemo(() => members.flatMap(member => member.points), [members]);
  const lines = useMemo(() => members.flatMap(member => member.lines), [members]);
  return <section aria-label={label} style={{ minWidth: 0, height: 520, position: "relative", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
    <div style={{ position: "absolute", zIndex: 30, top: 58, left: 10, background: "#fff", padding: "4px 8px", borderRadius: 4, maxWidth: "min(80%, 450px)" }}>
      <strong>{label}</strong><br /><small>{members.map(member => `r${member.revision} · ${member.hash.slice(0, 20)}… · ${member.param?.unit ?? "unit not recorded"}`).join(" / ")}</small>
    </div>
    {members.length === 1 && members[0]!.param ? <ParamSurfaceViewer surfaceId="custom" documentBinding={members[0]!.param.binding}
      customX={members[0]!.param.x} customY={members[0]!.param.y} customZ={members[0]!.param.z} paramDomain={members[0]!.param.domain}
      paramResolution={48} materialOpacity={members[0]!.param.opacity} inspectEnabled onInspectPick={hit => onPick({ memberId: members[0]!.id, point: hit.point })} /> :
    <GeometryViewer scene={{} as GeometryScene} meshOverrides={meshes} extraOverlayPointSets={points} extraOverlayPolylineGroups={lines}
      pickEnabled onPick={hit => { const key = hit.meshKey ?? ""; const member = members.find(item => key === item.id || key.startsWith(`${item.id}/`));
        if (member) onPick({ memberId: member.id, meshKey: hit.meshKey, faceIndex: hit.faceIndex, point: hit.point }); }} />}
  </section>;
};

export const ProjectCompositionView: React.FC<{ project: Math3DProject; readResource: ProjectResourceReader; onClose: () => void;
  onSave: (composition: ProjectComposition) => Promise<boolean> }> = ({ project, readResource, onClose, onSave }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);
  const candidates = supported(project);
  const [savedId, setSavedId] = useState("");
  const saved = project.compositions?.find(item => item.id === savedId);
  const [firstId, setFirstId] = useState<string>(candidates[0]?.expected.id ?? ""), [secondId, setSecondId] = useState<string>(candidates[1]?.expected.id ?? "");
  const [mode, setMode] = useState<"overlay" | "side-by-side">("side-by-side");
  const [frame, setFrame] = useState(""), [unit, setUnit] = useState("");
  const [visible, setVisible] = useState<[boolean, boolean]>([true, true]);
  const [palette, setPalette] = useState<[string, string]>([...colors]);
  const [opacity, setOpacity] = useState<[number, number]>([1, 0.72]);
  const [pick, setPick] = useState<Pick | null>(null), [message, setMessage] = useState("");
  const chooseSaved = (id: string) => {
    setSavedId(id); setPick(null); setMessage("");
    const choice = project.compositions?.find(item => item.id === id);
    if (!choice) return;
    setFirstId(choice.members[0].documentId); setSecondId(choice.members[1].documentId); setMode(choice.mode);
    setFrame(choice.alignment?.frame ?? ""); setUnit(choice.alignment?.unit ?? "");
    setVisible([choice.members[0].visible, choice.members[1].visible]);
    setPalette([choice.members[0].color, choice.members[1].color]); setOpacity([choice.members[0].opacity, choice.members[1].opacity]);
  };
  const composition = useMemo((): ProjectComposition | null => {
    if (!firstId || !secondId || firstId === secondId || mode === "overlay" && (!frame.trim() || !unit.trim())) return null;
    const entries = [firstId, secondId].map(id => candidates.find(item => item.expected.id === id));
    if (entries.some(entry => !entry)) return null;
    return { id: saved?.id ?? `composition:${crypto.randomUUID()}`, title: `${titleOf(project, firstId)} / ${titleOf(project, secondId)}`, mode,
      members: entries.map((entry, index) => ({ documentId: entry!.expected.id,
        expected: saved?.members[index].documentId === entry!.expected.id ? saved.members[index].expected : entry!.expected,
        visible: visible[index]!, color: palette[index]!, opacity: opacity[index]! })) as unknown as ProjectComposition["members"],
      ...(mode === "overlay" ? { alignment: { frame: frame.trim(), unit: unit.trim() } } : {}) };
  }, [firstId, secondId, mode, frame, unit, visible, palette, opacity, savedId, project]);
  const resolved = useMemo(() => {
    if (!composition) return { members: [] as RenderMember[], error: "Choose two different saved Mesh, Geometry or bounded Surface documents. Overlay also requires a declared frame and unit." };
    const statuses = inspectProjectComposition(composition, project.workspace);
    if (statuses.some(status => status !== "current")) return { members: [] as RenderMember[], error: `Source status: ${statuses.join(" / ")}. Historical bytes are not substituted.` };
    if (composition.mode === "overlay" && composition.members.some(member => project.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module === "surface"))
      return { members: [] as RenderMember[], error: "Overlay currently accepts Mesh and Geometry sources only. Use side-by-side for a Surface." };
    try {
      const members = composition.members.filter(member => member.visible).map(member => resolveProjectCompositionMember(project, member, readResource));
      if (members.reduce((total, member) => total + member.meshes.reduce((count, mesh) => count + mesh.positions.length / 3, 0), 0) > 500_000)
        throw new TypeError("This comparison exceeds the 500,000-vertex preview limit; the sources remain unchanged.");
      return { members, error: "" };
    }
    catch (error) { return { members: [] as RenderMember[], error: (error as Error).message }; }
  }, [composition, project, readResource]);
  const onSelect = (index: 0 | 1, id: string) => { setSavedId(""); setPick(null); if (index === 0) setFirstId(id); else setSecondId(id); };
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Project comparison and composition" data-testid="project-composition-view"
    style={{ position: "fixed", inset: 16, zIndex: 10000, background: "#f8fafc", color: "#18243a", border: "1px solid #94a3b8", borderRadius: 12,
      boxShadow: "0 24px 80px #0008", overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small>PROJECT / PC01–PC05</small><h2 style={{ margin: "4px 0" }}>Compare saved documents</h2>
      <p style={{ margin: 0 }}>Read-only composition; sources and scientific buffers stay in their owning documents.</p></div><button onClick={onClose}>Close</button></header>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <label>Saved composition <select value={savedId} onChange={event => chooseSaved(event.target.value)}><option value="">New comparison</option>{project.compositions?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>View <select data-testid="project-composition-mode" value={mode} onChange={event => { setSavedId(""); setMode(event.target.value as typeof mode); setPick(null); }}><option value="side-by-side">Side by side</option><option value="overlay">Overlay</option></select></label>
      {mode === "overlay" && <><label>Shared frame (your assertion) <input aria-label="Shared frame" value={frame} onChange={event => setFrame(event.target.value)} placeholder="e.g. laboratory xyz" maxLength={80} /></label>
        <label>Shared unit (your assertion) <input aria-label="Shared unit" value={unit} onChange={event => setUnit(event.target.value)} placeholder="e.g. mm" maxLength={40} /></label>
        <small>Mesh/Geometry sources do not supply a comparable frame-and-unit declaration; this alignment is your explicit assertion, not a verified scientific match.</small></>}
      <button disabled={!composition || !!resolved.error} onClick={() => { if (composition) void onSave(composition).then(ok => { if (ok) { setSavedId(composition.id); setMessage("Composition saved; source documents were not changed."); } else setMessage("Composition could not be saved."); }); }}>Save composition</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
      {([0, 1] as const).map(index => <div key={index} style={{ border: "1px solid #cbd5e1", padding: 8, borderRadius: 8 }}>
        <label>Source {index === 0 ? "A" : "B"} <select data-testid={`project-composition-source-${index}`} value={index === 0 ? firstId : secondId} onChange={event => onSelect(index, event.target.value)}>
          <option value="">Choose document</option>{candidates.map(entry => <option key={entry.expected.id} value={entry.expected.id}>{titleOf(project, entry.expected.id)} · {entry.module} r{entry.expected.revision}</option>)}</select></label>
        <label style={{ marginLeft: 10 }}><input type="checkbox" checked={visible[index]} onChange={event => setVisible(current => current.map((value, i) => i === index ? event.target.checked : value) as [boolean, boolean])} />Visible</label>
        {candidates.find(entry => entry.expected.id === (index === 0 ? firstId : secondId))?.module === "surface" ?
          <small style={{ marginLeft: 10 }}>Surface uses its viewer palette</small> :
          <label style={{ marginLeft: 10 }}>Color <input type="color" value={palette[index]} onChange={event => setPalette(current => current.map((value, i) => i === index ? event.target.value : value) as [string, string])} /></label>}
        <label style={{ marginLeft: 10 }}>Opacity <input aria-label={`Source ${index === 0 ? "A" : "B"} opacity`} type="range" min="0" max="1" step="0.05" value={opacity[index]}
          onChange={event => setOpacity(current => current.map((value, i) => i === index ? Number(event.target.value) : value) as [number, number])} /></label>
      </div>)}
    </div>
    {resolved.error ? <p role="alert">{resolved.error}</p> : <div style={{ display: "grid", gridTemplateColumns: mode === "overlay" ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12, flex: 1 }}>
      {mode === "overlay" ? <ComparisonPane members={resolved.members} label={`Overlay · ${frame} · ${unit}`} onPick={setPick} /> :
        composition?.members.map((member, index) => <ComparisonPane key={member.documentId} members={resolved.members.filter(item => item.id === member.documentId)}
          label={`${index === 0 ? "A" : "B"}: ${titleOf(project, member.documentId)}`} onPick={setPick} />)}
    </div>}
    <footer style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}><strong>Selection</strong> {pick ?
      `${titleOf(project, pick.memberId)} · ${pick.meshKey ?? "mesh"} · face ${pick.faceIndex ?? "—"} · (${pick.point.x.toPrecision(5)}, ${pick.point.y.toPrecision(5)}, ${pick.point.z.toPrecision(5)})` :
      "Click a rendered mesh to inspect its exact member and local coordinate; point and line overlays are not pickable here."}
      {saved && <span style={{ marginLeft: 16 }}>Saved source status: {inspectProjectComposition(saved, project.workspace).join(" / ")}</span>}
      {message && <p role="status">{message}</p>}
    </footer>
  </div>, document.body);
};
