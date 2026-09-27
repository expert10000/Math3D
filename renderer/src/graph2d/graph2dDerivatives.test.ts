import { describe, expect, it } from "vitest";
import { analyzeGraph2DDerivatives, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, differentiateGraph2DExpression, isAnalysisResultCurrent } from "@math3d/core";

const documentFor = (expression: string, domain = { min: -10, max: 10, includeMin: true, includeMax: true }) => {
  const empty = createEmptyGraph2DDocument("derivative:" + expression);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression, domain,
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, selection: scene.selection,
    stableKey: "derivative:" + expression });
};

describe("Graph2D derivatives", () => {
  it.each([
    ["x^3", 2, 12, 12],
    ["sin(x)", 0.4, Math.cos(0.4), -Math.sin(0.4)],
    ["exp(x)", 1, Math.E, Math.E],
    ["log(x)", 2, 1 / (2 * Math.LN10), -1 / (4 * Math.LN10)],
    ["x^x", 2, 4 * (Math.log(2) + 1), 4 * ((Math.log(2) + 1) ** 2 + 0.5)],
  ])("applies bounded symbolic rules for %s", (expression, x, expectedFirst, expectedSecond) => {
    const document = documentFor(expression);
    const firstAst = differentiateGraph2DExpression(document.source.objects[0]!.expression.ast, 1);
    expect(firstAst.ok).toBe(true);
    const [first, second] = analyzeGraph2DDerivatives(document, "function_1", x);
    expect(first.method).toBe("symbolic-rules");
    expect(second.method).toBe("symbolic-rules");
    expect(first.value).toBeCloseTo(expectedFirst, 7);
    expect(second.value).toBeCloseTo(expectedSecond, 7);
    expect(first.errorEstimate).toBeNull();
    expect(first.publication.status).toBe("numerical");
    expect(isAnalysisResultCurrent(first.publication, first.publication.provenance.source)).toBe(true);
  });

  it("uses convergent finite differences for unsupported smooth local rules", () => {
    const document = documentFor("abs(x)");
    const [first, second] = analyzeGraph2DDerivatives(document, "function_1", 2);
    expect(first.method).toBe("finite-difference");
    expect(first.value).toBeCloseTo(1, 5);
    expect(first.step).toBeGreaterThan(0);
    expect(first.errorEstimate).toBeLessThan(first.tolerance);
    expect(second.method).toBe("finite-difference");
    expect(second.value).toBeCloseTo(0, 3);
    const curved = documentFor("abs(x^2-1)");
    const [curvedFirst, curvedSecond] = analyzeGraph2DDerivatives(curved, "function_1", 2);
    expect(curvedFirst.value).toBeCloseTo(4, 4);
    expect(curvedSecond.value).toBeCloseTo(2, 3);
    expect(curvedSecond.errorEstimate).toBeLessThan(curvedSecond.tolerance);
  });

  it("reports cusps, singularities, and excluded domain endpoints as unavailable", () => {
    const abs = documentFor("abs(x)");
    const [cusp] = analyzeGraph2DDerivatives(abs, "function_1", 0);
    expect(cusp.status).toBe("unavailable");
    expect(cusp.diagnostics.some((entry) => entry.code === "nondifferentiable")).toBe(true);
    const sqrt = documentFor("sqrt(x)", { min: 0, max: 10, includeMin: true, includeMax: true });
    const [singular] = analyzeGraph2DDerivatives(sqrt, "function_1", 0);
    expect(singular.status).toBe("unavailable");
    const excluded = documentFor("x^2", { min: 0, max: 10, includeMin: false, includeMax: true });
    const [outside] = analyzeGraph2DDerivatives(excluded, "function_1", 0);
    expect(outside.status).toBe("unavailable");
    expect(outside.diagnostics[0]?.code).toBe("outside-domain");
  });
});
