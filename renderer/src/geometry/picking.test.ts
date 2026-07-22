import { describe, expect, it } from "vitest";
import {
  isGeometryTopologyReferenceStale,
  resolveGeometryPick,
  summarizeGeometryEdgeTopology,
  summarizeGeometryFaceTopology,
  summarizeGeometryVertexTopology,
  type GeometryPickContext,
  type GeometryRawHit,
} from "./picking";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

const triangleMesh: SurfaceMeshData = {
  label: "Triangle",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
};

const context: GeometryPickContext = {
  objects: [
    {
      objectId: "tri-1",
      objectLabel: "Triangle A",
      objectType: "mesh",
      meshKey: "tri-1",
      topologyVersion: 3,
      worldMesh: triangleMesh,
    },
  ],
};

const rawHit: GeometryRawHit = {
  renderObjectId: "tri-1",
  point: [0.2, 0.2, 0],
  normal: [0, 1, 0],
  faceIndex: 0,
  distance: 2,
};

const squareMesh: SurfaceMeshData = {
  label: "Square",
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  normals: null,
  uvs: null,
  source: { kind: "proceduralObjects" },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
};

describe("resolveGeometryPick", () => {
  it("returns object-level picks without inventing entity ids", () => {
    const pick = resolveGeometryPick(rawHit, "object", context);

    expect(pick?.kind).toBe("object");
    expect(pick?.objectId).toBe("tri-1");
    expect(pick?.label).toBe("Triangle A object");
    expect(pick?.topologyVersion).toBe(3);
    expect(pick?.faceIndex).toBeUndefined();
  });

  it("returns face picks with triangle, barycentric, normal, and tangent basis", () => {
    const pick = resolveGeometryPick(rawHit, "face", context);

    expect(pick?.kind).toBe("face");
    expect(pick?.faceIndex).toBe(0);
    expect(pick?.topologyReference).toEqual({
      objectId: "tri-1",
      topologyVersion: 3,
      kind: "face",
      faceIndex: 0,
      fallbackWorldPoint: [0.2, 0.2, 0],
    });
    expect(isGeometryTopologyReferenceStale(pick?.topologyReference, 3)).toBe(false);
    expect(isGeometryTopologyReferenceStale(pick?.topologyReference, 4)).toBe(true);
    expect(pick?.sourceTriangle).toEqual([0, 1, 2]);
    expect(pick?.normal).toEqual([0, 0, 1]);
    expect(pick?.faceNormal).toEqual([0, 0, 1]);
    expect(pick?.surfaceNormal).toEqual([0, 1, 0]);
    expect(pick?.tangent).toEqual([1, 0, 0]);
    expect(pick?.bitangent).toEqual([0, 1, 0]);
    expect(pick?.tangentKind).toBe("face-frame");
    expect(pick?.barycentric?.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("returns stable sorted edge vertex pairs", () => {
    const pick = resolveGeometryPick({ ...rawHit, point: [0.5, 0.05, 0] }, "edge", context);

    expect(pick?.kind).toBe("edge");
    expect(pick?.edgeVertices).toEqual([0, 1]);
    expect(pick?.edgeKey).toBe("0:1");
    expect(pick?.label).toBe("Triangle A edge [0, 1]");
    expect(pick?.tangent).toEqual([1, 0, 0]);
    expect(pick?.bitangent).toEqual([0, 1, 0]);
    expect(pick?.tangentKind).toBe("edge-direction");
  });

  it("uses pixel thresholds before accepting edge picks", () => {
    const screenHit: GeometryRawHit = {
      ...rawHit,
      screenPoint: [50, 30],
      sourceTriangleScreen: [[0, 0], [100, 0], [0, 100]],
    };

    expect(resolveGeometryPick(screenHit, "edge", { ...context, selectionRadiusPx: { edge: 8, vertex: 10 } })).toBeNull();
    expect(
      resolveGeometryPick(
        { ...screenHit, screenPoint: [50, 5] },
        "edge",
        { ...context, selectionRadiusPx: { edge: 8, vertex: 10 } }
      )?.edgeVertices
    ).toEqual([0, 1]);
  });

  it("uses pixel thresholds before accepting vertex picks", () => {
    const screenHit: GeometryRawHit = {
      ...rawHit,
      screenPoint: [22, 20],
      sourceTriangleScreen: [[0, 0], [100, 0], [0, 100]],
    };

    expect(resolveGeometryPick(screenHit, "vertex", { ...context, selectionRadiusPx: { edge: 8, vertex: 10 } })).toBeNull();
    expect(
      resolveGeometryPick(
        { ...screenHit, screenPoint: [4, 3] },
        "vertex",
        { ...context, selectionRadiusPx: { edge: 8, vertex: 10 } }
      )?.vertexIndex
    ).toBe(0);
  });

  it("returns explicit vertex picks when the renderer provides a vertex index", () => {
    const pick = resolveGeometryPick({ ...rawHit, vertexIndex: 2 }, "vertex", context);

    expect(pick?.kind).toBe("vertex");
    expect(pick?.vertexIndex).toBe(2);
    expect(pick?.worldPoint).toEqual([0, 1, 0]);
    expect(pick?.surfaceNormal).toEqual([0, 1, 0]);
    expect(pick?.vertexNormal).toEqual([0, 0, 1]);
    expect(pick?.normal).toEqual([0, 0, 1]);
    expect(pick?.tangent).toBeUndefined();
    expect(pick?.bitangent).toBeUndefined();
    expect(pick?.tangentKind).toBeUndefined();
    expect(pick?.vertexTopology).toEqual({
      incidentEdges: 2,
      incidentFaces: 1,
      valence: 2,
      boundaryEdges: 2,
      neighborVertices: [0, 1],
      faceIndices: [0],
    });
  });

  it("summarizes topology around selected vertices, edges, and faces", () => {
    expect(summarizeGeometryVertexTopology(squareMesh, 0)).toEqual({
      incidentEdges: 3,
      incidentFaces: 2,
      valence: 3,
      boundaryEdges: 2,
      neighborVertices: [1, 2, 3],
      faceIndices: [0, 1],
    });
    expect(summarizeGeometryEdgeTopology(squareMesh, [0, 2])).toEqual({
      incidentFaces: 2,
      adjacentFaces: [0, 1],
      boundary: false,
      nonManifold: false,
    });
    expect(summarizeGeometryFaceTopology(squareMesh, 0)).toEqual({
      vertices: 3,
      edges: 3,
      adjacentFaces: 1,
      adjacentFaceIndices: [1],
    });
  });

  it("honors explicit renderable pick policies", () => {
    const neverContext: GeometryPickContext = {
      objects: [{ ...context.objects[0], pickPolicy: "never" }],
    };
    const objectOnlyContext: GeometryPickContext = {
      objects: [{ ...context.objects[0], pickPolicy: "object-only" }],
    };
    const helperContext: GeometryPickContext = {
      objects: [{ ...context.objects[0], pickPolicy: "helper" }],
    };

    expect(resolveGeometryPick(rawHit, "object", neverContext)).toBeNull();
    expect(resolveGeometryPick(rawHit, "face", objectOnlyContext)).toBeNull();
    expect(resolveGeometryPick(rawHit, "object", objectOnlyContext)?.kind).toBe("object");
    expect(resolveGeometryPick(rawHit, "face", helperContext)).toBeNull();
    expect(resolveGeometryPick(rawHit, "face", { ...helperContext, includeHelperPicks: true })?.kind).toBe("face");
  });
});
