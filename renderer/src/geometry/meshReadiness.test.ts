import { describe, expect, it } from "vitest";
import { evaluateGeometryMeshReadiness } from "./meshReadiness";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

const mesh = (positions: number[], indices: number[] | null, normals?: number[] | null): SurfaceMeshData => ({
  label: "test",
  positions: new Float32Array(positions),
  indices: indices ? new Uint32Array(indices) : null,
  normals: normals ? new Float32Array(normals) : null,
  source: { kind: "detachedMesh" },
});

describe("evaluateGeometryMeshReadiness", () => {
  it("reports healthy mesh for a closed tetrahedron", () => {
    const tetra = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ],
      [
        0, 2, 1,
        0, 1, 3,
        0, 3, 2,
        1, 2, 3,
      ]
    );
    const report = evaluateGeometryMeshReadiness(tetra);
    expect(report.canSafelyBecomeMeshObject).toBe(true);
    expect(report.stats.nonManifoldEdgeCount).toBe(0);
    expect(report.stats.boundaryEdgeCount).toBe(0);
  });

  it("flags open boundary and non-manifold edge issues", () => {
    const openNonManifold = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0, -1, 0,
        0, 0, 1,
      ],
      [
        0, 1, 2,
        0, 1, 3,
        0, 1, 4,
      ]
    );
    const report = evaluateGeometryMeshReadiness(openNonManifold);
    expect(report.canSafelyBecomeMeshObject).toBe(false);
    expect(report.stats.nonManifoldEdgeCount).toBeGreaterThan(0);
    expect(report.stats.boundaryEdgeCount).toBeGreaterThan(0);
  });

  it("detects duplicate vertices and degenerate triangles", () => {
    const bad = mesh(
      [
        0, 0, 0,
        1, 0, 0,
        1, 0, 0,
        0, 0, 0,
      ],
      [
        0, 1, 2,
        1, 2, 3,
      ],
      [
        0, 0, 1,
      ]
    );
    const report = evaluateGeometryMeshReadiness(bad);
    expect(report.stats.duplicateVertexCount).toBeGreaterThan(0);
    expect(report.stats.degenerateTriangleCount).toBeGreaterThan(0);
    expect(report.checks.find((entry) => entry.id === "normals_valid")?.status).toBe("warning");
  });
});
