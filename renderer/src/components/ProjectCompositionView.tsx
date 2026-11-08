import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  inspectProjectCompositionAvailability, readProjectCoordinateFrame, qualifyProjectOverlayCoordinates, retainedGeometryGenerationDocuments, retainedMeshGenerationDocuments,
  retainedSurfaceGenerationDocuments, sameProjectCoordinateFrame,
  type ProjectCoordinateFrame, type ProjectCoordinateFrameRead, type GeometryDocument, type GeometryScene, type Math3DProject,
  type MeshDocument, type SurfaceDocument, type ProjectComposition, type ProjectCompositionMember, type MixedWorkspaceEntry,
  SAGE_LOCUS_SAMPLE_EXTENSION, parseSampledAlgebraicLocusGeometryDocument,
  SAGE_LOCUS_SINGULARITY_EXTENSION, parseAlgebraicSingularityGeometryDocument,
} from "@math3d/core";
import { projectResourceInventory, type ProjectResourceReader } from "../projects/projectResources";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import { buildSurfaceMeshFromGeometry, type SurfaceMeshData } from "../mesh/surfaceMesh";
import { GEOMETRY_OBJECT_REGISTRY } from "../geometry/proceduralObjects";
import { buildGeometryRenderData } from "../geometry/render";
import { GeometryViewer } from "./GeometryViewer";
import { ParamSurfaceViewer } from "./ParamSurfaceViewer";
import { surfaceDocumentBinding, type SurfaceDocumentBinding } from "../workspace/surfaceDocumentBinding";
import type { CameraSyncState, OverlayPointSet, OverlayPolylineGroup } from "./SurfaceViewer";
import { type ComparisonEvidenceSelection } from "../projects/projectComparisonEvidence";
import { useComparisonEvidenceExport } from "../projects/useComparisonEvidenceExport";
import { inspectProjectComparisonNote } from "../projects/projectComparisonNotes";
import { resolveLinkedCoordinateProbe, resolveSavedCoordinateProbe, type LinkedCoordinateProbe } from "../projects/projectLinkedCoordinateProbe";
import { resolveExactProjectCompositionSource } from "../projects/projectCompositionSource";
import { compositionCursorDraft, compositionCursorProbe } from "./compositionCursor";
import { scientificCursorBus } from "./scientificCursor";

type RenderMesh = SurfaceMeshData & { id: string; color: number; opacity: number; transform?: {
  position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number };
} };
export type RenderMember = { id: string; title: string; revision: number; hash: string; generation: "current" | "retained checkpoint" | "retained snapshot"; slot?: 0 | 1;
  coordinates: ProjectCoordinateFrameRead; meshes: RenderMesh[]; points: OverlayPointSet[]; lines: OverlayPolylineGroup[];
  param?: { binding?: SurfaceDocumentBinding; x?: string; y?: string; z?: string; domain?: { uMin: number; uMax: number; vMin: number; vMax: number }; unit: string; opacity: number } };
type Pick = ComparisonEvidenceSelection & { meshKey?: string; faceIndex?: number; uv?: { u: number; v: number };
  point: { x: number; y: number; z: number } };
const colors = ["#3976d7", "#e8793a"] as const;
const supported = (project: Math3DProject) => project.workspace.entries.filter(entry => ["mesh", "geometry", "surface"].includes(entry.module));
type GenerationChoice = { value: string; expected: ProjectCompositionMember["expected"]; label: string };
const sameGeneration = (a: ProjectCompositionMember["expected"], b: ProjectCompositionMember["expected"]) =>
  a.id === b.id && a.revision === b.revision && a.structuralHash === b.structuralHash;
