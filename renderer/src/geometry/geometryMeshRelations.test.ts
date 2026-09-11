import { describe, expect, it } from "vitest";
import { buildTraceMapForPromotion } from "./geometryMeshTraceMap";
import {
  createGeometryMeshRelation,
  createGeometryMeshRelationStore,
  mapGeometryMeshSelection,
  markGeometryMeshRelationsStale,
  regenerateGeometryMeshRelation,
  updateGeometryMeshNavigationContext,
  upsertGeometryMeshRelation,
} from "./geometryMeshRelations";

const mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

const relation = () => {
  const trace = buildTraceMapForPromotion({ sourceGeometryId: "surface-1", meshId: "mesh-1", sourceMesh: mesh, promotedMesh: mesh, createdAt: 10 });
  return createGeometryMeshRelation({ sourceGeometryId: "surface-1", sourceKind: "analytic-surface", meshId: "mesh-1", role: "derived-analysis-mesh", sourceRevision: 3, traceMap: trace.toSnapshot(), comparisonTargetIds: ["comparison-1"], now: 10 });
};

describe("Geometry Mesh scene relations", () => {
  it("separates ephemeral display tessellation from saved derived meshes", () => {
    const display = createGeometryMeshRelation({ sourceGeometryId: "g", meshId: "display", role: "display-tessellation", sourceRevision: 1 });
    const saved = createGeometryMeshRelation({ sourceGeometryId: "g", meshId: "saved", role: "saved-derived-mesh", sourceRevision: 1 });
    expect(display.ephemeral).toBe(true);
    expect(saved.ephemeral).toBe(false);
    expect(saved.tessellationPreset.preserveBoundaries).toBe(true);
  });

  it("stores first-class relations and marks old revisions stale", () => {
    const stored = upsertGeometryMeshRelation(createGeometryMeshRelationStore(), relation());
    const stale = markGeometryMeshRelationsStale(stored, "surface-1", 4, 20);
    expect(Object.values(stale.relations)[0].status).toBe("stale");
    expect(Object.values(stale.relations)[0].traceMap).not.toBeNull();
  });

  it("maps semantic selection in both directions with confidence", () => {
    const forward = mapGeometryMeshSelection({ relation: relation(), direction: "geometry-to-mesh", kind: "face", indices: [0] });
    const reverse = mapGeometryMeshSelection({ relation: relation(), direction: "mesh-to-geometry", kind: "vertex", indices: [0, 1] });
    expect(forward).toMatchObject({ confidence: "exact", matched: 1, total: 1, targetIndices: [0] });
    expect(reverse).toMatchObject({ confidence: "exact", matched: 2, total: 2, targetIndices: [0, 1] });
  });

  it("regenerates in place while preserving identity, history and comparison targets", () => {
    const regenerated = regenerateGeometryMeshRelation(relation(), { nextMeshId: "mesh-2", nextSourceRevision: 4, now: 30 });
    expect(regenerated.id).toBe(relation().id);
    expect(regenerated.meshId).toBe("mesh-2");
    expect(regenerated.status).toBe("current");
    expect(regenerated.comparisonTargetIds).toEqual(["comparison-1"]);
    expect(regenerated.regenerationHistory[0]).toMatchObject({ previousMeshId: "mesh-1", nextMeshId: "mesh-2", previousSourceRevision: 3, nextSourceRevision: 4 });
  });

  it("retains Geometry and Mesh navigation context on the shared relation", () => {
    const geometryContext = updateGeometryMeshNavigationContext(relation(), {
      module: "geometry",
      selectionKind: "face",
      selectedIndices: [0],
      cameraTarget: [0, 0, 0],
    });
    const roundTrip = updateGeometryMeshNavigationContext(geometryContext, {
      module: "mesh",
      selectionKind: "face",
      selectedIndices: [0],
      cameraPosition: [2, 2, 2],
    });
    expect(roundTrip.geometryContext?.selectedIndices).toEqual([0]);
    expect(roundTrip.meshContext?.cameraPosition).toEqual([2, 2, 2]);
  });
});
