import {
  createMixedWorkspaceDocument, MAX_RETAINED_GEOMETRY_GENERATIONS, MAX_RETAINED_MESH_GENERATIONS, MAX_RETAINED_SURFACE_GENERATIONS,
  readProjectCoordinateFrame, replaceMath3DProjectWorkspace,
  retainedGeometryGenerationDocuments, retainedMeshGenerationDocuments, retainedSurfaceGenerationDocuments,
  sameProjectCoordinateFrame, structuralHash,
  upsertMath3DProjectComposition, type GeometryDocument, type Math3DProject, type MeshDocument,
  type MeshResourceReference, type ProjectComposition, type ProjectCoordinateFrame, type SurfaceDocument,
} from "@math3d/core";
import { GeometryDocumentAdapter, type GeometryReplayBundle } from "../geometry/geometryDocumentAdapter";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { SurfaceDocumentAdapter, type SurfaceReplayBundle } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import type { MeshReplayBundle } from "../mesh/meshReplay";
import type { SurfaceMeshSource } from "../mesh/surfaceMesh";
import { MIXED_REPLAY_FORMATS, verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { projectResourceInventory, type ProjectResourceReader } from "./projectResources";
import { resolveExactProjectCompositionSource } from "./projectCompositionSource";

/** Adds an authored frame to one owning Geometry source and pins a new comparison to its exact revision. */
export function declareLegacyGeometryCoordinateFrame(project: Math3DProject, composition: ProjectComposition,
  slot: 0 | 1, frame: ProjectCoordinateFrame): { project: Math3DProject; comparison: ProjectComposition } {
  const saved = project.compositions?.find(item => item.id === composition.id);
  if (!saved || structuralHash(saved) !== structuralHash(composition) ||
    composition.mode === "overlay" && (composition.alignment?.frame !== frame.frame || composition.alignment.unit !== frame.unit))
    throw new TypeError("Save and reopen the exact comparison before declaring its source frame.");
  const member = composition.members[slot];
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry || entry.module !== "geometry" || entry.checkpoint.format !== "math3d.geometry-document" ||
    entry.replay && entry.replay.format !== MIXED_REPLAY_FORMATS.geometry ||
    entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash)
    throw new TypeError("Only a current replay-verified Geometry source can receive this frame declaration.");
  const retainCurrent = entry.checkpoint.identity.revision !== member.expected.revision ||
    entry.checkpoint.identity.structuralHash !== member.expected.structuralHash;
  if (retainCurrent && (!entry.replay || retainedGeometryGenerationDocuments(entry).length >= MAX_RETAINED_GEOMETRY_GENERATIONS))
    throw new TypeError("The current Geometry cannot be retained before this frame declaration.");
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  const verified = replayed.get(member.documentId);
  if (!verified || verified.format !== "math3d.geometry-document" ||
    verified.identity.revision !== member.expected.revision || verified.identity.structuralHash !== member.expected.structuralHash ||
    readProjectCoordinateFrame(verified).status !== "missing")
    throw new TypeError("The exact legacy Geometry source is unavailable or already declares a frame.");
  const source = { ...verified.source, extensions: { ...verified.source.extensions, math3dCoordinateFrame: frame } };
  if (readProjectCoordinateFrame({ ...verified, source } as GeometryDocument).status !== "declared")
    throw new TypeError("The coordinate-frame declaration is invalid.");
  const other = resolveExactProjectCompositionSource(project, composition.members[slot === 0 ? 1 : 0], replayed);
  const otherFrame = readProjectCoordinateFrame(other);
  if (otherFrame.status === "invalid" || otherFrame.value && !sameProjectCoordinateFrame(frame, otherFrame.value))
    throw new TypeError("The proposed axes or handedness disagree with the other source declaration.");
  const adapter = entry.replay ? GeometryDocumentAdapter.restore(entry.replay.payload as unknown as GeometryReplayBundle) :
    new GeometryDocumentAdapter(verified);
  const updated = adapter.commitSource(source, { kind: "interactive", sourceId: "project-coordinate-frame-declaration" },
    retainCurrent ? verified.identity.structuralHash : undefined);
  const replay = adapter.exportReplay();
  const workspace = createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item =>
    item === entry ? { ...item, checkpoint: replay.checkpoint.document, expected: updated.identity,
      replay: { format: MIXED_REPLAY_FORMATS.geometry, payload: replay as never } } : item) });
  const revised = replaceMath3DProjectWorkspace(project, workspace);
  verifyMixedWorkspaceReplay(revised.workspace);
  if (retainCurrent && !retainedGeometryGenerationDocuments(workspace.entries.find(item => item.expected.id === member.documentId)!)
    .some(document => document.identity.revision === member.expected.revision &&
      document.identity.structuralHash === member.expected.structuralHash))
    throw new TypeError("The prior Geometry revision was not retained.");
  const comparison: ProjectComposition = { ...composition,
    id: `composition:frame:${structuralHash([composition.id, member.expected, updated.identity]).slice(7, 39)}`,
    title: `${composition.title.replace(/^Unverified\s+/i, "").slice(0, 135)} · source frame r${updated.identity.revision}`,
    members: slot === 0 ? [{ ...composition.members[0], expected: updated.identity }, composition.members[1]] :
      [composition.members[0], { ...composition.members[1], expected: updated.identity }] };
  return { project: upsertMath3DProjectComposition(revised, comparison), comparison };
}

