import { describe, expect, it } from "vitest";
import { extractMeshFaceRegion, meshEdgeLoopVertices, meshFaceVertices, meshVertex } from "./meshDerivedGeometry";
import type { SurfaceMeshData } from "./surfaceMesh";

const mesh: SurfaceMeshData = { label: "Square", positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), source: { kind: "detachedMesh" } };
describe("mesh derived Geometry inputs", () => {
  it("validates component references and extracts a face region", () => {
    expect(meshVertex(mesh, 2)).toEqual({ x: 1, y: 1, z: 0 });
    expect(meshFaceVertices(mesh, 1)).toEqual([0, 2, 3]);
    expect(extractMeshFaceRegion(mesh, [1])?.indices).toEqual(new Uint32Array([0, 2, 3]));
    expect(extractMeshFaceRegion(mesh, [5])).toBeNull();
  });
  it("orders a connected edge loop and refuses disconnected edges", () => {
    expect(meshEdgeLoopVertices([[0, 1], [2, 3], [1, 2]])).toEqual([0, 1, 2, 3]);
    expect(meshEdgeLoopVertices([[0, 1], [2, 3]])).toBeNull();
  });
});
