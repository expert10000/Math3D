import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  inspectProjectCompositionAvailability, readProjectCoordinateFrame, qualifyProjectOverlayCoordinates, sameProjectCoordinateFrame,
  type ProjectCoordinateFrameRead, type GeometryDocument, type GeometryScene, type Math3DProject,
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
import type { CameraSyncState, OverlayPointSet, OverlayPolylineGroup } from "./SurfaceViewer";

type RenderMesh = SurfaceMeshData & { id: string; color: number; opacity: number; transform?: {
  position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number };
} };
type RenderMember = { id: string; title: string; revision: number; hash: string; generation: "current" | "retained checkpoint"; slot?: 0 | 1;
  coordinates: ProjectCoordinateFrameRead; meshes: RenderMesh[]; points: OverlayPointSet[]; lines: OverlayPolylineGroup[];
  param?: { binding?: SurfaceDocumentBinding; x?: string; y?: string; z?: string; domain?: { uMin: number; uMax: number; vMin: number; vMax: number }; unit: string; opacity: number } };
type Pick = { memberId: string; revision: number; hash: string; meshKey?: string; faceIndex?: number; uv?: { u: number; v: number };
  point: { x: number; y: number; z: number } };
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
  if (!entry) throw new TypeError("The selected source document is missing.");
  const current = verifyMixedWorkspaceReplay(project.workspace).get(member.documentId);
  if (!current || current.identity.revision !== entry.expected.revision || current.identity.structuralHash !== entry.expected.structuralHash)
    throw new TypeError("The current source did not pass replay verification.");
  const currentSelected = current.identity.revision === member.expected.revision && current.identity.structuralHash === member.expected.structuralHash;
  const checkpointSelected = !!entry.replay && entry.checkpoint.identity.revision === member.expected.revision &&
    entry.checkpoint.identity.structuralHash === member.expected.structuralHash;
  if (!currentSelected && !checkpointSelected)
    throw new TypeError("The selected source has a different saved revision and no matching retained checkpoint.");
  const document = currentSelected ? current : entry.checkpoint;
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
    generation: currentSelected ? "current" : "retained checkpoint",
    coordinates: readProjectCoordinateFrame(document), hash: document.identity.structuralHash, meshes, points, lines, ...(param ? { param } : {}) };
};

export const compatibleCompositionParameterChart = (members: readonly RenderMember[]): boolean =>
  members.length === 2 && members[0]!.id === members[1]!.id && !!members[0]!.param?.domain && !!members[1]!.param?.domain &&
  JSON.stringify(members[0]!.param.domain) === JSON.stringify(members[1]!.param.domain);

export const qualifyProjectCameraPair = (members: readonly RenderMember[]): "shared-surface-axes" | "declared-3d-frame" | null => {
  if (members.length !== 2) return null;
  const [a, b] = members;
  if (a!.param && b!.param && compatibleCompositionParameterChart(members) && a!.param.unit === b!.param.unit &&
    !!a!.param.x && a!.param.x === b!.param.x && !!a!.param.y && a!.param.y === b!.param.y)
    return "shared-surface-axes";
  if (!a!.param && !b!.param && a!.coordinates.status === "declared" && b!.coordinates.status === "declared" &&
    a!.coordinates.value && b!.coordinates.value && sameProjectCoordinateFrame(a!.coordinates.value, b!.coordinates.value))
    return "declared-3d-frame";
  return null;
};

