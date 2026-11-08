import { matchesScientificSourceGeneration, viewerSourceFromDocument,
  type KernelWorkspaceDocument, type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export type StudyPaneResolution = Readonly<{ status: "ready"; document: KernelWorkspaceDocument;
  documents: ReadonlyMap<string, KernelWorkspaceDocument> } | {
  status: "withheld"; reason: string }>;

/** Resolve a pane only on demand; Study references never substitute a newer source generation. */
export function resolveStudyPane(project: Math3DProject, study: StudyRecordV1,
  paneId: string): StudyPaneResolution {
  if (study.projectId !== project.identity.id || !project.workspace.studies?.some(item => item.id === study.id))
    return { status: "withheld", reason: "Study is outside the current Project." };
  const pane = study.layout.panes.find(item => item.paneId === paneId);
  const member = study.members.find(item => item.memberId === pane?.memberId);
  if (!pane || !member) return { status: "withheld", reason: "Study pane has no saved member." };
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry) return { status: "withheld", reason: "Saved member document is missing." };
  if (!matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: member.expected }),
      viewerSourceFromDocument({ identity: entry.expected })))
    return { status: "withheld", reason: "Member source changed since this Study was saved." };
  try {
    const documents = verifyMixedWorkspaceReplay(project.workspace);
    const document = documents.get(member.documentId);
    if (!document || !matchesScientificSourceGeneration(viewerSourceFromDocument(document),
        viewerSourceFromDocument({ identity: member.expected })))
      return { status: "withheld", reason: "Member replay did not reproduce its saved generation." };
    return { status: "ready", document, documents };
  } catch (error) {
    return { status: "withheld", reason: `Member replay unavailable: ${(error as Error).message}` };
  }
}
