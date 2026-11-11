import { matchesScientificSourceGeneration, normalizeProjectNoteAnchor, structuralHash, upsertProjectStudy,
  viewerSourceFromDocument, type Math3DProject, type MixedWorkspaceDocument, type ProjectNoteAnchor,
  type StudyRecordV1 } from "@math3d/core";

const qwzPin = /^qwz:band-0:([a-f0-9]{64}):(0|[1-9][0-9]{0,6})$/;
const scientificPin = /^selection:sha256:[a-f0-9]{64}$/;

/** A saved scientific selection is addressed by its complete content hash and owning member. */
export function qualifyStudyScientificSelectionPin(workspace: MixedWorkspaceDocument, study: StudyRecordV1,
  pin: string) {
  if (!scientificPin.test(pin) || !study.pinnedSelectionIds.includes(pin)) return null;
  const selection = workspace.scientificSelections?.find(item => item.identity.kind === "authored" &&
    `selection:${structuralHash(item)}` === pin);
  if (!selection || selection.source?.kind !== "document" || !selection.source.checkpoint) return null;
  const source = selection.source;
  const owner = study.members.find(item => item.documentId === source.documentId);
  if (!owner || owner.expected.revision !== selection.source.checkpoint.revision ||
    owner.expected.structuralHash !== selection.source.checkpoint.structuralHash) return null;
  return { selection, memberId: owner.memberId };
}

export function pinProjectStudyScientificSelection(project: Math3DProject, studyId: string,
  selectionId: string): Math3DProject {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  const selection = project.workspace.scientificSelections?.find(item =>
    item.identity.kind === "authored" && item.identity.id === selectionId);
  if (!study || !selection || selection.source?.kind !== "document" || !selection.source.checkpoint)
    throw new TypeError("Saved source-bound Study selection is unavailable.");
  const source = selection.source;
  const owner = study.members.find(item => item.documentId === source.documentId);
  const entry = project.workspace.entries.find(item => item.expected.id === owner?.documentId);
  if (!owner || !entry || owner.expected.revision !== selection.source.checkpoint.revision ||
    owner.expected.structuralHash !== selection.source.checkpoint.structuralHash ||
    entry.expected.revision !== owner.expected.revision || entry.expected.structuralHash !== owner.expected.structuralHash)
    throw new TypeError("Study selection source generation changed.");
  const pin = `selection:${structuralHash(selection)}`;
  return upsertProjectStudy(project, { ...study,
    pinnedSelectionIds: [...new Set([...study.pinnedSelectionIds, pin])] });
}

/** Bind a Note to a saved pin and the member that owns it, without copying scene values. */
export function createProjectStudySelectionNoteAnchor(project: Math3DProject, studyId: string,
  memberId: string, selectionId: string): Extract<ProjectNoteAnchor, { kind: "study-selection" }> {
  const study = project.workspace.studies?.find(item => item.id === studyId);
  if (!study || study.projectId !== project.identity.id)
    throw new TypeError("Study is unavailable in this Project.");
  if (!study.pinnedSelectionIds.includes(selectionId))
    throw new TypeError("The selected Study pin is unavailable.");
  if (scientificPin.test(selectionId) &&
    qualifyStudyScientificSelectionPin(project.workspace, study, selectionId)?.memberId !== memberId)
    throw new TypeError("The scientific selection is missing or belongs to another Study member.");
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
