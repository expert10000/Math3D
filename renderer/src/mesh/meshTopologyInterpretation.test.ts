import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSurfaceMeshFromFile, type SurfaceMeshData } from "./surfaceMesh";
import { computeMeshTopologyInterpretations } from "./meshTopologyInterpretation";

const meshRoot = path.resolve(fileURLToPath(new URL("../../../tests/assets/meshes", import.meta.url)));

const fixture = async (relativePath: string): Promise<SurfaceMeshData> => {
  const bytes = await readFile(path.join(meshRoot, relativePath));
  return loadSurfaceMeshFromFile([new File([bytes], path.basename(relativePath))], { mergeVertices: false });
};

describe("MESH-04 indexed source and spatial-weld interpretation", () => {
  it("keeps a split-vertex STL cube source intact while showing the connected interpretation", async () => {
    const source = await fixture("basic/03_cube_ascii.stl");
    const positionsBefore = new Uint8Array(source.positions.buffer.slice(0));
    const indicesBefore = source.indices ? new Uint8Array(source.indices.buffer.slice(0)) : null;

    const comparison = computeMeshTopologyInterpretations(source, 1e-6);
    expect(comparison).toMatchObject({ method: "position-distance", tolerance: 1e-6, mergedVertexCount: 28, collapsedFaceCount: 0 });
    expect(comparison.indexedSource).toMatchObject({ vertexCount: 36, faceCount: 12, boundaryEdgeCount: 36, closed: false });
    expect(comparison.spatialWeld).toMatchObject({ vertexCount: 8, faceCount: 12, edgeCount: 18, boundaryEdgeCount: 0, closed: true });
    expect(new Uint8Array(source.positions.buffer)).toEqual(positionsBefore);
    expect(source.indices ? new Uint8Array(source.indices.buffer) : null).toEqual(indicesBefore);
  });

  it("keeps open-boundary suitability separate from triangle validity", async () => {
    const source = await fixture("problematic/15_open_boundary.obj");
    const comparison = computeMeshTopologyInterpretations(source, 1e-6);
    expect(comparison.indexedSource.faceCount).toBeGreaterThan(0);
    expect(comparison.indexedSource.boundaryEdgeCount).toBe(4);
    expect(comparison.indexedSource.nonManifoldEdgeCount).toBe(0);
    expect(comparison.indexedSource.closed).toBe(false);
  });

  it("uses geometric distance across spatial cells without changing the input", async () => {
    const source = await fixture("basic/03_cube_ascii.stl");
    const positions = source.positions.slice();
    const first = Array.from({ length: positions.length / 3 }, (_, index) => index).find((index) =>
      index > 0 && positions[index * 3] === positions[0] &&
      positions[index * 3 + 1] === positions[1] && positions[index * 3 + 2] === positions[2]);
    expect(first).toBeDefined();
    positions[first! * 3] -= 5e-7;
    const altered = { ...source, positions };
    expect(computeMeshTopologyInterpretations(altered, 0).spatialWeld.vertexCount).toBe(9);
    expect(computeMeshTopologyInterpretations(altered, 1e-6).spatialWeld.vertexCount).toBe(8);
    expect(source.positions[first! * 3]).toBe(source.positions[0]);
  });

  it("rejects an invalid interpretation tolerance", async () => {
    const source = await fixture("basic/03_cube_ascii.stl");
    expect(() => computeMeshTopologyInterpretations(source, -1)).toThrow(RangeError);
    expect(() => computeMeshTopologyInterpretations(source, Number.NaN)).toThrow(RangeError);
  });
});
