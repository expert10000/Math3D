import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSageAlgebraReconstructionInput, parseSageAlgebraReconstructionResult } from "@math3d/core";

const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/sage-algebra/a08-reconstruction.json"), "utf8")) as {
  format: string; schemaVersion: number; cases: Array<{ name: string; request: { operation: string; params: unknown };
    expected: { kind: string; characteristic: string; isField: boolean; variables?: string[] } }> };

describe("SAGE-A08 versioned cross-runtime fixtures", () => {
  it("keeps seven bounded requests compatible with the core object and result contracts", () => {
    expect(fixture).toMatchObject({ format: "math3d.sage-algebra-runtime-fixtures", schemaVersion: 1 });
    expect(fixture.cases.map((item) => item.name)).toEqual([
      "ZZ", "QQ", "Z/12Z", "Z/13Z", "GF(7^2)", "QQ[x,y]", "GF(7^2)[t]",
    ]);
    for (const item of fixture.cases) {
      expect(item.request.operation).toBe("sage.algebra.reconstruct");
      const input = parseSageAlgebraReconstructionInput(item.request.params);
      const target = input.objects.at(-1)!;
      expect(target.kind).toBe(item.expected.kind);
      const result = { format: "math3d.sage-algebra-reconstruction-result", schemaVersion: 1,
        target: input.target, kind: target.kind, definitionHash: target.contentHash,
        text: item.name, latex: "", characteristic: item.expected.characteristic, isField: item.expected.isField,
        ...(item.expected.variables ? { baseRing: "Exact parent", variables: item.expected.variables } : {}) };
      expect(parseSageAlgebraReconstructionResult(result, input)).toMatchObject(result);
      expect(() => parseSageAlgebraReconstructionResult({ ...result, definitionHash: "sha256:" + "0".repeat(64) }, input))
        .toThrow(/mismatched/);
    }
  });
});
