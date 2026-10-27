import { describe, expect, it } from "vitest";
import { differentiateMathExpression, mathExpressionProvenance, mathExpressionSymbolTable,
  prepareMathExpression, previewMathExpression, restoreMathExpressionProvenance,
  serializeMathExpressionAst } from "./mathExpressionPipeline";

describe("shared math expression pipeline", () => {
  it("keeps module grammar and parses each source into a tagged AST", () => {
    const real = prepareMathExpression("2x + log(e)", "real", ["x"]);
    expect(real.ast?.profile).toBe("real");
    expect(real.evaluate?.({ x: 3 }).value).toBeCloseTo(7);
    const graph = prepareMathExpression("log(100)", "graph", []);
    expect(graph.ast?.profile).toBe("graph");
    expect(graph.evaluate?.({}).value).toBeCloseTo(2);
    const complex = prepareMathExpression("z^2+i", "complex", ["z"]);
    expect(complex.ast?.profile).toBe("complex");
    const value = complex.evaluate?.({ z: { re: 1, im: 1 } }).value;
    expect(typeof value).toBe("object");
    if (typeof value === "object") {
      expect(value.re).toBeCloseTo(0);
      expect(value.im).toBeCloseTo(3);
    }
  });

  it("enforces declared variables and finite bindings", () => {
    expect(prepareMathExpression("x+y", "real", ["x"]).error).toMatchObject({ kind: "scope", message: expect.stringContaining("Unknown identifier") });
    expect(prepareMathExpression("z+u", "complex", ["z"]).error).toMatchObject({ kind: "scope", message: expect.stringContaining("Unknown identifier") });
    expect(prepareMathExpression("x", "graph", ["x"]).evaluate?.({}).error?.kind).toBe("scope");
  });

  it("reports singularities in the preview without rejecting valid syntax", () => {
    const real = previewMathExpression("1/x", "real", ["x"], { x: 0 });
    expect(real.ast?.profile).toBe("real");
    expect(real.sampleError?.kind).toBe("domain");
    const complex = previewMathExpression("1/z", "complex", ["z"], { z: { re: 0, im: 0 } });
    expect(complex.ast?.profile).toBe("complex");
    expect(complex.sampleError?.kind).toBe("domain");
  });

  it("bounds long real sources before parsing", () => {
    const result = prepareMathExpression("x+".repeat(5_001), "real", ["x"]);
    expect(result.error?.kind).toBe("limit");
  });

  it("uses explicit scopes, arity checks, and domain diagnostics", () => {
    expect(prepareMathExpression("sin(x, y)", "graph", ["x", "y"]).error?.kind).toBe("syntax");
    expect(prepareMathExpression("sqrt(x)", "graph", ["x"]).evaluate?.({ x: -1 }).error?.kind).toBe("domain");
    expect(prepareMathExpression("1/(x-1)", "graph", ["x"]).evaluate?.({ x: 1 }).error?.kind).toBe("domain");
    expect(prepareMathExpression("x+y", "graph", ["x"]).error?.kind).toBe("scope");
    expect(prepareMathExpression("pi+1", "real", ["pi"]).error?.kind).toBe("scope");
    expect(prepareMathExpression("-x^2", "graph", ["x"]).evaluate?.({ x: 3 }).value).toBe(-9);
    expect(prepareMathExpression("-x^2", "real", ["x"]).evaluate?.({ x: 3 }).value).toBe(-9);
    expect(prepareMathExpression("2^-x", "real", ["x"]).evaluate?.({ x: 2 }).value).toBeCloseTo(0.25);
    const complexValue = prepareMathExpression("-z^2", "complex", ["z"]).evaluate?.({ z: 3 }).value;
    expect(typeof complexValue).toBe("object");
    if (typeof complexValue === "object") { expect(complexValue.re).toBeCloseTo(-9); expect(complexValue.im).toBeCloseTo(0); }
    expect(mathExpressionSymbolTable("graph", ["x"]).variables).toEqual(["x"]);
  });

  it("canonically serializes typed ASTs and retains source provenance", () => {
    const first = prepareMathExpression("x + 1", "graph", ["x"]).ast!;
    const second = prepareMathExpression("x+1", "graph", ["x"]).ast!;
    expect(first.normalized).toMatchObject({ kind: "binary", operator: "+", left: { kind: "symbol", name: "x" } });
    expect(prepareMathExpression("2x+1", "real", ["x"]).ast?.normalized).toMatchObject({ kind: "binary", operator: "+" });
    expect(serializeMathExpressionAst(first)).toBe(serializeMathExpressionAst(second));
    expect(mathExpressionProvenance(first)).toMatchObject({ source: "x + 1", profile: "graph",
      structuralHash: expect.any(String) });
    const provenance = mathExpressionProvenance(first);
    expect(restoreMathExpressionProvenance(provenance).evaluate?.({ x: 2 }).value).toBe(3);
    expect(restoreMathExpressionProvenance({ ...provenance, source: "x+2" }).error?.kind).toBe("syntax");
    expect(differentiateMathExpression(first, "x")).toMatchObject({ ok: true, method: "symbolic-rules",
      ast: { normalized: { kind: "number", value: 1 } } });
    expect(differentiateMathExpression(first, "y")).toMatchObject({ ok: false });
    const complex = prepareMathExpression("z^2+i", "complex", ["z"]).ast!;
    expect(serializeMathExpressionAst(complex)).toContain("complex");
  });
});
