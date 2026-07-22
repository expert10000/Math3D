import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "./surfaceMesh";
import { bevelEdge, deleteFace, extrudeFace, insetFace, moveVertex, splitEdge, weldVertices } from "./meshEditOps";

const makeSquareMesh = (): SurfaceMeshData => ({
  label: "Editable square",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

const vertexCount = (mesh: SurfaceMeshData) => Math.floor(mesh.positions.length / 3);
const faceCount = (mesh: SurfaceMeshData) => Math.floor((mesh.indices?.length ?? 0) / 3);
const positionAt = (mesh: SurfaceMeshData, index: number) => {
  const base = index * 3;
  return [mesh.positions[base], mesh.positions[base + 1], mesh.positions[base + 2]];
};

describe("mesh edit operations", () => {
  it("extrudes a face by adding an offset cap and side walls", () => {
    const edited = extrudeFace(makeSquareMesh(), 0, 0.25);

    expect(vertexCount(edited)).toBe(7);
    expect(faceCount(edited)).toBe(9);
    expect(positionAt(edited, 4)).toEqual([0, 0, 0.25]);
    expect(positionAt(edited, 5)).toEqual([1, 0, 0.25]);
  });

  it("insets a face by replacing it with an inner face and boundary triangles", () => {
    const edited = insetFace(makeSquareMesh(), 0, 0.25);

    expect(vertexCount(edited)).toBe(7);
    expect(faceCount(edited)).toBe(8);
    expect(positionAt(edited, 4)[0]).toBeCloseTo(1 / 6);
    expect(positionAt(edited, 4)[1]).toBeCloseTo(1 / 12);
  });

  it("deletes a face and compacts unused vertices", () => {
    const edited = deleteFace(makeSquareMesh(), 0);

    expect(vertexCount(edited)).toBe(3);
    expect(faceCount(edited)).toBe(1);
  });

  it("splits every incident triangle on a selected edge", () => {
    const edited = splitEdge(makeSquareMesh(), 0, 2);

    expect(vertexCount(edited)).toBe(5);
    expect(faceCount(edited)).toBe(4);
    expect(positionAt(edited, 4)).toEqual([0.5, 0.5, 0]);
  });

  it("bevels an edge along the averaged incident face normal", () => {
    const edited = bevelEdge(makeSquareMesh(), 0, 2, 0.1);

    expect(vertexCount(edited)).toBe(4);
    expect(faceCount(edited)).toBe(2);
    expect(positionAt(edited, 0)[2]).toBeCloseTo(0.1);
    expect(positionAt(edited, 2)[2]).toBeCloseTo(0.1);
  });

  it("moves a vertex along an explicit direction", () => {
    const edited = moveVertex(makeSquareMesh(), 1, 0.2, { x: 1, y: 0, z: 0 });

    expect(positionAt(edited, 1)[0]).toBeCloseTo(1.2);
    expect(positionAt(edited, 1)[1]).toBeCloseTo(0);
    expect(positionAt(edited, 1)[2]).toBeCloseTo(0);
  });

  it("welds vertices and drops degenerate triangles", () => {
    const edited = weldVertices(makeSquareMesh(), 0, 1);

    expect(vertexCount(edited)).toBe(3);
    expect(faceCount(edited)).toBe(1);
  });
});
