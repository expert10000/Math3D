import { extrudeGraph2DProfile, promoteGraph2DToCurve, promoteGraph2DToGeometry,
  revolveGraph2DProfile } from "./graph2dInterop";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { replaceMath3DProjectWorkspace, type Math3DProject } from "./math3dProject";
import { projectOpenInActions, type ProjectOpenInAction } from "./projectOpenInActions";
import { matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import { viewerSourceFromDocument } from "./viewerProvenance";
import type { DocumentRelationId } from "./documentRelations";
import type { KernelWorkspaceModule } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";

export type ProjectOpenInDerivation = Readonly<{
  project: Math3DProject;
  sourceDocumentId: string;
  targetDocumentId: string;
  targetModule: "curve" | "geometry" | "surface";
  relationId: DocumentRelationId;
  existing: boolean;
}>;

/** Requalifies at execution time; the UI descriptor is never an authority to mutate a Project. */
export const deriveProjectOpenIn = (project: Math3DProject, choice: ProjectOpenInAction): ProjectOpenInDerivation => {
  if (!choice.enabled || !choice.sourceObjectId || choice.id === "unavailable")
    throw new TypeError(choice.disabledReason ?? "Open in action is unavailable.");
  const entry = project.workspace.entries.find(item => item.expected.id === choice.source.documentId);
  if (!entry || entry.module !== "graph2d" || entry.checkpoint.format !== "math3d.graph2d-document")
    throw new TypeError("The Graph source is unavailable.");
  if (!matchesScientificSourceGeneration(viewerSourceFromDocument(entry.checkpoint), choice.source))
    throw new TypeError("The Graph source changed; review Open in destinations again.");
  const qualified = projectOpenInActions(project, entry.expected.id).find(action => action.id === choice.id &&
    action.sourceObjectId === choice.sourceObjectId && action.enabled && action.targetModule === choice.targetModule);
  if (!qualified) throw new TypeError("This Open in action is no longer qualified.");
  const promotion = choice.id === "graph2d.promote-curve" ?
    promoteGraph2DToCurve(entry.checkpoint, choice.sourceObjectId) :
    choice.id === "graph2d.promote-geometry" ?
      promoteGraph2DToGeometry(entry.checkpoint, choice.sourceObjectId) :
      choice.id === "graph2d.revolve-surface" ?
        revolveGraph2DProfile(entry.checkpoint, choice.sourceObjectId, { axis: "x", orientation: "positive" }) :
        extrudeGraph2DProfile(entry.checkpoint, choice.sourceObjectId,
          { direction: [0, 0, 1], length: 1, caps: "none" });
  const targetModule = choice.id === "graph2d.promote-curve" ? "curve" :
    choice.id === "graph2d.promote-geometry" ? "geometry" : "surface";
  const target = promotion.document;
  const existing = project.workspace.entries.find(item => item.expected.id === target.identity.id);
  if (existing) {
    const relation = project.workspace.relations.find(item => item.relationId === promotion.relation.relationId);
    if (!relation || existing.module !== targetModule ||
        !matchesScientificSourceGeneration(viewerSourceFromDocument(existing.checkpoint),
          viewerSourceFromDocument(target)))
      throw new TypeError("A companion with this identity has changed. Use the dependency refresh flow to fork it.");
    return { project, sourceDocumentId: entry.expected.id, targetDocumentId: existing.expected.id,
      targetModule, relationId: relation.relationId, existing: true };
  }
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: targetModule, checkpoint: target,
      expected: target.identity, replay: null }],
    activeDocumentIds: [...new Set([...project.workspace.activeDocumentIds, target.identity.id])],
    relations: [...project.workspace.relations, promotion.relation] });
  return { project: replaceMath3DProjectWorkspace(project, workspace),
    sourceDocumentId: entry.expected.id, targetDocumentId: target.identity.id,
    targetModule, relationId: promotion.relation.relationId, existing: false };
};

