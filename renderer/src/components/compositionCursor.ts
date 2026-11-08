import { matchesScientificSourceGeneration, readProjectCoordinateFrame, sameProjectCoordinateFrame,
  viewerSourceFromDocument, type AdapterFrame, type Math3DProject, type ValidationResult } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import type { CoordinateProbePick, CoordinateProbeMember, LinkedCoordinateProbe } from "../projects/projectLinkedCoordinateProbe";
import { resolveLinkedCoordinateProbe } from "../projects/projectLinkedCoordinateProbe";
import type { ProjectCursorDraft, ProjectScientificCursor } from "./scientificCursor";

const frameFrom = (member: CoordinateProbeMember): AdapterFrame | null => {
  const declared = member.coordinates.status === "declared" ? member.coordinates.value : null;
  return declared ? { kind: "cartesian", frameId: declared.frame,
    axes: declared.axes.map(name => ({ name, dimension: "length", unit: declared.unit })) } : null;
};
const sameAdapterFrame = (left: AdapterFrame, right: AdapterFrame): boolean =>
  left.kind === right.kind && left.frameId === right.frameId && left.axes.length === right.axes.length &&
  left.axes.every((axis, index) => axis.name === right.axes[index]?.name &&
    axis.dimension === right.axes[index]?.dimension && axis.unit === right.axes[index]?.unit);

/** Publish only a pick from the exact current Surface or Mesh generation and its declared frame. */
export function compositionCursorDraft(project: Math3DProject, members: readonly CoordinateProbeMember[],
  pick: CoordinateProbePick, originViewId: string): ValidationResult<ProjectCursorDraft> {
  const matches = members.filter(member => member.id === pick.memberId &&
    member.revision === pick.revision && member.hash === pick.hash);
  if (matches.length !== 1) return { ok: false, errors: ["Pick does not identify one verified comparison source."] };
  const member = matches[0]!;
  const entry = project.workspace.entries.find(item => item.expected.id === member.id);
  if (!entry || !["surface", "mesh"].includes(entry.module) ||
      entry.expected.revision !== member.revision || entry.expected.structuralHash !== member.hash)
    return { ok: false, errors: ["Comparison pick is not the current Surface or Mesh generation."] };
  const document = verifyMixedWorkspaceReplay(project.workspace).get(member.id);
  if (!document || !matchesScientificSourceGeneration(viewerSourceFromDocument(document),
    viewerSourceFromDocument({ identity: entry.expected })))
    return { ok: false, errors: ["Comparison source could not be replayed at its current generation."] };
  const declaration = readProjectCoordinateFrame(document);
  if (declaration.status !== "declared" || !declaration.value || member.coordinates.status !== "declared" ||
      !member.coordinates.value || !sameProjectCoordinateFrame(declaration.value, member.coordinates.value))
    return { ok: false, errors: ["Comparison source has no matching declared coordinate frame."] };
  const frame = frameFrom(member);
  const position = [pick.point.x, pick.point.y, pick.point.z];
  if (!frame || !position.every(value => Number.isFinite(value) && Math.abs(value) <= 1e12))
    return { ok: false, errors: ["Comparison pick has invalid physical coordinates."] };
  return { ok: true, value: { source: viewerSourceFromDocument(document), sourceModule: entry.module,
    frame, position, resourceSha256: document.format === "math3d.mesh-document" ?
      document.source.resource.checksum.slice(7) : null, mode: "locked", originViewId } };
}

/** Adopt a cursor from one current comparison member only as a coordinate marker in the other. */
export function compositionCursorProbe(project: Math3DProject, members: readonly CoordinateProbeMember[],
  cursor: ProjectScientificCursor): LinkedCoordinateProbe | null {
  const entry = project.workspace.entries.find(item => item.expected.id === cursor.source.documentId);
  const source = members.filter(member => member.id === cursor.source.documentId &&
    member.revision === cursor.source.revision && member.hash === cursor.source.structuralHash);
  if (!entry || source.length !== 1 || !["surface", "mesh"].includes(entry.module) ||
      entry.module !== cursor.sourceModule || !matchesScientificSourceGeneration(cursor.source,
        viewerSourceFromDocument({ identity: entry.expected }))) return null;
  const document = verifyMixedWorkspaceReplay(project.workspace).get(entry.expected.id);
  if (!document || !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(document))) return null;
  if (document.format === "math3d.mesh-document" &&
      cursor.resourceSha256 !== document.source.resource.checksum.slice(7) ||
      document.format !== "math3d.mesh-document" && cursor.resourceSha256 !== null) return null;
  const declaration = readProjectCoordinateFrame(document);
  if (declaration.status !== "declared" || !declaration.value || source[0]!.coordinates.status !== "declared" ||
      !source[0]!.coordinates.value || !sameProjectCoordinateFrame(declaration.value, source[0]!.coordinates.value)) return null;
  const expectedFrame = frameFrom(source[0]!);
  if (!expectedFrame || !sameAdapterFrame(cursor.frame, expectedFrame) || cursor.position.length !== 3 ||
      !cursor.position.every(value => Number.isFinite(value) && Math.abs(value) <= 1e12)) return null;
  return resolveLinkedCoordinateProbe(members, { memberId: source[0]!.id, revision: source[0]!.revision,
    hash: source[0]!.hash, point: { x: cursor.position[0]!, y: cursor.position[1]!, z: cursor.position[2]! } });
}
