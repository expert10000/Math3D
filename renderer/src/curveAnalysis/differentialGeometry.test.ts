import {
  analyzeCurveDifferentialGeometry,
  type Curve2D,
  type Curve3D,
} from "@math3d/core";
import { describe, expect, it } from "vitest";

const range = (minimum: number, maximum: number, count: number) =>
  Array.from({ length: count }, (_, index) => minimum + (maximum - minimum) * index / (count - 1));

const circle: Curve2D = {
  id: "circle-truth",
  name: "Unit circle",
  kind: "parametric",
  dimension: 2,
  domain: { tMin: 0, tMax: Math.PI * 2, closed: true, periodic: true },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }),
  derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }),
  secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t) }),
  thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t) }),
};

describe("Curve differential geometry field", () => {
  it("matches unit-circle curvature, radius, turning number, and evidence", () => {
    const field = analyzeCurveDifferentialGeometry(circle, { parameters: range(0, Math.PI * 2, 129), method: "exact" });
    expect(field.statistics.curvature?.minimum).toBeCloseTo(1, 10);
    expect(field.statistics.curvature?.maximum).toBeCloseTo(1, 10);
    expect(field.statistics.speed?.average).toBeCloseTo(1, 10);
    expect(field.turningNumber).toBeCloseTo(1, 8);
    expect(field.points.every((point) => point.frenetDefined)).toBe(true);
    expect(field.points[32].radiusOfCurvature).toBeCloseTo(1, 10);
    expect(field.points[32].evidence.osculatingCircle?.radius).toBeCloseTo(1, 10);
    expect(field.points[32].evidence.evolutePoint?.x).toBeCloseTo(0, 10);
    expect(field.provenance.derivativeSource).toBe("provided");
  });

  it("matches circular-helix curvature and torsion", () => {
    const pitch = 0.5;
    const helix: Curve3D = {
      id: "helix-truth",
      name: "Circular helix",
      kind: "parametric",
      dimension: 3,
      domain: { tMin: 0, tMax: Math.PI * 4 },
      eval: (t) => ({ x: Math.cos(t), y: Math.sin(t), z: pitch * t }),
      derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t), z: pitch }),
      secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t), z: 0 }),
      thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t), z: 0 }),
    };
    const field = analyzeCurveDifferentialGeometry(helix, { parameters: range(0, Math.PI * 4, 65), method: "exact" });
    expect(field.statistics.curvature?.average).toBeCloseTo(1 / (1 + pitch * pitch), 10);
    expect(field.statistics.torsion?.average).toBeCloseTo(pitch / (1 + pitch * pitch), 10);
    expect(field.points.every((point) => point.regularity === "regular")).toBe(true);
  });

  it("keeps a straight line stable while leaving Frenet quantities undefined", () => {
    const line: Curve3D = {
      id: "line-truth",
      name: "Line",
      kind: "parametric",
      dimension: 3,
      domain: { tMin: -2, tMax: 2 },
      eval: (t) => ({ x: t, y: 2 * t, z: -t }),
      derivative: () => ({ x: 1, y: 2, z: -1 }),
      secondDerivative: () => ({ x: 0, y: 0, z: 0 }),
      thirdDerivative: () => ({ x: 0, y: 0, z: 0 }),
    };
    const field = analyzeCurveDifferentialGeometry(line, { parameters: range(-2, 2, 17), method: "exact" });
    expect(field.statistics.curvature?.average).toBe(0);
    expect(field.points.every((point) => point.frenetNormal === null && point.frenetBinormal === null && point.torsion === null)).toBe(true);
    expect(field.points.every((point) => point.bishopNormal !== null && point.bishopBinormal !== null)).toBe(true);
    expect(field.points.every((point) => point.bishopFallbackUsed)).toBe(true);
    expect(field.warnings.some((warning) => warning.includes("Bishop fallback"))).toBe(true);
  });

  it("reports planar inflection and signed convexity intervals reproducibly", () => {
    const cubic: Curve2D = {
      id: "cubic-inflection",
      name: "Cubic",
      kind: "parametric",
      dimension: 2,
      domain: { tMin: -1, tMax: 1 },
      eval: (t) => ({ x: t, y: t ** 3 }),
      derivative: (t) => ({ x: 1, y: 3 * t * t }),
      secondDerivative: (t) => ({ x: 0, y: 6 * t }),
      thirdDerivative: () => ({ x: 0, y: 6 }),
    };
    const field = analyzeCurveDifferentialGeometry(cubic, { parameters: range(-1, 1, 41), method: "exact" });
    expect(field.inflectionParameters.some((t) => Math.abs(t) < 1e-12)).toBe(true);
    expect(field.statistics.signedCurvature!.minimum).toBeLessThan(0);
    expect(field.statistics.signedCurvature!.maximum).toBeGreaterThan(0);
    expect(field.convexityIntervals.map((interval) => interval.classification)).toEqual(expect.arrayContaining(["concave", "flat", "convex"]));
  });

  it("decomposes ambient curvature using an explicit Surface dependency", () => {
    const field = analyzeCurveDifferentialGeometry(circle, {
      parameters: range(0, Math.PI * 2, 33),
      method: "exact",
      surfaceContext: {
        dependency: { surfaceId: "unit-sphere", surfaceRevision: 4 },
        normalAt: (_t, position) => position,
      },
    });
    expect(field.provenance.surfaceDependency).toEqual({ surfaceId: "unit-sphere", surfaceRevision: 4 });
    expect(Math.abs(field.points[8].normalCurvature ?? 0)).toBeCloseTo(1, 10);
    expect(field.points[8].geodesicCurvature).toBeCloseTo(0, 10);
  });

  it("marks zero-speed and numerical uncertainty without emitting fake frames", () => {
    const cusp: Curve2D = {
      id: "cusp",
      name: "Semicubical cusp",
      kind: "parametric",
      dimension: 2,
      domain: { tMin: -1, tMax: 1 },
      eval: (t) => ({ x: t * t, y: t * t * t }),
    };
    const field = analyzeCurveDifferentialGeometry(cusp, { parameters: [-1, -0.5, 0, 0.5, 1], method: "numerical" });
    const cuspPoint = field.points.find((point) => point.t === 0)!;
    expect(cuspPoint.regularity).toBe("zero-speed");
    expect(cuspPoint.tangent).toBeNull();
    expect(cuspPoint.frenetNormal).toBeNull();
    expect(cuspPoint.uncertain).toBe(true);
    expect(field.uncertaintyMask.every((value) => value === 1)).toBe(true);
  });
});
