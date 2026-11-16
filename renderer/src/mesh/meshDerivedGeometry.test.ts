import { describe, expect, it } from "vitest";
import { extractMeshFaceRegion, meshEdgeLoopVertices, meshFaceVertices, meshVertex, normalizeMeshFaceRegionLink, refreshMeshFaceRegionLink } from "./meshDerivedGeometry";
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
  it("keeps face-region lineage portable and marks a deleted source missing", () => {
    const link = normalizeMeshFaceRegionLink({ sourceObjectId: "source", faceIndices: [1, 1], sourceRevision: 2, status: "linked" });
    expect(link).toMatchObject({ faceIndices: [1], sourceRevision: 2 });
    expect(normalizeMeshFaceRegionLink({ ...link, faceIndices: [99, -1] })).toBeNull();
    const missing = refreshMeshFaceRegionLink(link!, null, 2)!;
    expect(missing.link.status).toBe("missing");
    expect(missing.mesh).toBeNull();
    expect(refreshMeshFaceRegionLink(missing.link, null, 2)).toBeNull();
    const restored = refreshMeshFaceRegionLink(missing.link, mesh, 2)!;
    expect(restored.link.status).toBe("linked");
    expect(restored.mesh?.indices).toEqual(new Uint32Array([0, 2, 3]));
  });
  it("regenerates on a source revision and preserves the last result on invalid topology or detach", () => {
    const link = { sourceObjectId: "source", faceIndices: [1], sourceRevision: 2, status: "linked" as const };
    const changed = { ...mesh, positions: Float32Array.from(mesh.positions.map((value, index) => index % 3 === 2 ? value + 1 : value)) };
    const updated = refreshMeshFaceRegionLink(link, changed, 3)!;
    expect(updated.link.status).toBe("linked");
    expect(updated.mesh?.positions[2]).toBe(1);
    expect(refreshMeshFaceRegionLink(link, changed, 1)).toMatchObject({ link: { status: "stale" }, mesh: null });
    const invalid = refreshMeshFaceRegionLink(updated.link, { ...mesh, indices: new Uint32Array([0, 1, 2]) }, 4)!;
    expect(invalid.link.status).toBe("stale");
    expect(invalid.mesh).toBeNull();
    expect(refreshMeshFaceRegionLink({ ...updated.link, status: "detached" }, changed, 4)).toBeNull();
  });
});
