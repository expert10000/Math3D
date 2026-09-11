import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { promoteGeometryToMesh } from "./meshPromotionContract";
import { getGlobalGeometryMeshRelationStore, resetGlobalGeometryMeshRelationStore } from "./geometryMeshRelations";

const mesh = (positions: number[], indices: number[] | null): SurfaceMeshData => ({
  label: "source",
  positions: new Float32Array(positions),
  indices: indices ? new Uint32Array(indices) : null,
  source: { kind: "detachedMesh" },
});

describe("promoteGeometryToMesh", () => {
  it("adds contract metadata for raw mode", () => {
    resetGlobalGeometryMeshRelationStore();
    const input = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ],
      [0, 1, 2]
    );
    const result = promoteGeometryToMesh({
      mesh: input,
      sourceGeometryId: "obj-1",
      sourceGeometryKind: "solid",
      sourceRevision: 7,
      traceMeshId: "mesh-1",
      tessellationPreset: { id: "production", label: "Production", chordTolerance: 0.002, parameterDensity: 48 },
      sourceOperationHistory: ["create box", "extrude face"],
      promotionMode: "raw_mesh",
      createdAt: 1000,
    });
    expect(result.metadata.sourceGeometryId).toBe("obj-1");
    expect(result.metadata.sourceGeometryKind).toBe("solid");
    expect(result.metadata.sourceRevision).toBe(7);
    expect(result.metadata.relationId).toBe("geometry-mesh:obj-1:mesh-1");
    expect(result.metadata.relationRole).toBe("saved-derived-mesh");
    expect(result.metadata.tessellationPreset).toMatchObject({ id: "production", chordTolerance: 0.002, parameterDensity: 48, preserveBoundaries: true });
    expect(result.metadata.sourceOperationHistory).toEqual(["create box", "extrude face"]);
    expect(result.metadata.promotionMode).toBe("raw_mesh");
    expect(result.metadata.traceMap).toBeTruthy();
    expect(result.metadata.vertexCount).toBe(3);
    expect(result.metadata.faceCount).toBe(1);
    expect(result.metadata.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    expect(result.metadata.createdAt).toBe(1000);
    expect(Object.values(getGlobalGeometryMeshRelationStore().relations)[0]).toMatchObject({
      sourceGeometryId: "obj-1",
      meshId: "mesh-1",
      sourceRevision: 7,
      sourceKind: "solid",
    });
  });

  it("triangulates sequential faces when indices are missing", () => {
    const input = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
        1, 0, 1,
        0, 1, 1,
      ],
      null
    );
    const result = promoteGeometryToMesh({
      mesh: input,
      promotionMode: "triangulated_mesh",
    });
    expect(result.mesh.indices).not.toBeNull();
    expect(result.mesh.indices?.length).toBe(6);
    expect(result.metadata.traceMap).toBeNull();
    expect(result.metadata.faceCount).toBe(2);
  });

  it("marks frozen mode as frozen", () => {
    const input = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ],
      [0, 1, 2]
    );
    const result = promoteGeometryToMesh({
      mesh: input,
      promotionMode: "frozen_baked_object",
    });
    expect(result.frozen).toBe(true);
    expect(result.metadata.validityReport).toBeTruthy();
  });
});
