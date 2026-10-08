import type { MixedWorkspaceDocument, KernelWorkspaceModule } from "@math3d/core";
export function relatedDocuments(workspace: MixedWorkspaceDocument | undefined, id: string | null, documents?: ReadonlyMap<string, { identity: MixedWorkspaceDocument["entries"][number]["expected"] }>) {
  const related = new Map<string, { id: string; module: KernelWorkspaceModule; label: string }>();
  if (!workspace || !id) return [];
  for (const relation of workspace.relations) {
    if (relation.target.type !== "document") continue;
    const target = relation.target.generation;
    const generations = target.documentId === id ? relation.sources.map(source => ({ source, role: "Source" }))
      : relation.sources.some(source => source.documentId === id) ? [{ source: target, role: "Derived" }] : [];
    for (const { source, role } of generations) {
      const entry = workspace.entries.find(entry => entry.expected.id === source.documentId);
      if (!entry) continue;
      const current = documents?.get(entry.expected.id)?.identity ?? entry.expected;
      const historical = current.revision !== source.revision || current.structuralHash !== source.structuralHash;
      related.set(entry.expected.id, { id: entry.expected.id, module: entry.module,
        label: `${role} ${entry.module} · ${historical ? `current r${current.revision} (captured r${source.revision})` : `r${source.revision}`}` });
    }
  }
  return [...related.values()];
}
