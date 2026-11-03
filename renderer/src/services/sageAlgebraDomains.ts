import { buildSageAlgebraDomainInput, parseSageAlgebraDomainResult,
  type AlgebraObjectRef, type Math3DProject } from "@math3d/core";
import { sageExecutionRegistry, type SageExecutionRegistry } from "./sageOperationExecution";

/** Inspects two exact Project revisions through Sage's directional coercion maps. */
export const runSageAlgebraDomainInspection = (project: Math3DProject,
  left: AlgebraObjectRef, right: AlgebraObjectRef,
  registry: SageExecutionRegistry = sageExecutionRegistry) => {
  const input = buildSageAlgebraDomainInput(project, left, right);
  const handle = registry.run({ operation: "sage.algebra.inspectDomains", backend: "docker",
    params: input as unknown as Record<string, unknown> });
  return { jobId: handle.jobId, cancel: handle.cancel,
    promise: handle.promise.then(({ response, broker }) => ({ response, broker,
      result: response.success ? parseSageAlgebraDomainResult(response.result, input) : null })) };
};
