import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  computeGeometryAnalysisBasicMetrics,
  computeGeometryAnalysisTopologySummary,
  createGeometryAnalysisSnapshot,
  evaluateGeometryAnalysisEligibility,
  formatGeometryAnalysisSnapshotId,
} from "./analysisBridge";

const mesh = (positions: number[], indices: number[] | null): SurfaceMeshData => ({
  label: "test",
  positions: new Float32Array(positions),
  indices: indices ? new Uint32Array(indices) : null,
  normals: null,
  source: { kind: "detachedMesh" },
});

const tetraMesh = () =>
  mesh(
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

describe("analysisBridge", () => {
  it("formats snapshot ids with zero padding", () => {
    expect(formatGeometryAnalysisSnapshotId(1)).toBe("geometry-analysis-00001");
    expect(formatGeometryAnalysisSnapshotId(42)).toBe("geometry-analysis-00042");
  });

  it("computes basic metrics for tetra mesh", () => {
    const metrics = computeGeometryAnalysisBasicMetrics(tetraMesh());
    expect(metrics.volume).toBeGreaterThan(0);
    expect(metrics.area).toBeGreaterThan(0);
    expect(metrics.centroid).not.toBeNull();
    expect(metrics.bounds).not.toBeNull();
  });

  it("computes topology summary for tetra mesh", () => {
    const topology = computeGeometryAnalysisTopologySummary(tetraMesh());
    expect(topology.vertexCount).toBe(4);
    expect(topology.edgeCount).toBe(6);
    expect(topology.faceCount).toBe(4);
    expect(topology.eulerCharacteristic).toBe(2);
    expect(topology.boundaryCount).toBe(0);
    expect(topology.manifold).toBe(true);
  });

  it("rejects empty mesh eligibility", () => {
    const empty = mesh([], []);
    const eligibility = evaluateGeometryAnalysisEligibility(empty);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/no mesh vertices/i);
  });

  it("creates analysis-ready snapshot for eligible mesh", () => {
    const snapshot = createGeometryAnalysisSnapshot({
      mesh: tetraMesh(),
      sourceObjectId: "obj-1",
      sourceObjectName: "Tetra",
      snapshotSequence: 7,
      createdAt: 123,
    });
    expect(snapshot.id).toBe("geometry-analysis-00007");
    expect(snapshot.sourceObjectId).toBe("obj-1");
    expect(snapshot.createdAt).toBe(123);
    expect(snapshot.mesh.positions.length).toBeGreaterThan(0);
    expect(snapshot.readiness.stats.vertexCount).toBeGreaterThan(0);
  });
});

