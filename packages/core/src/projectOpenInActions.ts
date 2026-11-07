import type { Math3DProject } from "./math3dProject";
import type { KernelWorkspaceModule } from "./mixedWorkspace";
import { viewerSourceFromDocument } from "./viewerProvenance";
import type { ScientificSourceGeneration } from "./scientificJobs";
import { previewGraph2DRevolution } from "./graph2dInterop";
import { MAX_OPEN_IN_GEOMETRY_TRIANGLES } from "./projectMeshGeometry";

export const PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION = 1 as const;
export type ProjectOpenInActionId = "graph2d.promote-curve" | "graph2d.promote-geometry" |
  "graph2d.revolve-surface" | "surface.tessellate-saved" | "quantum.promote-graph2d" |
  "mesh.promote-geometry" | "quantum.promote-curve";
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
export const projectOpenInActions = (project: Math3DProject, sourceDocumentId: string,
  options: { surfaceMesh?: Readonly<{ available: boolean; reason: string | null }>;
    quantumGraph?: Readonly<{ available: boolean; reason: string | null }>;
    meshGeometry?: Readonly<{ available: boolean; reason: string | null }> } = {}): readonly ProjectOpenInAction[] => {
  const entry = project.workspace.entries.find(item => item.expected.id === sourceDocumentId);
  if (!entry) return [];
  const source = viewerSourceFromDocument(entry.checkpoint);
  const archived = !!project.metadata.documents?.[sourceDocumentId]?.archived;
  if (entry.module === "surface" && entry.checkpoint.format === "math3d.surface-document") {
    const reason = archived ? "Restore this archived source first." :
      options.surfaceMesh?.available ? null : options.surfaceMesh?.reason ??
        "The saved Surface sampler is unavailable on this host.";
    return [{ schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, id: "surface.tessellate-saved",
      source, sourceModule: "surface", sourceObjectId: null, targetModule: "mesh",
      label: "Open in Mesh Analysis", preview: "Creates a saved sampled Mesh snapshot with exact Surface lineage and verified source buffers. Sampling is numerical.",
      enabled: reason === null, disabledReason: reason }];
  }
  if (entry.module === "mesh" && entry.checkpoint.format === "math3d.mesh-document") {
    const resource = entry.checkpoint.source.resource;
    const elements = resource.indexCount || resource.vertexCount;
    const reason = archived ? "Restore this archived source first." :
      elements < 3 || elements % 3 !== 0 || elements / 3 > MAX_OPEN_IN_GEOMETRY_TRIANGLES ?
        `Geometry promotion requires 1–${MAX_OPEN_IN_GEOMETRY_TRIANGLES} complete Mesh triangles.` :
        options.meshGeometry?.available ? null : options.meshGeometry?.reason ??
          "The verified Mesh source buffers are unavailable on this host.";
    return [{ schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, id: "mesh.promote-geometry",
      source, sourceModule: "mesh", sourceObjectId: null, targetModule: "geometry",
      label: "Open in Geometry", preview: "Copies up to 4096 verified Mesh triangles into editable Geometry, preserving exact Mesh lineage and float32 source precision.",
      enabled: reason === null, disabledReason: reason }];
  }
  if (entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document") {
    const scene = entry.checkpoint;
    const linked = project.quantumScenes?.some(item =>
      item.sceneFingerprint === scene.source.sceneFingerprint);
    const polyline = scene.source.objects.some(item => item.kind === "polyline");
    const reason = archived ? "Restore this archived source first." : !linked ?
      "The exact external scene is not linked to this Project." : !polyline ?
        "This scene has no polyline that can become a Graph profile." :
        options.quantumGraph?.available ? null : options.quantumGraph?.reason ??
          "The scene verifier is unavailable on this host.";
    return [{ schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, id: "quantum.promote-graph2d",
      source, sourceModule: "quantum", sourceObjectId: null, targetModule: "graph2d",
      label: "Open in Graphs", preview: "Re-verifies the external scene, copies a bounded polyline into a Graph point table, and records exact scene lineage. The copy is numerical.",
      enabled: reason === null, disabledReason: reason },
    { schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, id: "quantum.promote-curve",
      source, sourceModule: "quantum", sourceObjectId: null, targetModule: "curve",
      label: "Open in Curves", preview: "Re-verifies the external scene and copies its bounded 3D polyline into an editable Curve with exact scene lineage. The copy is numerical.",
      enabled: reason === null, disabledReason: reason }];
  }
  if (entry.module !== "graph2d" || entry.checkpoint.format !== "math3d.graph2d-document") {
    const target = entry.module === "surface" ? "mesh" : entry.module === "mesh" ? "geometry" :
      entry.module === "vector3d" || entry.module === "field" ? "graph2d" :
      entry.module === "quantum" ? "graph2d" : "surface";
    return [unavailable(source, entry.module, target, archived ? "Restore this archived source first." :
      "This destination needs a qualified source adapter in its module. Use the existing module action until one is registered here.")];
  }
  const graph = entry.checkpoint;
  const objects = graph.source.objects.filter(object =>
    object.kind === "explicit-cartesian" || object.kind === "parametric");
  if (!objects.length) return [unavailable(source, "graph2d", "curve",
    archived ? "Restore this archived source first." : "No explicit or parametric Graph object can be promoted.")];
  return objects.flatMap(object => {
    let samplingReason: string | null = null;
    try { previewGraph2DRevolution(graph, object.id, { axis: "x", orientation: "positive" }); }
    catch (error) { samplingReason = (error as Error).message; }
    return ([
    { id: "graph2d.promote-curve" as const, targetModule: "curve" as const,
      label: `Open “${object.label}” in Curves`,
      preview: "Creates an editable Curve from the current expression and domain; records a promoted-from relation. Coordinates remain unitless." },
    { id: "graph2d.promote-geometry" as const, targetModule: "geometry" as const,
      label: `Open “${object.label}” in Geometry`,
      preview: "Creates bounded z=0 line segments from the current profile; records a promoted-from relation. Sampling is approximate and unitless." },
    { id: "graph2d.revolve-surface" as const, targetModule: "surface" as const,
      label: `Revolve “${object.label}” into Surfaces`,
      preview: "Revolves the profile around the x-axis through a full turn, creating an editable Surface with exact expression lineage. Coordinates are unitless." },
  ]).map(action => ({ schemaVersion: PROJECT_OPEN_IN_ACTION_SCHEMA_VERSION, ...action,
    source, sourceModule: "graph2d" as const, sourceObjectId: object.id,
    enabled: !archived && (action.id === "graph2d.promote-curve" || !samplingReason),
    disabledReason: archived ? "Restore this archived source first." :
      action.id === "graph2d.promote-curve" ? null : samplingReason }));
  });
};
