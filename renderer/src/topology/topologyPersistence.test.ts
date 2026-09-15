import { describe, expect, it } from "vitest";
import { normalizeTopologyPersistenceRecord, structuralHash } from "@math3d/core";
import { createReplayableTopologyDocument, isTopologyDocumentV3, migrateTopologyDocument } from "./documentFormat";
import { deriveTopologyAlgebraAuthority } from "./algebraPublication";
import { moveVertexInDiagram } from "./editorTools";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { TopologyDiagramCommandAdapter } from "./topologyCommandAdapter";

const analyzedReplayableDocument = () => {
  const initial = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
  const adapter = new TopologyDiagramCommandAdapter(initial);
  const first = moveVertexInDiagram(initial, initial.vertices[0]!.id, -0.72, 0.81);
  adapter.commit(first);
  const second = structuredClone(first);
  second.name = "Authored torus session";
  adapter.commit(second);
  expect(adapter.undo()).toEqual(first);

  const authority = deriveTopologyAlgebraAuthority(adapter.document());
  if (authority.status !== "exact") throw new Error("Expected an exact torus authority.");
  return {
    initial,
    first,
    second,
    adapter,
    authority,
    file: createReplayableTopologyDocument({
      document: adapter.document(),
      replay: adapter.exportReplay(),
      canonicalHash: authority.canonical.canonicalHash,
      results: [authority.localZ2.result, authority.surfaceClassification.result],
      artifactHandles: [authority.boundary.handle],
      activeView: "algebra",
      activeRealizationId: null,
    }),
  };
};

describe("replayable Topology v3 persistence", () => {
  it("round-trips author, analyze, save, reopen, and replay with exact hashes and redo state", () => {
    const { initial, first, second, adapter, authority, file } = analyzedReplayableDocument();
    const serialized = JSON.stringify(file);
    expect(serialized).not.toContain("coo-decimal-bigint");
    expect(serialized).not.toContain("math3d.topology-boundary-matrices");
    expect(isTopologyDocumentV3(JSON.parse(serialized))).toBe(true);

    const loaded = migrateTopologyDocument(JSON.parse(serialized));
    expect(loaded).toMatchObject({
      audit: { loadedVersion: 3, migration: "v3-replayed", cacheStatus: "replayed" },
      persistence: {
        canonicalHash: authority.canonical.canonicalHash,
        replay: { cursor: 1, transactions: [{}, {}] },
        results: [{ status: "exact" }, { status: "certified" }],
        artifacts: [{ state: "unavailable", reason: "payload-not-embedded" }],
      },
    });
    expect(loaded?.diagram).toEqual(first);
    expect(loaded?.persistence?.document.identity).toEqual(adapter.document().identity);
    expect(loaded?.persistence?.replay.finalStateHash).toBe(structuralHash({
      ...loaded!.persistence!.replay.checkpoint,
      document: adapter.document(),
    }));

    const restored = TopologyDiagramCommandAdapter.restore(loaded!.persistence!.replay);
    expect(restored.current()).toEqual(first);
    expect(restored.undo()).toEqual(initial);
    expect(restored.redo()).toEqual(first);
    expect(restored.redo()).toEqual(second);
  });

  it("retains compact current result provenance while marking every omitted artifact unavailable", () => {
    const { file, authority } = analyzedReplayableDocument();
    const record = file.payload.persistence;
    expect(record.document.results).toHaveLength(2);
    expect(record.results.map((result) => result.provenance.operation.type).sort()).toEqual([
      "topology.homology-z2",
      "topology.surface-classification",
    ]);
    expect(record.results.every((result) => result.provenance.source.structuralHash === record.document.identity.structuralHash)).toBe(true);
    expect(record.artifacts).toEqual([
      expect.objectContaining({ handle: authority.boundary.handle, state: "unavailable", reason: "payload-not-embedded" }),
    ]);
    expect(migrateTopologyDocument(file)?.audit.warnings[0]).toContain("recompute");
  });

  it("rejects replay divergence, stale compact results, and fabricated artifact availability", () => {
    const { file } = analyzedReplayableDocument();

    const divergent = structuredClone(file);
    const command = divergent.payload.persistence.replay.transactions[0]!.commands[0]!;
    (command.command.payload as any).model.name = "tampered after save";
    expect(normalizeTopologyPersistenceRecord(divergent.payload.persistence)).toMatchObject({ ok: false });
    expect(isTopologyDocumentV3(divergent)).toBe(false);

    const stale = structuredClone(file);
    stale.payload.persistence.results[0]!.provenance.source.generation += 1;
    expect(normalizeTopologyPersistenceRecord(stale.payload.persistence)).toMatchObject({ ok: false });

    const fabricated = structuredClone(file);
    (fabricated.payload.persistence.artifacts[0] as any).state = "available";
    expect(normalizeTopologyPersistenceRecord(fabricated.payload.persistence)).toMatchObject({ ok: false });
  });
});