const generationChoices = (entry: MixedWorkspaceEntry): GenerationChoice[] => {
  const choices: GenerationChoice[] = [{ value: "current", expected: entry.expected, label: `Current r${entry.expected.revision}` }];
  if (!entry.replay) return choices;
  if (!sameGeneration(entry.checkpoint.identity, entry.expected))
    choices.push({ value: "checkpoint", expected: entry.checkpoint.identity,
      label: `Retained checkpoint r${entry.checkpoint.identity.revision}` });
  if (entry.module === "mesh") {
    for (const document of retainedMeshGenerationDocuments(entry)) {
      const isCheckpoint = sameGeneration(document.identity, entry.checkpoint.identity);
      if (!isCheckpoint) choices.push({ value: `retained:${document.identity.revision}:${document.identity.structuralHash}`,
        expected: document.identity, label: `Retained snapshot r${document.identity.revision}` });
    }
  }
  if (entry.module === "geometry") {
    for (const document of retainedGeometryGenerationDocuments(entry)) {
      const isCheckpoint = sameGeneration(document.identity, entry.checkpoint.identity);
      if (!isCheckpoint) choices.push({ value: `retained:${document.identity.revision}:${document.identity.structuralHash}`,
        expected: document.identity, label: `Retained snapshot r${document.identity.revision}` });
    }
  }
  if (entry.module === "surface") {
    for (const document of retainedSurfaceGenerationDocuments(entry)) {
      const isCheckpoint = sameGeneration(document.identity, entry.checkpoint.identity);
      if (!isCheckpoint) choices.push({ value: `retained:${document.identity.revision}:${document.identity.structuralHash}`,
        expected: document.identity, label: `Retained snapshot r${document.identity.revision}` });
    }
  }
  return choices;
};
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
  const document = resolveExactProjectCompositionSource(project, member);
  const currentSelected = sameGeneration(document.identity, entry.expected);
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
    if (SAGE_LOCUS_SINGULARITY_EXTENSION in source.extensions) {
      const { analysis } = parseAlgebraicSingularityGeometryDocument(document, project);
      const coordinate = (value: string) => { const [n, d] = value.split("/"); return Number(n) / Number(d ?? 1); };
      const p = analysis.point.map(coordinate), origin = { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
      points.push({ points: [origin], color, opacity: member.opacity, size: 9 });
      const span = Math.min(...analysis.scene.domain.bounds.map((bound) => bound.max - bound.min)) * 0.3;
      if (analysis.local.realTangentDirections.length) lines.push({
        lines: analysis.local.realTangentDirections.map(([dx, dy]) => {
          const scale = span / (Math.hypot(dx, dy) || 1);
          return [{ x: origin.x - dx * scale, y: origin.y - dy * scale, z: origin.z },
            { x: origin.x + dx * scale, y: origin.y + dy * scale, z: origin.z }];
        }), color, opacity: member.opacity });
      if (p.length === 3 && analysis.local.onLocus && analysis.local.jacobianRank === 1) {
        const normal = analysis.local.jacobian.map(coordinate), length = Math.hypot(...normal);
        if (length > 0 && Number.isFinite(length)) {
          const n = normal.map((value) => value / length);
          const anchor = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
          const u = [n[1]*anchor[2]-n[2]*anchor[1], n[2]*anchor[0]-n[0]*anchor[2], n[0]*anchor[1]-n[1]*anchor[0]];
          const ul = Math.hypot(...u), unit = u.map((value) => value / ul);
          const v = [n[1]*unit[2]-n[2]*unit[1], n[2]*unit[0]-n[0]*unit[2], n[0]*unit[1]-n[1]*unit[0]];
          const vertex = (a: number, b: number) => [origin.x, origin.y, origin.z].map((value, axis) =>
            value + span * (a * unit[axis] + b * v[axis]));
          const a = vertex(-1,-1), b = vertex(1,-1), c = vertex(1,1), d = vertex(-1,1);
          meshes.push({ id: `${member.documentId}/tangent-plane`, label: "Exact tangent plane at selected point",
            positions: new Float32Array([...a,...b,...c,...a,...c,...d]), indices: null,
            source: { kind: "bakedFromImplicit" }, color, opacity: member.opacity * 0.5 });
        }
      }
    }
    if (SAGE_LOCUS_SAMPLE_EXTENSION in source.extensions) {
      const { sample } = parseSampledAlgebraicLocusGeometryDocument(document, project);
      const asPoint = (p: readonly number[]) => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 });
      if (sample.points.length) points.push({ points: sample.points.map(asPoint), color, opacity: member.opacity });
      if (sample.segments.length) lines.push({ lines: sample.segments.map(([a, b]) => [asPoint(a), asPoint(b)]),
        color, opacity: member.opacity });
      if (sample.triangles.length) meshes.push({ id: `${member.documentId}/locus`,
        label: `${document.metadata.title} (bounded numerical sample)`,
        positions: new Float32Array(sample.triangles.flatMap((triangle) => triangle.flatMap((p) => [p[0], p[1], p[2]]))),
        indices: null, source: { kind: "bakedFromImplicit" }, color, opacity: member.opacity });
    }
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
    generation: currentSelected ? "current" : sameGeneration(document.identity, entry.checkpoint.identity) ? "retained checkpoint" : "retained snapshot",
    coordinates: readProjectCoordinateFrame(document), hash: document.identity.structuralHash, meshes, points, lines, ...(param ? { param } : {}) };
};

export const compatibleCompositionParameterChart = (members: readonly RenderMember[]): boolean =>
  members.length === 2 && members[0]!.id === members[1]!.id && !!members[0]!.param?.domain && !!members[1]!.param?.domain &&
  JSON.stringify(members[0]!.param.domain) === JSON.stringify(members[1]!.param.domain);

export const qualifyProjectCameraPair = (members: readonly RenderMember[]): "shared-surface-axes" | "declared-3d-frame" | null => {
  if (members.length !== 2) return null;
  const [a, b] = members;
  if (a!.coordinates.status === "invalid" || b!.coordinates.status === "invalid" ||
    a!.coordinates.value && b!.coordinates.value && !sameProjectCoordinateFrame(a!.coordinates.value, b!.coordinates.value))
    return null;
  if (a!.param && b!.param && compatibleCompositionParameterChart(members) && a!.param.unit === b!.param.unit &&
    !!a!.param.x && a!.param.x === b!.param.x && !!a!.param.y && a!.param.y === b!.param.y)
    return "shared-surface-axes";
  if (a!.coordinates.status === "declared" && b!.coordinates.status === "declared" &&
    a!.coordinates.value && b!.coordinates.value && sameProjectCoordinateFrame(a!.coordinates.value, b!.coordinates.value))
    return "declared-3d-frame";
  return null;
};

