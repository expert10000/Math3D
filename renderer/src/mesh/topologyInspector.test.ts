import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "./surfaceMesh";
import { computeMeshTopologyInspector } from "./topologyInspector";

const makeQuadMesh = (): SurfaceMeshData => ({
  label: "Quad",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

const makeNonManifoldFan = (): SurfaceMeshData => ({
  label: "Fan",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, -1, 0,
    0, 0, 1,
  ]),
  indices: Uint32Array.from([0, 1, 2, 1, 0, 3, 0, 1, 4]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

describe("computeMeshTopologyInspector", () => {
  it("reports adjacency rows and boundary flags for an open quad mesh", () => {
    const details = computeMeshTopologyInspector(makeQuadMesh(), { rowLimit: 8, itemLimit: 8 });

    expect(details?.vertexCount).toBe(4);
    expect(details?.faceCount).toBe(2);
    expect(details?.edgeCount).toBe(5);
    expect(details?.boundaryEdgeCount).toBe(4);
    expect(details?.connectedComponentCount).toBe(1);
    expect(details?.eulerCharacteristic).toBe(1);
    expect(details?.watertight).toBe(false);
    expect(details?.manifold).toBe(true);
    expect(details?.orientable).toBe(true);
    expect(details?.vertexAdjacencyRows[0].detail).toContain("neighbors: v1, v2, v3");
    expect(details?.faceAdjacencyRows[0].detail).toContain("neighbors: f1");
    expect(details?.edgeIncidenceRows.some((row) => row.label === "e0-2" && row.detail.includes("f0, f1"))).toBe(
      true
    );
    expect(details?.boundaryLoops).toHaveLength(1);
    expect(details?.boundaryLoops[0].edgeCount).toBe(4);
  });

  it("flags edges with more than two incident faces", () => {
    const details = computeMeshTopologyInspector(makeNonManifoldFan(), { rowLimit: 12, itemLimit: 8 });

    expect(details?.nonManifoldEdgeCount).toBe(1);
    expect(details?.manifold).toBe(false);
    expect(details?.watertight).toBe(false);
    expect(details?.orientable).toBeNull();
    expect(details?.edgeIncidenceRows.find((row) => row.label === "e0-1")?.flags).toContain("non-manifold");
  });
});
