import { describe, expect, it } from "vitest";
import { curvature, frenetFrame, type Curve3D } from "@math3d/core";
import {
  analyzeExactCurve,
  evaluateExactCurveFrame,
  geometryAnalyticCurveToCoreCurve,
  getGeometryExactCurvePreset,
  type GeometryAnalyticCurveDefinition,
} from "./exactCurveAnalysis";

describe("exact Geometry curve differential analysis", () => {
  it("matches exact line quantities and reports the degenerate Frenet normal", () => {
    const line = getGeometryExactCurvePreset("line");
    const result = analyzeExactCurve({ definition: line, parameter: 0.25, sampleCount: 33 });
    expect(result.point.position).toEqual([0.25, 0, 0]);
    expect(result.point.derivative1).toEqual([1, 0, 0]);
    expect(result.point.derivative2).toEqual([0, 0, 0]);
    expect(result.point.derivative3).toEqual([0, 0, 0]);
    expect(result.point.speed).toBe(1);
    expect(result.point.tangent).toEqual([1, 0, 0]);
    expect(result.point.curvature).toBe(0);
    expect(result.point.radiusOfCurvature).toBe(Number.POSITIVE_INFINITY);
    expect(result.point.torsion).toBe(0);
    expect(result.point.degenerate).toBe(true);
    expect(result.arcLength).toEqual({ value: 4, method: "closed-form", uncertainty: 0 });
    expect(result.warnings.join(" ")).toContain("Degenerate Frenet frame");
  });

  it("matches unit-circle position, frame, curvature, radius, and length", () => {
    const circle = getGeometryExactCurvePreset("circle");
    const result = analyzeExactCurve({ definition: circle, parameter: 0, sampleCount: 65 });
    expect(result.point.position).toEqual([1, 0, 0]);
    expect(result.point.tangent).toEqual([0, 1, 0]);
    expect(result.point.normal).toEqual([-1, 0, 0]);
    expect(result.point.binormal).toEqual([0, 0, 1]);
    expect(result.point.curvature).toBeCloseTo(1, 12);
    expect(result.point.radiusOfCurvature).toBeCloseTo(1, 12);
    expect(result.point.torsion).toBeCloseTo(0, 12);
    expect(result.arcLength.value).toBeCloseTo(2 * Math.PI, 12);
    expect(result.visualization.osculatingCircle?.center).toEqual([0, 0, 0]);
    expect(result.visualization.osculatingCircle?.radius).toBeCloseTo(1, 12);
    expect(result.visualization.osculatingPlane?.normal).toEqual([0, 0, 1]);
  });

  it("matches circular-helix analytic curvature and torsion", () => {
    const helix = getGeometryExactCurvePreset("helix");
    const result = analyzeExactCurve({ definition: helix, parameter: Math.PI / 3, sampleCount: 65 });
    expect(result.point.speed).toBeCloseTo(Math.sqrt(1.04), 12);
    expect(result.point.curvature).toBeCloseTo(1 / 1.04, 12);
    expect(result.point.torsion).toBeCloseTo(0.2 / 1.04, 12);
    expect(result.arcLength.value).toBeCloseTo(4 * Math.PI * Math.sqrt(1.04), 12);
    expect(result.visualization.frenetFrames.length).toBeGreaterThan(8);
    expect(result.visualization.curvatureComb.length).toBeGreaterThan(8);
    expect(result.visualization.plot).toHaveLength(65);
    const sharedCurve = geometryAnalyticCurveToCoreCurve(helix) as Curve3D;
    expect(curvature(sharedCurve, Math.PI / 3)).toBeCloseTo(result.point.curvature ?? NaN, 12);
    expect(frenetFrame(sharedCurve, Math.PI / 3).tangent.x).toBeCloseTo(result.point.tangent?.[0] ?? NaN, 12);
  });

  it("detects stationary points with uncertainty and suppresses undefined quantities", () => {
    const stationary: GeometryAnalyticCurveDefinition = {
      id: "stationary-cubic",
      label: "Stationary cubic",
      dimension: 2,
      parameter: "u",
      domain: { min: -1, max: 1, closed: false },
      units: { parameter: "1", position: "m" },
      revision: 3,
      orientation: "increasing u",
      formula: ["u³", "0", "0"],
      capabilities: { position: "exact", first: "exact", second: "exact", third: "exact", arcLength: "closed-form" },
      evaluate: (u) => [u ** 3, 0, 0],
      derivative1: (u) => [3 * u * u, 0, 0],
      derivative2: (u) => [6 * u, 0, 0],
      derivative3: () => [6, 0, 0],
      exactArcLength: (a, b) => Math.abs(b ** 3 - a ** 3),
    };
    const point = evaluateExactCurveFrame(stationary, 0);
    expect(point.stationary).toBe(true);
    expect(point.tangent).toBeNull();
    expect(point.curvature).toBeNull();
    expect(point.torsion).toBeNull();
    const result = analyzeExactCurve({ definition: stationary, parameter: 0, sampleCount: 33 });
    expect(result.events.some((event) => event.kind === "stationary" && event.uncertainty > 0)).toBe(true);
    expect(result.warnings.join(" ")).toContain("Stationary point");
  });

  it("marks declared piecewise transitions for one-sided inspection", () => {
    const piecewise = getGeometryExactCurvePreset("piecewise-v");
    const result = analyzeExactCurve({ definition: piecewise, parameter: 0, sampleCount: 32 });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "piecewise-transition", t: 0, uncertainty: 0 }));
    expect(result.warnings.join(" ")).toContain("one-sided derivatives");
    expect(result.definition.formula[1]).toBe("|t|");
  });

  it("detects an analytic planar inflection and sampled curvature extrema", () => {
    const cubic: GeometryAnalyticCurveDefinition = {
      id: "planar-cubic",
      label: "Planar cubic",
      dimension: 2,
      parameter: "t",
      domain: { min: -1, max: 1, closed: false },
      units: { parameter: "1", position: "m" },
      revision: 2,
      orientation: "increasing t",
      formula: ["t", "t³", "0"],
      capabilities: { position: "exact", first: "exact", second: "exact", third: "exact", arcLength: "quadrature" },
      evaluate: (t) => [t, t ** 3, 0],
      derivative1: (t) => [1, 3 * t * t, 0],
      derivative2: (t) => [0, 6 * t, 0],
      derivative3: () => [0, 6, 0],
    };
    const result = analyzeExactCurve({ definition: cubic, parameter: 0, sampleCount: 65 });
    expect(result.events.some((event) => event.kind === "inflection" && Math.abs(event.t) < 0.02)).toBe(true);
    expect(result.events.some((event) => event.kind === "curvature-extremum")).toBe(true);
    expect(result.arcLength.method).toBe("adaptive-simpson");
    expect(result.arcLength.uncertainty).toBeLessThan(1e-8);
  });

  it("states sampled derivative fallback instead of claiming exactness", () => {
    const sampled: GeometryAnalyticCurveDefinition = {
      ...getGeometryExactCurvePreset("line"),
      id: "sampled-line",
      capabilities: {
        position: "exact",
        first: "sampled",
        second: "sampled",
        third: "sampled",
        arcLength: "quadrature",
      },
      exactArcLength: undefined,
    };
    const result = analyzeExactCurve({ definition: sampled, parameter: 0 });
    expect(result.arcLength.method).toBe("adaptive-simpson");
    expect(result.warnings.join(" ")).toContain("sampled fallback");
  });
});
