import { describe, expect, it } from "vitest";
import {
  buildMeshBenchmarkVerificationRows,
  hasMeshBenchmarkExpectedMetrics,
  meshBenchmarkVerificationPasses,
  type MeshBenchmarkActualMetrics,
} from "./meshBenchmarkVerification";

const baseActual: MeshBenchmarkActualMetrics = {
  boundaryEdges: 4,
  boundaryLoops: 1,
  closed: false,
  components: 1,
  degenerateFaces: 3,
  edges: 17,
  eulerCharacteristic: 1,
  faces: 10,
  nonManifoldEdges: 0,
  orientationConsistent: true,
  selfIntersectionPairs: 1,
  vertices: 8,
};

describe("meshBenchmarkVerification", () => {
  it("builds passing rows for exact benchmark expectations", () => {
    const rows = buildMeshBenchmarkVerificationRows(
      {
        expected: {
          vertices: 8,
          faces: 10,
          components: 1,
          boundaryEdges: 4,
          boundaryLoops: 1,
          nonManifoldEdges: 0,
          closed: false,
        },
      },
      baseActual
    );

    expect(rows.map((row) => row.id)).toContain("boundaryEdges");
    expect(rows.every((row) => row.passes)).toBe(true);
    expect(meshBenchmarkVerificationPasses(rows)).toBe(true);
  });

  it("marks failed rows and preserves at-least comparisons", () => {
    const rows = buildMeshBenchmarkVerificationRows(
      {
        expected: {
          nonManifoldEdges: 1,
          degenerateFacesAtLeast: 3,
          selfIntersectionPairsAtLeast: 2,
        },
      },
      baseActual
    );

    expect(rows.find((row) => row.id === "nonManifoldEdges")?.passes).toBe(false);
    expect(rows.find((row) => row.id === "degenerateFaces")?.passes).toBe(true);
    expect(rows.find((row) => row.id === "selfIntersectionPairs")?.passes).toBe(false);
    expect(rows.find((row) => row.id === "selfIntersectionPairs")?.comparator).toBe("atLeast");
    expect(meshBenchmarkVerificationPasses(rows)).toBe(false);
  });

  it("recognizes spatial-weld expectations as deterministic benchmark metrics", () => {
    expect(hasMeshBenchmarkExpectedMetrics({ expectedAfterSpatialWeld: { uniqueVertices: 8 } })).toBe(true);
    expect(hasMeshBenchmarkExpectedMetrics({ computedReference: { vertices: 8 } })).toBe(false);
  });
});
