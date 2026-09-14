import { describe, expect, it } from "vitest";
import {
  createTopologyDocument,
  isTopologyDocument,
  isTopologyDocumentV1,
  isTopologyDocumentV2,
  migrateTopologyDocument,
} from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";
import { normalizeTopologyRealizationKinds } from "./realization";
import type { CanonicalTopologyComplex } from "./core";

describe("topology document format", () => {
  it("creates a source-authoritative v2 document with cache provenance and history", () => {
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
      undoHistory: [diagram],
    });

    expect(doc.format).toBe("math3d-topology");
    expect(doc.version).toBe(2);
    expect(doc.extension).toBe(".math3d-topology");
    expect(doc.payload.source.kind).toBe("fundamental-diagram");
    expect(doc.payload.canonical).toEqual(built.topologyObject.canonical);
    expect(doc.payload.cache.sourceHash).toBe(built.topologyObject.provenance.source.hash);
    expect(doc.payload.cache.canonicalHash).toBe(built.topologyObject.provenance.canonicalization.hash);
    expect(doc.payload.cache.coefficientDomains).toEqual(["Z", "Z/2Z"]);
    expect(doc.payload.cache.algorithmVersions.homology).toBe(built.homology.algorithmVersion);
    expect(doc.payload.viewState.activeView).toBe("quotient");
    expect(doc.payload.viewState.animationPlan?.groups["op-0"]).toBe("g1");
    expect(doc.payload.history.undo).toHaveLength(1);
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
    expect(isTopologyDocumentV1(valid)).toBe(true);
    expect(isTopologyDocumentV2(valid)).toBe(false);
    const v2 = createTopologyDocument(TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram());
    expect(isTopologyDocument(v2)).toBe(true);
    expect(isTopologyDocumentV2(v2)).toBe(true);
    expect(isTopologyDocument({ format: "math3d-topology", version: 2 })).toBe(false);
    expect(isTopologyDocument(null)).toBe(false);
  });

  it("migrates v1 by ignoring its cache and deterministically recomputing", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const wrong = buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get("projective_plane")!.buildDiagram());
    const legacy = {
      format: "math3d-topology",
      version: 1,
      extension: ".math3d-topology",
      savedAt: "2026-04-04T00:00:00.000Z",
      payload: {
        diagram,
        cache: {
          buildResult: wrong,
          activeView: "algebra",
          activeRealizationId: null,
          realizationChoiceIds: [],
        },
      },
    };
    const loaded = migrateTopologyDocument(legacy);
    expect(loaded?.audit.migration).toBe("v1-recomputed");
    expect(loaded?.audit.cacheStatus).toBe("recomputed");
    expect(loaded?.document.version).toBe(2);
    expect(loaded?.document.payload.viewState.activeView).toBe("algebra");
    expect(loaded?.buildResult.homology.value?.integer.groups[1].notation).toBe("Z^2");
  });

  it("verifies current v2 caches and recomputes stale derived snapshots", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram();
    const currentDoc = createTopologyDocument(diagram);
    expect(migrateTopologyDocument(currentDoc)?.audit.migration).toBe("v2-verified");

    const stale = structuredClone(currentDoc);
    stale.payload.cache.algorithmVersions.homology = "obsolete@0";
    stale.payload.canonical.name = "tampered derived snapshot";
    const loaded = migrateTopologyDocument(stale);
    expect(loaded?.audit.migration).toBe("v2-stale-recomputed");
    expect(loaded?.audit.cacheStatus).toBe("recomputed");
    expect(loaded?.document.payload.canonical.name).not.toBe("tampered derived snapshot");
    expect(loaded?.document.payload.cache.algorithmVersions.homology).not.toBe("obsolete@0");

    const wrongBuild = buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get("projective_plane")!.buildDiagram());
    const guardedSave = createTopologyDocument(diagram, {
      buildResult: wrongBuild,
      activeView: "diagram",
      activeRealizationId: null,
    });
    expect(guardedSave.payload.provenance.source.hash).toBe(currentDoc.payload.provenance.source.hash);
    expect(guardedSave.payload.canonical).toEqual(currentDoc.payload.canonical);
  });

  it("round-trips multi-face source maps and history through v2", () => {
    const diagram = structuredClone(TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram());
    diagram.faces.push({
      id: "f1",
      name: "Second source face",
      boundary: diagram.faces[0]!.boundary.map((entry) => ({ ...entry })),
    });
    diagram.faceBoundaryWords.f1 = diagram.faceBoundaryWords.f0;
    const document = createTopologyDocument(diagram, {
      buildResult: buildQuotientPipeline(diagram),
      activeView: "complex",
      activeRealizationId: null,
      undoHistory: [diagram],
    });
    const loaded = migrateTopologyDocument(JSON.parse(JSON.stringify(document)));
    expect(loaded?.diagram.faces).toHaveLength(2);
    expect(loaded?.buildResult.topologyObject.canonical.faces).toHaveLength(2);
    expect(loaded?.buildResult.topologyObject.canonical.faces.map((face) => face.sourceRefs[0]?.cellId)).toEqual(
      diagram.faces.map((face) => face.id)
    );
    expect(loaded?.document.payload.history.undo).toHaveLength(1);
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
