import {
  SAGE_COMPLEX_ANALYSIS_OPERATION,
  canonicalJsonByteLength,
  normalizeComplexSageOutput,
  normalizeComplexSagePayload,
} from "@math3d/core";
import type { InProcessScientificJobAdapter } from "@math3d/kernel";
import { runSageOperation } from "../integrations/sage/sageClient";
import type { SageRunRequest, SageRunResponse } from "../integrations/sage/sageSchemas";

export type ComplexSageExecutor = (request: SageRunRequest) => Promise<SageRunResponse>;

export const COMPLEX_SAGE_RUNTIME_POLICY = Object.freeze({
  arbitrarySource: "denied",
  shell: "denied",
  network: "sage-service-only",
  filesystem: "ephemeral-working-directory-only",
});

/** The sole ordinary-analysis bridge: normalized AST data in, never source code. */
export const createComplexSageJobAdapter = (execute: ComplexSageExecutor = runSageOperation): InProcessScientificJobAdapter => ({
  operationType: "complex.sage-analysis",
  execute: async (input, context) => {
    context.checkpoint();
    const payload = normalizeComplexSagePayload(input.payload);
    if (!payload.ok) throw new TypeError(payload.errors.join(" "));
    const bytes = canonicalJsonByteLength(payload.value);
    context.reserveMemory(bytes);
    context.consumeWork(Math.max(1, JSON.stringify(payload.value.ast).length));
    context.reportProgress({ completed: 1, total: 3, message: "Validated structured Complex AST request" });
    try {
      const response = await execute({ operation: SAGE_COMPLEX_ANALYSIS_OPERATION, params: payload.value as unknown as Record<string, unknown> });
      context.checkpoint();
      if (!response.success) throw new Error(response.error || "SageMath Complex analysis failed.");
      if (response.operation !== SAGE_COMPLEX_ANALYSIS_OPERATION || response.engine !== "sagemath") throw new TypeError("Unexpected SageMath response identity.");
      const output = normalizeComplexSageOutput(response.result);
      if (!output.ok) throw new TypeError(output.errors.join(" "));
      context.reportProgress({ completed: 3, total: 3, message: "Verified exact SageMath result" });
      return output.value;
    } finally {
      context.releaseMemory(bytes);
    }
  },
});
