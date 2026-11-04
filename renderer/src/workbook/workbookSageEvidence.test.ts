import { describe, expect, it } from "vitest";
import { resolveWorkbookSageFreshness, type WorkbookSageEvidence, type WorkbookBlock } from "@math3d/workbook";

const evidence: WorkbookSageEvidence = {
  schemaVersion: 1, kind: "sage-result/v1", savedAt: 100,
  source: { module: "surface", id: "surface:implicit_custom", revision: 3,
    expression: "x^2+y^2+z^2-1", fingerprint: "source-a" },
  request: { operation: "sage.symbolic.gradient", params: {
    expression: "x^2+y^2+z^2-1", variables: ["x", "y", "z"] }, backend: "local", jobId: "job-1" },
  engine: { name: "SageMath", backend: "local", version: "10.6" },
  response: { engine: "sagemath", engineVersion: "10.6", operation: "sage.symbolic.gradient",
    success: true, latex: "(2x,2y,2z)", result: { components: ["2*x", "2*y", "2*z"] },
    warnings: ["sample warning"] },
  diagnostics: ["sample warning", "exact AST"],
};

describe("durable Sage Workbook evidence", () => {
  it("survives a Workbook JSON reopen with the exact request and diagnostics", () => {
    const block: WorkbookBlock = { id: "b1", type: "text", title: "Gradient", text: "result", sageEvidence: evidence };
    const reopened = JSON.parse(JSON.stringify(block)) as WorkbookBlock;
    expect(reopened.sageEvidence).toEqual(evidence);
    expect(resolveWorkbookSageFreshness(reopened.sageEvidence!.source, evidence.source)).toBe("current");
  });

  it("marks a changed Surface revision or expression stale after reopen", () => {
    const reopened = JSON.parse(JSON.stringify(evidence)) as WorkbookSageEvidence;
    expect(resolveWorkbookSageFreshness(reopened.source, { ...reopened.source, revision: 4 })).toBe("stale");
    expect(resolveWorkbookSageFreshness(reopened.source, { ...reopened.source,
      expression: "x^2+y^2+z^2-4", fingerprint: "source-b" })).toBe("stale");
    expect(resolveWorkbookSageFreshness(reopened.source, { ...reopened.source,
      expression: "x^2+y^2+z^2-4" })).toBe("stale");
  });

  it("detects a changed Geometry object and never treats a missing source as current", () => {
    const source = { ...evidence.source, module: "geometry" as const, id: "object-1", revision: 7 };
    expect(resolveWorkbookSageFreshness(source, { ...source, revision: 8 })).toBe("stale");
    expect(resolveWorkbookSageFreshness(source, null)).toBe("source-unavailable");
  });

  it("retains hosted backend, exact request, version, and failure diagnostics after reopen", () => {
    const hosted: WorkbookSageEvidence = {
      ...evidence,
      source: { module: "number_theory", id: "sage-input:unlinked", revision: 0,
        expression: "inverse_mod(2, 4)", fingerprint: "source-private" },
      request: { operation: "sage.numberTheory.modInverse", params: { integer: "2", modulus: "4" },
        backend: "private", jobId: "private-job-1" },
      engine: { name: "SageMath", backend: "private", version: "10.10" },
      response: { engine: "sagemath", engineVersion: "10.10", operation: "sage.numberTheory.modInverse",
        success: false, latex: "", result: { diagnostics: ["not invertible"] },
        warnings: [], error: "inverse does not exist", errorCode: "operation_failed" },
      diagnostics: ["not invertible", "inverse does not exist"],
    };
    const reopened = JSON.parse(JSON.stringify({ id: "hosted-result", type: "text", sageEvidence: hosted })) as WorkbookBlock;
    expect(reopened.sageEvidence).toEqual(hosted);
    expect(reopened.sageEvidence?.request).toEqual(hosted.request);
    expect(reopened.sageEvidence?.engine).toEqual(hosted.engine);
    expect(reopened.sageEvidence?.diagnostics).toEqual(hosted.diagnostics);
  });
});
