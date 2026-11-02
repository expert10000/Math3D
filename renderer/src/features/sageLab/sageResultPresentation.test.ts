import { describe, expect, it } from "vitest";
import type { SageRunResponse } from "../../integrations/sage/sageSchemas";
import { sageResultActions, sageResultDiagnostics, sageResultKind } from "./sageResultPresentation";

const result = (operation: string, data: Record<string, unknown> = {}, success = true): SageRunResponse => ({
  engine: "sagemath", engineVersion: "10.6", operation, success,
  latex: "", result: data, warnings: [], ...(success ? {} : { error: "exact operation failed" }),
});

describe("Sage Inspector result presentation", () => {
  it("classifies expression, vector, matrix, solution, and error contracts", () => {
    expect(sageResultKind(result("sage.symbolic.simplify", { text: "1" }))).toBe("expression");
    expect(sageResultKind(result("sage.symbolic.gradient", { components: ["2*x", "2*y", "2*z"] }))).toBe("vector");
    expect(sageResultKind(result("sage.symbolic.hessian", { matrix: [["2", "0"], ["0", "2"]] }))).toBe("matrix");
    expect(sageResultKind(result("sage.matrix.eigen_exact", { eigenvalues: ["1", "2"] }))).toBe("matrix");
    expect(sageResultKind(result("sage.symbolic.solve", { solutions: ["x=1"] }))).toBe("solution");
    expect(sageResultKind(result("sage.polynomial.roots_exact", { roots: [{ value: "1" }] }))).toBe("solution");
    expect(sageResultKind(result("sage.symbolic.simplify", {}, false))).toBe("error");
  });

  it("limits derived actions to compatible, fresh results", () => {
    const gradient = result("sage.symbolic.gradient", { components: ["1", "2", "3"] });
    expect(sageResultActions(gradient, "current")).toMatchObject({ visualize: true, createGeometry: false });
    expect(sageResultActions(gradient, "stale").visualize).toBe(false);
    expect(sageResultActions(gradient, "unlinked").visualize).toBe(true);
    expect(sageResultActions(result("sage.symbolic.factor", { text: "x^2" }), "unlinked").createGeometry).toBe(true);
    expect(sageResultActions(result("sage.symbolic.factor", { text: "x^2" }), "stale").createGeometry).toBe(false);
    expect(sageResultActions(result("sage.symbolic.solve", { solutions: [] }), "current").createGeometry).toBe(false);
    expect(sageResultActions(result("sage.symbolic.factor", {}, false), "current")).toMatchObject({
      visualize: false, createGeometry: false, saveWorkbook: true,
    });
  });

  it("retains worker warnings and diagnostics", () => {
    expect(sageResultDiagnostics({ ...result("sage.symbolic.solve", { diagnostics: ["bounded AST"] }),
      warnings: ["partial solution"] })).toEqual(["bounded AST"]);
  });
});
