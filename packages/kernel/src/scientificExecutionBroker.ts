import {
  SCIENTIFIC_JOB_FAILURE_CODES,
  SCIENTIFIC_JOB_SCHEMA_VERSION,
  canonicalJsonByteLength,
  canonicalJsonStringify,
  immutableCanonicalJsonClone,
  isScientificSourceGeneration,
  matchesScientificSourceGeneration,
  normalizeScientificJobRequest,
  type ScientificJobFailure,
  type ScientificJobOutcome,
  type ScientificJobRequest,
  type ScientificJobResult,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";
import type { InProcessScientificJobService, ScientificJobRuntime } from "./scientificJobService";

export const SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION = 1 as const;
export const SCIENTIFIC_BACKEND_TRANSPORTS = ["in-process", "worker", "remote"] as const;
export const SCIENTIFIC_RETRY_SAFETY = ["never", "idempotent"] as const;

export type ScientificBackendTransport = (typeof SCIENTIFIC_BACKEND_TRANSPORTS)[number];
export type ScientificRetrySafety = (typeof SCIENTIFIC_RETRY_SAFETY)[number];

export type ScientificOperationCapability = Readonly<{
  operationType: string;
  retrySafety: ScientificRetrySafety;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxMemoryBytes: number;
  maxWorkUnits: number;
}>;

export type ScientificBackendDiscovery = Readonly<{
  available: boolean;
  operations: readonly ScientificOperationCapability[];
  unavailableReason?: string;
}>;

export type ScientificBackendCapabilitySnapshot = Readonly<{
  schemaVersion: typeof SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION;
  backendId: string;
  backendVersion: string;
  transport: ScientificBackendTransport;
  priority: number;
  supportsCancellation: boolean;
  availability: "available" | "unavailable";
  operations: readonly ScientificOperationCapability[];
  unavailableReason?: string;
}>;

export type ScientificExecutionBackend = Readonly<{
  backendId: string;
  backendVersion: string;
  transport: ScientificBackendTransport;
  priority: number;
  supportsCancellation: boolean;
  discover: () => ScientificBackendDiscovery | Promise<ScientificBackendDiscovery>;
  execute: (request: ScientificJobRequest) => ScientificJobOutcome | Promise<ScientificJobOutcome>;
  cancel?: (jobId: string) => void | Promise<void>;
}>;

export const SCIENTIFIC_TRANSPORT_FAILURE_CODES = [
  "transport-unavailable",
  "transport-failed",
  "protocol-error",
] as const;
export type ScientificTransportFailureCode = (typeof SCIENTIFIC_TRANSPORT_FAILURE_CODES)[number];

export class ScientificTransportError extends Error {
  readonly code: ScientificTransportFailureCode;
  readonly transient: boolean;

  constructor(code: ScientificTransportFailureCode, message: string, transient = false) {
    super(message);
    this.name = "ScientificTransportError";
    this.code = code;
    this.transient = transient && code !== "protocol-error";
  }
}

export const SCIENTIFIC_BROKER_FAILURE_CODES = [
  "invalid-request",
  "duplicate-job",
  "capability-unavailable",
  "transport-unavailable",
  "transport-failed",
  "protocol-error",
  "scientific-failure",
  "cancelled",
  "deadline-exceeded",
  "stale-source",
] as const;
export type ScientificBrokerFailureCode = (typeof SCIENTIFIC_BROKER_FAILURE_CODES)[number];

export type ScientificBrokerAttemptOutcome =
  | "succeeded"
  | "scientific-failure"
  | "stale-source"
  | "transport-unavailable"
  | "transport-failed"
  | "protocol-error";

export type ScientificBrokerAttempt = Readonly<{
  backendId: string;
  backendVersion: string;
  transport: ScientificBackendTransport;
  attempt: number;
  outcome: ScientificBrokerAttemptOutcome;
  retryable: boolean;
}>;

export type ScientificBrokerSuccess = Readonly<{
  ok: true;
  schemaVersion: typeof SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION;
  jobId: string;
  result: ScientificJobResult;
  backend: Readonly<{
    backendId: string;
    backendVersion: string;
    transport: ScientificBackendTransport;
  }>;
  attempts: readonly ScientificBrokerAttempt[];
}>;

export type ScientificBrokerFailure = Readonly<{
  ok: false;
  schemaVersion: typeof SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION;
  jobId: string;
  operationType?: string;
  code: ScientificBrokerFailureCode;
  message: string;
  attempts: readonly ScientificBrokerAttempt[];
  scientificFailure?: ScientificJobFailure;
}>;

export type ScientificBrokerOutcome = ScientificBrokerSuccess | ScientificBrokerFailure;

export type ScientificBrokerRouteOptions = Readonly<{
  preferredBackendIds?: readonly string[];
  allowFallback?: boolean;
}>;

export type ScientificExecutionBrokerOptions = Readonly<{
  backends: readonly ScientificExecutionBackend[];
  resolveSource: (documentId: StableDocumentId) => ScientificSourceGeneration | null;
  maxAttemptsPerBackend?: number;
  runtime?: ScientificJobRuntime;
}>;

type ActiveBrokerJob = {
  settled: boolean;
  cancelled: boolean;
  currentBackend: ScientificExecutionBackend | null;
  signal: (control: BrokerControl) => void;
};

type BrokerControl = { kind: "cancelled" } | { kind: "deadline-exceeded" };
type RoutedBackend = {
  backend: ScientificExecutionBackend;
  snapshot: ScientificBackendCapabilitySnapshot;
  capability: ScientificOperationCapability;
};

const DEFAULT_RUNTIME: ScientificJobRuntime = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const OPERATION_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const DISCOVERY_FIELDS = new Set(["available", "operations", "unavailableReason"]);
const CAPABILITY_FIELDS = new Set([
  "operationType", "retrySafety", "maxInputBytes", "maxOutputBytes", "maxMemoryBytes", "maxWorkUnits",
]);
const SUCCESS_FIELDS = new Set(["ok", "schemaVersion", "jobId", "operationType", "source", "output", "outputBytes"]);
const FAILURE_FIELDS = new Set(["ok", "schemaVersion", "jobId", "operationType", "source", "code", "message"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyFields = (value: Record<string, unknown>, fields: ReadonlySet<string>): boolean =>
  Object.keys(value).every((field) => fields.has(field));

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const describeError = (error: unknown): string => String((error as Error)?.message ?? error);

const validateStaticBackend = (backend: ScientificExecutionBackend): void => {
  if (!SAFE_ID.test(backend.backendId)) throw new TypeError("Backend ID must be an ID-safe string of at most 160 characters.");
  if (typeof backend.backendVersion !== "string" || backend.backendVersion.trim().length === 0 || backend.backendVersion.length > 80) {
    throw new TypeError(`Backend '${backend.backendId}' requires a non-empty version of at most 80 characters.`);
  }
  if (!(SCIENTIFIC_BACKEND_TRANSPORTS as readonly unknown[]).includes(backend.transport)) {
    throw new TypeError(`Backend '${backend.backendId}' has an invalid transport.`);
  }
  if (!Number.isSafeInteger(backend.priority) || backend.priority < -1_000 || backend.priority > 1_000) {
    throw new TypeError(`Backend '${backend.backendId}' priority must be a safe integer from -1000 to 1000.`);
  }
  if (typeof backend.supportsCancellation !== "boolean") {
    throw new TypeError(`Backend '${backend.backendId}' must declare cancellation support.`);
  }
  if (typeof backend.discover !== "function" || typeof backend.execute !== "function") {
    throw new TypeError(`Backend '${backend.backendId}' requires discover and execute functions.`);
  }
  if (backend.supportsCancellation && typeof backend.cancel !== "function") {
    throw new TypeError(`Backend '${backend.backendId}' declares cancellation support without cancel().`);
  }
};

const normalizeDiscovery = (
  backend: ScientificExecutionBackend,
  value: unknown
): ScientificBackendCapabilitySnapshot => {
  if (!isRecord(value) || !hasOnlyFields(value, DISCOVERY_FIELDS) || typeof value.available !== "boolean" || !Array.isArray(value.operations)) {
    throw new TypeError("Capability discovery must return available, operations, and optional unavailableReason fields.");
  }
  if (value.unavailableReason !== undefined && (typeof value.unavailableReason !== "string" || value.unavailableReason.length > 500)) {
    throw new TypeError("Capability unavailableReason must contain at most 500 characters.");
  }
  const operations: ScientificOperationCapability[] = [];
  const operationTypes = new Set<string>();
  for (const candidate of value.operations) {
    if (!isRecord(candidate) || !hasOnlyFields(candidate, CAPABILITY_FIELDS) || Object.keys(candidate).length !== CAPABILITY_FIELDS.size) {
      throw new TypeError("Every operation capability must contain exactly the F08 capability fields.");
    }
    if (typeof candidate.operationType !== "string" || !OPERATION_TYPE.test(candidate.operationType)) {
      throw new TypeError("Capability operationType must be a namespaced lowercase operation type.");
    }
    if (operationTypes.has(candidate.operationType)) throw new TypeError(`Duplicate capability '${candidate.operationType}'.`);
    operationTypes.add(candidate.operationType);
    if (!(SCIENTIFIC_RETRY_SAFETY as readonly unknown[]).includes(candidate.retrySafety)) {
      throw new TypeError(`Capability '${candidate.operationType}' has invalid retry safety.`);
    }
    for (const field of ["maxInputBytes", "maxOutputBytes", "maxMemoryBytes", "maxWorkUnits"] as const) {
      if (!isPositiveSafeInteger(candidate[field])) {
        throw new TypeError(`Capability '${candidate.operationType}' ${field} must be a positive safe integer.`);
      }
    }
    operations.push(candidate as ScientificOperationCapability);
  }
  operations.sort((left, right) => left.operationType.localeCompare(right.operationType));
  const available = value.available as boolean;
  const unavailableReason = typeof value.unavailableReason === "string" ? value.unavailableReason : undefined;
  return immutableCanonicalJsonClone({
    schemaVersion: SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION,
    backendId: backend.backendId,
    backendVersion: backend.backendVersion,
    transport: backend.transport,
    priority: backend.priority,
    supportsCancellation: backend.supportsCancellation,
    availability: available ? "available" as const : "unavailable" as const,
    operations: available ? operations : [],
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
  }) as ScientificBackendCapabilitySnapshot;
};

const unavailableSnapshot = (
  backend: ScientificExecutionBackend,
  reason: string
): ScientificBackendCapabilitySnapshot => immutableCanonicalJsonClone({
  schemaVersion: SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION,
  backendId: backend.backendId,
  backendVersion: backend.backendVersion,
  transport: backend.transport,
  priority: backend.priority,
  supportsCancellation: backend.supportsCancellation,
  availability: "unavailable" as const,
  operations: [],
  unavailableReason: reason.slice(0, 500),
}) as ScientificBackendCapabilitySnapshot;

const validatesLimits = (request: ScientificJobRequest, capability: ScientificOperationCapability): boolean =>
  canonicalJsonByteLength(request.operation.payload) + (request.resources ?? []).reduce((total, resource) => total + resource.descriptor.byteLength, 0) <= capability.maxInputBytes &&
  request.limits.maxOutputBytes <= capability.maxOutputBytes &&
  request.limits.maxMemoryBytes <= capability.maxMemoryBytes &&
  request.limits.maxWorkUnits <= capability.maxWorkUnits;

const validateBackendOutcome = (
  outcome: unknown,
  request: ScientificJobRequest
): ScientificJobOutcome => {
  if (!isRecord(outcome) || typeof outcome.ok !== "boolean") {
    throw new ScientificTransportError("protocol-error", "Backend returned no valid F05 outcome.");
  }
  const allowed = outcome.ok ? SUCCESS_FIELDS : FAILURE_FIELDS;
  if (!hasOnlyFields(outcome, allowed) || outcome.schemaVersion !== SCIENTIFIC_JOB_SCHEMA_VERSION || outcome.jobId !== request.jobId) {
    throw new ScientificTransportError("protocol-error", "Backend outcome schema or job ID does not match the request.");
  }
  if (outcome.operationType !== request.operation.type) {
    throw new ScientificTransportError("protocol-error", "Backend outcome operation type does not match the request.");
  }
  if (!isScientificSourceGeneration(outcome.source) || !matchesScientificSourceGeneration(outcome.source, request.source)) {
    throw new ScientificTransportError("protocol-error", "Backend outcome source does not match the request.");
  }
  if (outcome.ok) {
    let outputBytes: number;
    try {
      canonicalJsonStringify(outcome.output);
      outputBytes = canonicalJsonByteLength(outcome.output);
    } catch (error) {
      throw new ScientificTransportError("protocol-error", `Backend output is not canonical JSON: ${describeError(error)}`);
    }
    if (!Number.isSafeInteger(outcome.outputBytes) || outcome.outputBytes !== outputBytes || outputBytes > request.limits.maxOutputBytes) {
      throw new ScientificTransportError("protocol-error", "Backend output byte length is invalid or exceeds the request limit.");
    }
    return immutableCanonicalJsonClone(outcome) as ScientificJobResult;
  }
  if (!(SCIENTIFIC_JOB_FAILURE_CODES as readonly unknown[]).includes(outcome.code) || typeof outcome.message !== "string" || outcome.message.length === 0) {
    throw new ScientificTransportError("protocol-error", "Backend returned an invalid scientific failure.");
  }
  return immutableCanonicalJsonClone(outcome) as ScientificJobFailure;
};

export class ScientificExecutionBroker {
  readonly #backends: readonly ScientificExecutionBackend[];
  readonly #backendById = new Map<string, ScientificExecutionBackend>();
  readonly #resolveSource: ScientificExecutionBrokerOptions["resolveSource"];
  readonly #maxAttemptsPerBackend: number;
  readonly #runtime: ScientificJobRuntime;
  readonly #active = new Map<string, ActiveBrokerJob>();

  constructor(options: ScientificExecutionBrokerOptions) {
    const attempts = options.maxAttemptsPerBackend ?? 2;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
      throw new RangeError("maxAttemptsPerBackend must be a safe integer from 1 to 10.");
    }
    for (const backend of options.backends) {
      validateStaticBackend(backend);
      if (this.#backendById.has(backend.backendId)) throw new TypeError(`Duplicate backend '${backend.backendId}'.`);
      this.#backendById.set(backend.backendId, backend);
    }
    this.#backends = [...options.backends];
    this.#resolveSource = options.resolveSource;
    this.#maxAttemptsPerBackend = attempts;
    this.#runtime = options.runtime ?? DEFAULT_RUNTIME;
  }

  async discoverCapabilities(): Promise<readonly ScientificBackendCapabilitySnapshot[]> {
    const snapshots = await Promise.all(this.#backends.map(async (backend) => {
      try {
        return normalizeDiscovery(backend, await backend.discover());
      } catch (error) {
        return unavailableSnapshot(backend, `Capability discovery failed: ${describeError(error)}`);
      }
    }));
    return Object.freeze(snapshots.sort(
      (left, right) => right.priority - left.priority || left.backendId.localeCompare(right.backendId)
    ));
  }

  cancel(jobId: string): boolean {
    const active = this.#active.get(jobId);
    if (!active || active.settled || active.cancelled) return false;
    active.cancelled = true;
    this.#propagateCancel(active, jobId);
    active.signal({ kind: "cancelled" });
    return true;
  }

  async submit(candidate: unknown, routeOptions: ScientificBrokerRouteOptions = {}): Promise<ScientificBrokerOutcome> {
    const normalized = normalizeScientificJobRequest(candidate);
    if (!normalized.ok) {
      const record = isRecord(candidate) ? candidate : null;
      return this.#failure(
        typeof record?.jobId === "string" ? record.jobId : "invalid-job",
        "invalid-request",
        normalized.errors.join(" "),
        []
      );
    }
    const request = normalized.value;
    if (this.#active.has(request.jobId)) {
      return this.#failure(request.jobId, "duplicate-job", `Job '${request.jobId}' is already active.`, [], request);
    }
    this.#validateRouteOptions(routeOptions);

    let signalControl!: (control: BrokerControl) => void;
    const control = new Promise<BrokerControl>((resolve) => { signalControl = resolve; });
    const active: ActiveBrokerJob = {
      settled: false,
      cancelled: false,
      currentBackend: null,
      signal: signalControl,
    };
    this.#active.set(request.jobId, active);
    const clearDeadline = this.#scheduleDeadline(request, active);
    const workflow = this.#routeAndExecute(request, routeOptions, active);
    const winner = await Promise.race<ScientificBrokerOutcome | BrokerControl>([workflow, control]);
    active.settled = true;
    clearDeadline();
    this.#active.delete(request.jobId);
    if ("kind" in winner) {
      const code = winner.kind;
      return this.#failure(
        request.jobId,
        code,
        code === "cancelled" ? "Scientific execution was cancelled." : "Scientific execution deadline was exceeded.",
        [],
        request
      );
    }
    return winner;
  }

  async #routeAndExecute(
    request: ScientificJobRequest,
    routeOptions: ScientificBrokerRouteOptions,
    active: ActiveBrokerJob
  ): Promise<ScientificBrokerOutcome> {
    const attempts: ScientificBrokerAttempt[] = [];
    const sourceAtStart = this.#readCurrentSource(request.source.documentId);
    if (!sourceAtStart || !matchesScientificSourceGeneration(request.source, sourceAtStart)) {
      return this.#failure(request.jobId, "stale-source", "Scientific source is unavailable or stale.", attempts, request);
    }
    const snapshots = await this.discoverCapabilities();
    if (active.cancelled) return this.#failure(request.jobId, "cancelled", "Scientific execution was cancelled.", attempts, request);
    if (this.#runtime.now() >= request.limits.deadlineAt) {
      return this.#failure(request.jobId, "deadline-exceeded", "Scientific execution deadline was exceeded.", attempts, request);
    }
    const routes = this.#routes(request, snapshots, routeOptions);
    if (routes.length === 0) {
      return this.#failure(
        request.jobId,
        "capability-unavailable",
        `No available backend satisfies '${request.operation.type}' and its declared limits.`,
        attempts,
        request
      );
    }

    for (const route of routes) {
      const allowedAttempts = route.capability.retrySafety === "idempotent" ? this.#maxAttemptsPerBackend : 1;
      for (let attemptNumber = 1; attemptNumber <= allowedAttempts; attemptNumber += 1) {
        if (active.cancelled) return this.#failure(request.jobId, "cancelled", "Scientific execution was cancelled.", attempts, request);
        if (this.#runtime.now() >= request.limits.deadlineAt) {
          return this.#failure(request.jobId, "deadline-exceeded", "Scientific execution deadline was exceeded.", attempts, request);
        }
        active.currentBackend = route.backend;
        try {
          const rawOutcome = await route.backend.execute(request);
          active.currentBackend = null;
          const outcome = validateBackendOutcome(rawOutcome, request);
          const currentSource = this.#readCurrentSource(request.source.documentId);
          if (!currentSource || !matchesScientificSourceGeneration(request.source, currentSource)) {
            attempts.push(this.#attempt(route, attemptNumber, "stale-source", false));
            return this.#failure(
              request.jobId,
              "stale-source",
              "Backend result cannot publish against a stale source.",
              attempts,
              request
            );
          }
          if (!outcome.ok) {
            attempts.push(this.#attempt(route, attemptNumber, "scientific-failure", false));
            return this.#failure(
              request.jobId,
              "scientific-failure",
              outcome.message,
              attempts,
              request,
              outcome
            );
          }
          attempts.push(this.#attempt(route, attemptNumber, "succeeded", false));
          return immutableCanonicalJsonClone({
            ok: true as const,
            schemaVersion: SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION,
            jobId: request.jobId,
            result: outcome,
            backend: {
              backendId: route.snapshot.backendId,
              backendVersion: route.snapshot.backendVersion,
              transport: route.snapshot.transport,
            },
            attempts,
          }) as ScientificBrokerSuccess;
        } catch (error) {
          active.currentBackend = null;
          const transportError = error instanceof ScientificTransportError
            ? error
            : new ScientificTransportError("transport-failed", `Backend execution failed: ${describeError(error)}`);
          const safeToRetry =
            route.capability.retrySafety === "idempotent" &&
            transportError.transient &&
            !active.cancelled;
          attempts.push(this.#attempt(route, attemptNumber, transportError.code, safeToRetry));
          if (!safeToRetry) {
            return this.#failure(request.jobId, transportError.code, transportError.message, attempts, request);
          }
          if (attemptNumber < allowedAttempts) continue;
          break;
        }
      }
    }
    return this.#failure(
      request.jobId,
      "transport-failed",
      "All safe transport retries and fallback routes were exhausted.",
      attempts,
      request
    );
  }

  #routes(
    request: ScientificJobRequest,
    snapshots: readonly ScientificBackendCapabilitySnapshot[],
    options: ScientificBrokerRouteOptions
  ): RoutedBackend[] {
    const preferred = options.preferredBackendIds ?? [];
    const preference = new Map(preferred.map((backendId, index) => [backendId, index]));
    const routes = snapshots.flatMap((snapshot): RoutedBackend[] => {
      if (snapshot.availability !== "available") return [];
      const capability = snapshot.operations.find((entry) => entry.operationType === request.operation.type);
      const backend = this.#backendById.get(snapshot.backendId);
      return capability && backend && validatesLimits(request, capability) ? [{ backend, snapshot, capability }] : [];
    }).sort((left, right) => {
      const leftRank = preference.get(left.snapshot.backendId);
      const rightRank = preference.get(right.snapshot.backendId);
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        return leftRank - rightRank;
      }
      return right.snapshot.priority - left.snapshot.priority || left.snapshot.backendId.localeCompare(right.snapshot.backendId);
    });
    if (options.allowFallback === false) {
      if (preferred.length > 0) {
        const preferredRoute = routes.find((route) => preference.has(route.snapshot.backendId));
        return preferredRoute ? [preferredRoute] : [];
      }
      return routes.slice(0, 1);
    }
    return routes;
  }

  #validateRouteOptions(options: ScientificBrokerRouteOptions): void {
    if (options.allowFallback !== undefined && typeof options.allowFallback !== "boolean") {
      throw new TypeError("allowFallback must be boolean when provided.");
    }
    if (options.preferredBackendIds !== undefined) {
      if (!Array.isArray(options.preferredBackendIds) || options.preferredBackendIds.some((id) => !SAFE_ID.test(id))) {
        throw new TypeError("preferredBackendIds must contain only valid backend IDs.");
      }
      if (new Set(options.preferredBackendIds).size !== options.preferredBackendIds.length) {
        throw new TypeError("preferredBackendIds must not contain duplicates.");
      }
    }
  }

  #attempt(
    route: RoutedBackend,
    attempt: number,
    outcome: ScientificBrokerAttemptOutcome,
    retryable: boolean
  ): ScientificBrokerAttempt {
    return {
      backendId: route.snapshot.backendId,
      backendVersion: route.snapshot.backendVersion,
      transport: route.snapshot.transport,
      attempt,
      outcome,
      retryable,
    };
  }

  #readCurrentSource(documentId: StableDocumentId): ScientificSourceGeneration | null {
    try {
      const source = this.#resolveSource(documentId);
      return isScientificSourceGeneration(source) ? source : null;
    } catch {
      return null;
    }
  }

  #propagateCancel(active: ActiveBrokerJob, jobId: string): void {
    const backend = active.currentBackend;
    if (!backend?.supportsCancellation || !backend.cancel) return;
    try {
      Promise.resolve(backend.cancel(jobId)).catch(() => undefined);
    } catch {
      // Cancellation completion must not depend on transport acknowledgement.
    }
  }

  #scheduleDeadline(request: ScientificJobRequest, active: ActiveBrokerJob): () => void {
    let cleared = false;
    let handle: unknown;
    const arm = (): void => {
      if (cleared || active.settled) return;
      const remaining = request.limits.deadlineAt - this.#runtime.now();
      if (remaining <= 0) {
        this.#propagateCancel(active, request.jobId);
        active.signal({ kind: "deadline-exceeded" });
        return;
      }
      handle = this.#runtime.schedule(arm, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    arm();
    return () => {
      cleared = true;
      if (handle !== undefined) this.#runtime.clear(handle);
    };
  }

  #failure(
    jobId: string,
    code: ScientificBrokerFailureCode,
    message: string,
    attempts: readonly ScientificBrokerAttempt[],
    request?: ScientificJobRequest,
    scientificFailure?: ScientificJobFailure
  ): ScientificBrokerFailure {
    return immutableCanonicalJsonClone({
      ok: false as const,
      schemaVersion: SCIENTIFIC_EXECUTION_BROKER_SCHEMA_VERSION,
      jobId,
      ...(request ? { operationType: request.operation.type } : {}),
      code,
      message,
      attempts,
      ...(scientificFailure ? { scientificFailure } : {}),
    }) as ScientificBrokerFailure;
  }
}

export type InProcessScientificBackendOptions = Readonly<{
  backendId: string;
  backendVersion: string;
  priority: number;
  operations: readonly ScientificOperationCapability[];
  service: InProcessScientificJobService;
}>;

/** Adapts the F05 in-process service without making it a mandatory broker backend. */
export const createInProcessScientificBackend = (
  options: InProcessScientificBackendOptions
): ScientificExecutionBackend => ({
  backendId: options.backendId,
  backendVersion: options.backendVersion,
  transport: "in-process",
  priority: options.priority,
  supportsCancellation: true,
  discover: () => ({ available: true, operations: options.operations }),
  execute: (request) => options.service.submit(request),
  cancel: (jobId) => { options.service.cancel(jobId); },
});

export const createScientificExecutionBroker = (
  options: ScientificExecutionBrokerOptions
): ScientificExecutionBroker => new ScientificExecutionBroker(options);
