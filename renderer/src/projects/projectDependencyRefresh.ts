import { createMixedWorkspaceDocument, regenerateGraph2DPromotion, replaceMath3DProjectWorkspace,
  analyzeGraph2DDerivative, createDocumentRelation, viewerSourceFromDocument,
  setProjectDocumentMetadata, type Math3DProject, type Graph2DAnyPromotion } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { inspectProjectDependencies } from "./projectDependencies";

const operations = new Set(["graph2d.promote-curve", "graph2d.revolve-surface", "graph2d.extrude-surface"]);
/** The first refresh adapter qualifies Graph-derived companions; other operations stay explicit. */
export const projectDependencyRefreshOptions = (project: Math3DProject) => {
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  return inspectProjectDependencies(project).relations.filter(relation => relation.freshness === "stale" && operations.has(relation.operation))
    .map(relation => {
      const graph = relation.sources.length === 1 ? documents.get(relation.sources[0]!.documentId) : null;
      const target = relation.target.type === "document" ? documents.get(relation.target.generation.documentId) : null;
      const parameters = relation.parameters && typeof relation.parameters === "object" && !Array.isArray(relation.parameters) ? relation.parameters as Record<string, unknown> : {};
      const canRefresh = graph?.format === "math3d.graph2d-document" &&
        (target?.format === "math3d.curve-document" || target?.format === "math3d.surface-document") &&
        typeof parameters.sourceObjectId === "string" && graph.source.objects.some(object => object.id === parameters.sourceObjectId);
      return { relationId: relation.relationId, targetId: target?.identity.id ?? null, canRefresh,
        reason: canRefresh ? "Creates a refreshed copy; existing documents and analysis remain historical." : "The original Graph object or companion is unavailable." };
    });
};
export const refreshProjectDependency = (project: Math3DProject, relationId: string): Math3DProject => {
  const option = projectDependencyRefreshOptions(project).find(item => item.relationId === relationId);
  if (!option?.canRefresh) throw new TypeError("This relation cannot be refreshed by the qualified Graph adapter.");
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const relation = project.workspace.relations.find(item => item.relationId === relationId)!;
  const graph = documents.get(relation.sources[0]!.documentId)!;
  const target = documents.get(option.targetId!)!;
  if (graph.format !== "math3d.graph2d-document" || (target.format !== "math3d.curve-document" && target.format !== "math3d.surface-document")) throw new TypeError("Invalid refresh source.");
  const parameters = relation.parameters as Record<string, unknown>;
  const promotion = { document: target, relation, trace: { sourceDocumentId: graph.identity.id,
    sourceRevision: relation.sources[0]!.revision, sourceObjectId: String(parameters.sourceObjectId), targetDocumentId: target.identity.id,
    operation: relation.operation, expressionMap: target.source.definition.expressions ?? {} } } as Graph2DAnyPromotion;
  const next = regenerateGraph2DPromotion(promotion, graph, "fork");
  if (project.workspace.entries.some(entry => entry.expected.id === next.document.identity.id)) throw new TypeError("This refreshed copy already exists for the current source generation.");
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: next.document.format === "math3d.curve-document" ? "curve" : "surface", checkpoint: next.document, expected: next.document.identity, replay: null }],
    relations: [...project.workspace.relations, next.relation] });
  const title = project.metadata.documents?.[target.identity.id]?.title ?? target.metadata.title;
  return setProjectDocumentMetadata(replaceMath3DProjectWorkspace(project, workspace), next.document.identity.id,
    { title: `${title.slice(0, 140)} refreshed`, archived: false });
};

export const projectAnalysisRefreshOptions = (project: Math3DProject) => {
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const stale = new Set(inspectProjectDependencies(project).results.filter(result => result.sourceFreshness === "stale").map(result => result.id));
  return project.workspace.results.filter(result => stale.has(result.resultId) && result.provenance.operation.type === "graph2d.derivative").map(result => {
    const graph = documents.get(result.provenance.source.documentId);
    const value = result.provenance.operation.parameters;
    const parameters = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const canRecompute = graph?.format === "math3d.graph2d-document" && graph.source.objects.some(object => object.id === parameters.objectId && object.kind === "explicit-cartesian") &&
      typeof parameters.x === "number" && Number.isFinite(parameters.x) && (parameters.order === 1 || parameters.order === 2) &&
      typeof parameters.tolerance === "number" && Number.isFinite(parameters.tolerance) && parameters.tolerance > 0;
    return { resultId: result.resultId, canRecompute,
      reason: canRecompute ? "Runs the local derivative algorithm on the current Graph; the historical record remains intact." : "The original explicit function or derivative parameters are unavailable." };
  });
};
export const recomputeProjectAnalysis = (project: Math3DProject, resultId: string): Math3DProject => {
  if (!projectAnalysisRefreshOptions(project).find(option => option.resultId === resultId)?.canRecompute) throw new TypeError("This analysis cannot be recomputed by the qualified derivative adapter.");
  const previous = project.workspace.results.find(result => result.resultId === resultId)!;
  const graph = verifyMixedWorkspaceReplay(project.workspace).get(previous.provenance.source.documentId)!;
  if (graph.format !== "math3d.graph2d-document") throw new TypeError("Missing analysis Graph.");
  const parameters = previous.provenance.operation.parameters as Record<string, unknown>;
  const result = analyzeGraph2DDerivative({ document: graph, objectId: String(parameters.objectId), x: Number(parameters.x),
    order: parameters.order as 1 | 2, tolerance: Number(parameters.tolerance) }).publication;
  if (project.workspace.results.some(record => record.resultId === result.resultId)) throw new TypeError("This analysis already exists for the current source generation.");
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [viewerSourceFromDocument(graph)], sourceOrder: "ordered",
    target: { type: "result", resultId: result.resultId, resultType: result.provenance.operation.type }, operation: "projects.refresh-graph-derivative",
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    results: [...project.workspace.results, result], relations: [...project.workspace.relations, relation] }));
};