const ComparisonPane: React.FC<{ members: RenderMember[]; label: string; onPick: (pick: Pick) => void;
  linkedUV?: { u: number; v: number } | null; linkedToken?: number;
  onCameraSync?: (state: CameraSyncState) => void; cameraOverride?: CameraSyncState | null; cameraOverrideToken?: number }> =
  ({ members, label, onPick, linkedUV, linkedToken, onCameraSync, cameraOverride, cameraOverrideToken }) => {
  const meshes = useMemo(() => members.flatMap(member => member.meshes), [members]);
  const points = useMemo(() => members.flatMap(member => member.points), [members]);
  const lines = useMemo(() => members.flatMap(member => member.lines), [members]);
  return <section aria-label={label} style={{ minWidth: 0, height: 520, position: "relative", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
    <div style={{ position: "absolute", zIndex: 30, top: 58, left: 10, background: "#fff", padding: "4px 8px", borderRadius: 4, maxWidth: "min(80%, 450px)" }}>
      <strong>{label}</strong><br /><small>{members.map(member => `${member.generation} r${member.revision} · ${member.hash.slice(0, 20)}… · ${member.param?.unit ?? "unit not recorded"}`).join(" / ")}</small>
    </div>
    {members.length === 1 && members[0]!.param ? <ParamSurfaceViewer surfaceId="custom" documentBinding={members[0]!.param.binding}
      customX={members[0]!.param.x} customY={members[0]!.param.y} customZ={members[0]!.param.z} paramDomain={members[0]!.param.domain}
      paramResolution={48} materialOpacity={members[0]!.param.opacity} inspectEnabled
      isCameraLeader={!!onCameraSync} onCameraSync={onCameraSync} cameraOverride={cameraOverride} cameraOverrideToken={cameraOverrideToken}
      paramProbeUV={linkedUV} paramProbeToken={linkedToken}
      onInspectPick={hit => onPick({ memberId: members[0]!.id,
        revision: members[0]!.revision, hash: members[0]!.hash, point: hit.point, ...(hit.uv ? { uv: hit.uv } : {}) })} /> :
    <GeometryViewer scene={{} as GeometryScene} meshOverrides={meshes} extraOverlayPointSets={points} extraOverlayPolylineGroups={lines}
      onCameraSync={onCameraSync} cameraOverride={cameraOverride} cameraOverrideToken={cameraOverrideToken}
      pickEnabled onPick={hit => { const key = hit.meshKey ?? ""; const member = members.find(item => key === item.id || key.startsWith(`${item.id}/`));
        if (member) onPick({ memberId: member.id, revision: member.revision, hash: member.hash,
          meshKey: hit.meshKey, faceIndex: hit.faceIndex, point: hit.point }); }} />}
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
  const [firstId, setFirstId] = useState<string>(candidates[0]?.expected.id ?? ""),
    [secondId, setSecondId] = useState<string>(candidates[1]?.expected.id ?? candidates[0]?.expected.id ?? "");
  const [checkpoint, setCheckpoint] = useState<[boolean, boolean]>([candidates.length === 1 && !!candidates[0]?.replay &&
    (candidates[0].checkpoint.identity.revision !== candidates[0].expected.revision ||
      candidates[0].checkpoint.identity.structuralHash !== candidates[0].expected.structuralHash), false]);
  const [mode, setMode] = useState<"overlay" | "side-by-side">("side-by-side");
  const [frame, setFrame] = useState(""), [unit, setUnit] = useState("");
  const [visible, setVisible] = useState<[boolean, boolean]>([true, true]);
  const [palette, setPalette] = useState<[string, string]>([...colors]);
  const [opacity, setOpacity] = useState<[number, number]>([1, 0.72]);
  const [pick, setPick] = useState<Pick | null>(null), [message, setMessage] = useState("");
  const [linked, setLinked] = useState<{ uv: { u: number; v: number }; token: number } | null>(null);
  const [cameraMode, setCameraMode] = useState<"independent" | "linked">("independent");
  const [cameraLeader, setCameraLeader] = useState<0 | 1>(0);
  const [cameraPose, setCameraPose] = useState<{ state: CameraSyncState; token: number } | null>(null);
  const onLeaderCamera = useCallback((state: CameraSyncState) =>
    setCameraPose(previous => ({ state, token: (previous?.token ?? 0) + 1 })), []);
  const chooseSaved = (id: string) => {
    setSavedId(id); setPick(null); setLinked(null); setCameraPose(null); setMessage("");
    const choice = project.compositions?.find(item => item.id === id);
    if (!choice) { setCameraMode("independent"); return; }
    setFirstId(choice.members[0].documentId); setSecondId(choice.members[1].documentId); setMode(choice.mode);
    setCameraMode(choice.camera?.mode ?? "independent"); setCameraLeader(choice.camera?.leader === "B" ? 1 : 0);
    setCheckpoint(choice.members.map(member => {
      const entry = candidates.find(item => item.expected.id === member.documentId);
      return !!entry && (entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash);
    }) as [boolean, boolean]);
    setFrame(choice.alignment?.frame ?? ""); setUnit(choice.alignment?.unit ?? "");
    setVisible([choice.members[0].visible, choice.members[1].visible]);
    setPalette([choice.members[0].color, choice.members[1].color]); setOpacity([choice.members[0].opacity, choice.members[1].opacity]);
  };
  const composition = useMemo((): ProjectComposition | null => {
    if (!firstId || !secondId || firstId === secondId && (mode !== "side-by-side" || checkpoint[0] === checkpoint[1]) ||
      mode === "overlay" && (!frame.trim() || !unit.trim())) return null;
    const entries = [firstId, secondId].map(id => candidates.find(item => item.expected.id === id));
    if (entries.some(entry => !entry)) return null;
    return { id: saved?.id ?? `composition:${crypto.randomUUID()}`, title: saved?.title ?? `${titleOf(project, firstId)} / ${titleOf(project, secondId)}`, mode,
      members: entries.map((entry, index) => ({ documentId: entry!.expected.id,
        expected: saved?.members[index].documentId === entry!.expected.id ? saved.members[index].expected :
          checkpoint[index] && entry!.replay ? entry!.checkpoint.identity : entry!.expected,
        visible: visible[index]!, color: palette[index]!, opacity: opacity[index]! })) as unknown as ProjectComposition["members"],
      ...(mode === "overlay" ? { alignment: { frame: frame.trim(), unit: unit.trim() } } : {}),
      ...(mode === "side-by-side" && cameraMode === "linked" ? { camera: { mode: "linked", leader: cameraLeader === 0 ? "A" : "B" } } : {}) };
  }, [firstId, secondId, checkpoint, mode, frame, unit, visible, palette, opacity, cameraMode, cameraLeader, savedId, project]);
  const resolved = useMemo(() => {
    if (!composition) return { members: [] as RenderMember[], error: "Choose two different saved documents, or two retained generations of one document. Overlay also requires a declared frame and unit." };
    const statuses = inspectProjectCompositionAvailability(composition, project.workspace);
    if (statuses.some(status => status !== "current" && status !== "retained-checkpoint"))
      return { members: [] as RenderMember[], error: `Source status: ${statuses.join(" / ")}. Unavailable historical bytes are not reconstructed.` };
    if (composition.mode === "overlay" && composition.members.some(member => project.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module === "surface"))
      return { members: [] as RenderMember[], error: "Overlay currently accepts Mesh and Geometry sources only. Use side-by-side for a Surface." };
    try {
      const sources = composition.members.map((member, index) =>
        ({ ...resolveProjectCompositionMember(project, member, readResource), slot: index as 0 | 1 }));
      let overlayQualification: ReturnType<typeof qualifyProjectOverlayCoordinates> | null = null;
      if (composition.mode === "overlay") {
        const [first, second] = sources;
        overlayQualification = qualifyProjectOverlayCoordinates(first!.coordinates, second!.coordinates, composition.alignment!);
        if (overlayQualification === "invalid") throw new TypeError("A source has invalid coordinate-frame metadata; overlay refused.");
        if (overlayQualification === "mismatch") throw new TypeError("Source coordinate frames, axes, handedness, or units disagree with this overlay; overlay refused.");
      }
      const members = sources.filter((_, index) => composition.members[index]!.visible);
      if (members.reduce((total, member) => total + member.meshes.reduce((count, mesh) => count + mesh.positions.length / 3, 0), 0) > 500_000)
        throw new TypeError("This comparison exceeds the 500,000-vertex preview limit; the sources remain unchanged.");
      return { members, error: "", verifiedOverlay: overlayQualification === "verified" };
    }
    catch (error) { return { members: [] as RenderMember[], error: (error as Error).message }; }
  }, [composition, project, readResource]);
  const linkable = mode === "side-by-side" && compatibleCompositionParameterChart(resolved.members);
  const cameraQualification = mode === "side-by-side" && !resolved.error ? qualifyProjectCameraPair(resolved.members) : null;
  const cameraLinked = cameraMode === "linked" && !!cameraQualification;
  const onPick = (next: Pick) => { setPick(next); setLinked(current => linkable && next.uv ? { uv: next.uv!, token: (current?.token ?? 0) + 1 } : null); };
  const onSelect = (index: 0 | 1, id: string) => { setSavedId(""); setPick(null); setLinked(null); setCameraMode("independent"); setCameraPose(null);
    setCheckpoint(current => current.map((value, i) => i === index ? false : value) as [boolean, boolean]); if (index === 0) setFirstId(id); else setSecondId(id); };
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Project comparison and composition" data-testid="project-composition-view"
    style={{ position: "fixed", inset: 16, zIndex: 10000, background: "#f8fafc", color: "#18243a", border: "1px solid #94a3b8", borderRadius: 12,
      boxShadow: "0 24px 80px #0008", overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small>PROJECT / PC01–PC06</small><h2 style={{ margin: "4px 0" }}>Compare saved documents</h2>
      <p style={{ margin: 0 }}>Read-only composition; sources and scientific buffers stay in their owning documents.</p></div><button onClick={onClose}>Close</button></header>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <label>Saved composition <select value={savedId} onChange={event => chooseSaved(event.target.value)}><option value="">New comparison</option>{project.compositions?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>View <select data-testid="project-composition-mode" value={mode} onChange={event => { setSavedId(""); setMode(event.target.value as typeof mode);
        setPick(null); setLinked(null); setCameraMode("independent"); setCameraPose(null); }}><option value="side-by-side">Side by side</option><option value="overlay">Overlay</option></select></label>
      {mode === "overlay" && <><label>Shared frame (your assertion) <input aria-label="Shared frame" value={frame} onChange={event => setFrame(event.target.value)} placeholder="e.g. laboratory xyz" maxLength={80} /></label>
        <label>Shared unit (your assertion) <input aria-label="Shared unit" value={unit} onChange={event => setUnit(event.target.value)} placeholder="e.g. mm" maxLength={40} /></label>
        <small>Source declarations are compared when both exist; otherwise this frame and unit remain your explicit alignment assertion.</small></>}
      <button disabled={!composition || !!resolved.error || cameraMode === "linked" && !cameraQualification} onClick={() => { if (composition) void onSave(composition).then(ok => { if (ok) { setSavedId(composition.id); setMessage("Composition saved; source documents were not changed."); } else setMessage("Composition could not be saved."); }); }}>Save composition</button>
    </div>
    {mode === "side-by-side" && <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <label><input data-testid="project-composition-camera-link" type="checkbox" checked={cameraLinked} disabled={!cameraQualification}
        onChange={event => { setCameraMode(event.target.checked ? "linked" : "independent"); setCameraPose(null); }} />Synchronize cameras</label>
      {cameraQualification ? <><label>Camera lead <select data-testid="project-composition-camera-leader" value={cameraLeader}
        disabled={!cameraLinked} onChange={event => { setCameraLeader(Number(event.target.value) as 0 | 1); setCameraPose(null); }}>
        <option value={0}>A → B</option><option value={1}>B → A</option></select></label>
        <small>{cameraQualification === "shared-surface-axes" ? "Same Surface parameter axes and units." : "Matching source-declared 3D frames and units."}</small></> :
        <small>Independent cameras: source frames or Surface axes are not demonstrably compatible.</small>}
      {cameraLinked && <small role="status">Camera linked from {cameraLeader === 0 ? "A" : "B"} · {cameraPose?.token ?? 0} updates</small>}
      {cameraMode === "linked" && !cameraQualification && <small role="alert">Saved camera link unavailable for these sources; choose independent cameras.</small>}
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
      {([0, 1] as const).map(index => <div key={index} style={{ border: "1px solid #cbd5e1", padding: 8, borderRadius: 8 }}>
        <label>Source {index === 0 ? "A" : "B"} <select data-testid={`project-composition-source-${index}`} value={index === 0 ? firstId : secondId} onChange={event => onSelect(index, event.target.value)}>
          <option value="">Choose document</option>{candidates.map(entry => <option key={entry.expected.id} value={entry.expected.id}>{titleOf(project, entry.expected.id)} · {entry.module} r{entry.expected.revision}</option>)}</select></label>
        {(() => {
          const entry = candidates.find(item => item.expected.id === (index === 0 ? firstId : secondId));
          const retained = !!entry?.replay && (entry.checkpoint.identity.revision !== entry.expected.revision ||
            entry.checkpoint.identity.structuralHash !== entry.expected.structuralHash);
          if (!entry || !retained) return null;
          return <label style={{ marginLeft: 10 }}>Generation <select data-testid={`project-composition-generation-${index}`}
            value={checkpoint[index] ? "checkpoint" : "current"} onChange={event => { setSavedId(""); setPick(null); setCameraMode("independent"); setCameraPose(null);
              setCheckpoint(current => current.map((value, i) => i === index ? event.target.value === "checkpoint" : value) as [boolean, boolean]); }}>
            <option value="current">Current r{entry.expected.revision}</option>
            <option value="checkpoint">Retained checkpoint r{entry.checkpoint.identity.revision}</option>
          </select></label>;
        })()}
        <label style={{ marginLeft: 10 }}><input type="checkbox" checked={visible[index]} onChange={event => { setCameraMode("independent"); setCameraPose(null);
          setVisible(current => current.map((value, i) => i === index ? event.target.checked : value) as [boolean, boolean]); }} />Visible</label>
        {candidates.find(entry => entry.expected.id === (index === 0 ? firstId : secondId))?.module === "surface" ?
          <small style={{ marginLeft: 10 }}>Surface uses its viewer palette</small> :
          <label style={{ marginLeft: 10 }}>Color <input type="color" value={palette[index]} onChange={event => setPalette(current => current.map((value, i) => i === index ? event.target.value : value) as [string, string])} /></label>}
        <label style={{ marginLeft: 10 }}>Opacity <input aria-label={`Source ${index === 0 ? "A" : "B"} opacity`} type="range" min="0" max="1" step="0.05" value={opacity[index]}
          onChange={event => setOpacity(current => current.map((value, i) => i === index ? Number(event.target.value) : value) as [number, number])} /></label>
      </div>)}
    </div>
    {resolved.error ? <p role="alert">{resolved.error}</p> : <div style={{ display: "grid", gridTemplateColumns: mode === "overlay" ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12, flex: 1 }}>
      {mode === "overlay" ? <ComparisonPane members={resolved.members} label={`Overlay · ${frame} · ${unit}`} onPick={onPick} /> :
        composition?.members.map((member, index) => <ComparisonPane key={`${index}:${member.documentId}`} members={resolved.members.filter(item => item.slot === index)}
          label={`${index === 0 ? "A" : "B"}: ${titleOf(project, member.documentId)} · r${member.expected.revision}`} onPick={onPick}
          linkedUV={linkable ? linked?.uv : null} linkedToken={linked?.token}
          onCameraSync={cameraLinked && index === cameraLeader ? onLeaderCamera : undefined}
          cameraOverride={cameraLinked && index !== cameraLeader ? cameraPose?.state : null}
          cameraOverrideToken={cameraLinked && index !== cameraLeader ? cameraPose?.token : undefined} />)}
    </div>}
    {mode === "overlay" && !resolved.error && <p role="status" style={{ margin: 0 }}>
      {resolved.verifiedOverlay ?
        "Source-declared coordinate frames, axes, handedness, and units match this overlay." :
        "Unverified overlay: at least one source has no coordinate-frame declaration. The frame and unit above are operator assertions."}
    </p>}
    <footer style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}><strong>Selection</strong> {pick ?
      `${titleOf(project, pick.memberId)} · r${pick.revision} · ${pick.hash.slice(0, 20)}… · ${pick.meshKey ?? "mesh"} · face ${pick.faceIndex ?? "—"} · (${pick.point.x.toPrecision(5)}, ${pick.point.y.toPrecision(5)}, ${pick.point.z.toPrecision(5)})` :
      "Click a rendered mesh to inspect its exact member and local coordinate; point and line overlays are not pickable here."}
      {saved && <span style={{ marginLeft: 16 }}>Saved source status: {inspectProjectCompositionAvailability(saved, project.workspace).join(" / ")}</span>}
      {mode === "side-by-side" && (linkable ? <p>Linked selection uses the same stored parameter ‘u,v’ in both generations, not an inferred physical-point match.
        {linked && ` Selected u=${linked.uv.u.toPrecision(5)}, v=${linked.uv.v.toPrecision(5)}.`}</p> :
        <p>Linked selection unavailable: these panes do not share a verified parameter chart. Each selection remains source-specific.</p>)}
      {message && <p role="status">{message}</p>}
    </footer>
  </div>, document.body);
};
