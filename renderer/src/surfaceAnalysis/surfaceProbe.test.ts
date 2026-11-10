import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { analyzeExactSurfaceDifferentialPoint } from "./differentialGeometry";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "./infrastructure";
import { presentSurfaceAnalysisResult } from "./surfaceResultPresentation";
import { compareSurfaceLocalProbes, createSurfaceLocalProbe, createSurfaceLocalProbeFromDifferential,
  createSurfaceProbePayload, evaluateEulerNormalCurvature } from "./surfaceProbe";
import { createSurfaceProbeEvidence, surfaceProbeEvidenceCsv,
  surfaceProbeEvidenceJson } from "./surfaceProbeEvidence";

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

  it("exports the recorded probe angle and withholds historical local values", () => {
    const definition = adaptSurfaceDefinition({ id: "probe-source", revision: 3, label: "Probe source",
      representation: "parametric", expressions: { x: "u", y: "v", z: "0" },
      domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
      units: { length: "m" } });
    const probe = createSurfaceLocalProbe({ probeId: "p3", domainCoordinate: { kind: "uv", u: 0.5, v: 0.25 },
      position: [0.5, 0.25, 0], normal: [0, 0, 1],
      principalCurvatures: [3, 1], principalDirections: [[1, 0, 0], [0, 1, 0]] }, 60);
    const payload = createSurfaceProbePayload({ definition, method: "surface-sampling", probe });
    const registry = createSurfaceAnalysisRegistry();
    let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
      request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition",
        definition, domain: "surface", method: "surface-sampling" }), now: 1 });
    store = publishSurfaceAnalysisResult({ store, registry,
      request: createSurfaceAnalysisRequest({ requestId: "probe", kind: "surface-probe",
        definition, domain: "point", method: "surface-sampling" }), payload, now: 2 });
    const result = getSurfaceAnalysisResult(store, definition.identity, "surface-probe")!;
    const evidence = createSurfaceProbeEvidence({ definition, result,
      qualification: presentSurfaceAnalysisResult(definition, result, store) });
    expect(evidence.publication).toMatchObject({ module: "surface",
      assessment: { status: "recorded", sourceStatus: "current" },
      summary: { probeId: "p3", normalCurvature: { angleDeg: 60 } } });
    expect(JSON.parse(surfaceProbeEvidenceJson(evidence)).probe.normalCurvature.angleDeg).toBe(60);
    expect(surfaceProbeEvidenceCsv(evidence)).toContain('"probeId","p3"');
    store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
    const historical = getSurfaceAnalysisResult(store, definition.identity, "surface-probe")!;
    const withheld = createSurfaceProbeEvidence({ definition, result: historical,
      qualification: presentSurfaceAnalysisResult(definition, historical, store) });
    expect(withheld.probe).toBeNull();
    expect(withheld.publication.summary).toBeNull();
    expect(surfaceProbeEvidenceJson(withheld)).not.toContain("0.25");
    expect(surfaceProbeEvidenceCsv(withheld)).not.toContain('"probeId","p3"');
  });
});
