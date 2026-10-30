import {
  createScientificJobRequest,
  createStableDocumentId,
  structuralHash,
  type CanonicalJsonValue,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createExecutionService,
  createInProcessScientificJobService,
  createScientificExecutionBroker,
  type ScientificBrokerOutcome,
  type ScientificExecutionBackend,
} from "@math3d/kernel";
import { runSageOperation } from "../integrations/sage/sageClient";
import type { SageRunRequest, SageRunResponse } from "../integrations/sage/sageSchemas";
import { observeBrokerJob, recordScientificJobEvent, registerBrokerDiscovery } from "../features/computeCenter/scientificJobTelemetry";

export const SAGE_SIMPLIFY_OPERATION = "symbolic.simplify";

export type SageSimplifyHandle = {
  jobId: string;
  promise: Promise<{ response: SageRunResponse; broker: ScientificBrokerOutcome }>;
  cancel: () => boolean;
};

type Runner = (request: SageRunRequest) => Promise<SageRunResponse>;
type Canceller = (jobId: string) => Promise<unknown> | unknown;

/** Keeps Sage's transport protocol behind the backend-neutral scientific job envelope. */
export function runSageSimplifyJob(
  request: SageRunRequest & { operation: "sage.symbolic.simplify"; backend: "local" | "docker" },
  options: { run?: Runner; cancel?: Canceller } = {},
): SageSimplifyHandle {
  const jobId = request.jobId ?? crypto.randomUUID();
  const payload = { expression: request.params.expression, variables: request.params.variables, backend: request.backend };
  if (typeof payload.expression !== "string" || !Array.isArray(payload.variables) ||
      !payload.variables.every((item) => typeof item === "string")) {
    throw new TypeError("Symbolic simplification requires an expression and variable names.");
  }
  const source: ScientificSourceGeneration = {
    documentId: createStableDocumentId("sage-symbolic", payload as CanonicalJsonValue),
    revision: 1,
    structuralHash: structuralHash(payload),
    generation: 1,
  };
  const resolveSource = (documentId: ScientificSourceGeneration["documentId"]) => documentId === source.documentId ? source : null;
  let response: SageRunResponse | null = null;
  const run = options.run ?? runSageOperation;
  const service = createInProcessScientificJobService({
    resolveSource,
    adapters: [{
      operationType: SAGE_SIMPLIFY_OPERATION,
      execute: async (input, context) => {
        const body = input.payload as { expression: string; variables: string[]; backend: "local" | "docker" };
        context.consumeWork(1);
        context.reportProgress({ completed: 0, total: 1, message: "Running SageMath simplification" });
        response = await run({ operation: "sage.symbolic.simplify", jobId: input.jobId,
          params: { expression: body.expression, variables: body.variables }, backend: body.backend });
        context.checkpoint();
        if (!response.success) throw new Error(response.error ?? "SageMath simplification failed.");
        return JSON.parse(JSON.stringify(response)) as CanonicalJsonValue;
      },
    }],
  });
  service.subscribe(recordScientificJobEvent);
  const backendId = request.backend === "local" ? "sage-local-wsl" : "sage-docker";
  const backend: ScientificExecutionBackend = {
    backendId, backendVersion: "1", transport: request.backend === "local" ? "worker" : "remote",
    priority: 100, supportsCancellation: request.backend === "local",
    discover: () => ({ available: true, operations: [{
      operationType: SAGE_SIMPLIFY_OPERATION, retrySafety: "never",
      maxInputBytes: 64 * 1024, maxOutputBytes: 256 * 1024,
      maxMemoryBytes: 512 * 1024 * 1024, maxWorkUnits: 1_000,
    }] }),
    execute: (job) => service.submit(job),
    ...(request.backend === "local" ? { cancel: (id: string) => {
      service.cancel(id);
      const cancel = options.cancel ?? ((value: string) => window.sageService?.cancel(value));
      void Promise.resolve(cancel(id)).catch(() => undefined);
    } } : {}),
  };
  const broker = createScientificExecutionBroker({ resolveSource, backends: [backend] });
  const execution = createExecutionService(broker);
  registerBrokerDiscovery("sage-simplify", () => broker.discoverCapabilities());
  const job = createScientificJobRequest({
    jobId, source,
    operation: { type: SAGE_SIMPLIFY_OPERATION, payload: payload as CanonicalJsonValue },
    limits: { deadlineAt: Date.now() + 40_000, maxInputBytes: 64 * 1024,
      maxOutputBytes: 256 * 1024, maxMemoryBytes: 512 * 1024 * 1024, maxWorkUnits: 1_000 },
  });
  const promise = observeBrokerJob(jobId, SAGE_SIMPLIFY_OPERATION, execution.submit(job, {
    preferredBackendIds: [backendId], allowFallback: false,
  })).then((outcome) => {
    const failed: SageRunResponse = {
      engine: "sagemath", operation: request.operation, success: false, latex: "", result: {}, warnings: [],
      error: outcome.ok ? "SageMath returned no response." : outcome.code === "cancelled"
        ? "Sage symbolic job cancelled." : outcome.message,
    };
    return { broker: outcome, response: outcome.ok ? response ?? failed : response?.success === false ? response : failed };
  });
  return { jobId, promise, cancel: () => execution.cancel(jobId) };
}