/** Adds an authored frame to the owning Surface orientation and pins a new exact side-by-side comparison. */
export function declareLegacySurfaceCoordinateFrame(project: Math3DProject, composition: ProjectComposition,
  slot: 0 | 1, frame: ProjectCoordinateFrame): { project: Math3DProject; comparison: ProjectComposition } {
  const saved = project.compositions?.find(item => item.id === composition.id);
  if (!saved || structuralHash(saved) !== structuralHash(composition) || composition.mode !== "side-by-side")
    throw new TypeError("Save and reopen the exact side-by-side comparison before declaring its Surface frame.");
  const member = composition.members[slot];
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry || entry.module !== "surface" || entry.checkpoint.format !== "math3d.surface-document" ||
    entry.replay && entry.replay.format !== MIXED_REPLAY_FORMATS.surface ||
    entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash)
    throw new TypeError("Only a current replay-verified Surface source can receive this frame declaration.");
  const retainCurrent = entry.checkpoint.identity.revision !== member.expected.revision ||
    entry.checkpoint.identity.structuralHash !== member.expected.structuralHash;
  if (retainCurrent && (!entry.replay || retainedSurfaceGenerationDocuments(entry).length >= MAX_RETAINED_SURFACE_GENERATIONS))
    throw new TypeError("The current Surface cannot be retained before this frame declaration.");
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  const verified = replayed.get(member.documentId);
  if (!verified || verified.format !== "math3d.surface-document" ||
    verified.identity.revision !== member.expected.revision || verified.identity.structuralHash !== member.expected.structuralHash ||
    readProjectCoordinateFrame(verified).status !== "missing")
    throw new TypeError("The exact legacy Surface source is unavailable or already declares a frame.");
  if (!verified.source.orientation || typeof verified.source.orientation !== "object" || Array.isArray(verified.source.orientation) ||
    !verified.source.units || typeof verified.source.units !== "object" || Array.isArray(verified.source.units) ||
    frame.unit !== (verified.source.units as { length: string }).length)
    throw new TypeError("The declared unit must equal the Surface source length unit.");
  const source = { ...verified.source, orientation: { ...verified.source.orientation, math3dCoordinateFrame: frame } };
  if (readProjectCoordinateFrame({ ...verified, source } as SurfaceDocument).status !== "declared")
    throw new TypeError("The coordinate-frame declaration is invalid.");
  const other = resolveExactProjectCompositionSource(project, composition.members[slot === 0 ? 1 : 0], replayed);
  const otherFrame = readProjectCoordinateFrame(other);
  if (otherFrame.status === "invalid" || otherFrame.value && !sameProjectCoordinateFrame(frame, otherFrame.value))
    throw new TypeError("The proposed frame, axes, or handedness disagree with the other source declaration.");
  const adapter = entry.replay ? SurfaceDocumentAdapter.fromReplayBundle(entry.replay.payload as unknown as SurfaceReplayBundle) :
    new SurfaceDocumentAdapter(verified);
  const updated = adapter.commitSource(source, retainCurrent ? verified.identity.structuralHash : undefined);
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item =>
    item === entry ? { ...item, checkpoint: replay.checkpoint, expected: updated.identity,
      replay: { format: MIXED_REPLAY_FORMATS.surface, payload: replay as never } } : item) });
  const revised = replaceMath3DProjectWorkspace(project, workspace);
  verifyMixedWorkspaceReplay(revised.workspace);
  if (retainCurrent && !retainedSurfaceGenerationDocuments(workspace.entries.find(item => item.expected.id === member.documentId)!)
    .some(document => document.identity.revision === member.expected.revision &&
      document.identity.structuralHash === member.expected.structuralHash))
    throw new TypeError("The prior Surface revision was not retained.");
  const comparison: ProjectComposition = { ...composition,
    id: `composition:frame:${structuralHash([composition.id, member.expected, updated.identity]).slice(7, 39)}`,
    title: `${composition.title.slice(0, 135)} · source frame r${updated.identity.revision}`,
    members: slot === 0 ? [{ ...composition.members[0], expected: updated.identity }, composition.members[1]] :
      [composition.members[0], { ...composition.members[1], expected: updated.identity }] };
  return { project: upsertMath3DProjectComposition(revised, comparison), comparison };
}

