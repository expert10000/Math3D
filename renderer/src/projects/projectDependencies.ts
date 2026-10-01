import { evaluateDocumentRelationStatus, isAnalysisResultCurrent, matchesScientificSourceGeneration, normalizeMath3DProject, viewerSourceFromDocument,
  type DocumentRelation, type DocumentRelationStatus, type Math3DProject } from "@math3d/core";
import { createInMemoryDependencyGraph } from "@math3d/kernel";

type Freshness = DocumentRelationStatus;
const rank: Record<Freshness, number> = { current: 0, stale: 1, unavailable: 2, broken: 3 };
const merge = (...values: Freshness[]): Freshness => values.reduce((left, right) => rank[right] > rank[left] ? right : left, "current");
export const inspectProjectDependencies = (project: Math3DProject, artifactAvailable: (id: string, hash: string | null) => boolean = () => false) => {
  const validated = normalizeMath3DProject(project); if (!validated.ok) throw new TypeError(validated.errors.join(" "));
  const workspace = validated.value.workspace, sources = new Map(workspace.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]));
  const graph = createInMemoryDependencyGraph({ relations: workspace.relations, resolveSource: (id) => sources.get(id) ?? null });
  const artifacts = workspace.artifacts.map((artifact) => {
    let available = false;
    try { available = artifact.contentHash !== null && artifactAvailable(artifact.handle.artifactId, artifact.contentHash); } catch { /* remain unavailable */ }
    return { id: artifact.handle.artifactId, kind: artifact.handle.kind, role: artifact.handle.role, contentHash: artifact.contentHash, byteLength: artifact.byteLength, available };
  });
  const available = new Set(artifacts.filter((artifact) => artifact.available).map((artifact) => artifact.id));
  const resultIds = new Set(workspace.results.map((result) => result.resultId));
  const targetFreshness = (relation: DocumentRelation): Freshness => {
    const target = relation.target;
    if (target.type === "document") {
      const current = sources.get(target.generation.documentId);
      return !current ? "unavailable" : matchesScientificSourceGeneration(current, target.generation) ? "current" : "stale";
    }
    if (target.type === "result") return resultIds.has(target.resultId) ? "current" : "unavailable";
    return available.has(target.artifactId) ? "current" : "unavailable";
  };
  const relations = workspace.relations.map((relation) => ({ ...relation,
    freshness: merge(evaluateDocumentRelationStatus(relation, (id) => sources.get(id) ?? null), graph.relationStatus(relation.relationId) ?? "unavailable", targetFreshness(relation)),
    snapshot: relation.kind === "snapshot-of" }));
  const documents = workspace.entries.map((entry) => {
    const incoming = relations.filter((relation) => relation.target.type === "document" && relation.target.generation.documentId === entry.expected.id);
    const outgoing = relations.filter((relation) => relation.sources.some((source) => source.documentId === entry.expected.id));
    return { id: entry.expected.id, module: entry.module, revision: entry.expected.revision, structuralHash: entry.expected.structuralHash,
      freshness: merge(...incoming.map((relation) => relation.freshness)), incomingRelationIds: incoming.map((relation) => relation.relationId),
      outgoingRelationIds: outgoing.map((relation) => relation.relationId), snapshot: incoming.some((relation) => relation.snapshot) };
  });
  const results = workspace.results.map((result) => {
    const source = sources.get(result.provenance.source.documentId);
    const incoming = relations.filter((relation) => relation.target.type === "result" && relation.target.resultId === result.resultId);
    const inherited = documents.find((document) => document.id === result.provenance.source.documentId)?.freshness ?? "unavailable";
    const missingArtifactIds = result.artifacts.filter((artifact) => !available.has(artifact.artifactId)).map((artifact) => artifact.artifactId);
    const sourceFreshness = merge(!source ? "unavailable" : isAnalysisResultCurrent(result, source) ? "current" : "stale", inherited, ...incoming.map((relation) => relation.freshness));
    return { id: result.resultId, authority: result.status, operation: result.provenance.operation.type, source: result.provenance.source,
      engine: result.provenance.engine, warnings: result.warnings, missingArtifactIds, sourceFreshness,
      freshness: merge(sourceFreshness, missingArtifactIds.length ? "unavailable" : "current") };
  });
  return { documents, relations, results, artifacts };
};
export type ProjectDependencyInspection = ReturnType<typeof inspectProjectDependencies>;
