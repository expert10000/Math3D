import { describe, expect, it } from "vitest";
import {
  createCurrentDocumentRelation,
  createDocumentRelation,
  createDocumentRelationIndex,
  createStableDocumentId,
  evaluateDocumentRelationStatus,
  normalizeDocumentRelation,
  structuralHash,
  withDocumentRelationStatus,
  type DocumentRelationTarget,
  type ScientificSourceGeneration,
} from "@math3d/core";

const source = (key: string, revision = 1): ScientificSourceGeneration => ({
  documentId: createStableDocumentId("fixture", key),
  revision,
  structuralHash: structuralHash({ key, revision }),
  generation: revision,
});

const artifactTarget = (id: string): DocumentRelationTarget => ({
  type: "artifact",
  artifactId: id,
  artifactKind: "mesh",
  role: "fixture/mesh",
});

describe("document relation contracts", () => {
  it("normalizes unordered multi-source lineage to a deterministic compact identity", () => {
    const left = source("left", 2);
    const right = source("right", 4);
    const input = {
      kind: "derived-from" as const,
      sourceOrder: "unordered" as const,
      target: artifactTarget("artifact:loft"),
      operation: "surface.multi-loft",
      parameters: { tolerance: 1e-6, mode: "ruled" },
      producer: { resultIds: ["result:z", "result:a"] },
      tool: { name: "fixture", version: "1" },
    };
    const forward = createDocumentRelation({ ...input, sources: [left, right] });
    const reverse = createDocumentRelation({ ...input, sources: [right, left] });

    expect(reverse.relationId).toBe(forward.relationId);
    expect(reverse.sources).toEqual(forward.sources);
    expect(reverse.producer?.resultIds).toEqual(["result:a", "result:z"]);
    expect(Object.isFrozen(reverse)).toBe(true);
    expect(Object.isFrozen(reverse.parameters)).toBe(true);
    expect(JSON.stringify(reverse).length).toBeLessThan(32 * 1024);
  });

  it("preserves semantic source order when an operation declares it ordered", () => {
    const left = source("ordered-left");
    const right = source("ordered-right");
    const base = {
      kind: "generated-by" as const,
      sourceOrder: "ordered" as const,
      target: artifactTarget("artifact:sweep"),
      operation: "geometry.path-sweep",
      parameters: {},
    };
    const forward = createDocumentRelation({ ...base, sources: [left, right] });
    const reverse = createDocumentRelation({ ...base, sources: [right, left] });
    expect(reverse.relationId).not.toBe(forward.relationId);
  });

  it("keeps identity stable across immutable lifecycle status changes", () => {
    const relation = createDocumentRelation({
      kind: "analysis-of",
      sources: [source("status")],
      sourceOrder: "unordered",
      target: { type: "result", resultId: "result:status", resultType: "mesh.quality" },
      operation: "mesh.quality-analysis",
      parameters: {},
    });
    const stale = withDocumentRelationStatus(relation, "stale");
    expect(stale.relationId).toBe(relation.relationId);
    expect(stale.status).toBe("stale");
    expect(relation.status).toBe("current");
  });

  it("rejects stale claims and evaluates missing sources without mutation", () => {
    const captured = source("freshness", 2);
    const current = source("freshness", 3);
    const input = {
      kind: "snapshot-of" as const,
      sources: [captured],
      sourceOrder: "unordered" as const,
      target: artifactTarget("artifact:freshness"),
      operation: "topology.mesh-snapshot",
      parameters: {},
    };
    const relation = createDocumentRelation(input);
    expect(evaluateDocumentRelationStatus(relation, () => current)).toBe("stale");
    expect(evaluateDocumentRelationStatus(relation, () => null)).toBe("unavailable");
    expect(() => createCurrentDocumentRelation(input, () => current)).toThrow(/resolve as 'stale'/);
    expect(createCurrentDocumentRelation(input, () => captured).status).toBe("current");
  });

  it("supports deterministic forward and reverse traversal", () => {
    const first = source("first");
    const second = source("second");
    const target = artifactTarget("artifact:combined");
    const relation = createDocumentRelation({
      kind: "derived-from",
      sources: [second, first],
      sourceOrder: "unordered",
      target,
      operation: "surface.multi-source",
      parameters: {},
    });
    const index = createDocumentRelationIndex([relation]);
    expect(index.fromSource(first)).toEqual([relation]);
    expect(index.fromSource(second.documentId)).toEqual([relation]);
    expect(index.toTarget(target)).toEqual([relation]);
    expect(index.parentsOf(target)).toEqual(relation.sources);
    expect(index.childrenOf(first)).toEqual([target]);
    expect(index.get(relation.relationId)).toEqual(relation);
  });

  it("rejects direct and transitive document-generation cycles", () => {
    const first = source("cycle-first");
    const second = source("cycle-second");
    expect(() => createDocumentRelation({
      kind: "derived-from",
      sources: [first],
      sourceOrder: "unordered",
      target: { type: "document", generation: first },
      operation: "fixture.self-cycle",
      parameters: {},
    })).toThrow(/own exact source/);
    const forward = createDocumentRelation({
      kind: "derived-from",
      sources: [first],
      sourceOrder: "unordered",
      target: { type: "document", generation: second },
      operation: "fixture.forward",
      parameters: {},
    });
    const reverse = createDocumentRelation({
      kind: "derived-from",
      sources: [second],
      sourceOrder: "unordered",
      target: { type: "document", generation: first },
      operation: "fixture.reverse",
      parameters: {},
    });
    expect(() => createDocumentRelationIndex([forward, reverse])).toThrow(/cycle/);
  });

  it("rejects non-canonical payloads, oversized parameters, and tampered IDs", () => {
    expect(() => createDocumentRelation({
      kind: "derived-from",
      sources: [source("binary")],
      sourceOrder: "unordered",
      target: artifactTarget("artifact:binary"),
      operation: "fixture.binary",
      parameters: new Uint8Array([1, 2, 3]) as never,
    })).toThrow(/plain JSON objects/);
    expect(() => createDocumentRelation({
      kind: "derived-from",
      sources: [source("large")],
      sourceOrder: "unordered",
      target: artifactTarget("artifact:large"),
      operation: "fixture.large",
      parameters: { label: "x".repeat(9 * 1024) },
    })).toThrow(/exceeds 8192 bytes/);
    expect(() => createDocumentRelation({
      kind: "derived-from",
      sources: [source("embedded")],
      sourceOrder: "unordered",
      target: artifactTarget("artifact:embedded"),
      operation: "fixture.embedded",
      parameters: { sourcePayload: "do not inline source data" },
    })).toThrow(/stored as an artifact reference/);
    const valid = createDocumentRelation({
      kind: "derived-from",
      sources: [source("tamper")],
      sourceOrder: "unordered",
      target: artifactTarget("artifact:tamper"),
      operation: "fixture.tamper",
      parameters: {},
    });
    const tampered = { ...valid, relationId: `math3d-relation:${"0".repeat(64)}` };
    expect(normalizeDocumentRelation(tampered)).toEqual({
      ok: false,
      errors: ["relation.relationId does not match its canonical lineage identity."],
    });
  });
});
