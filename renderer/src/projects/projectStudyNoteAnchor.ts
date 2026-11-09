import { matchesScientificSourceGeneration, normalizeProjectNoteAnchor, structuralHash,
  viewerSourceFromDocument, type Math3DProject, type ProjectNoteAnchor } from "@math3d/core";

const qwzPin = /^qwz:band-0:([a-f0-9]{64}):(0|[1-9][0-9]{0,6})$/;

/** Bind a Note to a saved pin and the member that owns it, without copying scene values. */
export function createProjectStudySelectionNoteAnchor(project: Math3DProject, studyId: string,
  memberId: string, selectionId: string): Extract<ProjectNoteAnchor, { kind: "study-selection" }> {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  if (!study || study.projectId !== project.identity.id)
    throw new TypeError("Study is unavailable in this Project.");
  if (!study.pinnedSelectionIds.includes(selectionId))
    throw new TypeError("The selected Study pin is unavailable.");
  const member = study.members.find(item => item.memberId === memberId);
  const entry = member && project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!member || !entry) throw new TypeError("The Study pin source member is unavailable.");
  const source = viewerSourceFromDocument({ identity: member.expected });
  if (!matchesScientificSourceGeneration(source, viewerSourceFromDocument({ identity: entry.expected })))
    throw new TypeError("The Study pin source generation changed.");
  if (selectionId.startsWith("qwz:")) {
    const match = qwzPin.exec(selectionId);
    if (!match || member.memberId !== "bands" || entry.module !== "quantum" ||
      entry.checkpoint.format !== "math3d.quantum-scene-document" ||
      entry.checkpoint.source.sceneFingerprint !== match[1])
      throw new TypeError("QWZ pin does not belong to this exact bands scene.");
  }
  const anchor = normalizeProjectNoteAnchor({ kind: "study-selection", source,
    studyId: study.id, studyHash: structuralHash(study), memberId, selectionId });
  if (!anchor || anchor.kind !== "study-selection") throw new TypeError("Study pin cannot form a Note anchor.");
  return anchor;
}
