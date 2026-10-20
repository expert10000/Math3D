import { describe, expect, it } from "vitest";
import { prepareMathExpression, previewMathExpression } from "./mathExpressionPipeline";

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
});
