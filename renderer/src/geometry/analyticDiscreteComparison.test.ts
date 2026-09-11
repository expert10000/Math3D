import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { getGeometryExactSurfacePreset } from "./exactSurfaceAnalysis";
import { compareAnalyticGeometryToDiscrete } from "./analyticDiscreteComparison";

const planeMesh = (z = 0): SurfaceMeshData => ({ label: "plane", positions: Float32Array.from([-2, -2, z, 2, -2, z, -2, 2, z, 2, 2, z]), indices: Uint32Array.from([0, 1, 2, 1, 3, 2]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: null, adjacency: [], meanEdgeLength: 1, source: { kind: "detachedMesh" }, validation: { ok: true, errors: [], warnings: [], stats: { vertexCount: 4, faceCount: 2, outOfRangeIndices: 0, degenerateFaces: 0, nanPositions: 0, nanNormals: 0, nanUvs: 0 } } });
const target = (mesh: SurfaceMeshData, kind: "display-tessellation" | "derived-analysis-mesh" | "saved-mesh-result" = "display-tessellation") => ({ id: kind, label: kind, kind, mesh, sourceRevision: 3, tessellation: { chordTolerance: 0.01, angularTolerance: 0.1, maximumEdgeLength: 1, parameterDensity: 17 }, engine: "test tessellator" });

describe("analytic versus discrete comparison", () => {
  it("keeps exact and discrete values distinct and locates worst error", () => {
    const result = compareAnalyticGeometryToDiscrete({ definition: getGeometryExactSurfacePreset("plane"), targets: [target(planeMesh(0.1))], uCount: 5, vCount: 5, createdAt: "2026-01-01T00:00:00.000Z" });
    const compared = result.targets[0];
    expect(result.conventions.exactDistinct).toBe(true);
    expect(compared.quantities.find((entry) => entry.quantity === "position")?.statistics).toMatchObject({ signedMean: expect.closeTo(0.1, 5), maximum: expect.any(Number) });
    expect(compared.worstMarkers.length).toBeGreaterThan(0);
    expect(compared.heatmap).toHaveLength(25);
  });
  it("compares all target roles and records revisions/tessellation/engines", () => {
    const targets = [target(planeMesh(), "display-tessellation"), target(planeMesh(), "derived-analysis-mesh"), { ...target(planeMesh(), "saved-mesh-result"), fields: { gaussianCurvature: [0, 0, 0, 0], geodesicLength: 2, featureCount: 3 } }];
    const result = compareAnalyticGeometryToDiscrete({ definition: getGeometryExactSurfacePreset("plane"), targets, uCount: 2, vCount: 2, analyticGeodesicLength: 2, analyticFeatureCount: 3 });
    expect(result.targets.map((entry) => entry.target.kind)).toEqual(["display-tessellation", "derived-analysis-mesh", "saved-mesh-result"]);
    expect(result.targets.every((entry) => entry.target.sourceRevision === 3 && entry.target.engine === "test tessellator")).toBe(true);
    expect(result.targets[2].quantities.find((entry) => entry.quantity === "geodesic")?.available).toBe(true);
  });
  it("explains unavailable semantic comparisons", () => {
    const result = compareAnalyticGeometryToDiscrete({ definition: getGeometryExactSurfacePreset("sphere"), targets: [target({ ...planeMesh(), normals: null })], uCount: 5, vCount: 5 });
    expect(result.targets[0].quantities.find((entry) => entry.quantity === "normal")).toMatchObject({ available: false, explanation: "Target has no vertex-normal field." });
    expect(result.targets[0].warnings.join(" ")).toContain("No compatible saved mesh curvature field");
    expect(result.targets[0].mapping.confidence).toBe("heuristic");
  });
});
