import { buildProjectExplorer, evaluateDocumentRelationStatus, isAnalysisResultCurrent, matchesScientificSourceGeneration,
  parseMath3DProject, replayMixedWorkspaceDocument, viewerSourceFromDocument, projectResourceInventory, VerifiedProjectResources, type ProjectResourceSidecar } from "@math3d/core";
import { mobileCurveUnavailableReason } from "./mobileProjectCurve";
import { mobileProjectRefreshOptions } from "./mobileProjectRefresh";
import { resolveMobileProjectWorkspace } from "./mobileProjectReplay";
import { mobileProjectResourceContext } from "./mobileProjectResources";
import { createInMemoryDependencyGraph } from "@math3d/kernel";

/** Inspect checkpointed named projects without activating an editor or mutating storage. */
export const buildMobileProjectExplorer = (raw: string, sidecars: readonly ProjectResourceSidecar[] = []) => {
  const project = parseMath3DProject(raw);
  if (project.workspace.entries.some(entry => !["graph2d", "curve"].includes(entry.module) && entry.replay !== null)) throw new TypeError("Export checkpoint JSON for documents other than Graphs and Curves on desktop to inspect these documents on mobile.");
  const resolved = resolveMobileProjectWorkspace(project.workspace);
  const resources = new VerifiedProjectResources(project, sidecars, mobileProjectResourceContext);
  const inventory = projectResourceInventory(project, mobileProjectResourceContext);
  const tree = buildProjectExplorer(project, resolved);
  const sources = new Map([...resolved].map(([id, document]) => [id, viewerSourceFromDocument(document)]));
  const dependencies = createInMemoryDependencyGraph({ relations: project.workspace.relations, resolveSource: id => sources.get(id) ?? null });
  const rank = { current: 0, stale: 1, unavailable: 2, broken: 3 } as const;
  const merge = (left: keyof typeof rank, right: keyof typeof rank) => rank[left] >= rank[right] ? left : right;
  const relations = project.workspace.relations.map(relation => {
    const sourceStatus = merge(evaluateDocumentRelationStatus(relation, id => sources.get(id) ?? null), dependencies.relationStatus(relation.relationId) ?? "unavailable");
    const target = relation.target.type === "document" ? sources.get(relation.target.generation.documentId) : null;
    const freshness = relation.target.type === "document" && (!target || !matchesScientificSourceGeneration(target, relation.target.generation)) ?
      merge(sourceStatus, target ? "stale" : "unavailable") : relation.target.type === "artifact" ? merge(sourceStatus, "unavailable") : sourceStatus;
    return { ...relation, freshness };
  });
  const curveReason = (id: string) => mobileCurveUnavailableReason(resolved.get(id)! as import("@math3d/core").CurveDocument,
    project.workspace.entries.find(entry => entry.expected.id === id)?.replay?.payload as import("@math3d/kernel").CurveReplayBundle | undefined);
  return {
    title: project.metadata.title,
    refreshOptions: mobileProjectRefreshOptions({ projectType: "project-preview", id: project.identity.id, title: project.metadata.title,
      serializedProject: raw, projectResources: [...sidecars], updatedAt: 0, lastOpenedAt: 0 }),
    resources: inventory.map(item => ({ id: item.id, kind: item.kind, required: item.required, available: resources.bytes(item) !== null })),
    groups: tree.groups.map(group => ({ ...group, documents: group.documents.map(document => ({ ...document,
      editing: document.module === "curve" && !document.archived && resolved.get(document.id)?.format === "math3d.curve-document" && !curveReason(document.id) ? "Curve workspace" : document.module === "graph2d" && !document.archived && !inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(document.id) && !resources.bytes(item)) ? "Graph workspace" : "Saved preview",
      unavailableReason: document.module === "curve" ? document.archived ? "Archived documents cannot be edited." : curveReason(document.id) : document.module !== "graph2d" ? "This module remains a saved preview on mobile." : document.archived ? "Archived documents cannot be edited." :
        inventory.some(item => item.kind === "graph-point-table" && item.owners.includes(document.id) && !resources.bytes(item)) ? "Import missing Graph source tables before editing." : null,
      stale: relations.some(relation => relation.freshness !== "current" && relation.target.type === "document" && relation.target.generation.documentId === document.id),
    })) })),
    relations,
    results: project.workspace.results.map(result => ({ id: result.resultId, operation: result.provenance.operation.type,
      sourceDocumentId: result.provenance.source.documentId, sourceRevision: result.provenance.source.revision,
      authority: result.status, freshness: !sources.has(result.provenance.source.documentId) || result.artifacts.length ? "unavailable" :
        isAnalysisResultCurrent(result, sources.get(result.provenance.source.documentId)!) && !relations.some(relation => relation.freshness !== "current" &&
          (relation.target.type === "document" ? relation.target.generation.documentId === result.provenance.source.documentId : relation.target.type === "result" && relation.target.resultId === result.resultId)) ? "current" : "stale" })),
  };
};
