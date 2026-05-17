import { describe, expect, it } from "vitest";
import { computeInvalidBoundaryCycleDiagnostics, computeNonManifoldEdgeDiagnostics, computeVertexStarDisconnectionDiagnostics } from "./diagnostics";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";
import type { QuotientComplex } from "./types";

describe("topology diagnostics regression", () => {
  it("keeps canonical preset invariants stable", () => {
    const canonical = [
      "sphere_boundary_contraction",
      "torus_square",
      "projective_plane",
      "klein_bottle_square",
      "mobius_from_rectangle",
      "cylinder",
      "cone",
    ] as const;

    for (const presetId of canonical) {
      const preset = TOPOLOGY_PRESET_BY_ID.get(presetId);
      expect(preset, `missing preset ${presetId}`).toBeTruthy();
      const result = buildQuotientPipeline(preset!.buildDiagram());
      const nonManifold = computeNonManifoldEdgeDiagnostics(result.quotient);
      const vertexStar = computeVertexStarDisconnectionDiagnostics(result.quotient);
      const invalidBoundary = computeInvalidBoundaryCycleDiagnostics(result.quotient);
      expect(Number.isInteger(result.quotient.invariants?.eulerCharacteristic), `unexpected chi for ${presetId}`).toBe(true);
      expect(result.quotient.invariants?.connectedComponents).toBe(1);
      expect(nonManifold.length, `non-manifold edge count mismatch for ${presetId}`).toBe(result.quotient.invariants?.nonManifoldEdgeCount ?? 0);
      expect(vertexStar.every((entry) => entry.components > 1), `vertex-star diagnostics shape for ${presetId}`).toBe(true);
      expect(invalidBoundary, `invalid boundaries for ${presetId}`).toHaveLength(0);
    }
  });

  it("detects non-manifold edge incidence > 2", () => {
    const quotient = createFixtureEdgeIncidenceGt2();
    const diagnostics = computeNonManifoldEdgeDiagnostics(quotient);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.edgeId).toBe("qe0");
    expect(diagnostics[0]?.incidentCount).toBe(3);
  });

  it("detects vertex-star disconnection and invalid boundary cycle", () => {
    const quotient = createFixtureVertexStarAndBoundaryCycleIssue();
    const vertexDiagnostics = computeVertexStarDisconnectionDiagnostics(quotient);
    const boundaryDiagnostics = computeInvalidBoundaryCycleDiagnostics(quotient);

    expect(vertexDiagnostics.some((entry) => entry.vertexId === "qv0" && entry.components > 1)).toBe(true);
    expect(boundaryDiagnostics.some((entry) => entry.faceId === "f0" && /non-contiguous/i.test(entry.reason))).toBe(true);
  });
});

