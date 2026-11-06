import {
  createMixedWorkspaceDocument, readProjectCoordinateFrame, replaceMath3DProjectWorkspace, sameProjectCoordinateFrame, structuralHash,
  upsertMath3DProjectComposition, type GeometryDocument, type Math3DProject, type ProjectComposition,
  type ProjectCoordinateFrame,
} from "@math3d/core";
import { GeometryDocumentAdapter, type GeometryReplayBundle } from "../geometry/geometryDocumentAdapter";
import { MIXED_REPLAY_FORMATS, verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

/** Adds an authored frame to one owning Geometry source and pins a new comparison to its exact revision. */
export function declareLegacyGeometryCoordinateFrame(project: Math3DProject, composition: ProjectComposition,
  slot: 0 | 1, frame: ProjectCoordinateFrame): { project: Math3DProject; comparison: ProjectComposition } {
  const saved = project.compositions?.find(item => item.id === composition.id);
  if (!saved || structuralHash(saved) !== structuralHash(composition) || composition.mode !== "overlay" ||
    composition.alignment?.frame !== frame.frame || composition.alignment.unit !== frame.unit)
    throw new TypeError("Save and reopen the exact overlay before declaring its source frame.");
  const member = composition.members[slot];
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry || entry.module !== "geometry" || entry.checkpoint.format !== "math3d.geometry-document" ||
    entry.replay && entry.replay.format !== MIXED_REPLAY_FORMATS.geometry ||
    entry.checkpoint.identity.revision !== member.expected.revision ||
    entry.checkpoint.identity.structuralHash !== member.expected.structuralHash ||
    entry.expected.revision !== member.expected.revision || entry.expected.structuralHash !== member.expected.structuralHash)
    throw new TypeError("Only a current Geometry source retained as its exact replay checkpoint can receive this frame declaration.");
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  const verified = replayed.get(member.documentId);
  if (!verified || verified.format !== "math3d.geometry-document" ||
    verified.identity.revision !== member.expected.revision || verified.identity.structuralHash !== member.expected.structuralHash ||
    readProjectCoordinateFrame(verified).status !== "missing")
    throw new TypeError("The exact legacy Geometry source is unavailable or already declares a frame.");
  const source = { ...verified.source, extensions: { ...verified.source.extensions, math3dCoordinateFrame: frame } };
  if (readProjectCoordinateFrame({ ...verified, source } as GeometryDocument).status !== "declared")
    throw new TypeError("The coordinate-frame declaration is invalid.");
  const other = replayed.get(composition.members[slot === 0 ? 1 : 0].documentId);
  if (!other) throw new TypeError("The other comparison source is unavailable.");
  const otherFrame = readProjectCoordinateFrame(other);
  if (otherFrame.status === "invalid" || otherFrame.value && !sameProjectCoordinateFrame(frame, otherFrame.value))
    throw new TypeError("The proposed axes or handedness disagree with the other source declaration.");
  const adapter = entry.replay ? GeometryDocumentAdapter.restore(entry.replay.payload as unknown as GeometryReplayBundle) :
    new GeometryDocumentAdapter(verified);
  const updated = adapter.commitSource(source, { kind: "interactive", sourceId: "project-coordinate-frame-declaration" });
  const replay = adapter.exportReplay();
  const workspace = createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(item =>
    item === entry ? { ...item, checkpoint: replay.checkpoint.document, expected: updated.identity,
      replay: { format: MIXED_REPLAY_FORMATS.geometry, payload: replay as never } } : item) });
  const revised = replaceMath3DProjectWorkspace(project, workspace);
  verifyMixedWorkspaceReplay(revised.workspace);
  const comparison: ProjectComposition = { ...composition,
    id: `composition:frame:${structuralHash([composition.id, member.expected, updated.identity]).slice(7, 39)}`,
    title: `${composition.title.replace(/^Unverified\s+/i, "").slice(0, 135)} · source frame r${updated.identity.revision}`,
    members: slot === 0 ? [{ ...composition.members[0], expected: updated.identity }, composition.members[1]] :
      [composition.members[0], { ...composition.members[1], expected: updated.identity }] };
  return { project: upsertMath3DProjectComposition(revised, comparison), comparison };
}
