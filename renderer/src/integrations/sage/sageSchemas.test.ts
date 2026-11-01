import { describe, expect, it } from "vitest";
import { normalizeSageHealth, normalizeSageRunResponse } from "./sageSchemas";

describe("Sage schemas", () => {
  it("normalizes health and filters unknown operations", () => {
    expect(
      normalizeSageHealth({
        status: "ok",
        engine: "sagemath",
        available: true,
        operations: ["sage.symbolic.simplify", "sage.topology.integer_homology", "sage.unsafe.eval"],
      })
    ).toEqual({
      status: "ok",
      engine: "sagemath",
      available: true,
      operations: ["sage.symbolic.simplify", "sage.topology.integer_homology"],
    });
  });

  it("retains a reported SageMath runtime version", () => {
    expect(normalizeSageHealth({ status: "ok", engine: "sagemath", engineVersion: "10.6",
      available: true, operations: ["sage.symbolic.simplify"] }).engineVersion).toBe("10.6");
  });

  it("normalizes successful run responses", () => {
    expect(
      normalizeSageRunResponse({
        engine: "sagemath",
        operation: "sage.symbolic.simplify",
        success: true,
        latex: "1",
        result: { text: "1" },
        warnings: [],
        elapsedMs: 12.4,
      })
    ).toEqual({
      engine: "sagemath",
      operation: "sage.symbolic.simplify",
      success: true,
      latex: "1",
      result: { text: "1" },
      warnings: [],
      elapsedMs: 12,
      error: undefined,
    });
  });

  it("preserves failure messages", () => {
    expect(
      normalizeSageRunResponse({
        engine: "sagemath",
        operation: "sage.symbolic.simplify",
        success: false,
        result: {},
        error: "Unsupported expression",
      })
    ).toMatchObject({
      success: false,
      error: "Unsupported expression",
      warnings: [],
    });
  });
});