/** Records a frame in a legacy Mesh origin without changing its verified binary geometry. */
export function declareLegacyMeshCoordinateFrame(project: Math3DProject, composition: ProjectComposition,
  slot: 0 | 1, frame: ProjectCoordinateFrame, read: ProjectResourceReader):
  { project: Math3DProject; comparison: ProjectComposition } {
  const saved = project.compositions?.find(item => item.id === composition.id);
  if (!saved || structuralHash(saved) !== structuralHash(composition) ||
    composition.mode === "overlay" && (composition.alignment?.frame !== frame.frame || composition.alignment.unit !== frame.unit))
    throw new TypeError("Save and reopen the exact comparison before declaring its source frame.");
  const member = composition.members[slot];
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry || entry.module !== "mesh" || entry.checkpoint.format !== "math3d.mesh-document" ||
    entry.replay && entry.replay.format !== MIXED_REPLAY_FORMATS.mesh ||
    entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash)
    throw new TypeError("Only a current replay-verified Mesh source can receive this frame declaration.");
  const retainCurrent = entry.checkpoint.identity.revision !== member.expected.revision ||
    entry.checkpoint.identity.structuralHash !== member.expected.structuralHash;
  if (retainCurrent && (!entry.replay || retainedMeshGenerationDocuments(entry).length >= MAX_RETAINED_MESH_GENERATIONS))
    throw new TypeError("The current Mesh cannot be retained before this frame declaration.");
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  const verified = replayed.get(member.documentId);
  if (!verified || verified.format !== "math3d.mesh-document" ||
    verified.identity.revision !== member.expected.revision || verified.identity.structuralHash !== member.expected.structuralHash ||
    readProjectCoordinateFrame(verified).status !== "missing")
    throw new TypeError("The exact legacy Mesh source is unavailable or already declares a frame.");
  const origin = verified.source.origin;
  if (!origin || typeof origin !== "object" || Array.isArray(origin))
    throw new TypeError("This Mesh origin cannot hold a coordinate-frame declaration.");
  const source = { ...verified.source, origin: { ...origin, math3dCoordinateFrame: frame } };
  if (readProjectCoordinateFrame({ ...verified, source } as MeshDocument).status !== "declared")
    throw new TypeError("The coordinate-frame declaration is invalid.");
  const other = resolveExactProjectCompositionSource(project, composition.members[slot === 0 ? 1 : 0], replayed);
  const otherFrame = readProjectCoordinateFrame(other);
  if (otherFrame.status === "invalid" || otherFrame.value && !sameProjectCoordinateFrame(frame, otherFrame.value))
    throw new TypeError("The proposed axes or handedness disagree with the other source declaration.");
  const resources = projectResourceInventory(project).filter(item => item.kind === "mesh-buffers" && item.owners.includes(member.documentId))
    .map(item => {
      const bytes = read(item);
      if (!bytes) throw new TypeError("The saved Mesh buffer is unavailable.");
      return { reference: item.reference as MeshResourceReference, bytes };
    });
  const store = new MeshResourceStore();
  for (const resource of resources) store.import(resource.reference, resource.bytes);
  const adapter = entry.replay ? MeshDocumentAdapter.restoreReplay({ ...(entry.replay.payload as unknown as MeshReplayBundle), resources }) :
    new MeshDocumentAdapter(verified, store);
  const mesh = adapter.mesh();
  const updated = adapter.replaceMesh({ ...mesh, source: { ...mesh.source, math3dCoordinateFrame: frame } as unknown as SurfaceMeshSource },
    "replace", { reason: "coordinate-frame-declaration",
      ...(retainCurrent ? { retainedBefore: verified.identity.structuralHash } : {}) });
  if (updated.source.resource.checksum !== verified.source.resource.checksum ||
    updated.source.resource.vertexCount !== verified.source.resource.vertexCount ||
    updated.source.resource.indexCount !== verified.source.resource.indexCount)
    throw new TypeError("The frame edit changed the Mesh buffer; source revision refused.");
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item =>
    item === entry ? { ...item, checkpoint: replay.checkpoint.document, expected: updated.identity,
      replay: { format: MIXED_REPLAY_FORMATS.mesh, payload: replay as never } } : item) });
  const revised = replaceMath3DProjectWorkspace(project, workspace);
  verifyMixedWorkspaceReplay(revised.workspace);
  if (retainCurrent && !retainedMeshGenerationDocuments(workspace.entries.find(item => item.expected.id === member.documentId)!)
    .some(document => document.identity.revision === member.expected.revision &&
      document.identity.structuralHash === member.expected.structuralHash))
    throw new TypeError("The prior Mesh revision was not retained.");
  const comparison: ProjectComposition = { ...composition,
    id: `composition:frame:${structuralHash([composition.id, member.expected, updated.identity]).slice(7, 39)}`,
    title: `${composition.title.replace(/^Unverified\s+/i, "").slice(0, 135)} · source frame r${updated.identity.revision}`,
    members: slot === 0 ? [{ ...composition.members[0], expected: updated.identity }, composition.members[1]] :
      [composition.members[0], { ...composition.members[1], expected: updated.identity }] };
  return { project: upsertMath3DProjectComposition(revised, comparison), comparison };
}
