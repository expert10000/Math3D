import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "./surfaceMesh";
import { meshEdgeKey, selectMeshEdgesByTool } from "./edgeSelection";

const makeStripMesh = (): SurfaceMeshData => ({
  label: "Tri strip",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    2, 0, 0,
    3, 0, 0,
    0, 1, 0,
    1, 1, 0,
    2, 1, 0,
    3, 1, 0,
  ]),
  indices: Uint32Array.from([
    0, 1, 5,
    0, 5, 4,
    1, 2, 6,
    1, 6, 5,
    2, 3, 7,
    2, 7, 6,
  ]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

const makeFoldedMesh = (): SurfaceMeshData => ({
  label: "Folded quad",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 1,
  ]),
  indices: Uint32Array.from([
    0, 1, 2,
    1, 3, 2,
  ]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

const makeFlatMeshWithFlippedWinding = (): SurfaceMeshData => ({
  label: "Flat flipped quad",
  positions: Float32Array.from([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]),
  indices: Uint32Array.from([
    0, 1, 2,
    1, 2, 3,
  ]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});

const edgeKeys = (edges: readonly (readonly [number, number])[]) =>
  edges.map(([a, b]) => meshEdgeKey(a, b)).sort();

describe("mesh edge selection tools", () => {
  it("selects the straight edge loop through connected vertices", () => {
    const result = selectMeshEdgesByTool(makeStripMesh(), 1, 2, "loop");

    expect(edgeKeys(result.edges)).toEqual(["0-1", "1-2", "2-3"]);
    expect(result.status).toContain("Edge loop selected 3 edges");
  });

  it("selects a parallel edge ring across adjacent faces", () => {
    const result = selectMeshEdgesByTool(makeStripMesh(), 1, 2, "ring");

    expect(edgeKeys(result.edges)).toEqual(["0-1", "1-2", "2-3", "4-5", "5-6", "6-7"]);
    expect(result.status).toContain("Edge ring selected 6 edges");
  });

  it("selects the connected boundary component from a boundary edge", () => {
    const result = selectMeshEdgesByTool(makeStripMesh(), 0, 1, "boundary");

    expect(edgeKeys(result.edges)).toEqual(["0-1", "0-4", "1-2", "2-3", "3-7", "4-5", "5-6", "6-7"]);
    expect(result.status).toContain("Boundary selected 8 edges");
  });

  it("selects all mesh boundary edges when the seed edge is interior", () => {
    const result = selectMeshEdgesByTool(makeStripMesh(), 1, 5, "boundary");

    expect(edgeKeys(result.edges)).toEqual(["0-1", "0-4", "1-2", "2-3", "3-7", "4-5", "5-6", "6-7"]);
  });

  it("selects sharp crease edges by face angle", () => {
    const result = selectMeshEdgesByTool(makeFoldedMesh(), 1, 2, "sharp");

    expect(edgeKeys(result.edges)).toEqual(["1-2"]);
    expect(result.status).toContain("Sharp edges selected 1 edge");
  });

  it("does not mark a flat shared edge as sharp when triangle winding is flipped", () => {
    const result = selectMeshEdgesByTool(makeFlatMeshWithFlippedWinding(), 1, 2, "sharp");

    expect(edgeKeys(result.edges)).toEqual([]);
    expect(result.status).toContain("Sharp edges found no selectable edges");
  });

  it("selects feature edges from sharp, boundary, and non-manifold candidates", () => {
    const result = selectMeshEdgesByTool(makeFoldedMesh(), 1, 2, "feature");

    expect(edgeKeys(result.edges)).toEqual(["0-1", "0-2", "1-2", "1-3", "2-3"]);
    expect(result.status).toContain("Feature edges selected 5 edges");
  });
});
