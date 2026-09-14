import { describe, expect, it } from "vitest";
import {
  canonicalJsonByteLength,
  createScientificJobRequest,
  createStableDocumentId,
  structuralHash,
  type CanonicalJsonValue,
  type ScientificJobFailure,
  type ScientificJobRequest,
  type ScientificJobResult,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  ScientificTransportError,
  createInProcessScientificBackend,
  createInProcessScientificJobService,
  createScientificExecutionBroker,
  type ScientificBackendDiscovery,
  type ScientificExecutionBackend,
  type ScientificJobRuntime,
  type ScientificOperationCapability,
} from "@math3d/kernel";

class ManualRuntime implements ScientificJobRuntime {
  nowValue = 1_000;
  nextHandle = 1;
  timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.nowValue;
  schedule = (callback: () => void, delayMs: number): number => {
    const handle = this.nextHandle++;
    this.timers.set(handle, { due: this.nowValue + delayMs, callback });
    return handle;
  };
  clear = (handle: unknown): void => { this.timers.delete(handle as number); };
  advance(milliseconds: number): void {
    this.nowValue += milliseconds;
    for (const [handle, timer] of [...this.timers.entries()].sort((a, b) => a[1].due - b[1].due)) {
      if (timer.due > this.nowValue) continue;
      this.timers.delete(handle);
      timer.callback();
    }
  }
}

const documentId = createStableDocumentId("broker", { fixture: "f08" });
const source = (revision = 1): ScientificSourceGeneration => ({
  documentId,
  revision,
  structuralHash: structuralHash({ revision }),
  generation: revision,
});

const operation = "topology.compute-homology";
const capability = (
  retrySafety: ScientificOperationCapability["retrySafety"] = "idempotent",
  operationType = operation,
  limits: Partial<ScientificOperationCapability> = {}
): ScientificOperationCapability => ({
  operationType,
  retrySafety,
  maxInputBytes: 1_000,
  maxOutputBytes: 1_000,
  maxMemoryBytes: 1_000,
  maxWorkUnits: 1_000,
  ...limits,
});

const request = (
  runtime: ManualRuntime,
  jobId = "job:broker",
  payload: CanonicalJsonValue = {}
): ScientificJobRequest => createScientificJobRequest({
  jobId,
  source: source(),
  operation: { type: operation, payload },
  limits: {
    deadlineAt: runtime.now() + 1_000,
    maxInputBytes: 1_000,
    maxOutputBytes: 1_000,
    maxMemoryBytes: 1_000,
    maxWorkUnits: 1_000,
  },
});

const success = (job: ScientificJobRequest, output: CanonicalJsonValue = { betti: [1, 2, 1] }): ScientificJobResult => ({
  ok: true,
  schemaVersion: 1,
  jobId: job.jobId,
  operationType: job.operation.type,
  source: job.source,
  output,
  outputBytes: canonicalJsonByteLength(output),
});

const failure = (job: ScientificJobRequest): ScientificJobFailure => ({
  ok: false,
  schemaVersion: 1,
  jobId: job.jobId,
  operationType: job.operation.type,
  source: job.source,
  code: "adapter-failed",
  message: "The scientific algorithm rejected the input.",
});

const backend = (options: {
  id: string;
  priority?: number;
  transport?: ScientificExecutionBackend["transport"];
  retrySafety?: ScientificOperationCapability["retrySafety"];
  discover?: () => ScientificBackendDiscovery | Promise<ScientificBackendDiscovery>;
  execute?: (job: ScientificJobRequest) => ReturnType<ScientificExecutionBackend["execute"]>;
  cancel?: (jobId: string) => void | Promise<void>;
  supportsCancellation?: boolean;
}): ScientificExecutionBackend => ({
  backendId: options.id,
  backendVersion: "1.0.0",
  transport: options.transport ?? "worker",
  priority: options.priority ?? 0,
  supportsCancellation: options.supportsCancellation ?? !!options.cancel,
  discover: options.discover ?? (() => ({ available: true, operations: [capability(options.retrySafety)] })),
  execute: options.execute ?? ((job) => success(job)),
  ...(options.cancel ? { cancel: options.cancel } : {}),
});