export const ComparisonPane: React.FC<{ members: RenderMember[]; label: string; onPick: (pick: Pick) => void; height?: number;
  captureToken?: number; onCaptureThumbnail?: (dataUrl: string | null) => void;
  linkedUV?: { u: number; v: number } | null; linkedToken?: number;
  coordinateProbe?: LinkedCoordinateProbe | null;
  onCameraSync?: (state: CameraSyncState) => void; cameraOverride?: CameraSyncState | null; cameraOverrideToken?: number }> =
  ({ members, label, onPick, height = 520, captureToken, onCaptureThumbnail, linkedUV, linkedToken, coordinateProbe, onCameraSync, cameraOverride, cameraOverrideToken }) => {
  const meshes = useMemo(() => members.flatMap(member => member.meshes), [members]);
  const points = useMemo(() => [...members.flatMap(member => member.points),
    ...(coordinateProbe ? [{ points: [coordinateProbe.point], color: 0xffbd2e, size: 0.2, opacity: 1 }] : [])],
    [members, coordinateProbe]);
  const lines = useMemo(() => members.flatMap(member => member.lines), [members]);
  return <section aria-label={label} style={{ minWidth: 0, height, position: "relative", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
    <div style={{ position: "absolute", zIndex: 30, top: 58, left: 10, background: "#fff", padding: "4px 8px", borderRadius: 4, maxWidth: "min(80%, 450px)" }}>
      <strong>{label}</strong><br /><small>{members.map(member => `${member.generation} r${member.revision} · ${member.hash.slice(0, 20)}… · ${member.param?.unit ?? member.coordinates.value?.unit ?? "unit not recorded"}`).join(" / ")}</small>
    </div>
    {coordinateProbe && <div data-testid="project-composition-linked-coordinate" style={{ position: "absolute", zIndex: 30, left: 10, bottom: 10,
      background: "#fff", padding: "5px 8px", borderRadius: 4, maxWidth: "min(80%, 480px)" }}>
      <strong>Linked coordinate · {coordinateProbe.frame}</strong><br />
      <small>From {coordinateProbe.source.slot === 0 ? "A" : "B"} · {coordinateProbe.source.id} r{coordinateProbe.source.revision} · {coordinateProbe.source.hash.slice(0, 16)}…<br />
        ({coordinateProbe.point.x.toPrecision(5)}, {coordinateProbe.point.y.toPrecision(5)}, {coordinateProbe.point.z.toPrecision(5)}) {coordinateProbe.unit}.
        Coordinate marker only; no target element or value inferred.</small>
    </div>}
    {members.length === 1 && members[0]!.param ? <ParamSurfaceViewer surfaceId="custom" documentBinding={members[0]!.param.binding}
      customX={members[0]!.param.x} customY={members[0]!.param.y} customZ={members[0]!.param.z} paramDomain={members[0]!.param.domain}
      paramResolution={48} materialOpacity={members[0]!.param.opacity} inspectEnabled
      isCameraLeader={!!onCameraSync} onCameraSync={onCameraSync} cameraOverride={cameraOverride} cameraOverrideToken={cameraOverrideToken}
      paramProbeUV={linkedUV} paramProbeToken={linkedToken}
      overlayPointSets={coordinateProbe ? [{ points: [coordinateProbe.point], color: 0xffbd2e, size: 0.2, opacity: 1 }] : null}
      captureToken={captureToken} onCaptureThumbnail={onCaptureThumbnail}
      captureSize="report"
      onInspectPick={hit => onPick({ memberId: members[0]!.id,
        revision: members[0]!.revision, hash: members[0]!.hash, point: hit.point, ...(hit.uv ? { uv: hit.uv } : {}) })} /> :
    <GeometryViewer scene={{} as GeometryScene} meshOverrides={meshes} extraOverlayPointSets={points} extraOverlayPolylineGroups={lines}
      captureToken={captureToken} onCaptureThumbnail={onCaptureThumbnail}
      captureSize="report"
      onCameraSync={onCameraSync} cameraOverride={cameraOverride} cameraOverrideToken={cameraOverrideToken}
      pickEnabled onPick={hit => { const key = hit.meshKey ?? ""; const member = members.find(item => key === item.id || key.startsWith(`${item.id}/`));
        if (member) onPick({ memberId: member.id, revision: member.revision, hash: member.hash,
          meshKey: hit.meshKey, faceIndex: hit.faceIndex, point: hit.point }); }} />}
  </section>;
};

export const ProjectCompositionView: React.FC<{ project: Math3DProject; readResource: ProjectResourceReader; onClose: () => void;
  initialCompositionId?: string; initialProbeNoteId?: string; onSave: (composition: ProjectComposition) => Promise<boolean>;
  onDeclareCoordinateFrame?: (composition: ProjectComposition, slot: 0 | 1, frame: ProjectCoordinateFrame) => Promise<string>;
  onSaveObservation: (composition: ProjectComposition, title: string, body: string, probe?: LinkedCoordinateProbe) => Promise<boolean> }> =
  ({ project, readResource, onClose, initialCompositionId, initialProbeNoteId, onSave, onDeclareCoordinateFrame, onSaveObservation }) => {
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
  const [generation, setGeneration] = useState<[string, string]>([
    candidates.length === 1 ? generationChoices(candidates[0]!).find(choice => choice.value !== "current")?.value ?? "current" : "current",
    "current",
  ]);
  const [mode, setMode] = useState<"overlay" | "side-by-side">("side-by-side");
  const [frame, setFrame] = useState(""), [unit, setUnit] = useState("");
  const [declaredAxes, setDeclaredAxes] = useState<[string, string, string]>(["x", "y", "z"]);
  const [declaredHandedness, setDeclaredHandedness] = useState<"right" | "left">("right");
  const [declaringFrame, setDeclaringFrame] = useState(false);
  const [visible, setVisible] = useState<[boolean, boolean]>([true, true]);
  const [palette, setPalette] = useState<[string, string]>([...colors]);
  const [opacity, setOpacity] = useState<[number, number]>([1, 0.72]);
  const [pick, setPick] = useState<Pick | null>(null), [message, setMessage] = useState("");
  const [cursorLinked, setCursorLinked] = useState(true);
  const [externalCursorProbe, setExternalCursorProbe] = useState<LinkedCoordinateProbe | null>(null);
  const [cursorStatus, setCursorStatus] = useState("");
  const cursorOriginViewId = `project-composition:${project.identity.id}`;
  const [observationTitle, setObservationTitle] = useState("Comparison observation");
  const [observationBody, setObservationBody] = useState("");
  const [observationBusy, setObservationBusy] = useState(false);
  const [savedProbeId, setSavedProbeId] = useState("");
  const [linked, setLinked] = useState<{ uv: { u: number; v: number }; token: number } | null>(null);
  const [cameraMode, setCameraMode] = useState<"independent" | "linked">("independent");
  const [cameraLeader, setCameraLeader] = useState<0 | 1>(0);
  const [cameraPose, setCameraPose] = useState<{ state: CameraSyncState; token: number } | null>(null);
  const onLeaderCamera = useCallback((state: CameraSyncState) =>
    setCameraPose(previous => ({ state, token: (previous?.token ?? 0) + 1 })), []);
  const chooseSaved = (id: string) => {
    setSavedId(id); setPick(null); setLinked(null); setSavedProbeId(""); setCameraPose(null); setMessage("");
    const choice = project.compositions?.find(item => item.id === id);
    if (!choice) { setCameraMode("independent"); return; }
    setFirstId(choice.members[0].documentId); setSecondId(choice.members[1].documentId); setMode(choice.mode);
    setCameraMode(choice.camera?.mode ?? "independent"); setCameraLeader(choice.camera?.leader === "B" ? 1 : 0);
    setGeneration(choice.members.map(member => {
      const entry = candidates.find(item => item.expected.id === member.documentId);
      return entry ? generationChoices(entry).find(option => sameGeneration(option.expected, member.expected))?.value ??
        `unavailable:${member.expected.revision}:${member.expected.structuralHash}` : "current";
    }) as [string, string]);
    setFrame(choice.alignment?.frame ?? ""); setUnit(choice.alignment?.unit ?? "");
    setVisible([choice.members[0].visible, choice.members[1].visible]);
    setPalette([choice.members[0].color, choice.members[1].color]); setOpacity([choice.members[0].opacity, choice.members[1].opacity]);
  };
  useEffect(() => { if (initialCompositionId) chooseSaved(initialCompositionId); }, [initialCompositionId]);
  useEffect(() => { if (initialProbeNoteId) { setPick(null); setSavedProbeId(initialProbeNoteId); } }, [initialProbeNoteId]);
  const composition = useMemo((): ProjectComposition | null => {
    if (!firstId || !secondId || firstId === secondId && (mode !== "side-by-side" || generation[0] === generation[1]) ||
      mode === "overlay" && (!frame.trim() || !unit.trim())) return null;
    const entries = [firstId, secondId].map(id => candidates.find(item => item.expected.id === id));
    if (entries.some(entry => !entry)) return null;
    return { id: saved?.id ?? `composition:${crypto.randomUUID()}`, title: saved?.title ?? `${titleOf(project, firstId)} / ${titleOf(project, secondId)}`, mode,
      members: entries.map((entry, index) => ({ documentId: entry!.expected.id,
        expected: saved?.members[index].documentId === entry!.expected.id ? saved.members[index].expected :
          generationChoices(entry!).find(option => option.value === generation[index])?.expected ?? entry!.expected,
        visible: visible[index]!, color: palette[index]!, opacity: opacity[index]! })) as unknown as ProjectComposition["members"],
      ...(mode === "overlay" ? { alignment: { frame: frame.trim(), unit: unit.trim() } } : {}),
      ...(mode === "side-by-side" && cameraMode === "linked" ? { camera: { mode: "linked", leader: cameraLeader === 0 ? "A" : "B" } } : {}) };
  }, [firstId, secondId, generation, mode, frame, unit, visible, palette, opacity, cameraMode, cameraLeader, savedId, project]);
  const resolved = useMemo(() => {
    if (!composition) return { members: [] as RenderMember[], error: "Choose two different saved documents, or two retained generations of one document. Overlay also requires a declared frame and unit." };
    const statuses = inspectProjectCompositionAvailability(composition, project.workspace);
    if (statuses.some(status => status !== "current" && status !== "retained-checkpoint" && status !== "retained-mesh" && status !== "retained-geometry" && status !== "retained-surface"))
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
  const report = useComparisonEvidenceExport(project, composition, readResource, pick);
  const linkable = mode === "side-by-side" && compatibleCompositionParameterChart(resolved.members);
  const coordinateProbe = mode === "side-by-side" && !resolved.error ? resolveLinkedCoordinateProbe(resolved.members, pick) : null;
  const savedProbes = saved && mode === "side-by-side" && !resolved.error ? (project.notes ?? []).flatMap(note => {
    if (note.anchor?.kind !== "comparison" || note.anchor.compositionId !== saved.id || !note.anchor.coordinateProbe ||
      inspectProjectComparisonNote(project, note, readResource).status !== "current") return [];
    const probe = resolveSavedCoordinateProbe(resolved.members, note.anchor);
    return probe ? [{ note, probe }] : [];
  }) : [];
  const savedProbe = savedProbeId ? savedProbes.find(item => item.note.identity.id === savedProbeId) : savedProbes.at(-1);
  useEffect(() => {
    if (!cursorLinked || resolved.error || mode !== "side-by-side") {
      setExternalCursorProbe(null); return;
    }
    return scientificCursorBus.subscribe(event => {
      if (event.kind !== "project" || event.originViewId === cursorOriginViewId) return;
      const projected = compositionCursorProbe(project, resolved.members, event);
      setExternalCursorProbe(projected);
      if (projected) setCursorStatus("Linked exact source coordinate; no target element inferred.");
      else if (resolved.members.some(member => member.id === event.source.documentId))
        setCursorStatus("Cursor withheld: source generation, resource, or coordinate frame differs.");
    });
  }, [cursorLinked, project, resolved, mode, cursorOriginViewId]);
  const displayedProbe = coordinateProbe ?? externalCursorProbe ?? savedProbe?.probe ?? null;
  const legacyFrameSlots = saved && !resolved.error ? ([0, 1] as const).filter(slot => {
    const member = saved.members[slot], entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
    if (!entry || !["geometry", "mesh", "surface"].includes(entry.module) ||
      mode === "overlay" && entry.module === "surface") return false;
    return (!entry.replay || entry.replay.format === (entry.module === "mesh" ? "math3d.mesh-replay.v1" :
      entry.module === "geometry" ? "math3d.geometry-replay.v1" : "math3d.surface-replay.v1")) &&
      entry.expected.revision === member.expected.revision && entry.expected.structuralHash === member.expected.structuralHash &&
      resolved.members.find(item => item.slot === slot)?.coordinates.status === "missing" &&
      (entry.module !== "mesh" || entry.checkpoint.format === "math3d.mesh-document" &&
        !!entry.checkpoint.source.origin && typeof entry.checkpoint.source.origin === "object" &&
        !Array.isArray(entry.checkpoint.source.origin));
  }) : [];
  const declarationValid = declaredAxes.every(axis => !!axis.trim() && axis.trim() === axis && axis.length <= 32) &&
    new Set(declaredAxes).size === 3;
  const cameraQualification = mode === "side-by-side" && !resolved.error ? qualifyProjectCameraPair(resolved.members) : null;
  const cameraLinked = cameraMode === "linked" && !!cameraQualification;
  const onPick = (next: Pick) => {
    setPick(next); setExternalCursorProbe(null);
    setLinked(current => linkable && next.uv ? { uv: next.uv!, token: (current?.token ?? 0) + 1 } : null);
    if (!cursorLinked) return;
    const result = compositionCursorDraft(project, resolved.members, next, cursorOriginViewId);
    if (!result.ok) { setCursorStatus(`Cursor withheld: ${result.errors.join(" ")}`); return; }
    try {
      scientificCursorBus.publishProject(result.value, result.value.source);
      setCursorStatus("Selected source coordinate pinned to the shared cursor.");
    } catch (error) { setCursorStatus(`Cursor withheld: ${String((error as Error).message)}`); }
  };
  const onSelect = (index: 0 | 1, id: string) => { setSavedId(""); setPick(null); setLinked(null); setCameraMode("independent"); setCameraPose(null);
    setGeneration(current => current.map((value, i) => i === index ? "current" : value) as [string, string]); if (index === 0) setFirstId(id); else setSecondId(id); };
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Project comparison and composition" data-testid="project-composition-view"
    style={{ position: "fixed", inset: 16, zIndex: 10000, background: "#f8fafc", color: "#18243a", border: "1px solid #94a3b8", borderRadius: 12,
      boxShadow: "0 24px 80px #0008", overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><small>PROJECT / PC01–PC06</small><h2 style={{ margin: "4px 0" }}>Compare saved documents</h2>
      <p style={{ margin: 0 }}>Comparisons read saved sources. Recording a frame creates a new revision of its owning document.</p></div><button onClick={onClose}>Close</button></header>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <label>Saved composition <select value={savedId} onChange={event => chooseSaved(event.target.value)}><option value="">New comparison</option>{project.compositions?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>View <select data-testid="project-composition-mode" value={mode} onChange={event => { setSavedId(""); setMode(event.target.value as typeof mode);
        setPick(null); setLinked(null); setCameraMode("independent"); setCameraPose(null); }}><option value="side-by-side">Side by side</option><option value="overlay">Overlay</option></select></label>
      {mode === "overlay" && <><label>Shared frame (your assertion) <input aria-label="Shared frame" value={frame} onChange={event => setFrame(event.target.value)} placeholder="e.g. laboratory xyz" maxLength={80} /></label>
        <label>Shared unit (your assertion) <input aria-label="Shared unit" value={unit} onChange={event => setUnit(event.target.value)} placeholder="e.g. mm" maxLength={40} /></label>
        <small>Each available source declaration is checked against the entered frame and unit. A missing declaration remains your alignment assertion.</small></>}
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
    {mode === "side-by-side" && composition && composition.members[0].documentId === composition.members[1].documentId &&
      project.workspace.entries.find(entry => entry.expected.id === composition.members[0].documentId)?.module === "mesh" &&
      <small role="status">Mesh picks belong to their own revision. Remeshing can change vertex and face IDs, so selections are not mapped between panes.</small>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
      {([0, 1] as const).map(index => <div key={index} style={{ border: "1px solid #cbd5e1", padding: 8, borderRadius: 8 }}>
        <label>Source {index === 0 ? "A" : "B"} <select data-testid={`project-composition-source-${index}`} value={index === 0 ? firstId : secondId} onChange={event => onSelect(index, event.target.value)}>
          <option value="">Choose document</option>{candidates.map(entry => <option key={entry.expected.id} value={entry.expected.id}>{titleOf(project, entry.expected.id)} · {entry.module} r{entry.expected.revision}</option>)}</select></label>
        {(() => {
          const entry = candidates.find(item => item.expected.id === (index === 0 ? firstId : secondId));
          if (!entry) return null;
          const choices = generationChoices(entry);
          if (choices.length === 1 && !generation[index].startsWith("unavailable:")) return null;
          return <label style={{ marginLeft: 10 }}>Generation <select data-testid={`project-composition-generation-${index}`}
            value={generation[index]} onChange={event => { setSavedId(""); setPick(null); setCameraMode("independent"); setCameraPose(null);
              setGeneration(current => current.map((value, i) => i === index ? event.target.value : value) as [string, string]); }}>
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            {generation[index].startsWith("unavailable:") && <option value={generation[index]}>Saved generation unavailable</option>}
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
      {mode === "overlay" ? <ComparisonPane members={resolved.members} label={`Overlay · ${frame} · ${unit}`} onPick={onPick}
        captureToken={report.captureToken} onCaptureThumbnail={report.onCapture(0)} /> :
        composition?.members.map((member, index) => <ComparisonPane key={`${index}:${member.documentId}`} members={resolved.members.filter(item => item.slot === index)}
          label={`${index === 0 ? "A" : "B"}: ${titleOf(project, member.documentId)} · r${member.expected.revision}`} onPick={onPick}
          captureToken={report.captureToken} onCaptureThumbnail={report.onCapture(index)}
          linkedUV={linkable ? linked?.uv : null} linkedToken={linked?.token}
          coordinateProbe={displayedProbe?.target.slot === index ? displayedProbe : null}
          onCameraSync={cameraLinked && index === cameraLeader ? onLeaderCamera : undefined}
          cameraOverride={cameraLinked && index !== cameraLeader ? cameraPose?.state : null}
          cameraOverrideToken={cameraLinked && index !== cameraLeader ? cameraPose?.token : undefined} />)}
    </div>}
    {mode === "overlay" && !resolved.error && <p role="status" style={{ margin: 0 }}>
      {resolved.verifiedOverlay ?
        "Source-declared coordinate frames, axes, handedness, and units match this overlay." :
        "Unverified overlay: at least one source has no coordinate-frame declaration. The frame and unit above are operator assertions."}
    </p>}
    {!!legacyFrameSlots.length && onDeclareCoordinateFrame && saved && composition && <section data-testid="project-composition-declare-frame"
      style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8 }}>
      <strong>Record a frame in a legacy source</strong>
      <p style={{ margin: "4px 0" }}>Enter the axes and handedness confirmed for that source. This creates a replay-backed source revision and a new exact comparison. The previous comparison keeps its exact retained generation. Matching declarations do not prove the producer's coordinate claim.</p>
      {mode === "side-by-side" && <label>Declared frame <input aria-label="Declared frame" value={frame} maxLength={80}
        onChange={event => setFrame(event.target.value)} placeholder="e.g. local" /></label>}
      {mode === "side-by-side" && legacyFrameSlots.some(slot => project.workspace.entries.find(item =>
        item.expected.id === composition.members[slot].documentId)?.module !== "surface") &&
        <label>Declared unit <input aria-label="Declared unit" value={unit} maxLength={40}
          onChange={event => setUnit(event.target.value)} placeholder="e.g. m" /></label>}
      {declaredAxes.map((axis, index) => <label key={index} style={{ marginRight: 8 }}>Axis {index + 1} <input
        aria-label={`Declared axis ${index + 1}`} value={axis} maxLength={32} style={{ width: 70 }}
        onChange={event => setDeclaredAxes(current => current.map((value, i) => i === index ? event.target.value : value) as [string, string, string])} /></label>)}
      <label>Handedness <select aria-label="Declared handedness" value={declaredHandedness}
        onChange={event => setDeclaredHandedness(event.target.value as "right" | "left")}>
        <option value="right">Right</option><option value="left">Left</option></select></label>
      <div>{legacyFrameSlots.map(slot => <button key={slot} type="button" style={{ marginTop: 6, marginRight: 8 }}
        data-testid={`project-composition-declare-frame-${slot}`} disabled={declaringFrame || !declarationValid ||
          mode === "side-by-side" && (!frame.trim() ||
            project.workspace.entries.find(item => item.expected.id === composition.members[slot].documentId)?.module !== "surface" && !unit.trim())}
        onClick={() => { setDeclaringFrame(true); setMessage("");
          const sourceEntry = project.workspace.entries.find(item => item.expected.id === composition.members[slot].documentId);
          const sourceUnit = sourceEntry?.module === "surface" ? resolved.members.find(item => item.slot === slot)?.param?.unit ?? "" : unit.trim();
          const declaration: ProjectCoordinateFrame = { format: "math3d.coordinate-frame/v1", frame: frame.trim(), unit: sourceUnit,
            axes: declaredAxes, handedness: declaredHandedness };
          void onDeclareCoordinateFrame(composition, slot, declaration).then(id => {
            setSavedId(id); setPick(null); setLinked(null); setMessage("Source frame recorded in a new document revision; new exact comparison saved.");
          }).catch(error => setMessage(`Frame declaration refused: ${String((error as Error).message)}`))
            .finally(() => setDeclaringFrame(false));
        }}>Record frame in source {slot === 0 ? "A" : "B"}</button>)}</div>
    </section>}
    {composition && <section data-testid="project-comparison-evidence" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8 }}>
      <strong>Exportable comparison evidence</strong><p style={{ margin: "4px 0" }}>A/B source revisions and complete hashes are retained in the report; selected values are local to their source.</p>
      {composition.members.map((member, index) => <div key={index} style={{ overflowWrap: "anywhere" }}>
        {index === 0 ? "A" : "B"} · {titleOf(project, member.documentId)} · r{member.expected.revision} · {member.expected.structuralHash}
      </div>)}
      <p style={{ margin: "4px 0" }}>Alignment: {mode === "overlay" ? resolved.verifiedOverlay ? "source-declared match" : "operator assertion (not independently verified)" : "not applicable; side-by-side"}.
        {pick ? ` Selected local xyz: ${JSON.stringify(pick.point)}${pick.uv ? `; stored (u,v): ${JSON.stringify(pick.uv)}` : ""}.` : " No point selected."}</p>
      <button data-testid="project-comparison-export-evidence" disabled={!saved || !!resolved.error || report.busy} onClick={() => void report.exportEvidence()}>
        {report.busy ? "Capturing views…" : "Export checked HTML report with views"}</button>
      {report.message && <span role="status" style={{ marginLeft: 8 }}>{report.message}</span>}
    </section>}
    {saved && <section data-testid="project-comparison-observations" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10 }}>
      <strong>Observations on this comparison</strong>
      <p style={{ margin: "5px 0" }}>A Note keeps this exact saved composition and both source generations. Its alignment label records whether the source frames matched or were asserted by the operator.</p>
      <label style={{ display: "block" }}>Observation title <input aria-label="Comparison observation title" value={observationTitle} maxLength={160}
        onChange={event => setObservationTitle(event.target.value)} /></label>
      <label style={{ display: "block", marginTop: 5 }}>Observation <textarea aria-label="Comparison observation body" value={observationBody} maxLength={8192} rows={3}
        onChange={event => setObservationBody(event.target.value)} style={{ display: "block", width: "min(100%, 680px)" }} /></label>
      <button data-testid="project-comparison-save-observation" disabled={!composition || !!resolved.error || observationBusy || !observationTitle.trim() || !observationBody.trim()}
        onClick={() => { if (!composition) return; setObservationBusy(true); void onSaveObservation(composition, observationTitle, observationBody).then(ok => {
          if (ok) { setObservationBody(""); setMessage("Observation saved with both exact source generations."); }
          else setMessage("Observation could not be saved; reopen the Project and check both sources.");
        }).finally(() => setObservationBusy(false)); }}>Save observation</button>
      <button data-testid="project-comparison-save-coordinate" style={{ marginLeft: 6 }}
        disabled={!saved || !coordinateProbe || observationBusy || !observationTitle.trim() || !observationBody.trim()}
        onClick={() => { if (!composition || !coordinateProbe) return; setObservationBusy(true);
          void onSaveObservation(composition, observationTitle, observationBody, coordinateProbe).then(ok => {
            if (ok) { setObservationBody(""); setPick(null); setMessage("Coordinate observation saved with both exact source generations."); }
            else setMessage("Coordinate observation could not be saved; recheck both sources.");
          }).finally(() => setObservationBusy(false)); }}>Save coordinate observation</button>
      <small style={{ display: "block" }}>Pick a declared-frame Mesh, Geometry, or Surface first. The Note records its coordinate and frame, not a matching element or measured value in the other source.</small>
      {(project.notes ?? []).filter(note => note.anchor?.kind === "comparison" && note.anchor.compositionId === saved.id).map(note => {
        const anchor = note.anchor!;
        if (anchor.kind !== "comparison") return null;
        const state = inspectProjectComparisonNote(project, note, readResource);
        return <article key={note.identity.id} style={{ borderTop: "1px solid #cbd5e1", marginTop: 8, paddingTop: 8 }}>
          <strong>{note.title}</strong> · {state.status}
          {anchor.coordinateProbe && state.status !== "current" ? <p role="alert">Saved coordinate unavailable until both exact sources verify.</p> :
            <p style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>{note.body}</p>}
          {anchor.coordinateProbe && state.status === "current" && <><small>Shared coordinate from {anchor.coordinateProbe.sourceSlot}:
            {` (${anchor.coordinateProbe.point.join(", ")}) ${anchor.coordinateProbe.coordinateFrame.unit}`} · {anchor.coordinateProbe.coordinateFrame.frame}.
            No target element inferred.</small><br /><button type="button" onClick={() => { setPick(null); setSavedProbeId(note.identity.id); }}>
            Show saved coordinate</button></>}
          <small>Alignment: {anchor.alignment}; composition {anchor.compositionId} · {anchor.compositionHash}<br />
            A: {anchor.members[0].id} r{anchor.members[0].revision} · {anchor.members[0].structuralHash}<br />
            B: {anchor.members[1].id} r{anchor.members[1].revision} · {anchor.members[1].structuralHash}</small>
        </article>;
      })}
    </section>}
    <footer style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>
      <button type="button" data-testid="project-composition-cursor-link" onClick={() => {
        setCursorLinked(value => !value); setExternalCursorProbe(null); setCursorStatus("");
      }}>{cursorLinked ? "Unlink scientific cursor" : "Link scientific cursor"}</button>
      {cursorStatus && <p data-testid="project-composition-cursor-status" role="status">{cursorStatus}</p>}
      <strong>Selection</strong> {pick ?
      `${titleOf(project, pick.memberId)} · r${pick.revision} · ${pick.hash.slice(0, 20)}… · ${pick.meshKey ?? "mesh"} · face ${pick.faceIndex ?? "—"} · (${pick.point.x.toPrecision(5)}, ${pick.point.y.toPrecision(5)}, ${pick.point.z.toPrecision(5)})` :
      "Click a rendered mesh to inspect its exact member and local coordinate; point and line overlays are not pickable here."}
      {saved && <span style={{ marginLeft: 16 }}>Saved source status: {inspectProjectCompositionAvailability(saved, project.workspace).join(" / ")}</span>}
      {mode === "side-by-side" && (linkable ? <p>Linked selection uses the same stored parameter ‘u,v’ in both generations, not an inferred physical-point match.
        {linked && ` Selected u=${linked.uv.u.toPrecision(5)}, v=${linked.uv.v.toPrecision(5)}.`}</p> :
        displayedProbe ? <p data-testid="project-composition-probe-status">{coordinateProbe || externalCursorProbe ? "Linked" : "Saved"} coordinate from {displayedProbe.source.slot === 0 ? "A" : "B"} to {displayedProbe.target.slot === 0 ? "A" : "B"}:
          {` (${displayedProbe.point.x.toPrecision(5)}, ${displayedProbe.point.y.toPrecision(5)}, ${displayedProbe.point.z.toPrecision(5)}) ${displayedProbe.unit}`}
          {` in ${displayedProbe.frame}.`} Source: {displayedProbe.source.id} r{displayedProbe.source.revision} · {displayedProbe.source.hash}.
          Element picks remain source-local; the other pane shows a coordinate marker only.</p> :
        <p data-testid="project-composition-probe-status">Linked coordinate unavailable until a Mesh, Geometry, or Surface is picked in two visible sources with matching declared frames, axes, handedness, and units. Element picks remain source-local.</p>)}
      {message && <p role="status">{message}</p>}
    </footer>
  </div>, document.body);
};
