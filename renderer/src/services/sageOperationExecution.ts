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
  type ScientificBackendCapabilitySnapshot,
  type ScientificExecutionBackend,
  type ScientificOperationCapability,
  type ScientificJobExecutionInput,
  type ScientificJobExecutionContext,
} from "@math3d/kernel";
import { checkSageHealth, isLocalSageOperation, runSageOperation } from "../integrations/sage/sageClient";
import type { SageHealthResponse, SageRunRequest, SageRunResponse } from "../integrations/sage/sageSchemas";
import type { SageConsoleResponse } from "../features/sageLab/sageConsoleTypes";
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
export type SageBackend = "local" | "docker";
type Backend = SageBackend;
type HealthChecker = (backend: Backend) => Promise<SageHealthResponse>;
const SAGE_LIMITS = { maxInputBytes: 64 * 1024, maxOutputBytes: 256 * 1024,
  maxMemoryBytes: 512 * 1024 * 1024, maxWorkUnits: 1_000 } as const;
export const SAGE_CONSOLE_OPERATION = "sage.console.execute";
export const SAGE_CONSOLE_LIMITS = { maxInputBytes: 16 * 1024, maxOutputBytes: 64 * 1024,
  maxMemoryBytes: 4 * 1024 * 1024 * 1024, maxWorkUnits: 1 } as const;

export type SageRuntimeProbe = Readonly<{
  backend: Backend;
  backendId: string;
  backendVersion: string;
  transport: "worker" | "remote";
  health: SageHealthResponse;
  limits: typeof SAGE_LIMITS;
  operations: readonly ScientificOperationCapability[];
}>;

export type SageExecutionRegistryOptions = {
  run?: Runner;
  cancel?: Canceller;
  health?: HealthChecker;
  consoleRun?: (request: { jobId: string; code: string; scope?: string }) => Promise<SageConsoleResponse>;
  consoleCancel?: Canceller;
  consoleAvailable?: () => boolean;
  registerDiscovery?: boolean;
};

const validateSageJob = (request: SageRunRequest & { operation: BrokeredSageOperation; backend: Backend }): void => {
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
};

/** Shared Sage operation registry and ExecutionService for Surface and Geometry. */
export class SageExecutionRegistry {
  readonly #sources = new Map<string, ScientificSourceGeneration>();
  readonly #responses = new Map<string, SageRunResponse>();
  readonly #consoleResponses = new Map<string, SageConsoleResponse>();
  readonly #consoleJobs = new Set<string>();
  readonly #activeJobs = new Set<string>();
  readonly #run: Runner;
  readonly #cancel: Canceller;
  readonly #health: HealthChecker;
  readonly #consoleRun: (request: { jobId: string; code: string; scope?: string }) => Promise<SageConsoleResponse>;
  readonly #consoleCancel: Canceller;
  readonly #consoleAvailable: () => boolean;
  readonly #broker: ReturnType<typeof createScientificExecutionBroker>;
  readonly #execution: ReturnType<typeof createExecutionService>;

