import { describe, expect, it } from "vitest";
import {
  createDocumentRelation,
  createStableDocumentId,
  structuralHash,
  type AnalysisArtifactHandle,
  type DocumentRelationTarget,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";
import {
  createInMemoryArtifactRegistry,
  createInMemoryDependencyGraph,
  type DependencyGraphEvent,
} from "@math3d/kernel";

const source = (key: string, revision = 1): ScientificSourceGeneration => {
  const documentId = createStableDocumentId("dependency", key);
  return { documentId, revision, structuralHash: structuralHash({ key, revision }), generation: revision };
};

const documentTarget = (generation: ScientificSourceGeneration): DocumentRelationTarget => ({ type: "document", generation });
const resultTarget = (id: string): DocumentRelationTarget => ({ type: "result", resultId: id, resultType: "fixture.analysis" });
const artifactTarget = (id: string): DocumentRelationTarget => ({ type: "artifact", artifactId: id, artifactKind: "mesh", role: "fixture/derived-mesh" });
const relation = (from: readonly ScientificSourceGeneration[], target: DocumentRelationTarget, operation: string) => createDocumentRelation({
  kind: target.type === "document" ? "derived-from" : target.type === "result" ? "analysis-of" : "generated-by",
  sources: from,
  sourceOrder: "unordered",
  target,
  operation,
  parameters: {},
});

const currentResolver = (sources: readonly ScientificSourceGeneration[]) => {
  const current = new Map<StableDocumentId, ScientificSourceGeneration>(sources.map((entry) => [entry.documentId, entry]));
  return { current, resolveSource: (documentId: StableDocumentId) => current.get(documentId) ?? null };
};

describe("GK02 cross-document dependency graph", () => {
  it("invalidates the exact downstream closure in deterministic topological order", () => {
    const a1 = source("a");
    const b1 = source("b");
    const x1 = source("x");
    const y1 = source("y");
    const { current, resolveSource } = currentResolver([a1, b1, x1, y1]);
    const meshHandle: AnalysisArtifactHandle = { artifactId: "artifact:gk02:mesh", kind: "mesh", role: "fixture/derived-mesh" };
    const sourceHandle: AnalysisArtifactHandle = { artifactId: "artifact:gk02:source-grid", kind: "sampled-grid", role: "fixture/source-grid" };
    const unrelatedHandle: AnalysisArtifactHandle = { artifactId: "artifact:gk02:unrelated", kind: "mesh", role: "fixture/derived-mesh" };
    const artifacts = createInMemoryArtifactRegistry({ resolveSource });
    for (const [handle, owner, artifactSource] of [[meshHandle, "owner:b", b1], [sourceHandle, "owner:a", a1], [unrelatedHandle, "owner:y", y1]] as const) {
      artifacts.declare({ handle, ownerId: owner, source: artifactSource, encoding: "application/octet-stream" });
      artifacts.beginComputation(handle.artifactId, owner, artifactSource);
      artifacts.publish({ artifactId: handle.artifactId, ownerId: owner, source: artifactSource, bytes: new Uint8Array([1, 2, 3]) });
    }
    const aToB = relation([a1], documentTarget(b1), "fixture.a-to-b");
    const bResult = relation([b1], resultTarget("result:gk02:b"), "fixture.b-result");
    const bArtifact = relation([b1], artifactTarget(meshHandle.artifactId), "fixture.b-artifact");
    const unrelated = relation([x1], documentTarget(y1), "fixture.x-to-y");
    const graph = createInMemoryDependencyGraph({ resolveSource, artifactRegistry: artifacts, relations: [bResult, unrelated, aToB, bArtifact] });
    const events: DependencyGraphEvent[] = [];
    graph.subscribe((event) => events.push(event));

    const a2 = source("a", 2);
    current.set(a2.documentId, a2);
    expect(graph.resolveRelation(aToB.relationId)).toMatchObject({ freshness: "stale", current: false });
    expect(graph.resolveRelation(bResult.relationId)).toMatchObject({ freshness: "stale", current: false });
    const report = graph.invalidateDocumentSource(a2);

    expect(report.affectedRelationIds).toEqual([aToB.relationId, bArtifact.relationId, bResult.relationId].sort());
    expect(report.topologicalRelationOrder[0]).toBe(aToB.relationId);
    expect(new Set(report.topologicalRelationOrder.slice(1))).toEqual(new Set([bArtifact.relationId, bResult.relationId]));
    expect(report.affectedDocumentGenerations).toEqual([b1]);
    expect(report.affectedResultIds).toEqual(["result:gk02:b"]);
    expect(report.affectedArtifactIds).toEqual([meshHandle.artifactId, sourceHandle.artifactId].sort());
    expect(report.invalidatedArtifactIds).toEqual([meshHandle.artifactId, sourceHandle.artifactId].sort());
    expect(graph.relationStatus(unrelated.relationId)).toBe("current");
    expect(graph.targetStatus(documentTarget(y1))).toBe("current");
    expect(current.get(b1.documentId)).toEqual(b1);
    expect(artifacts.resolve(meshHandle, b1)).toMatchObject({ ok: false, reason: "dirty" });
    expect(artifacts.listMetadata(a1.documentId)[0]).toMatchObject({ status: "dirty", availability: "unavailable" });
    expect(artifacts.resolve(unrelatedHandle, y1).ok).toBe(true);
    expect(events.map((event) => `${event.sequence}:${event.type}`)).toEqual(["5:dependency.invalidated"]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.affectedTargets)).toBe(true);
  });

  it("is idempotent and emits no duplicate completed invalidation event", () => {
    const a1 = source("idempotent-a");
    const b1 = source("idempotent-b");
    const { current, resolveSource } = currentResolver([a1, b1]);
    const edge = relation([a1], documentTarget(b1), "fixture.idempotent");
    const graph = createInMemoryDependencyGraph({ resolveSource, relations: [edge] });
    const events: DependencyGraphEvent[] = [];
    graph.subscribe((event) => events.push(event));
    const a2 = source("idempotent-a", 2);
    current.set(a2.documentId, a2);

    const first = graph.invalidateDocumentSource(a2);
    const second = graph.invalidateDocumentSource(a2);
    expect(first.changed).toBe(true);
    expect(first.newlyStaleRelationIds).toEqual([edge.relationId]);
    expect(second.changed).toBe(false);
    expect(second.newlyStaleRelationIds).toEqual([]);
    expect(second.invalidationId).toBe(first.invalidationId);
    expect(events).toHaveLength(1);
  });

  it("invalidates a multi-source dependency when either exact source advances", () => {
    const left1 = source("multi-left");
    const right1 = source("multi-right");
    const target = source("multi-target");
    const { current, resolveSource } = currentResolver([left1, right1, target]);
    const combined = relation([left1, right1], documentTarget(target), "fixture.multi-source");
    const graph = createInMemoryDependencyGraph({ resolveSource, relations: [combined] });
    const right2 = source("multi-right", 2);
    current.set(right2.documentId, right2);
    expect(graph.invalidateDocumentSource(right2).affectedRelationIds).toEqual([combined.relationId]);
    expect(graph.targetStatus(documentTarget(target))).toBe("stale");
  });

  it("rejects a cycle atomically and keeps the previously registered graph", () => {
    const a = source("cycle-a");
    const b = source("cycle-b");
    const { resolveSource } = currentResolver([a, b]);
    const forward = relation([a], documentTarget(b), "fixture.cycle-forward");
    const reverse = relation([b], documentTarget(a), "fixture.cycle-reverse");
    const graph = createInMemoryDependencyGraph({ resolveSource, relations: [forward] });
    expect(() => graph.register(reverse)).toThrow(/cycle/);
    expect(graph.relations()).toEqual([forward]);
  });

  it("blocks nested mutation while isolating listener failures", () => {
    const a1 = source("event-a");
    const b1 = source("event-b");
    const { current, resolveSource } = currentResolver([a1, b1]);
    const graph = createInMemoryDependencyGraph({ resolveSource });
    let nestedBlocked = false;
    graph.subscribe(() => {
      try { graph.register(relation([b1], resultTarget("result:nested"), "fixture.nested")); }
      catch { nestedBlocked = true; }
      throw new Error("observer failure");
    });
    const edge = graph.register(relation([a1], documentTarget(b1), "fixture.event"));
    const a2 = source("event-a", 2);
    current.set(a2.documentId, a2);
    expect(graph.invalidateDocumentSource(a2).affectedRelationIds).toEqual([edge.relationId]);
    expect(nestedBlocked).toBe(true);
  });
});
