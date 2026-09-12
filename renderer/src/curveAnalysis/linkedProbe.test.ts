import { analyzeCurveDifferentialGeometry, type Curve2D } from "@math3d/core";
import { describe, expect, it } from "vitest";
import { adaptCurveDefinition } from "./infrastructure";
import { buildCurveScalarPlots } from "./scalarPlots";
import { createSemanticCurvePick, curvePickComparison, curvePickIsStale, curvePickToCsv } from "./probe";

const curve: Curve2D = {
  id: "probe-circle",
  name: "Probe circle",
  kind: "parametric",
  dimension: 2,
  domain: { tMin: 0, tMax: Math.PI * 2, closed: true, periodic: true },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }),
  derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }),
  secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t) }),
  thirdDerivative: (t) => ({ x: Math.sin(t), y: -Math.cos(t) }),
};
const definition = adaptCurveDefinition({
  id: curve.id, revision: 3, label: curve.name, representation: "parametric", dimension: 2,
  expressions: { x: "cos(t)", y: "sin(t)" },
  domain: { parameter: "t", min: 0, max: Math.PI * 2, closed: true, periodic: true },
});
const field = analyzeCurveDifferentialGeometry(curve, { parameters: [0, Math.PI / 2, Math.PI], method: "exact" });

describe("linked Curve probes and scalar plots", () => {
  it("creates a revision-safe semantic pick with parameter, arc, span, point, and frame provenance", () => {
    const pick = createSemanticCurvePick({ identity: definition.identity, point: field.points[1], pointIndex: 1, parameterSpan: [0, Math.PI], source: "plot", createdAt: 42 });
    expect(pick.identity.curveRevision).toBe(3);
    expect(pick.t).toBeCloseTo(Math.PI / 2, 12);
    expect(pick.normalizedParameter).toBeCloseTo(0.25, 12);
    expect(pick.normalizedArcLength).toBeCloseTo(0.5, 12);
    expect(pick.segmentIndex).toBe(0);
    expect(pick.span).toEqual([0, Math.PI]);
    expect(pick.worldPoint).toEqual(expect.arrayContaining([expect.any(Number), expect.any(Number), 0]));
    expect(pick.frameKind).toBe("frenet");
    expect(pick.sourceMapping).toContain("plot -> curve parameter");
  });

  it("marks picks stale only when identity or revision changes", () => {
    const pick = createSemanticCurvePick({ identity: definition.identity, point: field.points[0], pointIndex: 0, parameterSpan: [0, Math.PI / 2], source: "viewport", createdAt: 1 });
    expect(curvePickIsStale(pick, definition.identity)).toBe(false);
    expect(curvePickIsStale(pick, { ...definition.identity, curveRevision: 4, revision: "4" })).toBe(true);
  });

  it("builds all scalar rows against parameter or normalized arc length", () => {
    const parameterRows = buildCurveScalarPlots(field, "parameter", [0.1, 0.2, 0.3]);
    const arcRows = buildCurveScalarPlots(field, "arc-length", [0.1, 0.2, 0.3]);
    expect(parameterRows.map((row) => row.key)).toEqual(["speed", "curvature", "signed-curvature", "torsion", "sampling-error"]);
    expect(parameterRows[0].values[1].x).toBeCloseTo(Math.PI / 2, 12);
    expect(arcRows[0].values[1].x).toBeCloseTo(0.5, 12);
    expect(arcRows[4].values.map((value) => value.value)).toEqual([0.1, 0.2, 0.3]);
  });

  it("compares and exports pinned probes", () => {
    const left = createSemanticCurvePick({ identity: definition.identity, point: field.points[0], pointIndex: 0, parameterSpan: [0, Math.PI / 2], source: "viewport", createdAt: 1 });
    const right = createSemanticCurvePick({ identity: definition.identity, point: field.points[1], pointIndex: 1, parameterSpan: [0, Math.PI], source: "plot", createdAt: 2 });
    expect(curvePickComparison(left, right).distance).toBeCloseTo(Math.sqrt(2), 10);
    const csv = curvePickToCsv([left, right]);
    expect(csv).toContain("curveId,revision,t,u,s");
    expect(csv.split("\n")).toHaveLength(3);
  });
});