const makeBroker = (
  runtime: ManualRuntime,
  backends: readonly ScientificExecutionBackend[],
  resolveSource: () => ScientificSourceGeneration | null = () => source(),
  maxAttemptsPerBackend = 2
) => createScientificExecutionBroker({ backends, resolveSource, runtime, maxAttemptsPerBackend });

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("capability-aware scientific execution broker", () => {
  it("discovers immutable capabilities in deterministic priority and ID order", async () => {
    const runtime = new ManualRuntime();
    const broker = makeBroker(runtime, [
      backend({ id: "backend:z", priority: 5 }),
      backend({ id: "backend:b", priority: 10 }),
      backend({ id: "backend:a", priority: 10 }),
    ]);
    const snapshots = await broker.discoverCapabilities();

    expect(snapshots.map((entry) => entry.backendId)).toEqual(["backend:a", "backend:b", "backend:z"]);
    expect(Object.isFrozen(snapshots)).toBe(true);
    expect(Object.isFrozen(snapshots[0]!.operations)).toBe(true);
  });

  it("turns thrown or malformed discovery into inspectable unavailable snapshots", async () => {
    const runtime = new ManualRuntime();
    const broker = makeBroker(runtime, [
      backend({ id: "backend:throw", discover: () => { throw new Error("offline"); } }),
      backend({ id: "backend:malformed", discover: () => ({ available: true } as never) }),
    ]);
    const snapshots = await broker.discoverCapabilities();

    expect(snapshots.every((entry) => entry.availability === "unavailable")).toBe(true);
    expect(snapshots.map((entry) => entry.unavailableReason)).toEqual([
      expect.stringMatching(/Capability discovery failed/),
      expect.stringMatching(/Capability discovery failed/),
    ]);
  });

  it("selects the highest-priority backend with backend ID as a stable tie-break", async () => {
    const runtime = new ManualRuntime();
    const invoked: string[] = [];
    const broker = makeBroker(runtime, [
      backend({ id: "backend:b", priority: 10, execute: (job) => { invoked.push("b"); return success(job); } }),
      backend({ id: "backend:a", priority: 10, execute: (job) => { invoked.push("a"); return success(job); } }),
    ]);
    const outcome = await broker.submit(request(runtime));

    expect(outcome).toMatchObject({ ok: true, backend: { backendId: "backend:a" } });
    expect(invoked).toEqual(["a"]);
  });

  it("honors caller preference and explicit no-fallback routing", async () => {
    const runtime = new ManualRuntime();
    const invoked: string[] = [];
    const broker = makeBroker(runtime, [
      backend({ id: "backend:fast", priority: 20, execute: (job) => { invoked.push("fast"); return success(job); } }),
      backend({ id: "backend:exact", priority: 1, execute: (job) => { invoked.push("exact"); return success(job); } }),
    ]);
    const outcome = await broker.submit(request(runtime), {
      preferredBackendIds: ["backend:exact"],
      allowFallback: false,
    });

    expect(outcome).toMatchObject({ ok: true, backend: { backendId: "backend:exact" } });
    expect(invoked).toEqual(["exact"]);
  });

  it("rejects unsupported operations and insufficient limits before transport", async () => {
    const runtime = new ManualRuntime();
    let invoked = false;
    const limited = backend({
      id: "backend:limited",
      discover: () => ({ available: true, operations: [capability("idempotent", operation, { maxOutputBytes: 10 })] }),
      execute: (job) => { invoked = true; return success(job); },
    });
    const broker = makeBroker(runtime, [limited]);
    const outcome = await broker.submit(request(runtime));

    expect(outcome).toMatchObject({ ok: false, code: "capability-unavailable", attempts: [] });
    expect(invoked).toBe(false);
  });

  it("retries transient transport failures and falls back only when idempotent", async () => {
    const runtime = new ManualRuntime();
    let remoteCalls = 0;
    let localCalls = 0;
    const broker = makeBroker(runtime, [
      backend({
        id: "backend:remote",
        priority: 20,
        retrySafety: "idempotent",
        execute: () => {
          remoteCalls += 1;
          throw new ScientificTransportError("transport-failed", "temporary disconnect", true);
        },
      }),
      backend({
        id: "backend:local",
        priority: 1,
        transport: "in-process",
        retrySafety: "idempotent",
        execute: (job) => { localCalls += 1; return success(job); },
      }),
    ]);
    const outcome = await broker.submit(request(runtime));

    expect(outcome).toMatchObject({ ok: true, backend: { backendId: "backend:local" } });
    expect(remoteCalls).toBe(2);
    expect(localCalls).toBe(1);
    expect(outcome.attempts.map((entry) => entry.outcome)).toEqual([
      "transport-failed", "transport-failed", "succeeded",
    ]);
  });

  it("never retries, falls back, or relabels scientific failures", async () => {
    const runtime = new ManualRuntime();
    let unsafeCalls = 0;
    let fallbackCalls = 0;
    const unsafeBroker = makeBroker(runtime, [
      backend({
        id: "backend:unsafe",
        priority: 10,
        retrySafety: "never",
        execute: () => {
          unsafeCalls += 1;
          throw new ScientificTransportError("transport-failed", "transient but unsafe", true);
        },
      }),
      backend({ id: "backend:fallback", retrySafety: "idempotent", execute: (job) => { fallbackCalls += 1; return success(job); } }),
    ]);
    expect(await unsafeBroker.submit(request(runtime, "job:unsafe"))).toMatchObject({ ok: false, code: "transport-failed" });
    expect([unsafeCalls, fallbackCalls]).toEqual([1, 0]);

    const scientificBroker = makeBroker(runtime, [
      backend({ id: "backend:scientific", priority: 10, execute: (job) => failure(job) }),
      backend({ id: "backend:not-used", execute: (job) => { fallbackCalls += 1; return success(job); } }),
    ]);
    const scientific = await scientificBroker.submit(request(runtime, "job:scientific"));
    expect(scientific).toMatchObject({
      ok: false,
      code: "scientific-failure",
      scientificFailure: { code: "adapter-failed" },
    });
    expect(fallbackCalls).toBe(0);
  });

  it("rejects malformed output and late results after the exact source changes", async () => {
    const runtime = new ManualRuntime();
    let current = source();
    const malformed = makeBroker(runtime, [backend({
      id: "backend:bad-protocol",
      execute: (job) => ({ ...success(job), outputBytes: 999 }),
    })], () => current);
    expect(await malformed.submit(request(runtime, "job:malformed"))).toMatchObject({
      ok: false, code: "protocol-error",
    });

    const stale = makeBroker(runtime, [backend({
      id: "backend:stale",
      execute: (job) => { current = source(2); return success(job); },
    })], () => current);
    expect(await stale.submit(request(runtime, "job:stale"))).toMatchObject({
      ok: false, code: "stale-source", attempts: [{ outcome: "stale-source" }],
    });
  });

  it("cancels promptly and propagates cancellation without awaiting transport", async () => {
    const runtime = new ManualRuntime();
    let cancellationCalls = 0;
    let finish!: (value: ScientificJobResult) => void;
    const uncooperative = backend({
      id: "backend:slow",
      supportsCancellation: true,
      cancel: () => { cancellationCalls += 1; },
      execute: () => new Promise<ScientificJobResult>((resolve) => { finish = resolve; }),
    });
    const broker = makeBroker(runtime, [uncooperative]);
    const job = request(runtime, "job:cancel");
    const pending = broker.submit(job);
    await flush();
    expect(broker.cancel(job.jobId)).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: "cancelled" });
    expect(cancellationCalls).toBe(1);
    finish(success(job));
    await flush();
    expect(broker.cancel(job.jobId)).toBe(false);
  });

  it("enforces one absolute deadline without awaiting an uncooperative backend", async () => {
    const runtime = new ManualRuntime();
    let cancellationCalls = 0;
    const broker = makeBroker(runtime, [backend({
      id: "backend:timeout",
      supportsCancellation: true,
      cancel: () => { cancellationCalls += 1; },
      execute: () => new Promise(() => undefined),
    })]);
    const pending = broker.submit(request(runtime, "job:timeout"));
    await flush();
    runtime.advance(1_000);

    expect(await pending).toMatchObject({ ok: false, code: "deadline-exceeded" });
    expect(cancellationCalls).toBe(1);
  });

  it("adapts the F05 in-process service as an optional local backend", async () => {
    const runtime = new ManualRuntime();
    const service = createInProcessScientificJobService({
      resolveSource: () => source(),
      runtime,
      adapters: [{
        operationType: operation,
        execute: (input) => ({ coefficient: input.payload, betti: [1, 2, 1] }),
      }],
    });
    const local = createInProcessScientificBackend({
      backendId: "backend:in-process",
      backendVersion: "1.5.0",
      priority: 0,
      operations: [capability("idempotent")],
      service,
    });
    const broker = makeBroker(runtime, [local]);
    const outcome = await broker.submit(request(runtime, "job:local", { field: "Z2" }));

    expect(outcome).toMatchObject({
      ok: true,
      backend: { backendId: "backend:in-process", transport: "in-process" },
      result: { output: { coefficient: { field: "Z2" }, betti: [1, 2, 1] } },
    });
  });
});
