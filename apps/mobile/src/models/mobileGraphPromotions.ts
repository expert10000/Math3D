import { createMixedWorkspaceDocument, createGraph2DWorkspaceProject, evaluateGraph2DPromotionGeometry, graph2DPromotionStatus,
  requirePlatformFacilities, type Graph2DDocument, type Graph2DAnyPromotion, type PlatformCapabilitySnapshot } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobileGraphWorkspace, readMobileNamedGraphProject, replaceMobileGraphCheckpoint, storeMobileGraph } from "./mobileGraphProject";

export const readMobileGraphPromotions = (project: MobileStoredSceneProject | undefined): Graph2DAnyPromotion[] => {
  const workspace = project ? readMobileGraphWorkspace(project) : null;
  if (!workspace) return [];
  const sourceId = workspace.entries.find((entry) => entry.module === "graph2d")?.expected.id;
  return workspace.relations.flatMap((relation): Graph2DAnyPromotion[] => {
    if (relation.kind !== "promoted-from" || relation.sources[0]?.documentId !== sourceId || relation.target.type !== "document" ||
      !["graph2d.promote-curve", "graph2d.revolve-surface", "graph2d.extrude-surface"].includes(relation.operation)) return [];
    const targetId = relation.target.generation.documentId;
    const entry = workspace.entries.find((candidate) => candidate.expected.id === targetId);
    if (!entry || (entry.checkpoint.format !== "math3d.curve-document" && entry.checkpoint.format !== "math3d.surface-document")) return [];
    const parameters = relation.parameters as Record<string, unknown>;
    if (typeof parameters.sourceObjectId !== "string" || !parameters.expressionMap || typeof parameters.expressionMap !== "object") return [];
    const trace = { sourceDocumentId: relation.sources[0]!.documentId, sourceRevision: relation.sources[0]!.revision,
      sourceObjectId: parameters.sourceObjectId, targetDocumentId: entry.checkpoint.identity.id,
      operation: relation.operation as Graph2DAnyPromotion["trace"]["operation"], expressionMap: parameters.expressionMap as Readonly<Record<string, string>> };
    return entry.checkpoint.format === "math3d.curve-document" ? [{ document: entry.checkpoint, relation, trace }] : [{ document: entry.checkpoint, relation, trace }];
  });
};

/** Preview is a pure shared document/geometry operation. Only Create calls this persistence boundary. */
export const commitMobileGraphPromotion = (previous: MobileStoredSceneProject | undefined, source: Graph2DDocument,
  promotion: Graph2DAnyPromotion, platform: PlatformCapabilitySnapshot, now = Date.now()): MobileStoredSceneProject => {
  requirePlatformFacilities(platform, ["persistentStorage"]);
  if (graph2DPromotionStatus(promotion, source) !== "current" || promotion.trace.sourceDocumentId !== source.identity.id)
    throw new TypeError("Promotion preview is stale. Preview again before creating.");
  evaluateGraph2DPromotionGeometry(promotion.document); // bounded local preview; no unavailable browser worker is advertised.
  const base = previous ? readMobileGraphWorkspace(previous) : null;
  const workspace = base ? replaceMobileGraphCheckpoint(base, source) : createGraph2DWorkspaceProject(source);
  if (workspace.entries.some((entry) => entry.expected.id === promotion.document.identity.id))
    throw new TypeError("This target already exists. Locate it, or use desktop regeneration/fork; it will not be overwritten.");
  const created = createMixedWorkspaceDocument({ ...workspace, entries: [...workspace.entries, {
    module: promotion.document.format === "math3d.curve-document" ? "curve" : "surface",
    checkpoint: promotion.document, expected: promotion.document.identity, replay: null }],
    activeDocumentIds: [...new Set([...workspace.activeDocumentIds, promotion.document.identity.id])],
    relations: [...workspace.relations, promotion.relation] });
  return { ...previous, ...storeMobileGraph(source, now, created, previous ? readMobileNamedGraphProject(previous.serializedProject) : null) };
};
