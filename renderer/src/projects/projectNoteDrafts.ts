import { createProjectNote, structuralHash, upsertMath3DProjectNote,
  type Math3DProject, type MixedWorkspaceDocument, type ProjectNoteAnchor } from "@math3d/core";

export type ProjectNoteDraft = Readonly<{
  id: string; title: string; body: string; anchor: ProjectNoteAnchor | null; createdAt: number;
}>;
export type NoteCaptureKind = "global" | "selection" | "result";

/** A draft has no Project identity until it is saved into a named Project. */
export const createProjectNoteDraft = (kind: NoteCaptureKind, workspace: MixedWorkspaceDocument, id: string, createdAt: number): ProjectNoteDraft => {
  if (!id || !Number.isSafeInteger(createdAt) || createdAt < 0) throw new TypeError("Invalid Note draft identity or time.");
  if (kind === "selection") {
    const selection = workspace.committedSelection;
    if (!selection?.entityIds.length) throw new TypeError("Commit a selection before capturing a Note.");
    return { id, title: "Selection observation", body: `Selected: ${selection.entityIds.join(", ")}. Add your observation.`,
      anchor: { kind: "document", source: selection.source }, createdAt };
  }
  if (kind === "result") {
    const result = workspace.results.at(-1);
    if (!result) throw new TypeError("Save an analysis result before capturing a Note.");
    return { id, title: "Result observation", body: "Add your observation about this result.",
      anchor: { kind: "result", source: result.provenance.source, resultId: result.resultId, resultHash: structuralHash(result) }, createdAt };
  }
  return { id, title: "New Note", body: "Add your observation.", anchor: null, createdAt };
};

export const bindProjectNoteDrafts = (project: Math3DProject, drafts: readonly ProjectNoteDraft[]): Math3DProject => {
  let next = project;
  for (const draft of drafts) {
    const note = createProjectNote({ projectId: project.identity.id, stableKey: draft.id, kind: "text",
      title: draft.title.trim(), body: draft.body, anchor: draft.anchor, createdAt: draft.createdAt });
    next = upsertMath3DProjectNote(next, note);
  }
  return next;
};
