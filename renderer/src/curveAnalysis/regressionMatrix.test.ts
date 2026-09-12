import { describe, expect, it } from "vitest";
import { DEFAULT_BEZIER_CURVE, DEFAULT_BSPLINE_CURVE, RATIONAL_NURBS_CIRCLE, analyzeCurveDifferentialGeometry, arcLength, buildArcLengthTable, curveBoundingBox, evaluateSpline, invertArcLengthTable, parameterToArcLength, sampleCurveRobust, validateSplineDefinition, type Curve2D, type Curve3D } from "@math3d/core";
import { analyzeCurveDiagnostics } from "./diagnostics";
import { adaptCurveDefinition, createCurveAnalysisResultStore } from "./infrastructure";
import { CURVE_ANALYSIS_PRESETS, applyCurveAnalysisPreset, beginCurveAnalysisPreset, createCurveResultLifecycleState, curveResultToJson, deriveCurveResultCards, reconcileCurveResultLifecycle } from "./resultLifecycle";
import { CANONICAL_CURVE_FIXTURES, PATHOLOGICAL_CURVE_FIXTURES, scaleAwareTolerance } from "./regressionFixtures";

const range = (min: number, max: number, count = 65) => Array.from({ length: count }, (_, index) => min + (max - min) * index / (count - 1));
const finitePoint = (point: { x: number; y: number; z?: number }) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z ?? 0);

