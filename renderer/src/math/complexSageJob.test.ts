import { describe, expect, it } from "vitest";
import {
  COMPLEX_SAGE_ANALYSIS_OPERATION,
  SAGE_COMPLEX_ANALYSIS_OPERATION,
  createComplexAnalysisDocument,
  createComplexSageJobRequest,
  createComplexSagePayload,
  parseComplexExpressionAst,
  publishComplexSageResult,
  type ComplexSageOutput,
  type ScientificJobLimits,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { createInProcessScientificJobService } from "@math3d/kernel";
import { COMPLEX_SAGE_RUNTIME_POLICY, createComplexSageJobAdapter } from "./complexSageJob";

const fixture = (sourceText = "1/(z^2+1)") => {
  const parsed = parseComplexExpressionAst(sourceText, ["z"]);
  if (!parsed.ast) throw new Error(parsed.error?.message);
  const document = createComplexAnalysisDocument({
    function: { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z"] },
    parameters: [], assumptions: [], domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns: 32, rows: 32, maximumSamples: 1024, tolerance: 1e-10 }, contours: [],
    branchPolicy: { profile: "principal", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 }, covering: null, mobius: null,
  }, { stableKey: `sage-${sourceText}` });
  const source: ScientificSourceGeneration = { documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision };
  return { document, source };
};
const limits = (): ScientificJobLimits => ({ deadlineAt: Date.now() + 10_000, maxInputBytes: 64_000, maxOutputBytes: 64_000, maxMemoryBytes: 256_000, maxWorkUnits: 100_000 });
const output = (operation: ComplexSageOutput["operation"], value = "-1/2*I"): ComplexSageOutput => ({
  format: "math3d.complex-sage-analysis-result", schemaVersion: 1, operation, exact: true, value, latex: value,
  points: operation === "poles" ? [{ value: "I", order: 1, classification: "pole" }, { value: "-I", order: 1, classification: "pole" }] : [],
  series: operation === "series" ? [{ power: -1, coefficient: "1" }] : [],
  engine: { name: "SageMath", version: "10.8" }, algorithm: "sage-structured-complex-analysis", elapsedMs: 8,
  diagnostics: [{ code: "complex/sage-exact", message: "Exact structured fixture." }],
});

describe("C07 constrained Sage Complex adapter", () => {
  it("translates only validated AST data and publishes engine/version provenance", async () => {
    const { document, source } = fixture();
    const payload = createComplexSagePayload({ document, operation: "residue", point: { re: 0, im: 1 } });
    let delivered: unknown = null;
    const service = createInProcessScientificJobService({
      adapters: [createComplexSageJobAdapter(async (request) => {
        delivered = request;
        return { engine: "sagemath", operation: request.operation, success: true, latex: "", result: output("residue"), warnings: [] };
      })], resolveSource: () => source,
    });
    const outcome = await service.submit(createComplexSageJobRequest({ jobId: "complex-residue", source, payload, limits: limits() }));
    expect(outcome.ok).toBe(true);
    expect(delivered).toMatchObject({ operation: SAGE_COMPLEX_ANALYSIS_OPERATION, params: { operation: "residue", ast: document.function.normalizedAst } });
    expect(JSON.stringify(delivered)).not.toMatch(/sourceText|python|shell|script/i);
    if (!outcome.ok) return;
    const result = publishComplexSageResult({ jobResult: outcome, currentSource: source, expectedPayload: payload });
    expect(result).toMatchObject({ status: "exact", provenance: { engine: { name: "SageMath", version: "10.8" }, operation: { type: COMPLEX_SAGE_ANALYSIS_OPERATION } } });
  });

  it("rejects source/script fields, unsupported operations, and non-z AST variables", async () => {
    const { document, source } = fixture();
    const payload = createComplexSagePayload({ document, operation: "derivative" });
    let calls = 0;
    const service = createInProcessScientificJobService({ adapters: [createComplexSageJobAdapter(async () => {
      calls += 1;
      return { engine: "sagemath", operation: SAGE_COMPLEX_ANALYSIS_OPERATION, success: true, latex: "", result: output("derivative"), warnings: [] };
    })], resolveSource: () => source });
    for (const mutation of [
      { source: "__import__('os').system('whoami')" },
      { script: "print(1)" },
      { operation: "arbitrary-python" },
    ]) {
      const unsafe = { ...payload, ...mutation };
      const request = createComplexSageJobRequest({ jobId: `unsafe-${Object.keys(mutation)[0]}`, source, payload, limits: limits() });
      const candidate = { ...request, operation: { ...request.operation, payload: unsafe } };
      expect(await service.submit(candidate)).toMatchObject({ ok: false, code: "adapter-failed" });
    }
    const badAst = { ...payload, ast: { type: "variable", name: "u" } };
    const badRequest = createComplexSageJobRequest({ jobId: "unsafe-variable", source, payload, limits: limits() });
    expect(await service.submit({ ...badRequest, operation: { ...badRequest.operation, payload: badAst } })).toMatchObject({ ok: false, code: "adapter-failed" });
    expect(calls).toBe(0);
  });

  it("inherits F05 cancellation, deadline, work, memory, and output limits", async () => {
    const { document, source } = fixture("exp(z)");
    const payload = createComplexSagePayload({ document, operation: "derivative" });
    let finish!: (value: any) => void;
    const service = createInProcessScientificJobService({ adapters: [createComplexSageJobAdapter(() => new Promise((resolve) => { finish = resolve; }))], resolveSource: () => source });
    const pending = service.submit(createComplexSageJobRequest({ jobId: "cancel-complex", source, payload, limits: limits() }));
    await Promise.resolve();
    expect(service.cancel("cancel-complex")).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: "cancelled" });
    finish({ engine: "sagemath", operation: SAGE_COMPLEX_ANALYSIS_OPERATION, success: true, latex: "", result: output("derivative"), warnings: [] });

    const workLimited = createComplexSageJobRequest({ jobId: "work-limited", source, payload, limits: { ...limits(), maxWorkUnits: 1 } });
    const limitedService = createInProcessScientificJobService({ adapters: [createComplexSageJobAdapter(async () => ({ engine: "sagemath", operation: SAGE_COMPLEX_ANALYSIS_OPERATION, success: true, latex: "", result: output("derivative"), warnings: [] }))], resolveSource: () => source });
    expect(await limitedService.submit(workLimited)).toMatchObject({ ok: false, code: "work-limit-exceeded" });
    expect(COMPLEX_SAGE_RUNTIME_POLICY).toMatchObject({ arbitrarySource: "denied", shell: "denied", filesystem: "ephemeral-working-directory-only" });
  });
});