/** Link an already saved physical Field profile row to its exact source; no values are computed here. */
export const linkProjectFieldProfileGraph = (project: Math3DProject, choice: ProjectOpenInAction) => {
  if (choice.id !== "vector3d.open-profile-graph" || !choice.enabled || !choice.sourceObjectId ||
      !choice.targetDocumentId)
    throw new TypeError(choice.disabledReason ?? "Field profile Graph action is unavailable.");
  const source = project.workspace.entries.find(item => item.expected.id === choice.source.documentId &&
    item.module === "vector3d");
  if (!source || !matchesScientificSourceGeneration(viewerSourceFromDocument(source.checkpoint), choice.source))
    throw new TypeError("The Field source changed; review Open in destinations again.");
  const qualified = projectOpenInActions(project, source.expected.id, {
    fieldGraph: { available: true, reason: null } }).find(action => action.id === choice.id &&
      action.sourceObjectId === choice.sourceObjectId && action.targetDocumentId === choice.targetDocumentId &&
      action.enabled);
  if (!qualified) throw new TypeError("This Field profile Graph action is no longer qualified.");
  const target = project.workspace.entries.find(item => item.expected.id === choice.targetDocumentId &&
    item.module === "graph2d");
  if (!target) throw new TypeError("The saved Graph document is unavailable.");
  const relation = createDocumentRelation({ kind: "derived-from", sources: [choice.source],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(target.checkpoint) },
    operation: "vector3d.open-profile-graph", parameters: { objectId: choice.sourceObjectId } });
  const existing = project.workspace.relations.some(item => item.relationId === relation.relationId);
  if (existing) return { project, targetDocumentId: target.expected.id, existing: true };
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    relations: [...project.workspace.relations, relation] });
  return { project: replaceMath3DProjectWorkspace(project, workspace), targetDocumentId: target.expected.id,
    existing: false };
};

export type ProjectOpenInReturn = Readonly<{
  sourceDocumentId: string;
  sourceModule: KernelWorkspaceModule;
  recordedSource: ScientificSourceGeneration;
  exact: boolean;
  reason: string | null;
  relationId: DocumentRelationId;
}>;

/** Resolve the saved relation rather than a temporary UI navigation stack. */
export const projectOpenInReturn = (project: Math3DProject, targetDocumentId: string): ProjectOpenInReturn | null => {
  const target = project.workspace.entries.find(item => item.expected.id === targetDocumentId);
  if (!target) return null;
  const relation = project.workspace.relations.find(item => item.target.type === "document" &&
    item.target.generation.documentId === targetDocumentId &&
    matchesScientificSourceGeneration(item.target.generation, viewerSourceFromDocument(target.checkpoint)) &&
    (item.operation === "graph2d.promote-curve" || item.operation === "graph2d.promote-geometry" ||
      item.operation === "graph2d.revolve-surface" || item.operation === "graph2d.extrude-surface" ||
      item.operation === "surface.tessellate-saved" || item.operation === "quantum.promote-graph2d" ||
      item.operation === "quantum.promote-curve" ||
      item.operation === "mesh.promote-geometry" || item.operation === "vector3d.open-profile-graph") &&
    item.sources.length === 1);
  if (!relation) return null;
  const recordedSource = relation.sources[0]!;
  const sourceModule: KernelWorkspaceModule = relation.operation === "surface.tessellate-saved" ? "surface" :
    relation.operation === "quantum.promote-graph2d" || relation.operation === "quantum.promote-curve" ? "quantum" :
    relation.operation === "mesh.promote-geometry" ? "mesh" :
    relation.operation === "vector3d.open-profile-graph" ? "vector3d" : "graph2d";
  const source = project.workspace.entries.find(item => item.expected.id === recordedSource.documentId && item.module === sourceModule);
  const exact = !!source && matchesScientificSourceGeneration(viewerSourceFromDocument(source.checkpoint), recordedSource);
  return { sourceDocumentId: recordedSource.documentId, sourceModule, recordedSource,
    exact, reason: exact ? null : source ? "The original source generation is historical. Open its current version from the Project navigator." :
      "The original source is unavailable in this Project.", relationId: relation.relationId };
};
