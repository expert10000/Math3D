import { createMixedWorkspaceDocument, evaluateDocumentRelationStatus, regenerateGraph2DPromotion, replaceMath3DProjectWorkspace,
  serializeMath3DProject, setProjectDocumentMetadata, viewerSourceFromDocument,
  type Graph2DCurvePromotion, type Math3DProject } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobilePreviewProject } from "./mobileProjectPreview";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";
import { readMobileProjectResources } from "./mobileProjectResources";
import { sampleMobileCurve } from "./mobileProjectCurve";

const planRefresh = (stored: MobileStoredSceneProject, project: Math3DProject, relationId: string) => {
  const relation = project.workspace.relations.find(item => item.relationId === relationId);
  if (!relation || relation.operation !== "graph2d.promote-curve" || relation.sources.length !== 1 || relation.sourceOrder !== "ordered" || relation.target.type !== "document")
    throw new TypeError("This relation has no qualified mobile Graph-to-Curve refresh adapter.");
  const documents = resolveMobileProjectWorkspace(project.workspace);
  const graph = documents.get(relation.sources[0]!.documentId), curve = documents.get(relation.target.generation.documentId);
  if (graph?.format !== "math3d.graph2d-document" || curve?.format !== "math3d.curve-document") throw new TypeError("The original Graph or Curve is unavailable.");
  if ([graph.identity.id, curve.identity.id].some(id => project.metadata.documents?.[id]?.archived)) throw new TypeError("Archived documents cannot be refreshed.");
  if (evaluateDocumentRelationStatus(relation, id => { const document = documents.get(id); return document ? viewerSourceFromDocument(document) : null; }) !== "stale")
    throw new TypeError("The Graph source has not changed; no refresh is needed.");
  if (readMobileProjectResources(stored).inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(graph.identity.id) && !item.available))
    throw new TypeError("Import missing Graph source tables before refreshing.");
  const parameters = relation.parameters as Record<string, unknown>;
  if (!parameters || typeof parameters.sourceObjectId !== "string") throw new TypeError("The saved Graph object is unavailable.");
  const promotion: Graph2DCurvePromotion = { document: curve, relation, trace: {
    operation: "graph2d.promote-curve", sourceDocumentId: graph.identity.id, sourceRevision: relation.sources[0]!.revision,
    sourceObjectId: parameters.sourceObjectId, targetDocumentId: curve.identity.id, expressionMap: curve.source.definition.expressions ?? {} } };
  const next = regenerateGraph2DPromotion(promotion, graph, "fork");
  if (next.document.format !== "math3d.curve-document") throw new TypeError("Refresh must produce a Curve.");
  sampleMobileCurve(next.document.source);
  if (project.workspace.entries.some(entry => entry.expected.id === next.document.identity.id)) throw new TypeError("This refreshed Curve already exists for the current Graph source.");
  return { next, originalId: curve.identity.id };
};
export const mobileProjectRefreshOptions = (stored: MobileStoredSceneProject) => {
  const project = readMobilePreviewProject(stored);
  return project.workspace.relations.filter(relation => relation.operation === "graph2d.promote-curve").map(relation => {
    try { planRefresh(stored, project, relation.relationId); return { relationId: relation.relationId, canRefresh: true, reason: "Creates a new Curve from the current Graph; previous documents and analysis remain historical." }; }
    catch (error) { return { relationId: relation.relationId, canRefresh: false, reason: (error as Error).message }; }
  });
};
/** Pure plan. The controller persists the full container before replacing any active session. */
export const refreshMobileProjectCurve = (stored: MobileStoredSceneProject, relationId: string, now = Date.now()): MobileStoredSceneProject => {
  const project = readMobilePreviewProject(stored), { next, originalId } = planRefresh(stored, project, relationId);
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: "curve", checkpoint: next.document, expected: next.document.identity, replay: null }],
    relations: [...project.workspace.relations, next.relation] });
  const title = project.metadata.documents?.[originalId]?.title ?? next.document.metadata.title;
  const updated = setProjectDocumentMetadata(replaceMath3DProjectWorkspace(project, workspace), next.document.identity.id,
    { title: `${title.slice(0, 140)} refreshed`, archived: false });
  const result = { ...stored, updatedAt: now, serializedProject: serializeMath3DProject(updated) };
  readMobilePreviewProject(result); return result;
};
