import { createMixedWorkspaceDocument, regenerateGraph2DPromotion, replaceMath3DProjectWorkspace,
  analyzeGraph2DDerivative, createDocumentRelation, viewerSourceFromDocument,
  analyzeGraph2DIntegral, analyzeGraph2DArcLength, analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections,
  createSurfaceDocument, canonicalJsonStringify,
  setProjectDocumentMetadata, type Math3DProject, type Graph2DAnyPromotion, type SurfaceDocument,
  type AnalysisResultEnvelope, type DocumentRelation, type KernelWorkspaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { inspectProjectDependencies } from "./projectDependencies";
import { additionalRepresentationView } from "./additionalProjectRepresentations";

const operations = new Set(["graph2d.promote-curve", "graph2d.revolve-surface", "graph2d.extrude-surface"]);
const constructions = new Set(["extrusion", "revolution", "ruled-surface", "loft", "sweep", "tube-surface"].flatMap(kind => [`curve.construct.${kind}`, `curve.${kind}`]));
const refreshedConstruction = (relation: DocumentRelation, documents: ReadonlyMap<string, KernelWorkspaceDocument>): SurfaceDocument => {
  const target = relation.target.type === "document" ? documents.get(relation.target.generation.documentId) : null;
  if (target?.format !== "math3d.surface-document" || target.source.representation !== "constructed" ||
    ![`curve.construct.${target.source.definition.familyId}`, `curve.${target.source.definition.familyId}`].includes(relation.operation) || relation.sourceOrder !== "ordered" ||
    canonicalJsonStringify(target.source.definition.sourceIds) !== canonicalJsonStringify(relation.sources.map(source => source.documentId)))
    throw new TypeError("The saved construction specification does not match its lineage.");
  const parents = relation.sources.map(source => documents.get(source.documentId));
  if (parents.some(parent => parent?.format !== "math3d.curve-document")) throw new TypeError("A construction source Curve is missing.");
  const sourceGenerations = parents.map(parent => viewerSourceFromDocument(parent!));
  const next = createSurfaceDocument({ stableKey: { refreshOf: target.identity.id, operation: relation.operation, sourceGenerations, parameters: target.source.parameters },
    source: { ...target.source, parameters: { ...target.source.parameters, sourceGenerations } }, metadata: target.metadata });
  // Use the same bounded evaluator as reopening the native construction editor.
  additionalRepresentationView(next, { documents });
  return next;
};
/** Each supported adapter creates a new source specification; no historical target is overwritten. */
export const projectDependencyRefreshOptions = (project: Math3DProject) => {
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  return inspectProjectDependencies(project).relations.filter(relation => relation.freshness === "stale" && (operations.has(relation.operation) || constructions.has(relation.operation)))
    .map(relation => {
      if (constructions.has(relation.operation)) {
        try { const original = project.workspace.relations.find(item => item.relationId === relation.relationId)!; const next = refreshedConstruction(original, documents);
          return { relationId: relation.relationId, targetId: original.target.type === "document" ? original.target.generation.documentId : null,
            canRefresh: !project.workspace.entries.some(entry => entry.expected.id === next.identity.id), reason: "Creates a new constructed Surface from the current ordered Curves; the historical target remains intact." }; }
        catch (error) { return { relationId: relation.relationId, targetId: null, canRefresh: false, reason: (error as Error).message }; }
      }
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
  if (!option?.canRefresh) throw new TypeError("This relation cannot be refreshed by a qualified adapter.");
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const relation = project.workspace.relations.find(item => item.relationId === relationId)!;
  if (constructions.has(relation.operation)) {
    const next = refreshedConstruction(relation, documents);
    if (project.workspace.entries.some(entry => entry.expected.id === next.identity.id)) throw new TypeError("This refreshed construction already exists for the current source generation.");
    const sources = relation.sources.map(source => viewerSourceFromDocument(documents.get(source.documentId)!));
    const lineage = createDocumentRelation({ kind: relation.kind, sources, sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(next) },
      operation: relation.operation, parameters: next.source.parameters, tool: relation.tool });
    const workspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: [...project.workspace.entries, { module: "surface", checkpoint: next, expected: next.identity, replay: null }], relations: [...project.workspace.relations, lineage] });
    const title = project.metadata.documents?.[option.targetId!]?.title ?? next.metadata.title;
    return setProjectDocumentMetadata(replaceMath3DProjectWorkspace(project, workspace), next.identity.id, { title: `${title.slice(0, 140)} refreshed`, archived: false });
  }
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

const analysisOperations = new Map([
  ["graph2d.derivative", "Recompute derivative"], ["graph2d.integral", "Recompute integral"],
  ["graph2d.arc-length", "Recompute arc length"], ["graph2d.critical-points", "Recompute critical points"],
  ["graph2d.intersections", "Recompute intersections"],
]);
const analysisPlan = (previous: AnalysisResultEnvelope, graph: KernelWorkspaceDocument | undefined): (() => AnalysisResultEnvelope) => {
  if (graph?.format !== "math3d.graph2d-document" || !analysisOperations.has(previous.provenance.operation.type) || previous.provenance.operation.algorithmVersion !== "1")
    throw new TypeError("This recorded analysis has no qualified local refresh adapter.");
  const value = previous.provenance.operation.parameters;
  const p = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const explicit = (id: unknown): string => {
    if (typeof id !== "string" || !graph.source.objects.some(object => object.id === id && object.kind === "explicit-cartesian")) throw new TypeError("The original explicit function is unavailable.");
    return id;
  };
  const finite = (value: unknown): number => { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Finite recorded parameters are required."); return value; };
  const interval = () => {
    const input = p.interval && typeof p.interval === "object" && !Array.isArray(p.interval) ? p.interval as Record<string, unknown> : {};
    const min = finite(input.min), max = finite(input.max);
    if (min >= max) throw new TypeError("An increasing recorded interval is required.");
    return { min, max };
  };
  const tolerance = () => { const t = finite(p.tolerance ?? previous.provenance.numericContext?.tolerance?.absolute); if (t <= 0 || t > 0.1) throw new TypeError("Recorded tolerance is outside the local algorithm's range."); return t; };
  switch (previous.provenance.operation.type) {
    case "graph2d.derivative": {
      const objectId = explicit(p.objectId), x = finite(p.x), t = finite(p.tolerance), order = p.order;
      if ((order !== 1 && order !== 2) || t <= 0) throw new TypeError("Invalid recorded derivative parameters.");
      return () => analyzeGraph2DDerivative({ document: graph, objectId, x, order, tolerance: t }).publication;
    }
    case "graph2d.integral": {
      const objectId = explicit(p.objectId), bounds = interval(), t = tolerance(), mode = p.mode;
      if (mode !== "signed" && mode !== "absolute") throw new TypeError("Invalid recorded integral mode.");
      return () => analyzeGraph2DIntegral({ document: graph, objectId, interval: bounds, tolerance: t, mode }).publication;
    }
    case "graph2d.arc-length": {
      const objectId = explicit(p.objectId), bounds = interval(), t = tolerance();
      return () => analyzeGraph2DArcLength({ document: graph, objectId, interval: bounds, tolerance: t }).publication;
    }
    case "graph2d.critical-points": {
      const objectId = explicit(p.objectId), bounds = interval();
      return () => analyzeGraph2DCriticalPoints({ document: graph, objectId, interval: bounds }).publication;
    }
    case "graph2d.intersections": {
      const firstObjectId = explicit(p.firstObjectId), secondObjectId = explicit(p.secondObjectId), bounds = interval();
      if (firstObjectId === secondObjectId) throw new TypeError("Two distinct recorded functions are required.");
      return () => analyzeGraph2DIntersections({ document: graph, firstObjectId, secondObjectId, interval: bounds }).publication;
    }
    default: throw new TypeError("This analysis has no local adapter.");
  }
};
export const projectAnalysisRefreshOptions = (project: Math3DProject) => {
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const stale = new Set(inspectProjectDependencies(project).results.filter(result => result.sourceFreshness === "stale").map(result => result.id));
  return project.workspace.results.filter(result => stale.has(result.resultId)).map(result => {
    const label = analysisOperations.get(result.provenance.operation.type) ?? "Recompute analysis";
    try { analysisPlan(result, documents.get(result.provenance.source.documentId));
      return { resultId: result.resultId, label, canRecompute: true, reason: "Runs the recorded local operation on the current source; historical analysis remains intact." }; }
    catch (error) { return { resultId: result.resultId, label, canRecompute: false, reason: (error as Error).message }; }
  });
};
export const recomputeProjectAnalysis = (project: Math3DProject, resultId: string): Math3DProject => {
  if (!projectAnalysisRefreshOptions(project).find(option => option.resultId === resultId)?.canRecompute) throw new TypeError("This analysis cannot be recomputed by a qualified local adapter.");
  const previous = project.workspace.results.find(result => result.resultId === resultId)!;
  const graph = verifyMixedWorkspaceReplay(project.workspace).get(previous.provenance.source.documentId)!;
  const result = analysisPlan(previous, graph)();
  if (project.workspace.results.some(record => record.resultId === result.resultId)) throw new TypeError("This analysis already exists for the current source generation.");
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [viewerSourceFromDocument(graph)], sourceOrder: "ordered",
    target: { type: "result", resultId: result.resultId, resultType: result.provenance.operation.type }, operation: `projects.refresh-${result.provenance.operation.type.replace(".", "-")}`,
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    results: [...project.workspace.results, result], relations: [...project.workspace.relations, relation] }));
};