const createFixtureEdgeIncidenceGt2 = (): QuotientComplex => ({
  id: "fixture/non-manifold-edge",
  name: "Fixture non-manifold edge incidence",
  vertices: [
    { id: "qv0", sourceVertexIds: ["v0"], label: "qv0" },
    { id: "qv1", sourceVertexIds: ["v1"], label: "qv1" },
    { id: "qv2", sourceVertexIds: ["v2"], label: "qv2" },
    { id: "qv3", sourceVertexIds: ["v3"], label: "qv3" },
    { id: "qv4", sourceVertexIds: ["v4"], label: "qv4" },
  ],
  edges: [
    { id: "qe0", sourceEdgeIds: ["e0"], label: "a", endpointVertexIds: ["qv0", "qv1"] },
    { id: "qe1", sourceEdgeIds: ["e1"], label: "b", endpointVertexIds: ["qv1", "qv2"] },
    { id: "qe2", sourceEdgeIds: ["e2"], label: "c", endpointVertexIds: ["qv2", "qv0"] },
    { id: "qe3", sourceEdgeIds: ["e3"], label: "d", endpointVertexIds: ["qv1", "qv3"] },
    { id: "qe4", sourceEdgeIds: ["e4"], label: "e", endpointVertexIds: ["qv3", "qv0"] },
    { id: "qe5", sourceEdgeIds: ["e5"], label: "f", endpointVertexIds: ["qv1", "qv4"] },
    { id: "qe6", sourceEdgeIds: ["e6"], label: "g", endpointVertexIds: ["qv4", "qv0"] },
  ],
  faces: [
    { id: "f0", sourceFaceIds: ["sf0"], attachmentId: "a0" },
    { id: "f1", sourceFaceIds: ["sf1"], attachmentId: "a1" },
    { id: "f2", sourceFaceIds: ["sf2"], attachmentId: "a2" },
  ],
  incidences: {
    vertexToEdges: {
      qv0: ["qe0", "qe2", "qe4", "qe6"],
      qv1: ["qe0", "qe1", "qe3", "qe5"],
      qv2: ["qe1", "qe2"],
      qv3: ["qe3", "qe4"],
      qv4: ["qe5", "qe6"],
    },
    edgeToFaces: {
      qe0: ["f0", "f1", "f2"],
      qe1: ["f0"],
      qe2: ["f0"],
      qe3: ["f1"],
      qe4: ["f1"],
      qe5: ["f2"],
      qe6: ["f2"],
    },
  },
  attachmentMap: {
    a0: { id: "a0", faceId: "f0", boundary: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe1", direction: 1 }, { edgeId: "qe2", direction: 1 }], boundaryWord: "a b c" },
    a1: { id: "a1", faceId: "f1", boundary: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe3", direction: 1 }, { edgeId: "qe4", direction: 1 }], boundaryWord: "a d e" },
    a2: { id: "a2", faceId: "f2", boundary: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe5", direction: 1 }, { edgeId: "qe6", direction: 1 }], boundaryWord: "a f g" },
  },
  cellBoundaries: [
    { faceId: "f0", edgeWalk: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe1", direction: 1 }, { edgeId: "qe2", direction: 1 }] },
    { faceId: "f1", edgeWalk: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe3", direction: 1 }, { edgeId: "qe4", direction: 1 }] },
    { faceId: "f2", edgeWalk: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe5", direction: 1 }, { edgeId: "qe6", direction: 1 }] },
  ],
  simplicialRefinement: null,
  invariants: {
    vertexCount: 5,
    edgeCount: 7,
    faceCount: 3,
    eulerCharacteristic: 1,
    connectedComponents: 1,
    isConnected: true,
    nonManifoldEdgeCount: 1,
  },
});

const createFixtureVertexStarAndBoundaryCycleIssue = (): QuotientComplex => ({
  id: "fixture/vertex-star-and-boundary",
  name: "Fixture vertex-star and invalid boundary cycle",
  vertices: [
    { id: "qv0", sourceVertexIds: ["v0"], label: "qv0" },
    { id: "qv1", sourceVertexIds: ["v1"], label: "qv1" },
    { id: "qv2", sourceVertexIds: ["v2"], label: "qv2" },
    { id: "qv3", sourceVertexIds: ["v3"], label: "qv3" },
    { id: "qv4", sourceVertexIds: ["v4"], label: "qv4" },
    { id: "qv5", sourceVertexIds: ["v5"], label: "qv5" },
    { id: "qv6", sourceVertexIds: ["v6"], label: "qv6" },
  ],
  edges: [
    { id: "qe0", sourceEdgeIds: ["e0"], label: "a", endpointVertexIds: ["qv0", "qv1"] },
    { id: "qe1", sourceEdgeIds: ["e1"], label: "b", endpointVertexIds: ["qv0", "qv2"] },
    { id: "qe2", sourceEdgeIds: ["e2"], label: "c", endpointVertexIds: ["qv0", "qv3"] },
    { id: "qe3", sourceEdgeIds: ["e3"], label: "d", endpointVertexIds: ["qv0", "qv4"] },
    { id: "qe4", sourceEdgeIds: ["e4"], label: "x", endpointVertexIds: ["qv5", "qv6"] },
  ],
  faces: [
    { id: "f0", sourceFaceIds: ["sf0"], attachmentId: "a0" },
    { id: "f1", sourceFaceIds: ["sf1"], attachmentId: "a1" },
  ],
  incidences: {
    vertexToEdges: {
      qv0: ["qe0", "qe1", "qe2", "qe3"],
      qv1: ["qe0"],
      qv2: ["qe1"],
      qv3: ["qe2"],
      qv4: ["qe3"],
      qv5: ["qe4"],
      qv6: ["qe4"],
    },
    edgeToFaces: {
      qe0: ["f0"],
      qe1: ["f0"],
      qe2: ["f1"],
      qe3: ["f1"],
      qe4: ["f0"],
    },
  },
  attachmentMap: {
    a0: { id: "a0", faceId: "f0", boundary: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe1", direction: 1 }, { edgeId: "qe4", direction: 1 }], boundaryWord: "a b x" },
    a1: { id: "a1", faceId: "f1", boundary: [{ edgeId: "qe2", direction: 1 }, { edgeId: "qe3", direction: 1 }, { edgeId: "qe2", direction: -1 }], boundaryWord: "c d c^-1" },
  },
  cellBoundaries: [
    { faceId: "f0", edgeWalk: [{ edgeId: "qe0", direction: 1 }, { edgeId: "qe1", direction: 1 }, { edgeId: "qe4", direction: 1 }] },
    { faceId: "f1", edgeWalk: [{ edgeId: "qe2", direction: 1 }, { edgeId: "qe3", direction: 1 }, { edgeId: "qe2", direction: -1 }] },
  ],
  simplicialRefinement: null,
  invariants: {
    vertexCount: 7,
    edgeCount: 5,
    faceCount: 2,
    eulerCharacteristic: 4,
    connectedComponents: 1,
    isConnected: true,
    nonManifoldEdgeCount: 0,
  },
});
