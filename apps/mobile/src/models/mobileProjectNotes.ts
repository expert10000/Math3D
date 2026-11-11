import { createProjectNote, serializeMath3DProject, structuralHash,
  updateProjectNote, upsertMath3DProjectNote, VerifiedProjectResources, type ProjectNoteAnchor } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { mobileProjectResourceContext } from "./mobileProjectResources";
import { readMobilePreviewProject } from "./mobileProjectPreview";

export type MobileProjectNoteInput = {
  noteId?: string;
  title: string;
  body: string;
  workbookBlock?: { workbookId: string; blockId: string };
};

/** Update only the named Project Note record; linked documents and resource bytes stay intact. */
export const saveMobileProjectNote = (stored: MobileStoredSceneProject, input: MobileProjectNoteInput, now = Date.now()): MobileStoredSceneProject => {
  const project = readMobilePreviewProject(stored);
  const title = input.title.trim(), body = input.body.trim();
  if (!title || !body) throw new TypeError("Enter a Note title and body.");
  if (input.noteId && input.workbookBlock) throw new TypeError("Editing a Note cannot silently change its target.");
  let note;
  if (input.noteId) {
    const existing = project.notes?.find(item => item.identity.id === input.noteId);
    if (!existing) throw new TypeError("This Note is no longer in the Project.");
    note = updateProjectNote(existing, { title, body }, Math.max(now, existing.updatedAt));
  } else {
    let anchor: ProjectNoteAnchor | null = null;
    if (input.workbookBlock) {
      const reference = project.workbooks?.find(item => item.id === input.workbookBlock!.workbookId);
      if (!reference) throw new TypeError("Workbook is not in this Project.");
      const resources = new VerifiedProjectResources(project, stored.projectResources ?? [], mobileProjectResourceContext);
      const bytes = resources.bytes({ kind: "workbook-payload", id: reference.id });
      if (!bytes) throw new TypeError("Import the Workbook resource before attaching a Note to its block.");
      const workbook = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as { stages: { blocks: { id: string }[] }[] };
      const block = workbook.stages.flatMap(stage => stage.blocks).find(item => item.id === input.workbookBlock!.blockId);
      if (!block) throw new TypeError("Workbook block is unavailable.");
      anchor = { kind: "workbook-block", workbookId: reference.id, workbookRevision: reference.revision,
        blockId: block.id, blockHash: structuralHash(block) };
    }
    note = createProjectNote({ projectId: project.identity.id, stableKey: ["mobile", now, project.notes?.length ?? 0, title],
      kind: "text", title, body, anchor, createdAt: now });
  }
  const nextProject = upsertMath3DProjectNote(project, note);
  const next = { ...stored, updatedAt: now, serializedProject: serializeMath3DProject(nextProject) };
  readMobilePreviewProject(next);
  return next;
};
