import { describe, expect, it } from "vitest";
import { createDocumentRelation, createStableDocumentId, structuralHash,
  type DocumentRelation, type ScientificSourceGeneration, type StableDocumentId } from "@math3d/core";
import { createInMemoryArtifactRegistry, createInMemoryDependencyGraph } from "@math3d/kernel";

const generation = (id: string, revision = 1): ScientificSourceGeneration => ({
  documentId: createStableDocumentId("gk18", id), revision, structuralHash: structuralHash({ id, revision }), generation: revision,
});
const relation = (source: ScientificSourceGeneration, target: ScientificSourceGeneration | string): DocumentRelation =>
  createDocumentRelation({ kind: typeof target === "string" ? "analysis-of" : "derived-from", sources: [source], sourceOrder: "ordered",
    target: typeof target === "string" ? { type: "result", resultType: "gk18.fixture", resultId: target }
      : { type: "document", generation: target }, operation: "gk18.fixture", parameters: {} });
const fixture = (relations: readonly DocumentRelation[], originals: readonly ScientificSourceGeneration[], strategy: "full" | "dependency-local") => {
  const current = new Map<StableDocumentId, ScientificSourceGeneration>(originals.map((source) => [source.documentId, source]));
  const resolveSource = (id: StableDocumentId) => current.get(id) ?? null;
  const graph = createInMemoryDependencyGraph({ resolveSource, relations, invalidationStrategy: strategy, localInvalidationMinRelations: 1 });
  return { current, graph, resolveSource };
};
const withoutScope = <T extends { scope: string }>(value: T) => {
  const { scope: _scope, ...parity } = value;
  return parity;
};

describe("GK18 dependency-local invalidation", () => {
  it("matches the full deterministic oracle across seeded DAGs and repeated invalidations", () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const sources = Array.from({ length: 10 }, (_, index) => generation(`${seed}-${index}`));
      let randomState = seed * 65537;
      const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 0x1_0000_0000; };
      const relations: DocumentRelation[] = [];
      for (let index = 1; index < sources.length; index += 1) {
        relations.push(relation(sources[Math.floor(random() * index)]!, sources[index]!));
        relations.push(relation(sources[index]!, `result:${seed}:${index}`));
      }
      const full = fixture(relations, sources, "full"), local = fixture(relations, sources, "dependency-local");
      const changed = generation(`${seed}-0`, 2);
      full.current.set(changed.documentId, changed); local.current.set(changed.documentId, changed);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        const fullReport = full.graph.invalidateDocumentSource(changed);
        const localReport = local.graph.invalidateDocumentSource(changed);
        expect(localReport.scope).toBe("dirty-local");
        expect(fullReport.scope).toBe("dirty-global");
        expect(withoutScope(localReport)).toEqual(withoutScope(fullReport));
        for (const entry of relations) {
          expect(local.graph.relationStatus(entry.relationId)).toBe(full.graph.relationStatus(entry.relationId));
          expect(local.graph.targetStatus(entry.target)).toBe(full.graph.targetStatus(entry.target));
        }
      }
    }
  });

  it("keeps unrelated artifacts available and invalidates the same downstream bytes as the full oracle", () => {
    const a = generation("artifact-a"), b = generation("artifact-b"), c = generation("artifact-c");
    const all = [a, b, c];
    const relations = [relation(a, b), relation(b, "result:dependent"), relation(c, "result:independent")];
    const make = (strategy: "full" | "dependency-local") => {
      const current = new Map<StableDocumentId, ScientificSourceGeneration>(all.map((item) => [item.documentId, item]));
      const resolveSource = (id: StableDocumentId) => current.get(id) ?? null;
      const artifacts = createInMemoryArtifactRegistry({ resolveSource });
      for (const [id, source] of [["dependent", a], ["independent", c]] as const) {
        const handle = { artifactId: `gk18:${id}`, kind: "mesh" as const, role: "fixture" };
        artifacts.declare({ handle, source, ownerId: `owner:${id}`, encoding: "application/octet-stream" });
        artifacts.beginComputation(handle.artifactId, `owner:${id}`, source);
        artifacts.publish({ artifactId: handle.artifactId, ownerId: `owner:${id}`, source, bytes: new Uint8Array([1, 2, 3]) });
      }
      const graph = createInMemoryDependencyGraph({ resolveSource, relations, artifactRegistry: artifacts,
        invalidationStrategy: strategy, localInvalidationMinRelations: 1 });
      return { current, graph, artifacts };
    };
    const full = make("full"), local = make("dependency-local");
    const changed = generation("artifact-a", 2);
    full.current.set(changed.documentId, changed); local.current.set(changed.documentId, changed);
    expect(withoutScope(local.graph.invalidateDocumentSource(changed))).toEqual(withoutScope(full.graph.invalidateDocumentSource(changed)));
    expect(local.artifacts.listMetadata(a.documentId)[0]).toMatchObject({ status: "dirty", availability: "unavailable" });
    expect(local.artifacts.listMetadata(c.documentId)[0]).toMatchObject({ status: "clean", availability: "available" });
  });

  it("falls back to global below the reviewed graph size and rejects invalid options", () => {
    const a = generation("fallback-a"), b = generation("fallback-b");
    const current = new Map<StableDocumentId, ScientificSourceGeneration>([[a.documentId, a], [b.documentId, b]]);
    const resolveSource = (id: StableDocumentId) => current.get(id) ?? null;
    const graph = createInMemoryDependencyGraph({ resolveSource, relations: [relation(a, b)],
      invalidationStrategy: "dependency-local", localInvalidationMinRelations: 512 });
    const next = generation("fallback-a", 2); current.set(next.documentId, next);
    expect(graph.invalidateDocumentSource(next).scope).toBe("dirty-global");
    expect(() => createInMemoryDependencyGraph({ resolveSource, localInvalidationMinRelations: 0 })).toThrow();
    const elementGraph = createInMemoryDependencyGraph({ resolveSource, relations: [relation(a, b)],
      invalidationStrategy: "dependency-local", localInvalidationMinRelations: 1 });
    expect(elementGraph.invalidateDocumentSource(next, { kind: "vertex", ids: ["7"] })).toMatchObject({
      scope: "dirty-global", affectedRegion: { requestedChangeSet: { kind: "vertex", ids: ["7"] } },
    });
    expect(() => elementGraph.invalidateDocumentSource(next, { kind: "face", ids: ["1", "1"] })).toThrow(/unique/);
  });

  it("indexes relations registered after construction without missing descendants", () => {
    const a = generation("late-a"), b = generation("late-b"), c = generation("late-c");
    const current = new Map<StableDocumentId, ScientificSourceGeneration>([a, b, c].map((entry) => [entry.documentId, entry]));
    const graph = createInMemoryDependencyGraph({ resolveSource: (id) => current.get(id) ?? null,
      invalidationStrategy: "dependency-local", localInvalidationMinRelations: 1 });
    const first = graph.register(relation(a, b));
    const second = graph.register(relation(b, c));
    const changed = generation("late-a", 2); current.set(changed.documentId, changed);
    expect(graph.invalidateDocumentSource(changed).affectedRelationIds).toEqual([first.relationId, second.relationId].sort());
    expect(graph.targetStatus({ type: "document", generation: c })).toBe("stale");
  });
});
