import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { analyzeExactSurfaceDifferentialPoint } from "./differentialGeometry";
import { compareSurfaceLocalProbes, createSurfaceLocalProbe, createSurfaceLocalProbeFromDifferential, evaluateEulerNormalCurvature } from "./surfaceProbe";

describe("Surface canonical local probe", () => {
  it("publishes complete exact forms, curvature, classification and Euler normal curvature", () => {
    const point = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("saddle"), u: 0, v: 0 });
    const probe = createSurfaceLocalProbeFromDifferential("p1", point, 45);
    expect(probe).toMatchObject({ kind: "local-probe", valid: true, classification: "hyperbolic", domainCoordinate: { kind: "uv", u: 0, v: 0 } });
    expect(probe.firstFundamentalForm).toEqual([1, 0, 1]);
    expect(probe.secondFundamentalForm).not.toBeNull();
    expect(probe.normalCurvature.value).toBeCloseTo(0, 8);
    expect(probe.normalCurvature.formula).toContain("cos²");
  });

  it("marks umbilic directions and directional evidence undefined", () => {
    const sphere = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("sphere"), u: 0, v: Math.PI / 2 });
    const probe = createSurfaceLocalProbeFromDifferential("sphere", sphere);
    expect(probe.classification).toBe("umbilic");
    expect(probe.principalDirections).toBeNull();
    expect(probe.missing.principalDirections).toMatch(/undefined at an umbilic/i);
    expect(probe.evidence.principalAxes).toBe(false);
  });

  it("reports absent represented forms explicitly while retaining mapped discrete curvature", () => {
    const probe = createSurfaceLocalProbe({
      probeId: "mesh", domainCoordinate: { kind: "mesh", vertexIndex: 4 }, position: [0, 0, 1], normal: [0, 0, 1],
      principalCurvatures: [2, -1], principalDirections: [[1, 0, 0], [0, 1, 0]], mapping: { vertexIndex: 4 },
    }, 90);
    expect(probe.classification).toBe("hyperbolic");
    expect(probe.normalCurvature.value).toBeCloseTo(-1);
    expect(probe.firstFundamentalForm).toBeNull();
    expect(probe.missing.firstFundamentalForm).toMatch(/did not publish/i);
  });

  it("constructs a deterministic oriented tangent basis without inventing principal axes", () => {
    const probe = createSurfaceLocalProbe({ probeId: "normal-only", domainCoordinate: { kind: "world" }, position: [1, 2, 3], normal: [0, 0, 1] });
    expect(probe.tangentBasis).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(probe.principalDirections).toBeNull();
    expect(probe.missing.curvature).toBeTruthy();
  });

  it("evaluates principal directions by angle and compares probe revisions", () => {
    const normal = evaluateEulerNormalCurvature([3, 1], [[1, 0, 0], [0, 1, 0]], 60);
    expect(normal.value).toBeCloseTo(1.5);
    expect(normal.direction?.[0]).toBeCloseTo(0.5);
    const left = createSurfaceLocalProbe({ probeId: "a", domainCoordinate: { kind: "world" }, position: [0, 0, 0], principalCurvatures: [2, 1] });
    const right = createSurfaceLocalProbe({ probeId: "b", domainCoordinate: { kind: "world" }, position: [3, 4, 0], principalCurvatures: [3, -1] });
    expect(compareSurfaceLocalProbes(left, right)).toMatchObject({ distance: 5, gaussianCurvatureDelta: -5, meanCurvatureDelta: -0.5, classificationChanged: true });
  });
});
