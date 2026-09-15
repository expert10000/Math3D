import { describe, expect, it } from "vitest";
import {
  TOPOLOGY_COMMAND_TYPES,
  createCommandEnvelope,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyCommandState,
  createTopologyDocument,
  topologyCommandDefinitions,
  type CanonicalJsonValue,
  type TopologyDocumentSource,
} from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import { moveVertexInDiagram } from "./editorTools";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { TopologyDiagramCommandAdapter } from "./topologyCommandAdapter";
import { canonicalizeFundamentalDiagramTopologyDocument } from "./canonicalFinite2DAdapter";

const command = (id: string, type: string, payload: CanonicalJsonValue) => createCommandEnvelope({
  commandId: id,
  origin: { kind: "interactive", sourceId: "topology-command-test" },
  command: { type, payload },
});

const fixtureState = () => {
  const source: TopologyDocumentSource = {
    sourceId: "topology-test/source",
    kind: "fundamental-diagram",
    model: { id: "diagram", edgePairings: { e0: ["e1"] } },
  };
  const id = createStableDocumentId("topology", { fixture: "commands" });
  return createTopologyCommandState(createTopologyDocument({
    identity: createDocumentIdentity(id, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: { origin: "native", sourceFormat: "fixture", sourceVersion: 1, diagnostics: [] },
  }));
};

describe("topology kernel commands", () => {
  it("routes source and pairing edits through revisioned, invalidating transactions", () => {
    const initial = fixtureState();
    const kernel = createInMemoryDocumentKernel({ initialState: initial, commandDefinitions: topologyCommandDefinitions });
    const source = { ...initial.document.source, model: { id: "edited", edgePairings: { e0: ["e1"] } } };
    const sourceForward = command(
      "source-forward",
      TOPOLOGY_COMMAND_TYPES.replaceSource,
      source as unknown as CanonicalJsonValue
    );
    const result = kernel.transact({
      transactionId: "source-edit",
      commands: [sourceForward],
      history: {
        kind: "reversible",
        inverseCommands: [command("source-inverse", TOPOLOGY_COMMAND_TYPES.replaceSource, initial.document.source as unknown as CanonicalJsonValue)],
      },
    });
    expect(result.ok).toBe(true);
    expect(kernel.query((state) => state.document.identity.revision)).toBe(2);
    expect(kernel.query((state) => state.document.source.model.id)).toBe("edited");
    expect(kernel.query((state) => state.document.canonicalComplex)).toBeNull();

    const replay = createInMemoryDocumentKernel({ initialState: initial, commandDefinitions: topologyCommandDefinitions });
    expect(replay.transact({
      transactionId: "source-replay",
      mode: "replay",
      commands: [sourceForward],
      history: { kind: "irreversible" },
    }).ok).toBe(true);
    expect(replay.query((state) => state.document.source)).toEqual(kernel.query((state) => state.document.source));

    expect(kernel.transact({
      transactionId: "pairing-edit",
      commands: [command("pairing-forward", TOPOLOGY_COMMAND_TYPES.setPairing, { edgeId: "e0", pairedEdgeIds: ["e2"] })],
      history: { kind: "irreversible" },
    }).ok).toBe(true);
    expect(kernel.query((state) => state.document.source.model.edgePairings)).toEqual({ e0: ["e2"] });
    expect(kernel.query((state) => state.document.identity.revision)).toBe(3);
  });

  it("binds selection, canonicalization, and analysis requests to canonical source state", () => {
    const kernel = createInMemoryDocumentKernel({ initialState: fixtureState(), commandDefinitions: topologyCommandDefinitions });
    const result = kernel.transact({
      transactionId: "intent-batch",
      commands: [
        command("selection", TOPOLOGY_COMMAND_TYPES.commitSelection, { dimension: 1, cellIds: ["e0"] }),
        command("canonicalize", TOPOLOGY_COMMAND_TYPES.requestCanonicalization, { requestId: "canonical-1" }),
        command("analyze", TOPOLOGY_COMMAND_TYPES.requestAnalysis, { requestId: "analysis-1", analysisType: "topology.homology" }),
      ],
      history: { kind: "irreversible" },
    });
    expect(result.ok).toBe(true);
    const state = kernel.query((entry) => entry);
    expect(state.committedSelection).toEqual({ dimension: 1, cellIds: ["e0"] });
    expect(state.canonicalizationRequest?.sourceHash).toBe(state.document.identity.structuralHash);
    expect(state.analysisRequest).toMatchObject({ analysisType: "topology.homology", sourceRevision: 1 });
  });

  it("rejects malformed command payloads atomically", () => {
    const initial = fixtureState();
    const kernel = createInMemoryDocumentKernel({ initialState: initial, commandDefinitions: topologyCommandDefinitions });
    const result = kernel.transact({
      transactionId: "bad-batch",
      commands: [
        command("valid", TOPOLOGY_COMMAND_TYPES.commitSelection, { dimension: 0, cellIds: ["v0"] }),
        command("invalid", TOPOLOGY_COMMAND_TYPES.requestAnalysis, { requestId: "analysis-1", analysisType: "homology" }),
      ],
      history: { kind: "irreversible" },
    });
    expect(result.ok).toBe(false);
    expect(kernel.query((state) => state)).toEqual(initial);
  });
});

describe("fundamental-diagram command adapter", () => {
  it("matches legacy editor output across commit, undo, redo, import, and canonicalization", () => {
    const base = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const vertexId = base.vertices[0]!.id;
    const legacyEdited = moveVertexInDiagram(base, vertexId, -0.6, 0.8);
    const adapter = new TopologyDiagramCommandAdapter(base);

    expect(adapter.commit(legacyEdited)).toEqual(legacyEdited);
    const canonical = canonicalizeFundamentalDiagramTopologyDocument(adapter.document());
    expect(canonical.status).toBe("canonicalized");
    expect(adapter.undo()).toEqual(base);
    expect(adapter.redo()).toEqual(legacyEdited);

    const imported = TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram();
    expect(adapter.import(imported)).toEqual(imported);
    expect(adapter.undo()).toBeNull();
  });

  it("keeps pointer previews transient and commits only once on completion", () => {
    const base = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const adapter = new TopologyDiagramCommandAdapter(base);
    const vertexId = base.vertices[0]!.id;
    let preview = base;
    for (let step = 0; step < 20; step += 1) {
      preview = adapter.preview(moveVertexInDiagram(preview, vertexId, -0.9 + step * 0.02, 0.9));
    }
    expect(adapter.completedTransactions).toBe(0);
    adapter.commit(preview);
    expect(adapter.completedTransactions).toBe(1);
  });

  it("migrates legacy snapshot history into the sole command-kernel undo/redo route", () => {
    const base = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const vertexId = base.vertices[0]!.id;
    const first = moveVertexInDiagram(base, vertexId, -0.8, 0.8);
    const current = moveVertexInDiagram(first, vertexId, -0.6, 0.7);
    const future = moveVertexInDiagram(current, vertexId, -0.4, 0.6);
    const adapter = TopologyDiagramCommandAdapter.restoreLegacyHistory(current, [base, first], [future]);

    expect(adapter.current()).toEqual(current);
    expect(adapter.historyState()).toEqual({ undoCount: 2, redoCount: 1 });
    expect(adapter.canUndo).toBe(true);
    expect(adapter.canRedo).toBe(true);
    expect(adapter.undo()).toEqual(first);
    expect(adapter.undo()).toEqual(base);
    expect(adapter.undo()).toBeNull();
    expect(adapter.redo()).toEqual(first);
    expect(adapter.redo()).toEqual(current);
    expect(adapter.redo()).toEqual(future);
    expect(adapter.redo()).toBeNull();
  });
});
