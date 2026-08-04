import { describe, expect, it } from "vitest";
import { resolveGeometryPick, type GeometryPickContext, type GeometryRawHit } from "../geometry/picking";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  areUnifiedSelectionsInSameSetDomain,
  createUnifiedSelectionManagerState,
  createUnifiedSelectionSet,
  describeUnifiedSelectionFilter,
  evaluateUnifiedSelectionFilter,
  filterUnifiedSelectionSet,
  getUnifiedSelectionEntityId,
  getUnifiedSelectionKey,
  selectionResultFromGeometryPick,
  selectionResultFromMeshTopology,
  selectionResultWithState,
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
    expect(selection).toMatchObject({
      entityType: "face",
      entityId: "face:0",
      point: [0.5, 0.5, 0],
      normal: [0, 0, 1],
      state: "selected",
      adjacency: {
        faces: [1],
        edges: ["0:1", "1:2", "0:2"],
        vertices: [0, 1, 2],
      },
      topologyFlags: {
        hasTopology: true,
        boundary: false,
        nonManifold: false,
        stale: false,
        faceVertexCount: 3,
        topologyVersion: 7,
      },
    });
  });

  it("returns the doc-facing SelectionResult shape for Geometry picks", () => {
    const pick = resolveGeometryPick(rawHit, "edge", geometryContext);
    const selection = selectionResultFromGeometryPick(pick, "hover");

    expect(selection).toMatchObject({
      workspace: "geometry",
      objectId: "square-1",
      entityType: "edge",
      entityId: "edge:0-2",
      point: [0.5, 0.5, 0],
      state: "hover",
      adjacency: {
        faces: [0, 1],
        vertices: [0, 2],
      },
      topologyFlags: {
        hasTopology: true,
        boundary: false,
        nonManifold: false,
        stale: false,
        topologyVersion: 7,
      },
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
    expect(selection).toMatchObject({
      entityType: "edge",
      entityId: "edge:0-2",
      point: [0.5, 0.5, 0],
      state: "selected",
      adjacency: {
        faces: [0, 1],
        vertices: [0, 2],
        incidentFaces: 2,
      },
      topologyFlags: {
        hasTopology: true,
        boundary: false,
        nonManifold: false,
        stale: false,
      },
    });
  });

  it("returns the doc-facing SelectionResult shape for Mesh topology picks", () => {
    const selection = selectionResultFromMeshTopology(
      {
        mode: "vertex",
        objectLabel: "Square mesh",
        meshKey: "square-mesh",
        mesh: squareMesh,
        vertexIndex: 2,
        valid: true,
      },
      "editing"
    );

    expect(selection).toMatchObject({
      workspace: "mesh",
      objectId: "square-mesh",
      entityType: "vertex",
      entityId: "vertex:2",
      point: [1, 1, 0],
      normal: null,
      state: "editing",
      adjacency: {
        faces: [0, 1],
        incidentFaces: 2,
        incidentEdges: 3,
        valence: 3,
      },
      topologyFlags: {
        hasTopology: true,
        boundary: true,
        nonManifold: false,
        stale: false,
        boundaryEdges: 2,
      },
    });
    expect([...(selection?.adjacency.vertices ?? [])].sort((a, b) => a - b)).toEqual([0, 1, 3]);
  });

  it("creates a shared manager snapshot from normalized selection results", () => {
    const geometryPick = resolveGeometryPick(rawHit, "face", geometryContext);
    const geometryHover = selectionResultFromGeometryPick(geometryPick, "hover");
    const meshSelected = selectionResultFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 2],
      valid: true,
    });

    const meshEditing = selectionResultWithState(meshSelected, "editing");
    const geometryPreview = selectionResultWithState(geometryHover, "preview");
    const manager = createUnifiedSelectionManagerState([geometryHover, meshSelected, meshEditing, geometryPreview]);

    expect(manager.hover?.entityId).toBe("face:0");
    expect(manager.selected?.entityId).toBe("edge:0-2");
    expect(manager.editing?.entityId).toBe("edge:0-2");
    expect(manager.preview?.entityId).toBe("face:0");
    expect(manager.active?.state).toBe("editing");
    expect(manager.byEntityId["face:0"]?.workspace).toBe("geometry");
    expect(manager.byEntityId["edge:0-2"]?.workspace).toBe("mesh");
    expect(manager.label).toBe("Square mesh edge [0-2]");
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

  it("dedupes multi-selection items while preserving mixed entity buckets", () => {
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
    expect(set.count).toBe(3);
    expect(set.items.map((item) => item.entityId)).toEqual(["edge:0-1", "edge:0-2", "vertex:1"]);
    expect(set.counts).toEqual({ object: 0, face: 0, edge: 2, vertex: 1 });
    expect(set.label).toBe("3 items selected on Square mesh");
    expect(set.mixedDomain).toBe(true);
    expect(set.domain).toBeNull();
    expect(set.activeSelection?.vertexId).toBe(1);
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
    expect(set.count).toBe(2);
    expect(set.counts).toEqual({ object: 0, face: 1, edge: 1, vertex: 0 });
    expect(set.domain).toBeNull();
    expect(set.mixedDomain).toBe(true);
    expect(set.activeSelection?.faceId).toBe(0);

    set = updateUnifiedSelectionSet(set, null, "clear");
    expect(set.empty).toBe(true);
    expect(set.label).toBe("No selection");
  });

  it("allows Ctrl-style additions across Geometry objects", () => {
    const first = unifiedSelectionFromGeometryPick(resolveGeometryPick(rawHit, "edge", geometryContext));
    const secondContext: GeometryPickContext = {
      objects: [
        {
          objectId: "square-2",
          objectLabel: "Square B",
          objectType: "mesh",
          meshKey: "square-2",
          topologyVersion: 3,
          worldMesh: squareMesh,
        },
      ],
    };
    const second = unifiedSelectionFromGeometryPick(
      resolveGeometryPick({ ...rawHit, renderObjectId: "square-2" }, "edge", secondContext)
    );

    let set = updateUnifiedSelectionSet(createUnifiedSelectionSet([]), first, "replace");
    set = updateUnifiedSelectionSet(set, second, "add");

    expect(set.count).toBe(2);
    expect(set.objectLabels).toEqual(["Square A", "Square B"]);
    expect(set.label).toBe("2 edges selected across 2 objects");
  });

  it("filters unified selections by type and topology flags", () => {
    const boundaryEdge = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectLabel: "Square mesh",
      meshKey: "square-mesh",
      mesh: squareMesh,
      edgeVertices: [0, 1],
      valid: true,
    });
    const interiorEdge = unifiedSelectionFromMeshTopology({
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

    expect(evaluateUnifiedSelectionFilter(boundaryEdge, { selectionTypes: ["edge"], boundary: "only" })).toEqual({
      accepted: true,
      reasons: [],
    });
    expect(evaluateUnifiedSelectionFilter(interiorEdge, { selectionTypes: ["edge"], boundary: "only" })).toMatchObject({
      accepted: false,
      reasons: ["Only boundary selections are enabled"],
    });
    expect(evaluateUnifiedSelectionFilter(face, { selectionTypes: ["edge"] })).toMatchObject({
      accepted: false,
      reasons: ["face selections are filtered out"],
    });
    expect(describeUnifiedSelectionFilter({ selectionTypes: ["edge"], boundary: "exclude" })).toBe(
      "types: edge · interior only"
    );
  });

  it("filters selection sets while preserving active keys when possible", () => {
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
    const set = createUnifiedSelectionSet([edgeA, edgeB]);
    const filtered = filterUnifiedSelectionSet(set, { boundary: "exclude" });

    expect(filtered.count).toBe(1);
    expect(filtered.activeSelection?.edgeId).toBe("0-2");
    expect(filtered.label).toBe("Square mesh edge [0-2]");
  });
});
