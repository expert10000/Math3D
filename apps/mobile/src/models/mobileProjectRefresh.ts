import { canonicalJsonStringify, createDocumentRelation, createSurfaceDocument, createMixedWorkspaceDocument,
  evaluateDocumentRelationStatus, evaluateGraph2DPromotionGeometry, regenerateGraph2DPromotion, replaceMath3DProjectWorkspace,
  serializeMath3DProject, setProjectDocumentMetadata, viewerSourceFromDocument,
  type Graph2DAnyPromotion, type Math3DProject, type SurfaceDocument, type DocumentRelation, type CurveDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobilePreviewProject } from "./mobileProjectPreview";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";
import { readMobileProjectResources } from "./mobileProjectResources";
import { sampleMobileCurve } from "./mobileProjectCurve";

const graphOperations = new Set(["graph2d.promote-curve", "graph2d.revolve-surface", "graph2d.extrude-surface"]);
const curveOperations = new Set(["curve.construct.extrusion", "curve.extrusion", "curve.construct.revolution", "curve.revolution"]);
const supported = (operation: string) => graphOperations.has(operation) || curveOperations.has(operation);
/** Matches desktop's bounded literal Curve extrusion/revolution qualification. */
const validateConstruction = (surface: SurfaceDocument, curve: CurveDocument): void => {
  const source = surface.source, domain = source.domain as Record<string, unknown>;
  if (source.representation !== "constructed" || domain.kind !== "curve-construction" ||
      canonicalJsonStringify(domain.u) !== "[0,1]" || canonicalJsonStringify(domain.v) !== "[0,1]" ||
      curve.source.representation !== "parametric" || curve.source.domain.parameter !== "t")
    throw new TypeError("This construction requires a literal parametric t Curve and normalized u/v domain.");
  sampleMobileCurve(curve.source);
  for (const [name, maximum] of [["uSegments", 256], ["vSegments", 128]] as const) {
    const value = source.parameters[name];
    if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 4 || Number(value) > maximum)) throw new TypeError("Construction resolution is outside its native bound.");
  }
  for (const name of ["depth", "angle", "radius"]) {
    const value = source.parameters[name];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) throw new TypeError("Finite construction parameters are required.");
  }
  if (source.parameters.axis !== undefined && !["x", "y", "z"].includes(String(source.parameters.axis)) ||
      source.parameters.radius !== undefined && Number(source.parameters.radius) < 1e-6) throw new TypeError("Invalid construction axis/radius.");
  const depth = Number(source.parameters.depth ?? 1), angle = Number(source.parameters.angle ?? 2 * Math.PI);
  if (sampleMobileCurve(curve.source).some(point => !Number.isFinite(point[2]! + depth) || !Number.isFinite(angle)))
    throw new TypeError("Construction produces nonfinite geometry.");
};
const planRefresh = (stored: MobileStoredSceneProject, project: Math3DProject, relationId: string) => {
  const relation = project.workspace.relations.find(item => item.relationId === relationId);
  if (!relation || !supported(relation.operation) || relation.sources.length !== 1 || relation.sourceOrder !== "ordered" || relation.target.type !== "document")
    throw new TypeError("This relation has no qualified mobile refresh adapter.");
  const documents = resolveMobileProjectWorkspace(project.workspace);
  const parent = documents.get(relation.sources[0]!.documentId), target = documents.get(relation.target.generation.documentId);
  if (!parent || !target) throw new TypeError("The original source or target document is unavailable.");
  if ([parent.identity.id, target.identity.id].some(id => project.metadata.documents?.[id]?.archived)) throw new TypeError("Archived documents cannot be refreshed.");
  if (evaluateDocumentRelationStatus(relation, id => { const document = documents.get(id); return document ? viewerSourceFromDocument(document) : null; }) !== "stale")
    throw new TypeError("The source has not changed; no refresh is needed.");
  let next: { document: Graph2DAnyPromotion["document"]; relation: DocumentRelation };
  if (curveOperations.has(relation.operation)) {
    if (parent.format !== "math3d.curve-document" || target.format !== "math3d.surface-document" ||
        ![`curve.construct.${target.source.definition.familyId}`, `curve.${target.source.definition.familyId}`].includes(relation.operation) ||
        canonicalJsonStringify(target.source.definition.sourceIds) !== canonicalJsonStringify(relation.sources.map(source => source.documentId)))
      throw new TypeError("The saved construction specification does not match its lineage.");
    const sourceGenerations = [viewerSourceFromDocument(parent)];
    const document = createSurfaceDocument({ stableKey: { refreshOf: target.identity.id, operation: relation.operation, sourceGenerations, parameters: target.source.parameters },
      source: { ...target.source, parameters: { ...target.source.parameters, sourceGenerations } }, metadata: target.metadata });
    validateConstruction(document, parent);
    next = { document, relation: createDocumentRelation({ kind: relation.kind, sources: sourceGenerations, sourceOrder: "ordered",
      target: { type: "document", generation: viewerSourceFromDocument(document) }, operation: relation.operation, parameters: document.source.parameters, tool: relation.tool }) };
  } else {
    if (parent.format !== "math3d.graph2d-document" || (target.format !== "math3d.curve-document" && target.format !== "math3d.surface-document") ||
        (relation.operation === "graph2d.promote-curve") !== (target.format === "math3d.curve-document")) throw new TypeError("The original Graph companion is unavailable.");
    if (readMobileProjectResources(stored).inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(parent.identity.id) && !item.available))
      throw new TypeError("Import missing Graph source tables before refreshing.");
    const parameters = relation.parameters as Record<string, unknown>;
    if (!parameters || typeof parameters.sourceObjectId !== "string") throw new TypeError("The saved Graph object is unavailable.");
    const promotion = { document: target, relation, trace: { operation: relation.operation as Graph2DAnyPromotion["trace"]["operation"],
      sourceDocumentId: parent.identity.id, sourceRevision: relation.sources[0]!.revision, sourceObjectId: parameters.sourceObjectId,
      targetDocumentId: target.identity.id, expressionMap: target.source.definition.expressions ?? {} } } as Graph2DAnyPromotion;
    next = regenerateGraph2DPromotion(promotion, parent, "fork");
    if (next.document.format === "math3d.curve-document") sampleMobileCurve(next.document.source);
    else evaluateGraph2DPromotionGeometry(next.document);
  }
  const kind = next.document.format === "math3d.curve-document" ? "Curve" : "Surface";
  if (project.workspace.entries.some(entry => entry.expected.id === next.document.identity.id)) throw new TypeError(`This refreshed ${kind} already exists for the current source generation.`);
  return { next, originalId: target.identity.id, kind };
};
export const mobileProjectRefreshOptions = (stored: MobileStoredSceneProject) => {
  const project = readMobilePreviewProject(stored);
  return project.workspace.relations.filter(relation => supported(relation.operation)).map(relation => {
    const kind = relation.operation === "graph2d.promote-curve" ? "Curve" : "Surface";
    try { planRefresh(stored, project, relation.relationId); return { relationId: relation.relationId, kind, canRefresh: true, reason: `Creates a new ${kind} from the current source; previous documents and analysis remain historical.` }; }
    catch (error) { return { relationId: relation.relationId, kind, canRefresh: false, reason: (error as Error).message }; }
  });
};
/** Pure plan. Persist the full container before replacing any active session. */
export const refreshMobileProjectDependency = (stored: MobileStoredSceneProject, relationId: string, now = Date.now()): MobileStoredSceneProject => {
  const project = readMobilePreviewProject(stored), { next, originalId } = planRefresh(stored, project, relationId);
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: next.document.format === "math3d.curve-document" ? "curve" : "surface", checkpoint: next.document, expected: next.document.identity, replay: null }],
    relations: [...project.workspace.relations, next.relation] });
  const title = project.metadata.documents?.[originalId]?.title ?? next.document.metadata.title;
  const updated = setProjectDocumentMetadata(replaceMath3DProjectWorkspace(project, workspace), next.document.identity.id,
    { title: `${title.slice(0, 140)} refreshed`, archived: false });
  const result = { ...stored, updatedAt: now, serializedProject: serializeMath3DProject(updated) };
  readMobilePreviewProject(result); return result;
};
/** Existing Curve-only callers retain their API. */
export const refreshMobileProjectCurve = refreshMobileProjectDependency;
