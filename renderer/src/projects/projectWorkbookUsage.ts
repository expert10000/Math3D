import type { Math3DProject } from "@math3d/core";
import { inspectNotebookReference, type NotebookReference, type WorkbookStageId } from "@math3d/workbook";
import { readProjectWorkbook } from "./projectWorkbookBinding";

export type ProjectWorkbookUse = {
  workbookId: string;
  workbookTitle: string;
  stageId: WorkbookStageId;
  blockId: string;
  blockTitle: string;
  status: "current" | "stale" | "missing";
};

/** Resolve only verified Workbook payloads; a citation is not inferred from prose. */
export function projectWorkbookUses(project: Math3DProject, documentId: string, bytesFor: (id: string) => Uint8Array | null):
  { uses: ProjectWorkbookUse[]; unavailable: number } {
  const uses: ProjectWorkbookUse[] = [];
  let unavailable = 0;
  for (const reference of project.workbooks ?? []) {
    const bytes = bytesFor(reference.id);
    if (!bytes) { unavailable++; continue; }
    let workbook;
    try { workbook = readProjectWorkbook(bytes, reference); }
    catch { unavailable++; continue; }
    for (const stage of workbook.stages) for (const block of stage.blocks) {
      const citations: NotebookReference[] = [block.notebookReference, ...(workbook.dependencies ?? [])
        .filter(edge => edge.targetBlockId === block.id && edge.source.kind === "project")
        .map(edge => edge.source.kind === "project" ? edge.source.reference : null)]
        .filter((item): item is NotebookReference => !!item && item.projectId === project.identity.id && item.source.documentId === documentId);
      const statuses = citations.map(item => inspectNotebookReference(project, item).status);
      const snapshots = [block.visualize?.snapshot, block.visualize?.snapshotA, block.visualize?.snapshotB];
      for (const snapshot of snapshots) if (snapshot?.provenance?.projectId === project.identity.id && snapshot.provenance.viewerSource?.documentId === documentId) {
        const source = snapshot.provenance.viewerSource;
        const current = project.workspace.entries.find(entry => entry.expected.id === documentId)?.expected;
        statuses.push(current && current.revision === source.revision && current.structuralHash === source.structuralHash ? "current" : "stale");
      }
      if (!statuses.length) continue;
      uses.push({ workbookId: reference.id, workbookTitle: reference.title, stageId: stage.id, blockId: block.id,
        blockTitle: block.title, status: statuses.includes("current") ? "current" : statuses.includes("stale") ? "stale" : "missing" });
    }
  }
  return { uses, unavailable };
}
