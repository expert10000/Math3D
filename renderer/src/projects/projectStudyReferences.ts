import type { Math3DProject, StudyRecordV1 } from "@math3d/core";
import { inspectNotebookReference, normalizeNotebookReference,
  type NotebookReference, type WorkbookStageId } from "@math3d/workbook";
import { readProjectWorkbook } from "./projectWorkbookBinding";

export type ProjectStudyWorkbookReference = Readonly<{
  workbookId: string;
  title: string;
  stageId: WorkbookStageId;
  blockId: string;
  status: "current" | "historical";
  reason: string;
}>;

/** Only checksum-qualified structured Workbook citations establish a reverse Study link. */
export function projectStudyWorkbookReferences(project: Math3DProject, study: StudyRecordV1,
  workbookBytes: (id: string) => Uint8Array | null): readonly ProjectStudyWorkbookReference[] {
  if (study.projectId !== project.identity.id) return [];
  const output: ProjectStudyWorkbookReference[] = [];
  for (const saved of project.workbooks ?? []) {
    let workbook;
    try {
      const bytes = workbookBytes(saved.id);
      if (!bytes) continue;
      workbook = readProjectWorkbook(bytes, saved);
    } catch { continue; }
    for (const stage of workbook.stages) for (const block of stage.blocks) {
      const candidates: NotebookReference[] = [];
      if (block.notebookReference) candidates.push(block.notebookReference);
      for (const dependency of workbook.dependencies ?? [])
        if (dependency.targetBlockId === block.id && dependency.source.kind === "project")
          candidates.push(dependency.source.reference);
      const linked = candidates.map(normalizeNotebookReference).filter(reference => reference?.kind === "study" &&
        reference.projectId === project.identity.id && reference.targetId === study.id);
      if (!linked.length) continue;
      const current = linked.some(reference => inspectNotebookReference(project, reference).status === "current");
      output.push({ workbookId: saved.id, title: `${saved.title} / ${block.title}`,
        stageId: stage.id, blockId: block.id, status: current ? "current" : "historical",
        reason: current ? "Workbook cites this exact Study and its current member generations." :
          "Workbook cites an earlier Study record or member generation." });
    }
  }
  return output;
}
