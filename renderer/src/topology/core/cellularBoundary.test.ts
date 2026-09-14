import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESETS } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import type { TopologyObject } from "./contracts";
import {
  buildExactCellularBoundaryOperators,
  decodeExactIntegerMatrix,
} from "./cellularBoundary";
import { validateCanonicalTopologyObject } from "./structuralValidation";

describe("exact cellular boundary operators", () => {
  it("builds exact matrices and verifies the chain condition for every shipped preset", () => {
    for (const preset of TOPOLOGY_PRESETS) {
      const result = buildQuotientPipeline(preset.buildDiagram());
      const operators = result.cellularBoundaryOperators;
      expect(operators.status, preset.id).toBe("exact");
      expect(operators.value?.chainCondition.holds, preset.id).toBe(true);
      expect(operators.value?.boundary1.entries.length, preset.id).toBe(
        result.topologyObject.canonical.vertices.length
      );
      expect(operators.value?.boundary2.entries.length, preset.id).toBe(
        result.topologyObject.canonical.edges.length
      );
      expect(operators.value?.boundary1.encoding).toBe("decimal-bigint");
    }
  });

  it("uses target minus source for boundary1, including exact loop cancellation", () => {
    const interval = buildQuotientPipeline(TOPOLOGY_PRESETS.find((preset) => preset.id === "cylinder")!.buildDiagram());
    const object = structuredClone(interval.topologyObject);
    object.canonical.vertices = [
      { id: "v0", name: "v0", sourceRefs: [{ stage: "source", dimension: 0, cellId: object.source.value.vertices[0].id }] },
      { id: "v1", name: "v1", sourceRefs: [{ stage: "source", dimension: 0, cellId: object.source.value.vertices[1].id }] },
    ];
    object.canonical.edges = [
      { id: "e", name: "e", endpoints: ["v0", "v1"], sourceRefs: [{ stage: "source", dimension: 1, cellId: object.source.value.edges[0].id }] },
      { id: "loop", name: "loop", endpoints: ["v0", "v0"], sourceRefs: [{ stage: "source", dimension: 1, cellId: object.source.value.edges[1].id }] },
    ];
    object.canonical.faces = [];
    object.canonical.incidences = {
      vertexToEdges: { v0: ["e", "loop"], v1: ["e"] },
      edgeToFaces: { e: [], loop: [] },
    };
    const validation = validateCanonicalTopologyObject(object);
    const result = buildExactCellularBoundaryOperators(object, validation);

    expect(result.status).toBe("exact");
    expect(result.value?.boundary1.entries).toEqual([
      ["-1", "0"],
      ["1", "0"],
    ]);
    expect(decodeExactIntegerMatrix(result.value!.boundary1)).toEqual([
      [-1n, 0n],
      [1n, 0n],
    ]);
  });

  it("matches the audited torus, projective-plane, and Klein cellular presentations", () => {
    const torus = buildQuotientPipeline(
      TOPOLOGY_PRESETS.find((preset) => preset.id === "torus_square")!.buildDiagram()
    );
    const projective = buildQuotientPipeline(
      TOPOLOGY_PRESETS.find((preset) => preset.id === "projective_plane")!.buildDiagram()
    );
    const klein = buildQuotientPipeline(
      TOPOLOGY_PRESETS.find((preset) => preset.id === "klein_bottle_square")!.buildDiagram()
    );

    expect(torus.cellularBoundaryOperators.value?.chainCellIds).toEqual({
      c0: ["qV0"],
      c1: ["qE0", "qE1"],
      c2: ["qF0"],
    });
    expect(torus.cellularBoundaryOperators.value?.boundary1.entries).toEqual([["0", "0"]]);
    expect(torus.cellularBoundaryOperators.value?.boundary2.entries).toEqual([["0"], ["0"]]);
    expect(projective.cellularBoundaryOperators.value?.boundary2.entries).toEqual([["2"], ["2"]]);
    expect(klein.cellularBoundaryOperators.value?.boundary1.entries).toEqual([["0", "0"]]);
    expect(klein.cellularBoundaryOperators.value?.boundary2.entries).toEqual([["0"], ["2"]]);
  });

  it("sums signed face occurrences exactly in boundary2", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const sourceVertexId = built.topologyObject.source.value.vertices[0].id;
    const sourceEdgeId = built.topologyObject.source.value.edges[0].id;
    const sourceFaceId = built.topologyObject.source.value.faces[0].id;
    const object: TopologyObject = {
      ...structuredClone(built.topologyObject),
      canonical: {
        schemaVersion: 1,
        dimension: 2,
        id: "fixture/rp2",
        name: "one-loop degree-two attachment",
        vertices: [{ id: "v", name: "v", sourceRefs: [{ stage: "source", dimension: 0, cellId: sourceVertexId }] }],
        edges: [{ id: "a", name: "a", endpoints: ["v", "v"], sourceRefs: [{ stage: "source", dimension: 1, cellId: sourceEdgeId }] }],
        faces: [{
          id: "f",
          name: "f",
          attachment: [{ edgeId: "a", direction: 1 }, { edgeId: "a", direction: 1 }],
          boundaryWord: "a a",
          sourceRefs: [{ stage: "source", dimension: 2, cellId: sourceFaceId }],
        }],
        incidences: { vertexToEdges: { v: ["a"] }, edgeToFaces: { a: ["f"] } },
      },
    };
    const validation = validateCanonicalTopologyObject(object);
    const result = buildExactCellularBoundaryOperators(object, validation);

    expect(result.status).toBe("exact");
    expect(result.value?.boundary1.entries).toEqual([["0"]]);
    expect(result.value?.boundary2.entries).toEqual([["2"]]);
    expect(result.value?.compositionBoundary1Boundary2.entries).toEqual([["0"]]);
  });

  it("returns unsupported instead of constructing matrices for malformed structure", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const object = structuredClone(built.topologyObject);
    object.canonical.faces[0].attachment.push({ edgeId: "missing", direction: 1 });
    const validation = validateCanonicalTopologyObject(object);
    const result = buildExactCellularBoundaryOperators(object, validation);

    expect(validation.status).toBe("failed");
    expect(result.status).toBe("unsupported");
    expect(result).not.toHaveProperty("value");
    expect(result.diagnostics[0]?.code).toBe("cellular-boundary/invalid-structure");
  });
});
