import { bench, describe } from "vitest";
import { createDocumentRelation, createStableDocumentId, structuralHash,
  type ScientificSourceGeneration, type StableDocumentId } from "@math3d/core";
import { createInMemoryDependencyGraph } from "@math3d/kernel";

// Sparse large-workspace fixture: one changed source with one dependent result,
// plus 639 unrelated source/result pairs. No element-level footprint is assumed.
const source = (index: number, revision = 1): ScientificSourceGeneration => ({
  documentId: createStableDocumentId("gk18-benchmark", `${index}`), revision,
  structuralHash: structuralHash({ index, revision }), generation: revision,
});
const originals = Array.from({ length: 640 }, (_, index) => source(index));
const relations = originals.map((entry, index) => createDocumentRelation({ kind: "analysis-of", sources: [entry], sourceOrder: "ordered",
  target: { type: "result", resultType: "gk18.benchmark", resultId: `result:${index}` },
  operation: "gk18.benchmark", parameters: {} }));
const makeGraph = (strategy: "full" | "dependency-local") => {
  const current = new Map<StableDocumentId, ScientificSourceGeneration>(originals.map((entry) => [entry.documentId, entry]));
  const graph = createInMemoryDependencyGraph({ resolveSource: (id) => current.get(id) ?? null, relations,
    invalidationStrategy: strategy, localInvalidationMinRelations: 512 });
  const changed = source(0, 2);
  current.set(changed.documentId, changed);
  graph.invalidateDocumentSource(changed);
  return { graph, changed };
};
const full = makeGraph("full"), local = makeGraph("dependency-local");

describe("GK18 sparse dependency graph invalidation (640 relations)", () => {
  bench("full deterministic oracle", () => { full.graph.invalidateDocumentSource(full.changed); });
  bench("indexed dependency-local closure", () => { local.graph.invalidateDocumentSource(local.changed); });
});
