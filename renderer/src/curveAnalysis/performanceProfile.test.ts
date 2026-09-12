import { describe, expect, it } from "vitest";
import type { Curve3D } from "@math3d/core";
import { createDerivedCurveMesh } from "./curveMesh";
import { CURVE_PERFORMANCE_BUDGETS, executeCurveWorkerRequest, type CurveWorkerRequest } from "./curveComputation";
import { adaptCurveDefinition } from "./infrastructure";

const request = (operation: CurveWorkerRequest["operation"], positions: Float64Array, workload: CurveWorkerRequest["workload"], targetCount = positions.length / 3): CurveWorkerRequest => ({ requestId: `profile:${operation}:${positions.length}`, operation, curveId: "profile", curveRevision: 1, curveFingerprint: "profile-v1", dependencies: [], backendVersion: "curve-worker-v1", tolerance: 1e-7, targetCount, workload, positions, consumers: ["viewport", "plots", "diagnostics", "derived", "curve-mesh"] });

describe("Curves v1 reviewed performance gates", () => {
  it("profiles sampled self-intersection search with a bounded transfer and deadline", async () => {
    const count = 768, positions = new Float64Array(count * 3);
    for (let index = 0; index < count; index++) { const t = index / (count - 1) * Math.PI * 2; positions[index * 3] = Math.sin(3 * t); positions[index * 3 + 1] = Math.sin(4 * t); }
    const started = performance.now(); const result = await executeCurveWorkerRequest(request("intersections", positions, "high-curvature"), () => undefined, () => false); const elapsed = performance.now() - started;
    expect(result.statistics.intersections).toBeGreaterThan(0); expect(result.output.byteLength).toBeLessThanOrEqual(CURVE_PERFORMANCE_BUDGETS["high-curvature"].maximumTransferBytes); expect(elapsed).toBeLessThan(4_000);
  }, 10_000);

  it("profiles a production-size Bishop tube inside geometry and memory budgets", () => {
    const helix: Curve3D = { id: "profile-helix", name: "Profile helix", kind: "parametric", family: "parametric", dimension: 3, domain: { tMin: 0, tMax: 16 * Math.PI }, eval: (t) => ({ x: Math.cos(t), y: Math.sin(t), z: t / 8 }), derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t), z: 1 / 8 }), secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t), z: 0 }) };
    const definition = adaptCurveDefinition({ id: helix.id, revision: 1, label: helix.name, representation: "parametric", dimension: 3, domain: { parameter: "t", min: helix.domain.tMin, max: helix.domain.tMax, closed: false, periodic: false }, expressions: { x: "cos(t)", y: "sin(t)", z: "t/8" }, sampling: { maximumSamples: 10_000 } });
    const started = performance.now(); const tube = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "tube", longitudinalResolution: 2_000, radialResolution: 12, framePolicy: "bishop", cap: "both", seamPolicy: "weld", tubeRadius: 0.04 } }); const elapsed = performance.now() - started;
    expect(tube.vertexCount).toBeLessThanOrEqual(25_000); expect(tube.faceCount).toBeLessThanOrEqual(50_000); expect(tube.geometry.positions.byteLength + tube.geometry.indices.byteLength).toBeLessThan(2_000_000); expect(elapsed).toBeLessThan(4_000); expect(tube.correspondence.state).toBe("complete");
  }, 10_000);
});
