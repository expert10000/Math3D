import { describe, expect, it } from "vitest";
import { summarizeMobileMesh } from "../../apps/mobile/src/models/mobileMeshSummary";

describe("mobile mesh summaries", () => {
  it("reports geometry and topology for an oriented tetrahedron", () => {
    const result = summarizeMobileMesh({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      indices: new Uint16Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
      source: "fixture",
    });
    expect(result).toMatchObject({
      status: "ready",
      vertexCount: 4,
      triangleCount: 4,
      componentCount: 1,
      boundaryEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      orientationMismatchEdgeCount: 0,
      eulerCharacteristic: 2,
      manifold: true,
      closed: true,
      healthy: true,
    });
    if (result.status === "ready") {
      expect(result.enclosedVolume).toBeCloseTo(1 / 6);
      expect(result.surfaceArea).toBeCloseTo(1.5 + Math.sqrt(3) / 2);
    }
  });

  it("withholds volume and counts boundaries and components for open geometry", () => {
    const result = summarizeMobileMesh({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 4, 0, 0, 5, 0, 0, 4, 1, 0],
      source: "fixture",
    });
    expect(result).toMatchObject({
      status: "ready",
      triangleCount: 2,
      componentCount: 2,
      boundaryEdgeCount: 6,
      eulerCharacteristic: 2,
      closed: false,
      enclosedVolume: null,
    });
  });

  it("rejects incomplete or out-of-range mesh buffers", () => {
    expect(summarizeMobileMesh({ positions: [0, 0], source: "bad" })).toMatchObject({ status: "unavailable" });
    expect(summarizeMobileMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 9], source: "bad" })).toMatchObject({ status: "unavailable" });
  });
});
