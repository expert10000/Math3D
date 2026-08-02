import { describe, expect, it } from "vitest";
import { resolveGeometryPick, type GeometryPickContext, type GeometryRawHit } from "../geometry/picking";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { unifiedSelectionFromGeometryPick, unifiedSelectionFromMeshTopology } from "./unifiedSelection";

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

const geometryContext: GeometryPickContext = {
  objects: [
    {
      objectId: "square-1",
      objectLabel: "Square A",
      objectType: "mesh",
      meshKey: "square-1",
      topologyVersion: 7,
      worldMesh: squareMesh,
    },
  ],
};

const rawHit: GeometryRawHit = {
  renderObjectId: "square-1",
  point: [0.5, 0.5, 0],
  normal: [0, 0, 1],
  faceIndex: 0,
  distance: 1,
};

describe("unifiedSelection", () => {
  it("adapts Geometry picks to the shared selection contract", () => {
    const pick = resolveGeometryPick(rawHit, "face", geometryContext);
    const selection = unifiedSelectionFromGeometryPick(pick);

    expect(selection).toMatchObject({
      workspace: "geometry",
      selectionType: "face",
      lifecycle: "selected",
      objectId: "square-1",
      objectLabel: "Square A",
      meshKey: "square-1",
      topologyVersion: 7,
      stale: false,
      faceId: 0,
      label: "Square A face #0",
      source: "geometry-pick",
    });
    expect(selection?.topology.adjacentFaces).toEqual([1]);
    expect(selection?.topology.adjacentEdges).toEqual(["0:1", "1:2", "0:2"]);
    expect(selection?.worldPosition).toEqual([0.5, 0.5, 0]);
    expect(selection?.normal).toEqual([0, 0, 1]);
    expect(selection?.topologyReference).toMatchObject({
      objectId: "square-1",
      topologyVersion: 7,
      kind: "face",
      faceIndex: 0,
    });
  });

  it("adapts Mesh object mode to the shared selection contract", () => {
    const selection = unifiedSelectionFromMeshTopology({
      mode: "object",
      objectLabel: "Bunny mesh",
      objectId: "bunny",
      mesh: squareMesh,
    });

    expect(selection).toMatchObject({
      workspace: "mesh",
      selectionType: "object",
      objectId: "bunny",
      objectLabel: "Bunny mesh",
      label: "Bunny mesh object",
      source: "mesh-object",
    });
  });

  it("adapts Mesh edge fields and computes topology when mesh data is available", () => {
    const selection = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
    });

    expect(selection).toMatchObject({
      workspace: "mesh",
      selectionType: "edge",
      objectId: "square-mesh",
      meshKey: "square-mesh",
      edgeId: "0-2",
      edgeVertices: [0, 2],
      label: "Square mesh edge [0-2]",
      source: "mesh-topology",
    });
    expect(selection?.topology).toMatchObject({
      adjacentFaces: [0, 1],
      adjacentVertices: [0, 2],
      incidentFaces: 2,
      boundary: false,
      nonManifold: false,
    });
  });

  it("returns null for cleared or invalid Mesh entity selections", () => {
    expect(
      unifiedSelectionFromMeshTopology({
        mode: "vertex",
        objectLabel: "Square mesh",
        vertexIndex: 2,
        valid: false,
      })
    ).toBeNull();
    expect(
      unifiedSelectionFromMeshTopology({
        mode: "face",
        objectLabel: "Square mesh",
        faceIndex: 0,
        selectionCleared: true,
      })
    ).toBeNull();
  });
});
