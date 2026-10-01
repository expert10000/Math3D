import { normalizeMath3DProject, type Math3DProject } from "./math3dProject";
import type { KernelWorkspaceDocument, KernelWorkspaceModule } from "./mixedWorkspace";

export const PROJECT_EXPLORER_MODULES: readonly KernelWorkspaceModule[] = ["graph2d", "geometry", "curve", "surface", "mesh", "volume", "topology", "complex"];
export const PROJECT_MODULE_LABELS: Record<KernelWorkspaceModule, string> = {
  graph2d: "Graph", geometry: "Geometry", curve: "Curve", surface: "Surface", mesh: "Mesh", volume: "Volume", topology: "Topology", complex: "Complex Analysis",
};
export type ProjectExplorerDocument = Readonly<{ id: string; module: KernelWorkspaceModule; title: string; revision: number; active: boolean; archived: boolean }>;
const titleFor = (document: KernelWorkspaceDocument): string => {
  switch (document.format) {
    case "math3d.geometry-document": return document.metadata.title;
    case "math3d.mesh-document": return document.metadata.label;
    case "math3d.graph2d-document": return document.metadata.title;
    case "math3d.curve-document": return document.metadata.title;
    case "math3d.surface-document": return document.metadata.title;
    case "math3d.topology-document": return typeof document.source.model.name === "string" ? document.source.model.name : "Topology document";
    case "math3d.complex-analysis-document": return `f(z) = ${document.function.sourceText}`;
    case "math3d.volume-document": return document.metadata.title;
  }
};

/** Read-only projection. Result records are distinct from editable mathematical documents. */
export const buildProjectExplorer = (project: Math3DProject, resolved?: ReadonlyMap<string, KernelWorkspaceDocument>) => {
  const validated = normalizeMath3DProject(project);
  if (!validated.ok) throw new TypeError(validated.errors.join(" "));
  const workspace = validated.value.workspace;
  const documents: ProjectExplorerDocument[] = workspace.entries.map((entry) => {
    const document = resolved?.get(entry.expected.id) ?? (entry.replay === null ? entry.checkpoint : null);
    if (!document || document.identity.id !== entry.expected.id || document.identity.revision !== entry.expected.revision || document.identity.structuralHash !== entry.expected.structuralHash) {
      throw new TypeError(`Explorer requires verified replay for ${entry.expected.id}.`);
    }
    const metadata = validated.value.metadata.documents?.[entry.expected.id];
    return { id: entry.expected.id, module: entry.module, title: metadata?.title ?? (titleFor(document).trim().slice(0, 160) || PROJECT_MODULE_LABELS[entry.module]),
      revision: entry.expected.revision, active: workspace.activeDocumentIds.includes(entry.expected.id), archived: metadata?.archived ?? false };
  });
  return {
    groups: PROJECT_EXPLORER_MODULES.map((module) => ({ module, title: PROJECT_MODULE_LABELS[module], documents: documents.filter((document) => document.module === module) })),
    analysis: workspace.results.map((result) => ({ id: result.resultId, title: result.provenance.operation.type,
      authority: result.status, sourceDocumentId: result.provenance.source.documentId, sourceRevision: result.provenance.source.revision })),
  };
};
