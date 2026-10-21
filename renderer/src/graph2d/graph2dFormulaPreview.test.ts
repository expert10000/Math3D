import { describe, expect, it } from "vitest";
import { previewGraph2DFormula } from "./graph2dFormulaPreview";

describe("Graph formula preview", () => {
  it("samples a one-variable formula over its editor domain", () => {
    const preview = previewGraph2DFormula("sin(x)", ["x"], ["x"], {}, [{ min: -Math.PI, max: Math.PI }]);
    expect(preview.kind).toBe("curve");
    if (preview.kind !== "curve") return;
    expect(preview.points).toHaveLength(61);
    expect(preview.midpoint).toBeCloseTo(0);
    expect(preview.max).toBeGreaterThan(0.9);
    expect(preview.fidelity).toBe("fast");
    expect(preview.samplesEvaluated).toBe(122);
  });

  it("exposes preview fidelity and warns when sparse samples may alias oscillations", () => {
    const ranges = [{ min: -10, max: 10 }] as const;
    const fast = previewGraph2DFormula("x*sin(x^2)", ["x"], ["x"], {}, ranges);
    const accurate = previewGraph2DFormula("x*sin(x^2)", ["x"], ["x"], {}, ranges,
      "values", {}, "accurate");
    expect(fast.kind).toBe("curve");
    expect(accurate.kind).toBe("curve");
    if (fast.kind !== "curve" || accurate.kind !== "curve") return;
    expect(fast.points).toHaveLength(61);
    expect(fast.aliasingRisk).toBe(true);
    expect(accurate.points).toHaveLength(481);
    expect(accurate.samplesEvaluated).toBe(962);
  });

  it("samples a two-variable formula and preserves its sign", () => {
    const preview = previewGraph2DFormula("x^2+y^2-4", ["x", "y"], ["x", "y"], {},
      [{ min: -2, max: 2 }, { min: -2, max: 2 }]);
    expect(preview.kind).toBe("field");
    if (preview.kind !== "field") return;
    expect(preview.midpoint).toBe(-4);
    expect(preview.cells[0]?.[0]).toBe(4);
    expect(preview.cells[2]?.[2]).toBe(-4);
  });

  it("uses current parameter values and reports parser diagnostics", () => {
    const preview = previewGraph2DFormula("a*x", ["x", "a"], ["x"], { a: 2 }, [{ min: -1, max: 1 }]);
    expect(preview.kind === "curve" && preview.midpoint).toBe(0);
    expect(preview.kind === "curve" && preview.points.at(-1)).toBe(2);
    const invalid = previewGraph2DFormula("sin(", ["x"], ["x"]);
    expect(invalid.kind).toBe("error");
    if (invalid.kind === "error") expect(invalid.source).toBe("parser");
  });

  it("draws the zero contour with the Graph contour sampler", () => {
    const preview = previewGraph2DFormula("x^2+y^2-4", ["x", "y"], ["x", "y"], {},
      [{ min: -3, max: 3 }, { min: -3, max: 3 }], "implicit");
    expect(preview.kind).toBe("contour");
    if (preview.kind !== "contour") return;
    expect(preview.segments.length).toBeGreaterThan(0);
    expect(preview.segments.flat().some(point => Math.abs(point.x - 2) < .2)).toBe(true);
    expect(preview.samplesEvaluated).toBeLessThanOrEqual(2400);
    expect(preview.cellsVisited).toBeGreaterThan(0);
    expect(preview.closedBranches).toBeGreaterThan(0);
    expect(preview.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("distinguishes no contour from an undefined formula", () => {
    const noCrossing = previewGraph2DFormula("x^2+y^2+1", ["x", "y"], ["x", "y"], {},
      [{ min: -3, max: 3 }, { min: -3, max: 3 }], "implicit");
    expect(noCrossing.kind).toBe("contour");
    if (noCrossing.kind === "contour") expect(noCrossing.segments).toHaveLength(0);
    const undefinedEverywhere = previewGraph2DFormula("sqrt(-1)", ["x"], ["x"]);
    expect(undefinedEverywhere).toMatchObject({ kind: "error", source: "sampling" });
    const partial = previewGraph2DFormula("sqrt(x)", ["x"], ["x"]);
    expect(partial.kind === "curve" && partial.invalidSamples).toBeGreaterThan(0);
    expect(previewGraph2DFormula("x", ["x"], ["x"], {}, [{ min: 2, max: 1 }]))
      .toMatchObject({ kind: "error", source: "sampling", message: expect.stringContaining("domain") });
  });

  it("uses the Graph samplers for slope directions and a combined inequality", () => {
    const ranges = [{ min: -2, max: 2 }, { min: -2, max: 2 }] as const;
    const slope = previewGraph2DFormula("y", ["x", "y"], ["x", "y"], {}, ranges, "slope-field");
    expect(slope.kind).toBe("diagram");
    if (slope.kind === "diagram") {
      expect(slope.mode).toBe("slope-field");
      expect(slope.segments.length).toBeGreaterThan(0);
      expect(slope.samplesEvaluated).toBeLessThanOrEqual(100);
    }
    const region = previewGraph2DFormula("x^2+y^2-1", ["x", "y"], ["x", "y"], {}, ranges, "inequality",
      { region: { clauses: [{ expression: "x^2+y^2-1", comparator: "<=" },
        { expression: "y", comparator: ">=" }], operator: "all", editingIndex: 0 } });
    expect(region.kind).toBe("diagram");
    if (region.kind === "diagram") {
      expect(region.mode).toBe("inequality");
      expect(region.fills.length).toBeGreaterThan(0);
      expect(region.fills.every(fill => fill.yMax > 0)).toBe(true);
    }
  });

  it("previews the current ODE seed and both phase derivatives", () => {
    const ode = previewGraph2DFormula("-x", ["t", "x"], ["t", "x"], {},
      [{ min: -1, max: 2 }, { min: -1, max: 3 }], "time-ode", { timeOde: { seed: { t: 0, x: 1 } } });
    expect(ode.kind).toBe("diagram");
    if (ode.kind === "diagram") {
      expect(ode.mode).toBe("time-ode");
      expect(ode.segments.length).toBeGreaterThan(0);
      expect(ode.seeds).toEqual([{ x: 0, y: 1 }]);
    }
    const phaseContext = { phasePortrait: { xDerivative: "y", yDerivative: "-x", editing: "x" as const,
      seeds: [{ x: 1, y: 0 }], timeSpan: 2 * Math.PI } };
    const phase = previewGraph2DFormula("y", ["x", "y"], ["x", "y"], {},
      [{ min: -2, max: 2 }, { min: -2, max: 2 }], "phase-portrait", phaseContext);
    expect(phase.kind).toBe("diagram");
    if (phase.kind === "diagram") {
      expect(phase.mode).toBe("phase-portrait");
      expect(phase.fieldSegments.length).toBeGreaterThan(0);
      expect(phase.segments.length).toBeGreaterThan(0);
    }
    const badCompanion = previewGraph2DFormula("y", ["x", "y"], ["x", "y"], {},
      [{ min: -2, max: 2 }, { min: -2, max: 2 }], "phase-portrait",
      { phasePortrait: { ...phaseContext.phasePortrait, yDerivative: "sin(" } });
    expect(badCompanion).toMatchObject({ kind: "error", source: "sampling" });
  });

  it("reports two-variable formulas that cannot produce a visible result", () => {
    const ranges = [{ min: -2, max: 2 }, { min: -2, max: 2 }] as const;
    expect(previewGraph2DFormula("sqrt(-1)", ["x", "y"], ["x", "y"], {}, ranges, "slope-field"))
      .toMatchObject({ kind: "error", source: "sampling" });
    expect(previewGraph2DFormula("sqrt(-1)", ["x", "y"], ["x", "y"], {}, ranges, "inequality",
      { region: { clauses: [{ expression: "sqrt(-1)", comparator: "<=" }], operator: "all", editingIndex: 0 } }))
      .toMatchObject({ kind: "error", source: "sampling" });
    expect(previewGraph2DFormula("sqrt(-1)", ["t", "x"], ["t", "x"], {}, ranges, "time-ode",
      { timeOde: { seed: { t: 0, x: 1 } } })).toMatchObject({ kind: "error", source: "sampling" });
  });
});
