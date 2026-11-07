import type { Math3DProject } from "./math3dProject";
import type { KernelWorkspaceModule } from "./mixedWorkspace";
import { viewerSourceFromDocument } from "./viewerProvenance";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION = 1 as const;
export type ProjectOpenInActionId = "graph2d.promote-curve" | "graph2d.promote-geometry";
export type ProjectOpenInAction = Readonly<{
  schemaVersion: typeof PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION;
  id: ProjectOpenInActionId | "unavailable";
  source: ScientificSourceGeneration;
  sourceModule: KernelWorkspaceModule;
  sourceObjectId: string | null;
  targetModule: KernelWorkspaceModule;
  label: string;
  preview: string;
  enabled: boolean;
  disabledReason: string | null;
}>;

const unavailable = (source: ScientificSourceGeneration, sourceModule: KernelWorkspaceModule,
  targetModule: KernelWorkspaceModule, reason: string): ProjectOpenInAction => ({
  schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, id: "unavailable", source, sourceModule,
  sourceObjectId: null, targetModule, label: `Open in ${targetModule === "graph2d" ? "Graphs" :
    targetModule === "vector3d" ? "Field Explorer" : targetModule[0]!.toUpperCase() + targetModule.slice(1)}`,
  preview: "No derived document will be created.", enabled: false, disabledReason: reason,
});

/** Lists only bounded transformations whose existing producers retain exact source lineage. */
export const projectOpenInActions = (project: Math3DProject, sourceDocumentId: string): readonly ProjectOpenInAction[] => {
  const entry = project.workspace.entries.find(item => item.expected.id === sourceDocumentId);
  if (!entry) return [];
  const source = viewerSourceFromDocument(entry.checkpoint);
  const archived = !!project.metadata.documents?.[sourceDocumentId]?.archived;
  if (entry.module !== "graph2d" || entry.checkpoint.format !== "math3d.graph2d-document") {
    const target = entry.module === "surface" ? "mesh" : entry.module === "mesh" ? "geometry" :
      entry.module === "vector3d" || entry.module === "field" ? "graph2d" :
      entry.module === "quantum" ? "graph2d" : "surface";
    return [unavailable(source, entry.module, target, archived ? "Restore this archived source first." :
      "This destination needs a qualified source adapter in its module. Use the existing module action until one is registered here.")];
  }
  const objects = entry.checkpoint.source.objects.filter(object =>
    object.kind === "explicit-cartesian" || object.kind === "parametric");
  if (!objects.length) return [unavailable(source, "graph2d", "curve",
    archived ? "Restore this archived source first." : "No explicit or parametric Graph object can be promoted.")];
  return objects.flatMap(object => ([
    { id: "graph2d.promote-curve" as const, targetModule: "curve" as const,
      label: `Open “${object.label}” in Curves`,
      preview: "Creates an editable Curve from the current expression and domain; records a promoted-from relation. Coordinates remain unitless." },
    { id: "graph2d.promote-geometry" as const, targetModule: "geometry" as const,
      label: `Open “${object.label}” in Geometry`,
      preview: "Creates bounded z=0 line segments from the current profile; records a promoted-from relation. Sampling is approximate and unitless." },
  ]).map(action => ({ schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, ...action,
    source, sourceModule: "graph2d" as const, sourceObjectId: object.id,
    enabled: !archived, disabledReason: archived ? "Restore this archived source first." : null })));
};
