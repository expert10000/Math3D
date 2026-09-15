import {
  canonicalJsonByteLength,
  computeLocalZ2Homology,
  normalizeSageIntegerHomologyOutput,
  normalizeSageIntegerHomologyPayload,
  TOPOLOGY_INTEGER_HOMOLOGY_OPERATION,
  type AnalysisArtifactHandle,
  type ExactSparseBoundaryMatrixArtifact,
  type LocalZ2HomologyOutcome,
  type ScientificJobFailure,
  type ScientificJobOutcome,
  type ScientificSourceGeneration,
} from "@math3d/core";
import type { InProcessScientificJobAdapter } from "@math3d/kernel";
import { runSageOperation } from "../integrations/sage/sageClient";
import type { SageRunRequest, SageRunResponse } from "../integrations/sage/sageSchemas";

export const SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION = "sage.topology.integer_homology" as const;

export type SageIntegerHomologyExecutor = (request: SageRunRequest) => Promise<SageRunResponse>;

/**
 * The only bridge from a normal Topology workflow into Sage. The adapter accepts
 * the reviewed sparse-matrix schema; it never accepts Sage expressions or source.
 */
export const createSageIntegerHomologyJobAdapter = (
  execute: SageIntegerHomologyExecutor = runSageOperation
): InProcessScientificJobAdapter => ({
  operationType: TOPOLOGY_INTEGER_HOMOLOGY_OPERATION,
  execute: async (input, context) => {
    context.checkpoint();
    const payload = normalizeSageIntegerHomologyPayload(input.payload);
    if (!payload.ok) throw new TypeError(payload.errors.join(" "));
    const cellCount = payload.value.chainDimensions.reduce((sum, value) => sum + value, 0);
    const nonzeros = payload.value.boundary1.entries.length + payload.value.boundary2.entries.length;
    context.consumeWork(Math.max(1, cellCount + nonzeros));
    const inputBytes = canonicalJsonByteLength(payload.value);
    context.reserveMemory(inputBytes);
    context.reportProgress({ completed: 1, total: 3, message: "Validated exact cellular boundary matrices" });
    try {
      const response = await execute({
        operation: SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION,
        params: payload.value,
      });
      context.checkpoint();
      if (!response.success) throw new Error(response.error || "SageMath integer homology failed.");
      if (response.operation !== SAGE_TOPOLOGY_INTEGER_HOMOLOGY_OPERATION) {
        throw new TypeError("SageMath returned a result for a different operation.");
      }
      const output = normalizeSageIntegerHomologyOutput(response.result);
      if (!output.ok) throw new TypeError(output.errors.join(" "));
      if (response.engine !== "sagemath") throw new TypeError("Unexpected SageMath engine identity.");
      context.reportProgress({ completed: 3, total: 3, message: "Verified integer homology result" });
      return output.value;
    } finally {
      context.releaseMemory(inputBytes);
    }
  },
});

export type SageIntegerHomologyFallback = Readonly<{
  status: "sage-unavailable";
  sageFailure: ScientificJobFailure;
  localZ2: LocalZ2HomologyOutcome;
}>;

/** Keeps the completed T07 answer available, clearly labeled Z/2Z, when Sage is absent. */
export const createSageUnavailableFallback = (args: {
  sageOutcome: ScientificJobOutcome;
  boundaryMatrices: ExactSparseBoundaryMatrixArtifact;
  boundaryMatrixHandle: AnalysisArtifactHandle;
  currentSource: ScientificSourceGeneration;
}): SageIntegerHomologyFallback | null => {
  if (args.sageOutcome.ok) return null;
  if (!["adapter-failed", "unsupported-operation", "deadline-exceeded"].includes(args.sageOutcome.code)) return null;
  return {
    status: "sage-unavailable",
    sageFailure: args.sageOutcome,
    localZ2: computeLocalZ2Homology({
      boundaryMatrices: args.boundaryMatrices,
      boundaryMatrixHandle: args.boundaryMatrixHandle,
      currentSource: args.currentSource,
    }),
  };
};
