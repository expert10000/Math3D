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

export const SAGE_JOB_OPERATIONS = {
  "sage.symbolic.simplify": { type: "symbolic.simplify", label: "simplification", cancelled: "Sage symbolic job cancelled." },
  "sage.polynomial.factor": { type: "polynomial.factor", label: "polynomial factorization", cancelled: "Sage factorization cancelled." },
  "sage.polynomial.roots_exact": { type: "polynomial.roots.exact", label: "exact polynomial roots", cancelled: "Sage root calculation cancelled." },
  "sage.symbolic.gradient": { type: "symbolic.gradient", label: "gradient", cancelled: "Sage symbolic job cancelled." },
  "sage.symbolic.hessian": { type: "symbolic.hessian", label: "Hessian", cancelled: "Sage symbolic job cancelled." },
  "sage.symbolic.expand": { type: "symbolic.expand", label: "expansion", cancelled: "Sage symbolic job cancelled." },
  "sage.symbolic.factor": { type: "symbolic.factor", label: "symbolic factorization", cancelled: "Sage symbolic job cancelled." },
  "sage.symbolic.solve": { type: "symbolic.solve", label: "symbolic solve", cancelled: "Sage symbolic job cancelled." },
  "sage.symbolic.singularities": { type: "symbolic.singularities", label: "singularity analysis", cancelled: "Sage symbolic job cancelled." },
  "sage.matrix.eigen_exact": { type: "matrix.eigen.exact", label: "exact eigenvalues", cancelled: "Sage matrix job cancelled." },
  "sage.matrix.charpoly": { type: "matrix.charpoly", label: "characteristic polynomial", cancelled: "Sage matrix job cancelled." },
  "sage.groebner.compute": { type: "algebra.groebner", label: "Gröbner basis", cancelled: "Sage Gröbner job cancelled." },
  "sage.numberTheory.gcd": { type: "number-theory.gcd", label: "greatest common divisor", cancelled: "Sage number theory job cancelled." },
  "sage.numberTheory.modInverse": { type: "number-theory.mod-inverse", label: "modular inverse", cancelled: "Sage number theory job cancelled." },
} as const;
export type BrokeredSageOperation = keyof typeof SAGE_JOB_OPERATIONS;
export const isBrokeredSageOperation = (operation: string): operation is BrokeredSageOperation =>
  Object.hasOwn(SAGE_JOB_OPERATIONS, operation);

export type SageOperationHandle = {
  jobId: string;
  promise: Promise<{ response: SageRunResponse; broker: ScientificBrokerOutcome }>;
  cancel: () => boolean;
};

type Runner = (request: SageRunRequest) => Promise<SageRunResponse>;
type Canceller = (jobId: string) => Promise<unknown> | unknown;

/** Keeps Sage's transport protocol behind the backend-neutral scientific job envelope. */
export function runSageJob(
  request: SageRunRequest & { operation: BrokeredSageOperation; backend: "local" | "docker" },
  options: { run?: Runner; cancel?: Canceller } = {},
): SageOperationHandle {
  const jobId = request.jobId ?? crypto.randomUUID();
  const definition = SAGE_JOB_OPERATIONS[request.operation];
  const params = request.params;
  const polynomial = request.operation === "sage.polynomial.factor" || request.operation === "sage.polynomial.roots_exact";
  const matrix = params.matrix;
  const variables = params.variables;
  const stringVariables = Array.isArray(params.variables) &&
    params.variables.every((item) => typeof item === "string");
  const validParams = request.operation.startsWith("sage.matrix.")
    ? request.backend === "docker" && Array.isArray(matrix) &&
      matrix.length > 0 && matrix.length <= 8 &&
      matrix.every((row) => Array.isArray(row) && row.length === matrix.length &&
        row.every((item) => (typeof item === "string" && item.trim().length > 0) ||
          (typeof item === "number" && Number.isFinite(item))))
    : request.operation === "sage.groebner.compute"
      ? request.backend === "docker" && Array.isArray(params.polynomials) &&
        params.polynomials.length > 0 && params.polynomials.length <= 12 &&
        params.polynomials.every((item) => typeof item === "string" && item.trim().length > 0) &&
        stringVariables && Array.isArray(variables) && variables.length > 0 && variables.length <= 8
    : request.operation === "sage.numberTheory.gcd"
      ? request.backend === "docker" && Array.isArray(params.values) && params.values.length >= 2 &&
        params.values.every((item) => typeof item === "string" && /^-?[0-9]{1,128}$/.test(item))
    : request.operation === "sage.numberTheory.modInverse"
      ? request.backend === "docker" &&
        typeof params.a === "string" && /^-?[0-9]{1,128}$/.test(params.a) &&
        typeof params.modulus === "string" && /^[0-9]{1,128}$/.test(params.modulus) &&
        BigInt(params.modulus) > 1n
    : polynomial
    ? request.backend === "local"
      ? Array.isArray(params.coefficients) && params.coefficients.every((item) => typeof item === "string")
      : typeof params.polynomial === "string" && stringVariables
    : typeof params.expression === "string" && stringVariables;
  if (!validParams) {
    throw new TypeError(`Invalid Sage ${definition.label} parameters.`);
  }
  const payload = { operation: request.operation, params, backend: request.backend };
  const source: ScientificSourceGeneration = {
    documentId: createStableDocumentId("sage-operation", payload as CanonicalJsonValue),
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
      operationType: definition.type,
      execute: async (input, context) => {
        const body = input.payload as typeof payload;
        context.consumeWork(1);
        context.reportProgress({ completed: 0, total: 1, message: `Running SageMath ${definition.label}` });
        response = await run({ operation: body.operation, jobId: input.jobId,
          params: body.params, backend: body.backend });
        context.checkpoint();
        if (!response.success) throw new Error(response.error ?? `SageMath ${definition.label} failed.`);
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
      operationType: definition.type, retrySafety: "never",
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
  registerBrokerDiscovery(`${request.operation}:${request.backend}`, () => broker.discoverCapabilities());
  const job = createScientificJobRequest({
    jobId, source,
    operation: { type: definition.type, payload: payload as CanonicalJsonValue },
    limits: { deadlineAt: Date.now() + 40_000, maxInputBytes: 64 * 1024,
      maxOutputBytes: 256 * 1024, maxMemoryBytes: 512 * 1024 * 1024, maxWorkUnits: 1_000 },
  });
  const promise = observeBrokerJob(jobId, definition.type, execution.submit(job, {
    preferredBackendIds: [backendId], allowFallback: false,
  })).then((outcome) => {
    const failed: SageRunResponse = {
      engine: "sagemath", operation: request.operation, success: false, latex: "", result: {}, warnings: [],
      error: outcome.ok ? "SageMath returned no response." : outcome.code === "cancelled"
        ? definition.cancelled : outcome.message,
    };
    return { broker: outcome, response: outcome.ok ? response ?? failed : response?.success === false ? response : failed };
  });
  return { jobId, promise, cancel: () => execution.cancel(jobId) };
}
