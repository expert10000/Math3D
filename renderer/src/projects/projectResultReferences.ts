import { matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument,
  type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";
import { inspectNotebookReference, type NotebookReference, type WorkbookStageId } from "@math3d/workbook";
import { readProjectWorkbook } from "./projectWorkbookBinding";

export type ProjectResultReference = Readonly<{ kind: "note" | "study" | "workbook";
  id: string; title: string; status: "current" | "historical";
  reason: string; stageId?: WorkbookStageId; blockId?: string }>;

/** Only structured Note anchors and value bindings establish a reverse Result link. */
export function resultNoteReferences(project: Math3DProject,
  result: AnalysisResultEnvelope): readonly ProjectResultReference[] {
  const hash = structuralHash(result);
  return (project.notes ?? []).flatMap(note => {
    if (note.projectId !== project.identity.id) return [];
    const anchors = [note.anchor?.kind === "result" ? note.anchor : null,
      ...(note.valueBindings ?? []).filter(binding => binding.kind === "result")];
    const linked = anchors.filter(anchor => anchor?.resultId === result.resultId);
    if (!linked.length) return [];
    const entry = project.workspace.entries.find(item =>
      item.expected.id === result.provenance.source.documentId);
    const current = entry && matchesScientificSourceGeneration(
      viewerSourceFromDocument({ identity: entry.expected }), result.provenance.source);
    const exact = !!current && linked.some(anchor => anchor?.resultHash === hash &&
      matchesScientificSourceGeneration(anchor.source, result.provenance.source));
    return [{ kind: "note" as const, id: note.identity.id, title: note.title,
      status: exact ? "current" as const : "historical" as const,
      reason: exact ? "Exact result anchor or value binding." :
        "The Note records this result ID with a different hash or a historical source generation." }];
  });
}

/** A Study backlink is current only when its member and Project source match the recorded result. */
export function resultStudyReferences(project: Math3DProject,
  result: AnalysisResultEnvelope): readonly ProjectResultReference[] {
  return (project.workspace.studies ?? []).flatMap(study => {
    if (study.projectId !== project.identity.id) return [];
    const members = study.members.filter(member => member.resultId === result.resultId);
    if (!members.length) return [];
    const exact = members.some(member => {
      const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
      return member.documentId === result.provenance.source.documentId && !!entry &&
        matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: member.expected }),
          result.provenance.source) &&
        matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: entry.expected }),
          result.provenance.source);
    });
    return [{ kind: "study" as const, id: study.id, title: study.title,
      status: exact ? "current" as const : "historical" as const,
      reason: exact ? "Study member and Project source match the saved result generation." :
        "The Study references this result ID but its member or current source generation differs." }];
  });
}

/** Read only checksum-qualified Workbook payloads; prose and absent resources imply no backlink. */
export function resultWorkbookReferences(project: Math3DProject, result: AnalysisResultEnvelope,
  workbookBytes: (id: string) => Uint8Array | null): readonly ProjectResultReference[] {
  const references: ProjectResultReference[] = [];
  for (const saved of project.workbooks ?? []) {
    let workbook;
    try { const bytes = workbookBytes(saved.id); if (!bytes) continue;
      workbook = readProjectWorkbook(bytes, saved); }
    catch { continue; }
    for (const stage of workbook.stages) for (const block of stage.blocks) {
      const candidates: NotebookReference[] = [];
      if (block.notebookReference) candidates.push(block.notebookReference);
      for (const edge of workbook.dependencies ?? []) if (edge.targetBlockId === block.id &&
          edge.source.kind === "project") candidates.push(edge.source.reference);
      for (const evidence of block.claim?.evidence ?? []) if (evidence.kind === "result")
        candidates.push(evidence.reference);
      for (const snapshot of [block.visualize?.snapshot, block.visualize?.snapshotA,
        block.visualize?.snapshotB]) for (const item of snapshot?.provenance?.results ?? [])
        candidates.push(item.reference);
      const linked = candidates.filter(candidate => candidate.kind === "result" &&
        candidate.projectId === project.identity.id && candidate.targetId === result.resultId);
      if (!linked.length) continue;
      const exact = linked.some(candidate => inspectNotebookReference(project, candidate).status === "current");
      references.push({ kind: "workbook", id: saved.id, title: `${saved.title} / ${block.title}`,
        stageId: stage.id, blockId: block.id,
        status: exact ? "current" : "historical",
        reason: exact ? "Checked Workbook block cites the current result generation." :
          "The checked Workbook block cites this result ID at a historical or unavailable generation." });
    }
  }
  return references;
}