describe("Curves v1 analytic regression matrix", () => {
  it("maintains the complete canonical and pathological fixture inventory", () => {
    expect(Object.keys(CANONICAL_CURVE_FIXTURES)).toEqual(["line", "circle", "ellipse", "parabola", "hyperbola", "helix", "clothoid", "catenary", "lissajous", "hypotrochoid", "bezier", "b-spline", "rational-nurbs-circle"]);
    expect(Object.keys(PATHOLOGICAL_CURVE_FIXTURES)).toEqual(["cusp", "inflection", "almost-straight", "derivative-singularity", "discontinuity", "self-intersection", "near-intersection", "oscillation", "tiny-loop", "repeated-points", "degenerate-spline-span", "large-coordinate-range"]);
  });

  it("verifies known length, tangent, signed/unsigned curvature, torsion, turning, and bounds", () => {
    const line = CANONICAL_CURVE_FIXTURES.line as Curve2D, circle = CANONICAL_CURVE_FIXTURES.circle as Curve2D, helix = CANONICAL_CURVE_FIXTURES.helix as Curve3D;
    expect(arcLength(line, -2, 2)).toBeCloseTo(4 * Math.sqrt(5), 7);
    expect(arcLength(circle)).toBeCloseTo(Math.PI * 2, 7);
    const circleField = analyzeCurveDifferentialGeometry(circle, { parameters: range(0, Math.PI * 2, 129), method: "exact" });
    expect(circleField.points[21].tangent).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(circleField.statistics.curvature?.minimum).toBeCloseTo(1, 10); expect(circleField.statistics.signedCurvature?.minimum).toBeCloseTo(1, 10); expect(circleField.turningNumber).toBeCloseTo(1, 8);
    const helixField = analyzeCurveDifferentialGeometry(helix, { parameters: range(0, Math.PI * 4), method: "exact" });
    expect(helixField.statistics.curvature?.average).toBeCloseTo(0.8, 9); expect(helixField.statistics.torsion?.average).toBeCloseTo(0.4, 9);
    const bounds = curveBoundingBox(CANONICAL_CURVE_FIXTURES.ellipse, 2049)!;
    expect(bounds.min.x).toBeCloseTo(-2, 6); expect(bounds.max.x).toBeCloseTo(2, 6); expect(bounds.min.y).toBeCloseTo(-1, 6); expect(bounds.max.y).toBeCloseTo(1, 6);
  });

  it("keeps every canonical fixture finite, deterministic, and within scale-aware sampling envelopes", () => {
    for (const curve of Object.values(CANONICAL_CURVE_FIXTURES)) {
      const options = { tolerance: scaleAwareTolerance(10, 1e-4), minimumSamples: 12, maximumSamples: 4096, maxDepth: 12 };
      const first = sampleCurveRobust(curve, options), second = sampleCurveRobust(curve, options);
      expect(first.samples.map((sample) => sample.t), curve.id).toEqual(second.samples.map((sample) => sample.t));
      expect(first.samples.every((sample) => !sample.valid || finitePoint(sample.point)), curve.id).toBe(true);
      expect(first.samples.length, curve.id).toBeLessThanOrEqual(4096);
    }
  });

  it("verifies rational circle, Bezier, and B-spline basis/continuity fixtures", () => {
    for (const fixture of [DEFAULT_BEZIER_CURVE, DEFAULT_BSPLINE_CURVE, RATIONAL_NURBS_CIRCLE]) expect(validateSplineDefinition(fixture)).toEqual([]);
    for (const t of range(0, 1, 65)) { const point = evaluateSpline(RATIONAL_NURBS_CIRCLE, t); expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 7); }
    expect(evaluateSpline(DEFAULT_BEZIER_CURVE, 0)).toEqual(expect.objectContaining(DEFAULT_BEZIER_CURVE.controlPoints[0]));
    expect(evaluateSpline(DEFAULT_BSPLINE_CURVE, 1)).toEqual(expect.objectContaining(DEFAULT_BSPLINE_CURVE.controlPoints.at(-1)!));
  });

  it("verifies adaptive convergence, seam closure, and stable t-to-s inversion", () => {
    const circle = CANONICAL_CURVE_FIXTURES.circle;
    const coarse = sampleCurveRobust(circle, { tolerance: 1e-2, minimumSamples: 8 }), fine = sampleCurveRobust(circle, { tolerance: 1e-4, minimumSamples: 8 });
    expect(fine.samples.length).toBeGreaterThan(coarse.samples.length); expect(fine.statistics.seamDuplicateRemoved).toBe(true); expect(fine.renderSamples.length).toBe(fine.samples.length - 1);
    const table = buildArcLengthTable(circle, 2048);
    for (const t of range(0, Math.PI * 2, 17)) expect(invertArcLengthTable(table, parameterToArcLength(table, t))).toBeCloseTo(t, 9);
  });

  it("preserves invalid masks and uncertainty for every pathological family", () => {
    for (const [name, curve] of Object.entries(PATHOLOGICAL_CURVE_FIXTURES)) {
      const sampled = sampleCurveRobust(curve, { tolerance: scaleAwareTolerance(name === "large-coordinate-range" ? 1e12 : 1, 1e-5), minimumSamples: 17, maximumSamples: 2048, maxDepth: 10, discontinuityTolerance: name === "discontinuity" ? 0.1 : undefined });
      const field = analyzeCurveDifferentialGeometry(curve, { parameters: sampled.samples.map((sample) => sample.t), method: "numerical", tolerance: scaleAwareTolerance(name === "tiny-loop" ? 1e-9 : 1) });
      expect(field.validityMask).toHaveLength(field.points.length); expect(field.uncertaintyMask).toHaveLength(field.points.length); expect(field.uncertaintyMask.every((value) => value === 1), name).toBe(true);
      expect(sampled.samples.length, name).toBeLessThanOrEqual(2048);
    }
  });

  it("classifies cusps, inflections, discontinuities, self-intersections, and near intersections reproducibly", () => {
    for (const name of ["cusp", "inflection", "discontinuity", "self-intersection", "near-intersection"] as const) {
      const curve = PATHOLOGICAL_CURVE_FIXTURES[name]; const sampled = sampleCurveRobust(curve, { tolerance: 1e-4, minimumSamples: 65, maximumSamples: 4096, discontinuityTolerance: 0.05 });
      const field = analyzeCurveDifferentialGeometry(curve, { parameters: sampled.samples.map((sample) => sample.t), method: "numerical" });
      const identity = adaptCurveDefinition({ id: name, revision: 1, label: name, representation: "parametric", dimension: curve.dimension, domain: { parameter: "t", min: curve.domain.tMin, max: curve.domain.tMax, closed: !!curve.domain.closed, periodic: !!curve.domain.periodic }, expressions: curve.dimension === 2 ? { x: "fixture", y: "fixture" } : { x: "fixture", y: "fixture", z: "fixture" } }).identity;
      const reportA = analyzeCurveDiagnostics({ identity, curve, field, samplingDiagnostics: sampled.diagnostics, breakpoints: curve.domain.breakpoints, tolerance: 1e-4 });
      const reportB = analyzeCurveDiagnostics({ identity, curve, field, samplingDiagnostics: sampled.diagnostics, breakpoints: curve.domain.breakpoints, tolerance: 1e-4 });
      expect(reportA.fingerprint, name).toBe(reportB.fingerprint); expect(reportA.entries.length, name).toBeGreaterThan(0);
    }
  });

  it("covers preset/export/reload invalidation contracts in one deterministic journey", () => {
    const curve = CANONICAL_CURVE_FIXTURES.circle, definition = adaptCurveDefinition({ id: "matrix-circle", revision: 1, label: "Matrix circle", representation: "parametric", dimension: 2, domain: { parameter: "t", min: 0, max: Math.PI * 2, closed: true, periodic: true }, expressions: { x: "cos(t)", y: "sin(t)" }, sampling: { tolerance: 1e-4 } });
    const sampled = sampleCurveRobust(curve, { tolerance: 1e-4 }); const points = sampled.samples.map((sample) => ({ x: sample.point.x, y: sample.point.y, z: "z" in sample.point ? sample.point.z : 0 }));
    for (const preset of CURVE_ANALYSIS_PRESETS) {
      const begun = beginCurveAnalysisPreset(createCurveResultLifecycleState(), definition, preset.id); const result = applyCurveAnalysisPreset({ state: begun, store: createCurveAnalysisResultStore(), definition, points, now: 10 });
      expect(result.accepted, preset.id).toBe(true); const card = deriveCurveResultCards(result.store, definition, result.state)[0]; expect(() => JSON.parse(curveResultToJson(card, definition))).not.toThrow(); expect(reconcileCurveResultLifecycle(result.state, { ...definition, identity: { ...definition.identity, curveRevision: 2, revision: "2", key: "curve:matrix-circle@2" } }).activePreset?.state).toBe("stale");
    }
  });
});