  constructor(options: SageExecutionRegistryOptions = {}) {
    this.#run = options.run ?? runSageOperation;
    this.#cancel = options.cancel ?? ((jobId) => window.sageService?.cancel(jobId));
    this.#health = options.health ?? checkSageHealth;
    this.#consoleRun = options.consoleRun ?? ((request) => window.sageConsole!.run(request));
    this.#consoleCancel = options.consoleCancel ?? ((jobId) => window.sageConsole?.cancel(jobId));
    this.#consoleAvailable = options.consoleAvailable ?? (() => typeof window !== "undefined" && !!window.sageConsole);
    const resolveSource = (documentId: ScientificSourceGeneration["documentId"]) =>
      this.#sources.get(documentId) ?? null;
    const service = createInProcessScientificJobService({
      resolveSource,
      adapters: [...(Object.entries(SAGE_JOB_OPERATIONS) as [BrokeredSageOperation, typeof SAGE_JOB_OPERATIONS[BrokeredSageOperation]][])
        .map(([operation, definition]) => ({
          operationType: definition.type,
          execute: async (input: ScientificJobExecutionInput, context: ScientificJobExecutionContext) => {
            const body = input.payload as { operation: BrokeredSageOperation; params: Record<string, unknown>; backend: Backend };
            if (body.operation !== operation) throw new Error("Sage operation payload does not match its registered adapter.");
            context.consumeWork(1);
            context.reportProgress({ completed: 0, total: 1, message: `Running SageMath ${definition.label}` });
            const response = await this.#run({ ...body, jobId: input.jobId });
            if (this.#activeJobs.has(input.jobId)) this.#responses.set(input.jobId, response);
            context.checkpoint();
            if (!response.success) throw new Error(response.error ?? `SageMath ${definition.label} failed.`);
            return JSON.parse(JSON.stringify(response)) as CanonicalJsonValue;
          },
        })), {
          operationType: SAGE_CONSOLE_OPERATION,
          execute: async (input: ScientificJobExecutionInput, context: ScientificJobExecutionContext) => {
            const body = input.payload as { code: string; backend: string; scope?: string };
            if (body.backend !== "local" || typeof body.code !== "string") throw new Error("Sage Console requires the local backend.");
            context.consumeWork(1);
            context.reportProgress({ completed: 0, total: 1, message: "Running trusted Sage code" });
            const response = await this.#consoleRun({ jobId: input.jobId, code: body.code, ...(body.scope ? { scope: body.scope } : {}) });
            if (this.#activeJobs.has(input.jobId)) this.#consoleResponses.set(input.jobId, response);
            context.checkpoint();
            if (!response.success) throw new Error(response.error ?? "Sage Console failed.");
            return JSON.parse(JSON.stringify(response)) as CanonicalJsonValue;
          },
        }],
    });
    service.subscribe(recordScientificJobEvent);
    const makeBackend = (scope: Backend): ScientificExecutionBackend => ({
      backendId: scope === "local" ? "sage-local-wsl" : "sage-docker",
      backendVersion: "1", transport: scope === "local" ? "worker" : "remote",
      priority: 100, supportsCancellation: true,
      discover: async () => {
        const probe = await this.probeBackend(scope);
        return {
          available: probe.health.available,
          unavailableReason: probe.health.available ? undefined : probe.health.status,
          operations: probe.operations,
        };
      },
      execute: (job) => service.submit(job),
      cancel: (jobId) => {
        service.cancel(jobId);
        try {
          void Promise.resolve(this.#consoleJobs.has(jobId) ? this.#consoleCancel(jobId) : this.#cancel(jobId)).catch(() => undefined);
        } catch {
          // The broker owns the cancellation result; transport cleanup is best effort.
        }
      },
    });
    this.#broker = createScientificExecutionBroker({ resolveSource, backends: [makeBackend("local"), makeBackend("docker")] });
    this.#execution = createExecutionService(this.#broker);
    if (options.registerDiscovery) registerBrokerDiscovery("sage", () => this.#broker.discoverCapabilities());
  }

  discoverBackends(): Promise<readonly ScientificBackendCapabilitySnapshot[]> {
    return this.#broker.discoverCapabilities();
  }

  async probeBackend(backend: Backend): Promise<SageRuntimeProbe> {
    let health: SageHealthResponse;
    try {
      health = await this.#health(backend);
    } catch (error) {
      health = { engine: "sagemath", available: false, operations: [],
        status: error instanceof Error ? error.message : "SageMath health check failed." };
    }
    const operations: ScientificOperationCapability[] = (Object.entries(SAGE_JOB_OPERATIONS) as [BrokeredSageOperation, typeof SAGE_JOB_OPERATIONS[BrokeredSageOperation]][])
      .filter(([operation]) => health.operations.includes(operation) && (backend === "docker" || isLocalSageOperation(operation)))
      .map(([, definition]) => ({ operationType: definition.type, retrySafety: "never" as const, ...SAGE_LIMITS }))
      .sort((left, right) => left.operationType.localeCompare(right.operationType));
    if (backend === "local" && health.available && this.#consoleAvailable()) {
      operations.push({ operationType: SAGE_CONSOLE_OPERATION, retrySafety: "never", ...SAGE_CONSOLE_LIMITS });
    }
    return {
      backend, backendId: backend === "local" ? "sage-local-wsl" : "sage-docker",
      backendVersion: "1", transport: backend === "local" ? "worker" : "remote",
      health, limits: SAGE_LIMITS, operations,
    };
  }

  run(request: SageRunRequest & { operation: BrokeredSageOperation; backend: Backend }): SageOperationHandle {
    validateSageJob(request);
    const jobId = request.jobId ?? crypto.randomUUID();
    if (this.#activeJobs.has(jobId)) throw new Error("Sage job ID is already in use.");
    const definition = SAGE_JOB_OPERATIONS[request.operation];
    const payload = { operation: request.operation, params: request.params, backend: request.backend };
    const source: ScientificSourceGeneration = {
      documentId: createStableDocumentId("sage-operation", { jobId, payload } as CanonicalJsonValue),
      revision: 1, structuralHash: structuralHash(payload), generation: 1,
    };
    const backendId = request.backend === "local" ? "sage-local-wsl" : "sage-docker";
    const job = createScientificJobRequest({
      jobId, source,
      operation: { type: definition.type, payload: payload as CanonicalJsonValue },
      limits: { deadlineAt: Date.now() + 40_000, ...SAGE_LIMITS },
    });
    this.#activeJobs.add(jobId);
    this.#sources.set(source.documentId, source);
    const promise = observeBrokerJob(jobId, definition.type, this.#execution.submit(job, {
      preferredBackendIds: [backendId], allowFallback: false,
    }), backendId).then((outcome) => {
      const response = this.#responses.get(jobId);
      const failed: SageRunResponse = {
        engine: "sagemath", operation: request.operation, success: false, latex: "", result: {}, warnings: [],
        error: outcome.ok ? "SageMath returned no response." : outcome.code === "cancelled"
          ? definition.cancelled : outcome.message,
      };
      return { broker: outcome, response: outcome.ok ? response ?? failed : response?.success === false ? response : failed };
    }).finally(() => {
      this.#activeJobs.delete(jobId);
      this.#responses.delete(jobId);
      this.#sources.delete(source.documentId);
    });
    return { jobId, promise, cancel: () => this.#execution.cancel(jobId) };
  }

  runConsole(request: { code: string; trusted: boolean; jobId?: string; scope?: string }): {
    jobId: string;
    promise: Promise<{ response: SageConsoleResponse | null; broker: ScientificBrokerOutcome }>;
    cancel: () => boolean;
  } {
    if (!request.trusted || !this.#consoleAvailable()) throw new Error("Trust an available local Sage runtime before executing code.");
    if (typeof request.code !== "string" || !request.code.trim() ||
      new TextEncoder().encode(request.code).byteLength > SAGE_CONSOLE_LIMITS.maxInputBytes) {
      throw new Error("Enter Sage code of at most 16 KiB.");
    }
    const jobId = request.jobId ?? crypto.randomUUID();
    if (this.#activeJobs.has(jobId)) throw new Error("Sage job ID is already in use.");
    const payload = { code: request.code, backend: "local", ...(request.scope ? { scope: request.scope } : {}) };
    const source: ScientificSourceGeneration = {
      documentId: createStableDocumentId("sage-console", { jobId, payload } as CanonicalJsonValue),
      revision: 1, structuralHash: structuralHash(payload), generation: 1,
    };
    const job = createScientificJobRequest({
      jobId, source, operation: { type: SAGE_CONSOLE_OPERATION, payload },
      limits: { deadlineAt: Date.now() + 20_000, ...SAGE_CONSOLE_LIMITS },
    });
    this.#activeJobs.add(jobId);
    this.#consoleJobs.add(jobId);
    this.#sources.set(source.documentId, source);
    const promise = observeBrokerJob(jobId, SAGE_CONSOLE_OPERATION, this.#execution.submit(job, {
      preferredBackendIds: ["sage-local-wsl"], allowFallback: false,
    }), "sage-local-wsl").then((broker) => ({ broker, response: this.#consoleResponses.get(jobId) ?? null })).finally(() => {
      this.#activeJobs.delete(jobId);
      this.#consoleJobs.delete(jobId);
      this.#consoleResponses.delete(jobId);
      this.#sources.delete(source.documentId);
    });
    return { jobId, promise, cancel: () => this.#execution.cancel(jobId) };
  }
}

export const createSageExecutionRegistry = (options: SageExecutionRegistryOptions = {}) => new SageExecutionRegistry(options);
export const sageExecutionRegistry = createSageExecutionRegistry({ registerDiscovery: true });
