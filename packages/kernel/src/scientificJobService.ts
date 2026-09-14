import {
  SCIENTIFIC_JOB_SCHEMA_VERSION,
  canonicalJsonByteLength,
  immutableCanonicalJsonClone,
  matchesScientificSourceGeneration,
  normalizeScientificJobProgress,
  normalizeScientificJobRequest,
  type CanonicalJsonValue,
  type ScientificJobEvent,
  type ScientificJobEventType,
  type ScientificJobFailure,
  type ScientificJobFailureCode,
  type ScientificJobLimits,
  type ScientificJobOutcome,
  type ScientificJobProgress,
  type ScientificJobRequest,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";

export type ScientificJobExecutionInput = Readonly<{
  jobId: string;
  source: ScientificSourceGeneration;
  payload: CanonicalJsonValue;
  limits: ScientificJobLimits;
}>;

export type ScientificJobExecutionContext = Readonly<{
  checkpoint: () => void;
  reportProgress: (progress: ScientificJobProgress) => void;
  consumeWork: (units?: number) => void;
  reserveMemory: (bytes: number) => void;
  releaseMemory: (bytes: number) => void;
  isCancellationRequested: () => boolean;
}>;

export type InProcessScientificJobAdapter = Readonly<{
  operationType: string;
  execute: (
    input: ScientificJobExecutionInput,
    context: ScientificJobExecutionContext
  ) => CanonicalJsonValue | Promise<CanonicalJsonValue>;
}>;

export type ScientificJobRuntime = Readonly<{
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
}>;

export type ScientificJobListener = (event: ScientificJobEvent) => void;

export type InProcessScientificJobServiceOptions = Readonly<{
  adapters: readonly InProcessScientificJobAdapter[];
  resolveSource: (documentId: StableDocumentId) => ScientificSourceGeneration | null;
  runtime?: ScientificJobRuntime;
}>;

type ControlSignal =
  | { kind: "cancelled" }
  | { kind: "deadline-exceeded" }
  | { kind: "stale-source" };

type AdapterRace =
  | { kind: "adapter-result"; output: CanonicalJsonValue }
  | { kind: "adapter-error"; error: unknown }
  | ControlSignal;

type ActiveJob = {
  settled: boolean;
  cancellationRequested: boolean;
  signal: (value: ControlSignal) => void;
};

class ScientificJobExecutionError extends Error {
  readonly code: ScientificJobFailureCode;

  constructor(code: ScientificJobFailureCode, message: string) {
    super(message);
    this.name = "ScientificJobExecutionError";
    this.code = code;
  }
}

const DEFAULT_RUNTIME: ScientificJobRuntime = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const OPERATION_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const failureEventType = (code: ScientificJobFailureCode): ScientificJobEventType => {
  if (code === "cancelled") return "scientific-job.cancelled";
  if (code === "deadline-exceeded") return "scientific-job.timed-out";
  if (code === "stale-source") return "scientific-job.stale-rejected";
  return "scientific-job.failed";
};

const describeError = (error: unknown): string => String((error as Error)?.message ?? error);

export class InProcessScientificJobService {
  readonly #adapters = new Map<string, InProcessScientificJobAdapter>();
  readonly #resolveSource: InProcessScientificJobServiceOptions["resolveSource"];
  readonly #runtime: ScientificJobRuntime;
  readonly #active = new Map<string, ActiveJob>();
  readonly #listeners = new Map<number, ScientificJobListener>();
  #nextSubscriberId = 1;
  #eventSequence = 0;

  constructor(options: InProcessScientificJobServiceOptions) {
    for (const adapter of options.adapters) {
      if (!OPERATION_TYPE.test(adapter.operationType)) {
        throw new TypeError(`Invalid scientific job adapter type '${adapter.operationType}'.`);
      }
      if (this.#adapters.has(adapter.operationType)) {
        throw new TypeError(`Duplicate scientific job adapter '${adapter.operationType}'.`);
      }
      this.#adapters.set(adapter.operationType, adapter);
    }
    this.#resolveSource = options.resolveSource;
    this.#runtime = options.runtime ?? DEFAULT_RUNTIME;
  }

  subscribe(listener: ScientificJobListener): () => void {
    const subscriberId = this.#nextSubscriberId;
    this.#nextSubscriberId += 1;
    this.#listeners.set(subscriberId, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(subscriberId);
    };
  }

  cancel(jobId: string): boolean {
    const active = this.#active.get(jobId);
    if (!active || active.settled || active.cancellationRequested) return false;
    active.cancellationRequested = true;
    active.signal({ kind: "cancelled" });
    return true;
  }

  async submit(candidate: unknown): Promise<ScientificJobOutcome> {
    const normalized = normalizeScientificJobRequest(candidate);
    if (!normalized.ok) {
      const record = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : null;
      return this.#failure(
        typeof record?.jobId === "string" ? record.jobId : "invalid-job",
        "invalid-request",
        normalized.errors.join(" ")
      );
    }
    const request = normalized.value;
    if (this.#active.has(request.jobId)) {
      return this.#failure(request.jobId, "invalid-request", `Job '${request.jobId}' is already active.`, request);
    }
    const adapter = this.#adapters.get(request.operation.type);
    if (!adapter) {
      return this.#failure(
        request.jobId,
        "unsupported-operation",
        `No adapter is registered for '${request.operation.type}'.`,
        request
      );
    }
    if (canonicalJsonByteLength(request.operation.payload) > request.limits.maxInputBytes) {
      return this.#failure(
        request.jobId,
        "input-limit-exceeded",
        "Scientific job payload exceeds maxInputBytes.",
        request
      );
    }
    const sourceAtStart = this.#readSource(request.source.documentId);
    if (!sourceAtStart) {
      return this.#failure(request.jobId, "source-unavailable", "Scientific source is unavailable.", request);
    }
    if (!matchesScientificSourceGeneration(request.source, sourceAtStart)) {
      return this.#failure(request.jobId, "stale-source", "Scientific source generation is already stale.", request);
    }

    let resolveControl!: (value: ControlSignal) => void;
    const controlPromise = new Promise<ControlSignal>((resolve) => { resolveControl = resolve; });
    const active: ActiveJob = {
      settled: false,
      cancellationRequested: false,
      signal: resolveControl,
    };
    this.#active.set(request.jobId, active);
    this.#emit(request, "scientific-job.submitted");

    let progressSequence = 0;
    let usedWork = 0;
    let reservedMemory = 0;
    const signalIfSourceChanged = (): void => {
      const current = this.#readSource(request.source.documentId);
      if (!current || !matchesScientificSourceGeneration(request.source, current)) {
        active.signal({ kind: "stale-source" });
        throw new ScientificJobExecutionError("stale-source", "Scientific source changed during execution.");
      }
    };
    const checkpoint = (): void => {
      if (active.settled) {
        throw new ScientificJobExecutionError("cancelled", "Scientific job is no longer active.");
      }
      if (active.cancellationRequested) {
        throw new ScientificJobExecutionError("cancelled", "Scientific job was cancelled.");
      }
      if (this.#runtime.now() >= request.limits.deadlineAt) {
        active.signal({ kind: "deadline-exceeded" });
        throw new ScientificJobExecutionError("deadline-exceeded", "Scientific job deadline was exceeded.");
      }
      signalIfSourceChanged();
    };
    const context: ScientificJobExecutionContext = {
      checkpoint,
      isCancellationRequested: () => active.cancellationRequested,
      reportProgress: (progress) => {
        checkpoint();
        const progressResult = normalizeScientificJobProgress(progress);
        if (!progressResult.ok) throw new TypeError(progressResult.errors.join(" "));
        progressSequence += 1;
        this.#emit(request, "scientific-job.progressed", {
          progressSequence,
          progress: progressResult.value,
        });
      },
      consumeWork: (units = 1) => {
        checkpoint();
        if (!Number.isSafeInteger(units) || units < 1) {
          throw new TypeError("consumeWork units must be a positive safe integer.");
        }
        usedWork += units;
        if (!Number.isSafeInteger(usedWork) || usedWork > request.limits.maxWorkUnits) {
          throw new ScientificJobExecutionError("work-limit-exceeded", "Scientific job exceeded maxWorkUnits.");
        }
      },
      reserveMemory: (bytes) => {
        checkpoint();
        if (!Number.isSafeInteger(bytes) || bytes < 1) {
          throw new TypeError("reserveMemory bytes must be a positive safe integer.");
        }
        reservedMemory += bytes;
        if (!Number.isSafeInteger(reservedMemory) || reservedMemory > request.limits.maxMemoryBytes) {
          throw new ScientificJobExecutionError("memory-limit-exceeded", "Scientific job exceeded maxMemoryBytes.");
        }
      },
      releaseMemory: (bytes) => {
        if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > reservedMemory) {
          throw new TypeError("releaseMemory bytes must be a positive reserved amount.");
        }
        reservedMemory -= bytes;
      },
    };

    const clearDeadline = this.#scheduleDeadline(request, active);
    const adapterPromise: Promise<AdapterRace> = Promise.resolve()
      .then(() => {
        checkpoint();
        return adapter.execute({
          jobId: request.jobId,
          source: request.source,
          payload: request.operation.payload,
          limits: request.limits,
        }, context);
      })
      .then((output): AdapterRace => ({ kind: "adapter-result", output }))
      .catch((error): AdapterRace => ({ kind: "adapter-error", error }));

    const race = await Promise.race<AdapterRace>([adapterPromise, controlPromise]);
    active.settled = true;
    clearDeadline();
    this.#active.delete(request.jobId);

    if (race.kind === "cancelled") {
      return this.#terminalFailure(request, "cancelled", "Scientific job was cancelled.");
    }
    if (race.kind === "deadline-exceeded") {
      return this.#terminalFailure(request, "deadline-exceeded", "Scientific job deadline was exceeded.");
    }
    if (race.kind === "stale-source") {
      return this.#terminalFailure(request, "stale-source", "Scientific source changed during execution.");
    }
    if (race.kind === "adapter-error") {
      if (race.error instanceof ScientificJobExecutionError) {
        return this.#terminalFailure(request, race.error.code, race.error.message);
      }
      return this.#terminalFailure(request, "adapter-failed", `Scientific adapter failed: ${describeError(race.error)}`);
    }

    const sourceAtPublication = this.#readSource(request.source.documentId);
    if (!sourceAtPublication || !matchesScientificSourceGeneration(request.source, sourceAtPublication)) {
      return this.#terminalFailure(request, "stale-source", "Scientific result cannot publish against a changed source.");
    }
    let outputBytes: number;
    try {
      outputBytes = canonicalJsonByteLength(race.output);
    } catch (error) {
      return this.#terminalFailure(request, "adapter-failed", `Scientific output is not canonical JSON: ${describeError(error)}`);
    }
    if (outputBytes > request.limits.maxOutputBytes) {
      return this.#terminalFailure(request, "output-limit-exceeded", "Scientific output exceeds maxOutputBytes.");
    }
    const result = immutableCanonicalJsonClone({
      ok: true as const,
      schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
      jobId: request.jobId,
      operationType: request.operation.type,
      source: request.source,
      output: race.output,
      outputBytes,
    });
    this.#emit(request, "scientific-job.completed");
    return result;
  }

  #readSource(documentId: StableDocumentId): ScientificSourceGeneration | null {
    try {
      return this.#resolveSource(documentId);
    } catch {
      return null;
    }
  }

  #scheduleDeadline(request: ScientificJobRequest, active: ActiveJob): () => void {
    let cleared = false;
    let handle: unknown;
    const arm = (): void => {
      if (cleared || active.settled) return;
      const remaining = request.limits.deadlineAt - this.#runtime.now();
      if (remaining <= 0) {
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
    code: ScientificJobFailureCode,
    message: string,
    request?: ScientificJobRequest
  ): ScientificJobFailure {
    return immutableCanonicalJsonClone({
      ok: false as const,
      schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
      jobId,
      ...(request ? { operationType: request.operation.type, source: request.source } : {}),
      code,
      message,
    }) as ScientificJobFailure;
  }

  #terminalFailure(
    request: ScientificJobRequest,
    code: ScientificJobFailureCode,
    message: string
  ): ScientificJobFailure {
    const failure = this.#failure(request.jobId, code, message, request);
    this.#emit(request, failureEventType(code), { failureCode: code });
    return failure;
  }

  #emit(
    request: ScientificJobRequest,
    type: ScientificJobEventType,
    fields: Pick<ScientificJobEvent, "progressSequence" | "progress" | "failureCode"> = {}
  ): void {
    this.#eventSequence += 1;
    const event = immutableCanonicalJsonClone({
      schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
      sequence: this.#eventSequence,
      type,
      jobId: request.jobId,
      operationType: request.operation.type,
      source: request.source,
      ...fields,
    }) as ScientificJobEvent;
    for (const listener of [...this.#listeners.values()]) {
      try {
        listener(event);
      } catch {
        // A diagnostic listener cannot alter job lifecycle or block other listeners.
      }
    }
  }
}

export const createInProcessScientificJobService = (
  options: InProcessScientificJobServiceOptions
): InProcessScientificJobService => new InProcessScientificJobService(options);
