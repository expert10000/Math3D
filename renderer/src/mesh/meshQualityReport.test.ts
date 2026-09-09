import { describe, expect, it } from "vitest";
import { computeMeshQualityReport, selectMeshQualityFaces } from "./meshQualityReport";

const equilateralMesh = () => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0]),
  indices: new Uint32Array([0, 1, 2]),
});

describe("computeMeshQualityReport", () => {
  it("matches the VTK/Verdict equilateral reference for every normalized triangle metric", () => {
    const report = computeMeshQualityReport(equilateralMesh());
    expect(report.fields.faceValidMask).toEqual(Uint8Array.from([1]));
    expect(report.fields.face.triangleArea[0]).toBeCloseTo(Math.sqrt(3) / 4, 6);
    expect(report.fields.face.aspectRatio[0]).toBeCloseTo(1, 6);
    expect(report.fields.face.edgeRatio[0]).toBeCloseTo(1, 6);
    expect(report.fields.face.minimumAngleDeg[0]).toBeCloseTo(60, 5);
    expect(report.fields.face.maximumAngleDeg[0]).toBeCloseTo(60, 5);
    expect(report.fields.face.radiusRatio[0]).toBeCloseTo(1, 6);
    expect(report.fields.face.scaledJacobian[0]).toBeCloseTo(1, 6);
    expect(report.conventions.backend).toContain("VTK/Verdict");
  });

  it("retains one value per face and orders an elongated triangle as worse", () => {
    const mesh = {
      positions: new Float32Array([
        0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0,
        2, 0, 0, 7, 0, 0, 2.01, 0.05, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    const report = computeMeshQualityReport(mesh);
    expect(report.faceCount).toBe(2);
    for (const values of Object.values(report.fields.face)) expect(values).toHaveLength(2);
    expect(report.fields.face.aspectRatio[1]).toBeGreaterThan(report.fields.face.aspectRatio[0]);
    expect(report.fields.face.edgeRatio[1]).toBeGreaterThan(report.fields.face.edgeRatio[0]);
    expect(report.fields.face.minimumAngleDeg[1]).toBeLessThan(report.fields.face.minimumAngleDeg[0]);
    expect(report.fields.face.radiusRatio[1]).toBeGreaterThan(report.fields.face.radiusRatio[0]);
    expect(report.fields.face.scaledJacobian[1]).toBeLessThan(report.fields.face.scaledJacobian[0]);
  });

  it("masks a near-degenerate triangle instead of contaminating finite statistics", () => {
    const mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 1, 3]),
    };
    const report = computeMeshQualityReport(mesh);
    expect(report.fields.faceValidMask).toEqual(Uint8Array.from([0, 1]));
    expect(Number.isNaN(report.fields.face.minimumAngleDeg[0])).toBe(true);
    expect(report.metrics.minimumAngleDeg.min).toBeCloseTo(45, 6);
    expect(report.topology.degenerateFaceCount).toBe(1);
  });

  it("detects non-manifold edges with incident count greater than two", () => {
    const mesh = {
      positions: new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1]),
      indices: new Uint32Array([0,1,2, 0,1,3, 0,1,4]),
    };
    const report = computeMeshQualityReport(mesh);
    expect(report.topology.nonManifoldEdgeCount).toBe(1);
    expect(report.defects.nonManifoldEdges[0]?.edgeId).toBe("0|1");
    expect(report.defects.nonManifoldEdges[0]?.incidentFaceCount).toBe(3);
  });

  it("selects minimum-angle thresholds and stable worst percentiles on mixed quality", () => {
    const mesh = {
      positions: new Float32Array([
        0,0,0, 1,0,0, 0.5,0.8660254,0,
        2,0,0, 3,0,0, 2.5,0.35,0,
        4,0,0, 5,0,0, 4.5,0.15,0,
        6,0,0, 7,0,0, 6.5,0.05,0,
      ]),
      indices: new Uint32Array([0,1,2, 3,4,5, 6,7,8, 9,10,11]),
    };
    const report = computeMeshQualityReport(mesh);
    const belowTwenty = selectMeshQualityFaces(report, "minimumAngleDeg", { mode: "threshold", value: 20 });
    expect(belowTwenty.count).toBe(2);
    expect(Array.from(belowTwenty.selected)).toEqual([0, 0, 1, 1]);

    const worstOne = selectMeshQualityFaces(report, "aspectRatio", { mode: "worst-percent", percent: 1 });
    expect(worstOne.count).toBe(1);
    expect(Array.from(worstOne.selected)).toEqual([0, 0, 0, 1]);
    const worstFive = selectMeshQualityFaces(report, "minimumAngleDeg", { mode: "worst-percent", percent: 5 });
    expect(worstFive.count).toBe(1);
    expect(Array.from(worstFive.selected)).toEqual([0, 0, 0, 1]);
  });

  it("computes a large regular grid with complete face arrays", () => {
    const side = 130;
    const positions = new Float32Array(side * side * 3);
    for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) {
      const offset = (y * side + x) * 3;
      positions[offset] = x; positions[offset + 1] = y;
    }
    const indices = new Uint32Array((side - 1) * (side - 1) * 6);
    let cursor = 0;
    for (let y = 0; y < side - 1; y += 1) for (let x = 0; x < side - 1; x += 1) {
      const a = y * side + x, b = a + 1, c = a + side, d = c + 1;
      indices.set([a, b, c, b, d, c], cursor); cursor += 6;
    }
    const report = computeMeshQualityReport({ positions, indices });
    const faceCount = (side - 1) * (side - 1) * 2;
    expect(report.faceCount).toBe(faceCount);
    expect(report.fields.face.scaledJacobian).toHaveLength(faceCount);
    expect(report.metrics.minimumAngleDeg.min).toBeCloseTo(45, 6);
  });
});
