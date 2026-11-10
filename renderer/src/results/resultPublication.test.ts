import { describe, expect, it } from "vitest";
import { createResultPublication, resultEvidenceRowsCsv } from "./resultPublication";

const input = {
  module: "project" as const, resultId: "result-1",
  source: { id: "source-1", revision: 2, generation: 3, hash: "sha256:abc" },
  sourceStatus: "Source verified", status: "recorded" as const,
  reason: "Exact bytes checked", recordedClaim: "Producer numerical result",
  independentCheck: "Source-only; no independent mathematics", summary: { value: 42 },
};

describe("cross-module result publication", () => {
  it("keeps source integrity separate from mathematical authority", () => {
    const receipt = createResultPublication(input);
    expect(receipt).toMatchObject({ schema: "math3d.result-publication/v1",
      source: { revision: 2, generation: 3, hash: "sha256:abc" },
      assessment: { status: "recorded", sourceStatus: "Source verified",
        recordedClaim: "Producer numerical result", omissions: [] }, summary: { value: 42 } });
    expect(receipt.assessment.independentCheck).toContain("no independent mathematics");
  });

  it("cannot publish values through a withheld or preview receipt", () => {
    for (const status of ["withheld", "preview"] as const) {
      const receipt = createResultPublication({ ...input, status });
      expect(receipt.summary).toBeNull();
      expect(receipt.assessment.omissions).toEqual(["summary values"]);
      expect(JSON.stringify(receipt)).not.toContain("42");
    }
  });

  it("escapes quotes, newlines and formula-like cells consistently", () => {
    const csv = resultEvidenceRowsCsv([
      ["id", "=1+1"], ["text", 'line\n"quoted"'], ["empty", null],
      ["data", { value: 42 }],
    ]);
    expect(csv).toContain('"id","\'=1+1"');
    expect(csv).toContain('"text","line\n""quoted"""');
    expect(csv).toContain('"empty",""');
    expect(csv).toContain('"data","{""value"":42}"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
