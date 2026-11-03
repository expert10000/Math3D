import {
  buildSageAlgebraReconstructionInput,
  parseSageAlgebraReconstructionResult,
  type AlgebraObjectRef,
  type Math3DProject,
} from "@math3d/core";
import { sageExecutionRegistry, type SageExecutionRegistry } from "./sageOperationExecution";

/** Runs the exact Project snapshot through the shared bounded Sage broker. */
export const runSageAlgebraReconstruction = (project: Math3DProject, target: AlgebraObjectRef,
  registry: SageExecutionRegistry = sageExecutionRegistry) => {
  const input = buildSageAlgebraReconstructionInput(project, target);
  const handle = registry.run({ operation: "sage.algebra.reconstruct", backend: "docker",
    params: input as unknown as Record<string, unknown> });
  return { jobId: handle.jobId, cancel: handle.cancel,
    promise: handle.promise.then(({ response, broker }) => ({ response, broker,
      result: response.success ? parseSageAlgebraReconstructionResult(response.result, input) : null })) };
};
