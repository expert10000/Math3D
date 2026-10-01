import { describe, expect, it } from "vitest";
import { createReplayableTopologyDocument, createTopologyDocument, migrateTopologyDocument } from "./documentFormat";
import { deriveTopologyAlgebraAuthority } from "./algebraPublication";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { TopologyDiagramCommandAdapter } from "./topologyCommandAdapter";
import { buildQuotientPipeline } from "./quotientBuilder";

const initial = () => TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
const save = (adapter: TopologyDiagramCommandAdapter) => {
  const authority = deriveTopologyAlgebraAuthority(adapter.document());
  if (authority.status !== "exact") throw new Error("Expected exact torus authority");
  return createReplayableTopologyDocument({ document: adapter.document(), replay: adapter.exportReplay(),
    canonicalHash: authority.canonical.canonicalHash, results: [authority.localZ2.result],
    artifactHandles: [authority.boundary.handle], activeView: "algebra", activeRealizationId: null });
};

describe("post-1.6.0 Topology upgrade and bounded replay", () => {
  it("saves and reopens after crossing the 100-edit history boundary", () => {
    const diagram = initial(), adapter = new TopologyDiagramCommandAdapter(diagram);
    for (let i = 1; i <= 105; i++) adapter.commit({ ...diagram, name: `edit ${i}` });
    const loaded = migrateTopologyDocument(JSON.parse(JSON.stringify(save(adapter))));
    expect(loaded?.diagram.name).toBe("edit 105");
    expect(loaded?.persistence?.replay.transactions).toHaveLength(100);
    const restored = TopologyDiagramCommandAdapter.restore(loaded!.persistence!.replay);
    expect(restored.document().identity).toEqual(adapter.document().identity);
    for (let i = 104; i >= 5; i--) expect(restored.undo()?.name).toBe(`edit ${i}`);
    expect(restored.canUndo).toBe(false);
    expect(restored.undo()).toBeNull();
    expect(restored.redo()?.name).toBe("edit 6");
    restored.commit({ ...diagram, name: "new branch" });
    expect(restored.canRedo).toBe(false);
    expect(migrateTopologyDocument(JSON.parse(JSON.stringify(save(restored))))?.diagram.name).toBe("new branch");
  }, 30_000); // Full 100-transaction replay also runs alongside the mapped audit suites.

  it("migrates v2 undo/redo near the limit without moving the current source", () => {
    const diagram = initial();
    const states = Array.from({ length: 111 }, (_, i) => ({ ...diagram, name: `legacy ${i}` }));
    const legacy = createTopologyDocument(states[90]!, { buildResult: buildQuotientPipeline(states[90]!), activeView: "algebra", activeRealizationId: null,
      undoHistory: states.slice(0, 90), redoHistory: states.slice(91).reverse() });
    const loaded = migrateTopologyDocument(JSON.parse(JSON.stringify(legacy)))!;
    const adapter = TopologyDiagramCommandAdapter.restoreLegacyHistory(loaded.diagram, loaded.document.payload.history.undo, loaded.document.payload.history.redo);
    expect(adapter.current()).toEqual(states[90]);
    expect(adapter.historyState()).toEqual({ undoCount: 80, redoCount: 20 });
    const reopened = migrateTopologyDocument(JSON.parse(JSON.stringify(save(adapter))))!;
    const restored = TopologyDiagramCommandAdapter.restore(reopened.persistence!.replay);
    expect(restored.current()).toEqual(states[90]);
    expect(restored.undo()).toEqual(states[89]);
    expect(restored.redo()).toEqual(states[90]);
    expect(restored.redo()).toEqual(states[91]);
    expect(restored.current().edges.map((edge) => edge.id)).toEqual(diagram.edges.map((edge) => edge.id));
  }, 30_000);

  it("does not save an analysis from the source before an edit", () => {
    const adapter = new TopologyDiagramCommandAdapter(initial());
    const old = save(adapter);
    adapter.commit({ ...adapter.current(), name: "changed source" });
    const authority = deriveTopologyAlgebraAuthority(adapter.document());
    if (authority.status !== "exact") throw new Error("Expected exact torus authority");
    expect(() => createReplayableTopologyDocument({ document: adapter.document(), replay: adapter.exportReplay(),
      canonicalHash: authority.canonical.canonicalHash, results: old.payload.persistence.results,
      artifactHandles: [], activeView: "algebra", activeRealizationId: null })).toThrow();
  });

  it("keeps the live revision after repeated undo/redo and a new edit branch", () => {
    const diagram = initial(), adapter = new TopologyDiagramCommandAdapter(diagram);
    adapter.commit({ ...diagram, name: "first" });
    adapter.commit({ ...diagram, name: "second" });
    adapter.undo(); adapter.redo(); adapter.undo();
    const beforeBranch = migrateTopologyDocument(JSON.parse(JSON.stringify(save(adapter))))!;
    expect(beforeBranch.persistence!.document.identity).toEqual(adapter.document().identity);
    expect(TopologyDiagramCommandAdapter.restore(beforeBranch.persistence!.replay).redo()?.name).toBe("second");
    adapter.commit({ ...diagram, name: "replacement second" });
    const loaded = migrateTopologyDocument(JSON.parse(JSON.stringify(save(adapter))))!;
    const restored = TopologyDiagramCommandAdapter.restore(loaded.persistence!.replay);
    expect(restored.document().identity).toEqual(adapter.document().identity);
    expect(restored.undo()?.name).toBe("first");
    expect(restored.redo()?.name).toBe("replacement second");
    restored.commit({ ...diagram, name: "continued after reopen" });
    const continued = restored.exportReplay();
    expect(new Set(continued.transactions.map((transaction) => transaction.transactionId)).size).toBe(continued.transactions.length);
    const continuedFile = migrateTopologyDocument(JSON.parse(JSON.stringify(save(restored))))!;
    expect(continuedFile.persistence!.document.identity).toEqual(restored.document().identity);
  });

  it("reopens a v1 source with preserved IDs and upgrades it through commands to v3", () => {
    const diagram = initial();
    const bytes = JSON.stringify({ format: "math3d-topology", version: 1, extension: ".math3d-topology",
      savedAt: "2026-09-01T00:00:00.000Z", payload: { diagram } });
    const loaded = migrateTopologyDocument(JSON.parse(bytes))!;
    const adapter = TopologyDiagramCommandAdapter.restoreLegacyHistory(loaded.diagram, [], []);
    expect(adapter.current()).toEqual(diagram);
    adapter.commit({ ...diagram, name: "v1 continued" });
    const reopened = migrateTopologyDocument(JSON.parse(JSON.stringify(save(adapter))))!;
    const restored = TopologyDiagramCommandAdapter.restore(reopened.persistence!.replay);
    expect(restored.undo()).toEqual(diagram);
    expect(restored.redo()?.name).toBe("v1 continued");
    expect(JSON.parse(bytes).payload.diagram).toEqual(diagram);
  });
});
