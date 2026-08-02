import { describe, expect, it } from "vitest";
import { resolveGeometryPick, type GeometryPickContext, type GeometryRawHit } from "../geometry/picking";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  areUnifiedSelectionsInSameSetDomain,
  createUnifiedSelectionSet,
  getUnifiedSelectionEntityId,
  getUnifiedSelectionKey,
  unifiedSelectionFromGeometryPick,
  unifiedSelectionFromMeshTopology,
  updateUnifiedSelectionSet,
} from "./unifiedSelection";

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

  it("builds a single-item selection set with stable identity, active, and anchor keys", () => {
    const pick = resolveGeometryPick(rawHit, "face", geometryContext);
    const selection = unifiedSelectionFromGeometryPick(pick);
    expect(selection).not.toBeNull();

    const key = getUnifiedSelectionKey(selection!);
    const set = createUnifiedSelectionSet([selection]);

    expect(getUnifiedSelectionEntityId(selection!)).toBe("face:0");
    expect(key).toBe("geometry|square-1|square-1|7|face|face%3A0");
    expect(set).toMatchObject({
      count: 1,
      empty: false,
      keys: [key],
      activeKey: key,
      anchorKey: key,
      label: "Square A face #0",
      counts: { object: 0, face: 1, edge: 0, vertex: 0 },
    });
    expect(set.domain).toMatchObject({
      workspace: "geometry",
      selectionType: "face",
      objectId: "square-1",
      objectLabel: "Square A",
    });
    expect(set.activeSelection).toBe(selection);
    expect(set.anchorSelection).toBe(selection);
  });

  it("dedupes multi-selection items inside one workspace/object/type domain", () => {
    const edgeA = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const edgeB = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
    });
    const duplicateEdgeA = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const vertex = unifiedSelectionFromMeshTopology({
      mode: "vertex",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      vertexIndex: 1,
      valid: true,
    });

    expect(edgeA && edgeB && areUnifiedSelectionsInSameSetDomain(edgeA, edgeB)).toBe(true);
    expect(edgeA && vertex && areUnifiedSelectionsInSameSetDomain(edgeA, vertex)).toBe(false);

    const set = createUnifiedSelectionSet([edgeA, edgeB, duplicateEdgeA, vertex]);
    expect(set.count).toBe(2);
    expect(set.items.map((item) => item.edgeId)).toEqual(["0-1", "0-2"]);
    expect(set.counts).toEqual({ object: 0, face: 0, edge: 2, vertex: 0 });
    expect(set.label).toBe("2 edges selected on Square mesh");
    expect(set.activeSelection?.edgeId).toBe("0-2");
    expect(set.anchorSelection?.edgeId).toBe("0-1");
  });

  it("updates multi-selection sets with add, toggle, remove, replace, and clear edits", () => {
    const edgeA = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const edgeB = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
    });
    const face = unifiedSelectionFromMeshTopology({
      mode: "face",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      faceIndex: 0,
      valid: true,
    });

    let set = updateUnifiedSelectionSet(createUnifiedSelectionSet([]), edgeA, "replace");
    set = updateUnifiedSelectionSet(set, edgeB, "add");
    expect(set.items.map((item) => item.edgeId)).toEqual(["0-1", "0-2"]);
    expect(set.activeSelection?.edgeId).toBe("0-2");
    expect(set.anchorSelection?.edgeId).toBe("0-1");

    set = updateUnifiedSelectionSet(set, edgeA, "toggle");
    expect(set.items.map((item) => item.edgeId)).toEqual(["0-2"]);
    expect(set.anchorSelection?.edgeId).toBe("0-2");

    set = updateUnifiedSelectionSet(set, edgeA, "add");
    expect(set.items.map((item) => item.edgeId)).toEqual(["0-2", "0-1"]);

    set = updateUnifiedSelectionSet(set, edgeA, "remove");
    expect(set.items.map((item) => item.edgeId)).toEqual(["0-2"]);

    set = updateUnifiedSelectionSet(set, face, "add");
    expect(set.count).toBe(1);
    expect(set.domain?.selectionType).toBe("face");
    expect(set.activeSelection?.faceId).toBe(0);

    set = updateUnifiedSelectionSet(set, null, "clear");
    expect(set.empty).toBe(true);
    expect(set.label).toBe("No selection");
  });
});
