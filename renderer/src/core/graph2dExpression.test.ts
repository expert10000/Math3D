import { describe, expect, it } from "vitest";
import { evaluateGraph2DExpression, formatGraph2DExpressionAst, parseGraph2DExpression } from "@math3d/core";

const valueOf = (source: string, x = 0) => {
  const parsed = parseGraph2DExpression(source);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message);
  return evaluateGraph2DExpression(parsed.ast, { x });
};

describe("Graph2D safe expression language", () => {
  it("uses deterministic precedence, right associative powers, constants, and formatting", () => {
    expect(valueOf("-2^2")).toMatchObject({ ok: true, value: -4 });
    expect(valueOf("2^3^2")).toMatchObject({ ok: true, value: 512 });
    expect(valueOf("2 + 3*4")).toMatchObject({ ok: true, value: 14 });
    expect(valueOf("sin(pi/2)+x", 3)).toMatchObject({ ok: true, value: 4 });
    const parsed = parseGraph2DExpression("x ^ 2");
    if (!parsed.ok) throw new Error("Expected AST");
    expect(formatGraph2DExpressionAst(parsed.ast)).toBe("(x^2)");
    expect(parseGraph2DExpression(formatGraph2DExpressionAst(parsed.ast)).ok).toBe(true);
  });

  it("reports syntax, symbol, domain, and non-finite diagnostics", () => {
    expect(parseGraph2DExpression("x + ")).toMatchObject({ ok: false, diagnostics: [{ code: "syntax" }] });
    expect(parseGraph2DExpression("process.exit(1)")).toMatchObject({ ok: false, diagnostics: [{ code: "syntax" }] });
    expect(parseGraph2DExpression("constructor(x)")).toMatchObject({ ok: false, diagnostics: [{ code: "unknown-symbol" }] });
    expect(parseGraph2DExpression("sin(y)")).toMatchObject({ ok: false, diagnostics: [{ code: "unknown-symbol" }] });
    expect(valueOf("1/x", 0)).toMatchObject({ ok: false, diagnostic: { code: "domain" } });
    expect(valueOf("sqrt(-1)")).toMatchObject({ ok: false, diagnostic: { code: "domain" } });
    expect(valueOf("exp(1000)")).toMatchObject({ ok: false, diagnostic: { code: "non-finite" } });
  });

  it("bounds source, AST depth, and evaluation work", () => {
    expect(parseGraph2DExpression("x".repeat(2049))).toMatchObject({ ok: false, diagnostics: [{ code: "limit" }] });
    expect(parseGraph2DExpression("(".repeat(40) + "x" + ")".repeat(40))).toMatchObject({ ok: false, diagnostics: [{ code: "limit" }] });
    const parsed = parseGraph2DExpression("x+1");
    if (!parsed.ok) throw new Error("Expected AST");
    expect(evaluateGraph2DExpression(parsed.ast, { x: 1 }, { maxEvaluations: 1 })).toMatchObject({ ok: false, diagnostic: { code: "limit" } });
    expect(evaluateGraph2DExpression(parsed.ast, { x: 1 }, { deadlineMs: 0 })).toMatchObject({ ok: false, diagnostic: { code: "limit" } });
  });
});
