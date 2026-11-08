import { matchesScientificSourceGeneration, viewerSourceFromDocument,
  type KernelWorkspaceModule, type Math3DProject, type ScientificSourceGeneration } from "@math3d/core";

export type ProjectResultSourceLink = Readonly<{
  status: "current" | "historical" | "missing";
  module: KernelWorkspaceModule | null;
  reason: string;
}>;

/** Prevents a saved result link from opening a newer editor generation as its source. */
export const projectResultSourceLink = (project: Math3DProject,
  source: ScientificSourceGeneration): ProjectResultSourceLink => {
  const entry = project.workspace.entries.find(item => item.expected.id === source.documentId);
  if (!entry) return { status: "missing", module: null,
    reason: "The recorded source document is missing from this Project." };
  if (!matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: entry.expected }), source))
    return { status: "historical", module: entry.module,
      reason: `This result uses revision ${source.revision}, generation ${source.generation}; the saved document is a different generation.` };
  return { status: "current", module: entry.module,
    reason: "The saved document matches the result's exact source generation." };
};
