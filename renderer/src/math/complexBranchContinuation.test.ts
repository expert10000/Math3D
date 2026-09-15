import { describe, expect, it } from "vitest";
import { createComplexAnalysisDocument, parseComplexExpressionAst } from "@math3d/core";
import { analyzeAdaptiveComplexContinuation } from "./complexBranchContinuation";
import { contourRecordFromPoints } from "./complexNumericalAnalysis";

const fixture = (sourceText: string, center = { re: 0, im: 0 }, radius = 0.75) => {
  const parsed = parseComplexExpressionAst(sourceText, ["z"]);
  if (!parsed.ast) throw new Error(parsed.error?.message);
  const points = Array.from({ length: 33 }, (_, index) => { const angle = 2 * Math.PI * index / 32; return { re: center.re + radius * Math.cos(angle), im: center.im + radius * Math.sin(angle) }; });
  return createComplexAnalysisDocument({
    function: { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z"] }, parameters: [], assumptions: [],
    domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
    sampling: { strategy: "adaptive-grid", columns: 32, rows: 32, maximumSamples: 1024, tolerance: 1e-8 },
    contours: [contourRecordFromPoints("continuation-loop", "branch-loop", points)],
    branchPolicy: { profile: "principal", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: true, sheetCount: 3, activeSheet: 0 }, covering: null, mobius: null,
  }, { stableKey: `continuation-${sourceText}` });
};

describe("C10 adaptive branch continuation", () => {
  it.each([
    ["log(z)", 1, ["k -> k + 1"]],
    ["sqrt(z)", 1, ["0->1", "1->0"]],
    ["z^(1/3)", 1, ["0->1", "1->2", "2->0"]],
    ["sqrt(z^2-1)", 1, ["0->1", "1->0"], { re: 1, im: 0 }],
  ])("publishes validated monodromy for %s", (source, shift, permutation, center) => {
    const result = analyzeAdaptiveComplexContinuation(fixture(source as string, center as any), 10).result;
    expect(result.summary.outcome).toBe("validated");
    expect(result.summary.sheetShift).toBe(shift);
    expect(result.summary.monodromyPermutation).toEqual(permutation);
    expect(result.provenance.numericContext?.precision?.decimalDigits).toBeGreaterThanOrEqual(30);
  });

  it("withholds monodromy when a path touches the discriminant", () => {
    const document = fixture("sqrt(z)", { re: 0.5, im: 0 }, 0.5);
    const result = analyzeAdaptiveComplexContinuation(document, 10).result;
    expect(result.summary.outcome).toBe("uncertain");
    expect(result.summary.monodromyPermutation).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/discriminant|maximum depth/i);
  });

  it("reports unsupported profiles instead of reusing a preset conclusion", () => {
    const result = analyzeAdaptiveComplexContinuation(fixture("exp(z)"), 10).result;
    expect(result.status).toBe("unsupported");
    expect(result.summary.outcome).toBe("uncertain");
    expect(result.summary.monodromyPermutation).toEqual([]);
  });
});
