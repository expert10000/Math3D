import { describe, expect, it } from "vitest";
import { createComplexAnalysisDocument, normalizeComplexSageOutput, parseComplexExpressionAst } from "@math3d/core";
import { analyzeComplexExactMvp, differentiateComplexAst } from "./complexExactAnalysis";
import { compileComplexExpressionAstPreview } from "./complexExpr";
import { contourRecordFromPoints } from "./complexNumericalAnalysis";

const EXPECTED = {
  "1/z": { derivative: "-1/z^2", classification: "meromorphic", singularities: 1, argument: -1 },
  "1/(z^2+1)": { derivative: "-2*z/(z^2+1)^2", classification: "meromorphic", singularities: 2, argument: -2 },
  "sin(z)/z": { derivative: "(z*cos(z)-sin(z))/z^2", classification: "entire-after-removable-extension", singularities: 1, argument: 0 },
  "exp(z)": { derivative: "exp(z)", classification: "entire", singularities: 0, argument: 0 },
} as const;

const fixture = (sourceText: keyof typeof EXPECTED) => {
  const parsed = parseComplexExpressionAst(sourceText, ["z"]);
  if (!parsed.ast) throw new Error(parsed.error?.message);
  const radius = 2;
  const points = Array.from({ length: 97 }, (_, index) => {
    const angle = 2 * Math.PI * index / 96;
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) };
  });
  return createComplexAnalysisDocument({
    function: { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z"] }, parameters: [], assumptions: [],
    domain: { re: { min: -2.5, max: 2.5 }, im: { min: -2.5, max: 2.5 }, exclusions: [] },
    sampling: { strategy: "adaptive-grid", columns: 64, rows: 64, maximumSamples: 4096, tolerance: 1e-7 },
    contours: [contourRecordFromPoints("acceptance-circle", "circle", points)],
    branchPolicy: { profile: "principal", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 }, covering: null, mobius: null,
  }, { stableKey: `exact-${sourceText}` });
};

describe("C08 exact residue and contour MVP", () => {
  it("passes the four required exact known-value and provenance fixtures", () => {
    for (const [sourceText, expected] of Object.entries(EXPECTED) as [keyof typeof EXPECTED, typeof EXPECTED[keyof typeof EXPECTED]][]) {
      const document = fixture(sourceText);
      const result = analyzeComplexExactMvp({ document, now: 10 });
      expect(result.symbolic.status, sourceText).toBe("exact");
      expect(result.symbolic.summary.derivative, sourceText).toBe(expected.derivative);
      expect(result.symbolic.summary.classification, sourceText).toBe(expected.classification);
      expect((result.symbolic.summary.singularities as unknown[]).length, sourceText).toBe(expected.singularities);
      expect(result.symbolic.provenance.source.structuralHash, sourceText).toBe(document.identity.structuralHash);
      expect(result.contour.status, sourceText).toBe("numerical");
      expect(result.contour.summary.zerosMinusPoles, sourceText).toBe(expected.argument);
      expect(result.contour.summary.errorEstimate, sourceText).toBeTypeOf("number");
    }
  });

  it("differentiates the normalized AST and agrees with preview values", () => {
    const document = fixture("exp(z)");
    const derivative = differentiateComplexAst(document.function.normalizedAst);
    const compiled = compileComplexExpressionAstPreview(derivative, ["z"]);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn!({ z: { re: 1, im: 0 } }).re).toBeCloseTo(Math.E, 10);
  });

  it("agrees with the constrained Sage contract for all four symbolic derivatives", () => {
    for (const [sourceText, expected] of Object.entries(EXPECTED) as [keyof typeof EXPECTED, typeof EXPECTED[keyof typeof EXPECTED]][]) {
      const sage = normalizeComplexSageOutput({
        format: "math3d.complex-sage-analysis-result", schemaVersion: 1, operation: "derivative", exact: true,
        value: expected.derivative, latex: expected.derivative, points: [], series: [],
        engine: { name: "SageMath", version: "10.8" }, algorithm: "sage-structured-complex-analysis", elapsedMs: 1,
        diagnostics: [{ code: "complex/sage-exact", message: "Differential fixture." }],
      });
      expect(sage.ok, sourceText).toBe(true);
      expect(analyzeComplexExactMvp({ document: fixture(sourceText), now: 10 }).symbolic.summary.derivative, sourceText)
        .toBe(sage.ok ? sage.value.value : "invalid");
    }
  });

  it("keeps unrecognized exact singularity claims explicitly unsupported", () => {
    const parsed = parseComplexExpressionAst("cos(z)", ["z"]);
    const source = fixture("exp(z)");
    const document = createComplexAnalysisDocument({
      function: { sourceText: "cos(z)", astVersion: 1, normalizedAst: parsed.ast!, allowedVariables: ["z"] },
      parameters: [], assumptions: [], domain: source.domain, sampling: source.sampling, contours: source.contours,
      branchPolicy: source.branchPolicy, covering: null, mobius: null,
    }, { stableKey: "unsupported-cos" });
    expect(analyzeComplexExactMvp({ document, now: 10 }).symbolic).toMatchObject({ status: "unsupported", summary: { evidence: "unsupported" } });
  });
});
