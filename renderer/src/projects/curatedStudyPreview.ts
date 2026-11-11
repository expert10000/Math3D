import { inspectProjectNoteAnchor, inspectResearchReference, migrateLegacyStudyPaneResearchReference,
  type Math3DProject } from "@math3d/core";
import { assessProjectResearchCitation } from "./projectResearchCitation";
import { projectNoteSourceResolver } from "./projectNoteTargets";
import { readProjectWorkbook } from "./projectWorkbookBinding";
import type { VerifiedProjectResources } from "./projectResources";

/** Read-only Project evidence overview for a browser or mobile-sized Gallery preview. */
export function curatedStudyResearchPreview(project: Math3DProject, resources?: VerifiedProjectResources) {
  const reader = (item: Parameters<VerifiedProjectResources["bytes"]>[0]) => resources?.bytes(item) ?? null;
  const studies = (project.workspace.studies ?? []).flatMap(study => study.layout.panes.map(pane => {
    const member = study.members.find(item => item.memberId === pane.memberId)!;
    const reference = study.paneReferences?.find(item => item.paneId === pane.paneId)?.reference ??
      migrateLegacyStudyPaneResearchReference(study, pane.paneId);
    const checked = reference ? inspectResearchReference(project, reference, reader) : null;
    return { studyId: study.id, title: study.title, documentId: member.documentId,
      status: checked?.status ?? "missing", reason: checked?.reason ?? "Saved pane reference is unavailable." };
  }));
  const resolver = projectNoteSourceResolver(project.identity.id, project.workspace);
  const notes = (project.notes ?? []).map(note => {
    const anchor = inspectProjectNoteAnchor(note, resolver);
    const pin = note.anchor?.researchReference;
    const checked = pin ? inspectResearchReference(project, pin, reader) : null;
    return { id: note.identity.id, title: note.title,
      status: anchor.status !== "current" ? anchor.status : checked?.status ?? "unverified",
      reason: anchor.status !== "current" ? anchor.reason : checked?.reason ?? "Note has no saved resource pin." };
  });
  const citations = (project.workbooks ?? []).flatMap(saved => {
    try {
      const bytes = reader({ kind: "workbook-payload", id: saved.id });
      if (!bytes) return [{ workbookId: saved.id, title: saved.title, status: "missing", reason: "Workbook payload is missing." }];
      const book = readProjectWorkbook(bytes, saved);
      return book.stages.flatMap(stage => stage.blocks.filter(block => !!block.notebookReference).map(block => {
        const checked = assessProjectResearchCitation(project, block.notebookReference, reader);
        return { workbookId: saved.id, title: `${saved.title} / ${block.title}`,
          status: checked.status, reason: checked.reason };
      }));
    } catch {
      return [{ workbookId: saved.id, title: saved.title, status: "corrupt", reason: "Workbook payload failed verification." }];
    }
  });
  return { studies, notes, citations };
}
