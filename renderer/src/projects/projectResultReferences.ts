import { matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument,
  type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";

export type ProjectResultReference = Readonly<{ kind: "note" | "study" | "workbook";
  id: string; title: string; status: "current" | "historical";
  reason: string; stageId?: string; blockId?: string }>;

/** Only structured Note anchors and value bindings establish a reverse Result link. */
export function resultNoteReferences(project: Math3DProject,
  result: AnalysisResultEnvelope): readonly ProjectResultReference[] {
  const hash = structuralHash(result);
  return (project.notes ?? []).flatMap(note => {
    const anchors = [note.anchor?.kind === "result" ? note.anchor : null,
      ...(note.valueBindings ?? []).filter(binding => binding.kind === "result")];
    const linked = anchors.filter(anchor => anchor?.resultId === result.resultId);
    if (!linked.length) return [];
    const exact = linked.some(anchor => anchor?.resultHash === hash &&
      matchesScientificSourceGeneration(anchor.source, result.provenance.source));
    return [{ kind: "note" as const, id: note.identity.id, title: note.title,
      status: exact ? "current" as const : "historical" as const,
      reason: exact ? "Exact result anchor or value binding." :
        "The Note records this result ID with a different source generation or result hash." }];
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
