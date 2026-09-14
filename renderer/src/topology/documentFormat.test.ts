import { describe, expect, it } from "vitest";
import { createTopologyDocument, isTopologyDocument } from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";
import { normalizeTopologyRealizationKinds } from "./realization";
import type { CanonicalTopologyComplex } from "./core";

describe("topology document format", () => {
  it("creates a versioned .math3d-topology document with cache", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("dunce_cap");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const built = buildQuotientPipeline(diagram);

    const doc = createTopologyDocument(diagram, {
      buildResult: built,
      activeView: "quotient",
      activeRealizationId: built.realizations[0]?.id ?? null,
      animationPlan: {
        order: ["op-0"],
        groups: { "op-0": "g1" },
      },
    });

    expect(doc.format).toBe("math3d-topology");
    expect(doc.version).toBe(1);
    expect(doc.extension).toBe(".math3d-topology");
    expect(doc.payload.cache?.activeView).toBe("quotient");
    expect(doc.payload.cache?.realizationChoiceIds).toEqual(built.realizations.map((entry) => entry.id));
    expect(doc.payload.cache?.animationPlan?.groups["op-0"]).toBe("g1");
    expect(() => JSON.stringify(doc)).not.toThrow();
    expect(JSON.stringify(doc)).toContain("decimal-bigint");
  });

  it("detects valid and invalid documents", () => {
    const valid = {
      format: "math3d-topology",
      version: 1,
      extension: ".math3d-topology",
      savedAt: "2026-04-04T00:00:00.000Z",
      payload: {
        diagram: {
          id: "d0",
          name: "D",
          vertices: [],
          edges: [],
          faces: [],
          edgeOrientations: {},
          edgeLabels: {},
          edgePairings: {},
          vertexLabels: {},
          faceBoundaryWords: {},
        },
      },
    };

    expect(isTopologyDocument(valid)).toBe(true);
    expect(isTopologyDocument({ format: "math3d-topology", version: 2 })).toBe(false);
    expect(isTopologyDocument(null)).toBe(false);
  });

  it("reconstructs structural contracts for legacy v1 cached builds", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram();
    const legacy = structuredClone(buildQuotientPipeline(diagram));
    delete (legacy as { structuralValidation?: unknown }).structuralValidation;
    delete (legacy as { cellularBoundaryOperators?: unknown }).cellularBoundaryOperators;
    delete (legacy as { homology?: unknown }).homology;
    delete (legacy as { algebraicConsistency?: unknown }).algebraicConsistency;
    delete (legacy as { surfaceClassification?: unknown }).surfaceClassification;
    delete (legacy.topologyObject.canonical as Partial<CanonicalTopologyComplex>).incidences;
    legacy.pipeline = legacy.pipeline.filter((stage) => stage.id !== "validation" && stage.id !== "boundary" && stage.id !== "homology" && stage.id !== "algebra" && stage.id !== "classification");

    const normalized = normalizeTopologyRealizationKinds(legacy);

    expect(normalized.topologyObject.canonical.incidences).toBeTruthy();
    expect(normalized.structuralValidation.status).toBe("certified-within-model");
    expect(normalized.cellularBoundaryOperators.status).toBe("exact");
    expect(normalized.homology.status).toBe("exact");
    expect(normalized.algebraicConsistency.status).toBe("exact");
    expect(normalized.surfaceClassification.status).toBe("certified-within-model");
    expect(normalized.pipeline.some((stage) => stage.id === "validation")).toBe(true);
    expect(normalized.pipeline.some((stage) => stage.id === "boundary")).toBe(true);
    expect(normalized.pipeline.some((stage) => stage.id === "homology")).toBe(true);
    expect(normalized.pipeline.some((stage) => stage.id === "algebra")).toBe(true);
    expect(normalized.pipeline.some((stage) => stage.id === "classification")).toBe(true);
  });
});
