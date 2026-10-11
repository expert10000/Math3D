import { matchesScientificSourceGeneration, viewerSourceFromDocument,
  type DocumentRelation, type DocumentRelationStatus, type Math3DProject, type ScientificSourceGeneration } from "@math3d/core";

export type ProjectFreshnessPresentation = { label: string; detail: string; tone: "current" | "stale" | "unavailable" | "broken" | "historical" };

export const presentProjectFreshness = (status: DocumentRelationStatus): ProjectFreshnessPresentation => {
  switch (status) {
    case "current": return { label: "Up to date", detail: "Recorded generations match this Project snapshot.", tone: "current" };
    case "stale": return { label: "Stale", detail: "A recorded generation differs from this Project snapshot.", tone: "stale" };
    case "unavailable": return { label: "Unavailable", detail: "A source, target, or verified artifact is unavailable.", tone: "unavailable" };
    case "broken": return { label: "Broken", detail: "The stored dependency chain is broken.", tone: "broken" };
  }
};

export const presentProjectRelationFreshness = (project: Math3DProject, relation: DocumentRelation,
  status: DocumentRelationStatus): ProjectFreshnessPresentation => {
  const entries = new Map(project.workspace.entries.map(entry => [entry.expected.id, entry] as const));
  const historical = (generation: ScientificSourceGeneration) => {
    const entry = entries.get(generation.documentId);
    return !!entry && !matchesScientificSourceGeneration(viewerSourceFromDocument({ identity: entry.expected }), generation);
  };
  const historicalTarget = relation.target.type === "document" && historical(relation.target.generation);
  const historicalSource = relation.sources.some(historical);
  if (status === "stale" && historicalTarget)
    return { label: "Historical target", detail: "This relation points to an older target generation. The current document may have a newer relation.", tone: "historical" };
  if (status === "stale" && relation.kind === "snapshot-of" && historicalSource)
    return { label: "Historical snapshot", detail: "The snapshot keeps its recorded source generation after the source changed.", tone: "historical" };
  if (status === "stale" && historicalSource)
    return { label: "Stale source", detail: "The source changed after this target was derived. Create a refreshed copy explicitly; this relation stays recorded.", tone: "stale" };
  return presentProjectFreshness(status);
};
