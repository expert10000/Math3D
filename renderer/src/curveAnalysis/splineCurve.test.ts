import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEZIER_CURVE,
  DEFAULT_BSPLINE_CURVE,
  DEFAULT_NURBS_QUARTER_ARC,
  RATIONAL_NURBS_CIRCLE,
  buildSplineCurve,
  cloneSplineFixture,
  constrainSplineJoin,
  createSplineHistory,
  currentSplineRevision,
  elevateBezierDegree,
  evaluateSpline,
  evaluateSplineBasis,
  evaluateSplineDerivative,
  findSplineKnotSpan,
  insertSplineKnot,
  moveSplineControlPoint,
  parseSplineDefinition,
  pushSplineHistory,
  redoSplineHistory,
  reduceBezierDegree,
  removeSplineKnot,
  serializeSplineDefinition,
  setSplineKnot,
  setSplineWeight,
  splineConstructionEvidence,
  splineEndpoint,
  subdivideBezier,
  undoSplineHistory,
  validateSplineDefinition,
  type CanonicalSplineDefinition,
} from "@math3d/core";

const distance = (a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const sampleDeviation = (a: CanonicalSplineDefinition, b: CanonicalSplineDefinition) => Math.max(...Array.from({ length: 101 }, (_, index) => {
  const u = index / 100;
  const ta = a.domain.tMin + u * (a.domain.tMax - a.domain.tMin);
  const tb = b.domain.tMin + u * (b.domain.tMax - b.domain.tMin);
  return distance(evaluateSpline(a, ta), evaluateSpline(b, tb));
}));

describe("canonical spline curve core", () => {
  it("validates canonical definitions and evaluates stable basis, endpoints, derivatives, and rational arcs", () => {
    for (const definition of [DEFAULT_BEZIER_CURVE, DEFAULT_BSPLINE_CURVE, DEFAULT_NURBS_QUARTER_ARC, RATIONAL_NURBS_CIRCLE]) {
      expect(validateSplineDefinition(definition)).toEqual([]);
      const midpoint = 0.5 * (definition.domain.tMin + definition.domain.tMax);
      expect(evaluateSplineBasis(definition, midpoint).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
      expect(findSplineKnotSpan(definition, midpoint)).toBeGreaterThanOrEqual(definition.degree);
      expect(Number.isFinite(evaluateSplineDerivative(definition, midpoint).x)).toBe(true);
      expect(splineEndpoint(definition, "start")).toEqual(expect.objectContaining(definition.controlPoints[0]));
      expect(splineEndpoint(definition, "end")).toEqual(expect.objectContaining(definition.controlPoints.at(-1)!));
      expect(buildSplineCurve(definition).spline).toBe(definition);
    }
    expect(evaluateSpline(DEFAULT_NURBS_QUARTER_ARC, 0.5).x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(evaluateSpline(DEFAULT_NURBS_QUARTER_ARC, 0.5).y).toBeCloseTo(Math.SQRT1_2, 8);
    for (let index = 0; index <= 32; index += 1) {
      const point = evaluateSpline(RATIONAL_NURBS_CIRCLE, index / 32);
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 8);
    }
  });

  it("produces inspectable De Casteljau and De Boor construction evidence", () => {
    const casteljau = splineConstructionEvidence(DEFAULT_BEZIER_CURVE, 0.35);
    expect(casteljau.levels.map((level) => level.length)).toEqual([4, 3, 2, 1]);
    expect(distance(casteljau.point, evaluateSpline(DEFAULT_BEZIER_CURVE, 0.35))).toBeLessThan(1e-12);
    const deBoor = splineConstructionEvidence(DEFAULT_BSPLINE_CURVE, 0.4);
    expect(deBoor.levels).toHaveLength(DEFAULT_BSPLINE_CURVE.degree + 1);
    expect(deBoor.basis.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  it("subdivides, elevates, and conditionally reduces Bezier curves without geometry loss", () => {
    const [left, right] = subdivideBezier(DEFAULT_BEZIER_CURVE, 0.4);
    expect(distance(evaluateSpline(left, left.domain.tMax), evaluateSpline(right, right.domain.tMin))).toBeLessThan(1e-10);
    for (let index = 0; index <= 40; index += 1) {
      const t = index / 100;
      expect(distance(evaluateSpline(left, left.domain.tMin + (t / 0.4) * (left.domain.tMax - left.domain.tMin)), evaluateSpline(DEFAULT_BEZIER_CURVE, t))).toBeLessThan(1e-9);
    }
    const elevated = elevateBezierDegree(DEFAULT_BEZIER_CURVE);
    expect(elevated.degree).toBe(4);
    expect(sampleDeviation(DEFAULT_BEZIER_CURVE, elevated)).toBeLessThan(1e-9);
    const reduced = reduceBezierDegree(elevated);
    expect(reduced).not.toBeNull();
    expect(sampleDeviation(DEFAULT_BEZIER_CURVE, reduced!)).toBeLessThan(1e-8);
  });

  it("inserts and removes B-spline/NURBS knots and edits knots and weights as new revisions", () => {
    const inserted = insertSplineKnot(DEFAULT_BSPLINE_CURVE, 0.5);
    expect(inserted.revision).toBe(DEFAULT_BSPLINE_CURVE.revision + 1);
    expect(inserted.controlPoints).toHaveLength(DEFAULT_BSPLINE_CURVE.controlPoints.length + 1);
    expect(sampleDeviation(DEFAULT_BSPLINE_CURVE, inserted)).toBeLessThan(1e-9);
    const insertedIndex = inserted.knotVector.findIndex((knot, index) => knot === 0.5 && inserted.knotVector[index - 1] !== 0.5);
    const removed = removeSplineKnot(inserted, insertedIndex, 1e-5);
    expect(removed).not.toBeNull();
    expect(sampleDeviation(DEFAULT_BSPLINE_CURVE, removed!)).toBeLessThan(1e-5);

    const knotEdited = setSplineKnot(DEFAULT_BSPLINE_CURVE, 4, 0.25);
    expect(knotEdited.revision).toBe(2);
    expect(knotEdited.knotVector[4]).toBe(0.25);
    const weighted = setSplineWeight(DEFAULT_NURBS_QUARTER_ARC, 1, 0.5);
    expect(weighted.revision).toBe(2);
    expect(evaluateSpline(weighted, 0.5).x).not.toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("applies position, tangent, curvature, and geometric continuity constraints", () => {
    for (const continuity of ["C0", "C1", "C2", "G1", "G2"] as const) {
      const joined = constrainSplineJoin(DEFAULT_BEZIER_CURVE, { ...cloneSplineFixture(DEFAULT_BEZIER_CURVE), id: "right" }, continuity);
      expect(joined.revision).toBe(2);
      expect(joined.controlPoints[0]).toEqual(DEFAULT_BEZIER_CURVE.controlPoints.at(-1));
      if (continuity !== "C0") {
        const leftTangent = sub(DEFAULT_BEZIER_CURVE.controlPoints.at(-1)!, DEFAULT_BEZIER_CURVE.controlPoints.at(-2)!);
        const rightTangent = sub(joined.controlPoints[1], joined.controlPoints[0]);
        expect(crossMagnitude(leftTangent, rightTangent)).toBeLessThan(1e-9);
      }
    }
  });

  it("stores edits in branch-safe undo/redo history and round-trips the full rational definition", () => {
    const moved = moveSplineControlPoint(DEFAULT_NURBS_QUARTER_ARC, 1, { x: 1.2, y: 1.1 });
    const weighted = setSplineWeight(moved, 1, 0.8);
    let history = createSplineHistory(DEFAULT_NURBS_QUARTER_ARC);
    history = pushSplineHistory(history, moved);
    history = pushSplineHistory(history, weighted);
    expect(currentSplineRevision(history).revision).toBe(3);
    history = undoSplineHistory(history);
    expect(currentSplineRevision(history).controlPoints[1]).toEqual({ x: 1.2, y: 1.1 });
    history = redoSplineHistory(history);
    expect(currentSplineRevision(history).weights[1]).toBe(0.8);

    const roundTrip = parseSplineDefinition(serializeSplineDefinition(RATIONAL_NURBS_CIRCLE));
    expect(roundTrip).toEqual(RATIONAL_NURBS_CIRCLE);
    expect(roundTrip.controlPoints).toHaveLength(9);
    expect(roundTrip.knotVector).toHaveLength(12);
  });
});

const sub = (a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const crossMagnitude = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
