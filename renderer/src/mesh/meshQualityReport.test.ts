import { describe, expect, it } from "vitest";
import { computeMeshQualityReport } from "./meshQualityReport";

describe("computeMeshQualityReport", () => {
  it("computes basic min/avg/max metrics for a simple manifold mesh", () => {
    const mesh = {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        1, 1, 0,
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        1, 3, 2,
      ]),
    };

    const report = computeMeshQualityReport(mesh);
    expect(report.vertexCount).toBe(4);
    expect(report.faceCount).toBe(2);
    expect(report.topology.nonManifoldEdgeCount).toBe(0);
    expect(report.topology.degenerateFaceCount).toBe(0);
    expect(report.metrics.edgeLength.min).toBeGreaterThan(0);
    expect(report.metrics.triangleArea.min).toBeGreaterThan(0);
    expect(report.metrics.aspectRatio.max).toBeGreaterThanOrEqual(report.metrics.aspectRatio.min ?? 0);
  });

  it("detects non-manifold edges with incident count > 2", () => {
    const mesh = {
      positions: new Float32Array([
        0, 0, 0, // 0
        1, 0, 0, // 1
        0, 1, 0, // 2
        0, -1, 0, // 3
        0, 0, 1, // 4
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        0, 1, 3,
        0, 1, 4,
      ]),
    };

    const report = computeMeshQualityReport(mesh);
    expect(report.topology.nonManifoldEdgeCount).toBe(1);
    expect(report.defects.nonManifoldEdges[0]?.edgeId).toBe("0|1");
    expect(report.defects.nonManifoldEdges[0]?.incidentFaceCount).toBe(3);
  });

  it("flags degenerate and high-aspect faces", () => {
    const mesh = {
      positions: new Float32Array([
        0, 0, 0, // 0
        2, 0, 0, // 1
        2.001, 0.0001, 0, // 2 (very skinny)
        0, 0, 0, // 3
        0, 0, 0, // 4 (degenerate)
        1, 1, 0, // 5
      ]),
      indices: new Uint32Array([
        0, 1, 2,
        3, 4, 5,
      ]),
    };

    const report = computeMeshQualityReport(mesh, { highAspectRatioThreshold: 6 });
    expect(report.topology.degenerateFaceCount).toBeGreaterThan(0);
    expect(report.defects.degenerateFaces.length).toBeGreaterThan(0);
    expect(report.defects.highAspectFaces.length).toBeGreaterThan(0);
  });
});
