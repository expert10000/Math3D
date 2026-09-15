import { describe, expect, it } from "vitest";
import corpus from "../../../tests/fixtures/complex-analysis-v1/scientific-corpus.json";
import { deserializeComplexExpressionAst, parseComplexExpressionAst, serializeComplexExpressionAst, validateComplexExpressionAst } from "@math3d/core";
import { C } from "./complex";
import { compileComplexExpression, compileComplexExpressionAstPreview } from "./complexExpr";

describe("C03 validated serializable complex-expression AST", () => {
  it.each(corpus.functionCases)("serializes and reparses a stable normalized AST for $expression", ({ expression }) => {
    const first = parseComplexExpressionAst(expression, ["z"]);
    expect(first.error).toBeUndefined();
    const serialized = serializeComplexExpressionAst(first.ast!);
    const restored = deserializeComplexExpressionAst(serialized);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value).toEqual(first.ast);
    expect(serializeComplexExpressionAst(restored.value)).toBe(serialized);
    expect(parseComplexExpressionAst(expression, ["z"]).ast).toEqual(first.ast);
  });

  it.each(corpus.functionCases)("retains preview value for $expression", ({ expression, z, expected, tolerance }) => {
    const parsed = parseComplexExpressionAst(expression, ["z"]);
    const compiledAst = compileComplexExpressionAstPreview(parsed.ast!, ["z"]);
    const compiledSource = compileComplexExpression(expression, ["z"]);
    for (const compiled of [compiledAst, compiledSource]) {
      const value = compiled.fn!({ z: C(z[0], z[1]) });
      expect(Math.abs(value.re - expected[0])).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(value.im - expected[1])).toBeLessThanOrEqual(tolerance);
    }
  });

  it("preserves implicit multiplication and the controlled grammar", () => {
    const parsed = parseComplexExpressionAst("2i + 3(z+1) - -z", ["z"]);
    expect(parsed.error).toBeUndefined();
    const value = compileComplexExpressionAstPreview(parsed.ast!, ["z"]).fn!({ z: C(1, 0) });
    expect(value).toEqual(C(7, 2));
  });

  it.each([
    { source: "z +\n@", message: "Unexpected character '@'", index: 4, line: 2, col: 1 },
    { source: "foo + z", message: "Unknown identifier 'foo'", index: 0, line: 1, col: 1 },
    { source: "z +", message: "Expected expression", index: 3, line: 1, col: 4 },
    { source: "sin()", message: "requires one argument", index: 4, line: 1, col: 5 },
    { source: "sin(z, z)", message: "accepts exactly one argument", index: 5, line: 1, col: 6 },
    { source: "(z+1", message: "Mismatched '('", index: 0, line: 1, col: 1 },
    { source: "z + u", message: "Unknown identifier 'u'", index: 4, line: 1, col: 5 },
  ])("reports precise source diagnostics for $source", ({ source, message, index, line, col }) => {
    const parsed = parseComplexExpressionAst(source, ["z"]);
    expect(parsed.ast).toBeUndefined();
    expect(parsed.error).toMatchObject({ index, line, col });
    expect(parsed.error?.message).toContain(message);
  });

  it("rejects executable, unknown, and malformed AST fields", () => {
    const invalid = validateComplexExpressionAst({ type: "call", name: "eval", argument: { type: "variable", name: "z" }, executable: () => 1 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.join(" ")).toMatch(/canonical JSON|unknown fields|supported function/);
  });
});
