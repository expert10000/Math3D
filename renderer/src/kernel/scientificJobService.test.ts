import { describe, expect, it } from "vitest";
import {
  createScientificJobRequest,
  createStableDocumentId,
  structuralHash,
  type CanonicalJsonValue,
  type ScientificJobEvent,
  type ScientificJobLimits,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createInProcessScientificJobService,
  type InProcessScientificJobAdapter,
  type ScientificJobRuntime,
} from "@math3d/kernel";

class ManualRuntime implements ScientificJobRuntime {
  nowValue = 1_000;
  nextHandle = 1;
  timers = new Map<number, { due: number; callback: () => void }>();

  now = () => this.nowValue;

  schedule = (callback: () => void, delayMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timers.set(handle, { due: this.nowValue + delayMs, callback });
    return handle;
  };

  clear = (handle: unknown): void => {
    this.timers.delete(handle as number);
  };

  advance(milliseconds: number): void {
    this.nowValue += milliseconds;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.due <= this.nowValue)
      .sort((left, right) => left[1].due - right[1].due || left[0] - right[0]);
    for (const [handle, timer] of due) {
      this.timers.delete(handle);
      timer.callback();
    }
  }
}

const documentId = createStableDocumentId("topology", { fixture: "scientific-job" });

const source = (revision = 1, generation = 1): ScientificSourceGeneration => ({
  documentId,
  revision,
  structuralHash: structuralHash({ revision }),
  generation,
});

const defaultLimits = (runtime: ManualRuntime): ScientificJobLimits => ({
  deadlineAt: runtime.now() + 1_000,
  maxInputBytes: 1_000,
  maxOutputBytes: 1_000,
  maxMemoryBytes: 1_000,
  maxWorkUnits: 100,
});

const request = (
  runtime: ManualRuntime,
  jobId: string,
  operationType: string,
  payload: CanonicalJsonValue = {},
  limits: Partial<ScientificJobLimits> = {},
  sourceGeneration = source()
) => createScientificJobRequest({
  jobId,
  source: sourceGeneration,
  operation: { type: operationType, payload },
  limits: { ...defaultLimits(runtime), ...limits },
});

const makeService = (
  runtime: ManualRuntime,
  adapters: readonly InProcessScientificJobAdapter[],
  resolveSource: () => ScientificSourceGeneration | null = () => source()
) => createInProcessScientificJobService({
  adapters,
  resolveSource,
  runtime,
});

const waitForAdapterStart = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("revision-safe scientific jobs", () => {
  it("validates requests and emits immutable submitted/progress/completed facts in order", async () => {
    const runtime = new ManualRuntime();
    let lateProgress: (() => void) | null = null;
    const adapter: InProcessScientificJobAdapter = {
      operationType: "topology.compute-betti",
      execute: (input, context) => {
        context.reserveMemory(64);
        context.consumeWork(2);
        context.reportProgress({ completed: 1, total: 2, message: "canonicalizing" });
        context.releaseMemory(64);
        lateProgress = () => context.reportProgress({ completed: 2, total: 2 });
        return { betti: [1, 2, 1], echoed: input.payload };
      },
    };
    const service = makeService(runtime, [adapter]);
    const observed: string[] = [];
    service.subscribe((event) => {
      observed.push(`${event.sequence}:${event.type}`);
      (event.source as { revision: number }).revision = 99;
    });
    service.subscribe((event) => observed.push(`safe:${event.source.revision}`));

    const outcome = await service.submit(request(
      runtime,
      "job-success",
      "topology.compute-betti",
      { coefficient: "Z2" }
    ));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.output).toEqual({ betti: [1, 2, 1], echoed: { coefficient: "Z2" } });
    expect(outcome.outputBytes).toBeGreaterThan(0);
    expect(outcome.source).toEqual(source());
    expect(observed).toEqual([
      "1:scientific-job.submitted", "safe:1",
      "2:scientific-job.progressed", "safe:1",
      "3:scientific-job.completed", "safe:1",
    ]);
    expect(() => lateProgress?.()).toThrow(/no longer active/);
    expect(observed).toHaveLength(6);
  });

  it("cancels without waiting for an uncooperative adapter and ignores late output", async () => {
    const runtime = new ManualRuntime();
    let finish!: (value: CanonicalJsonValue) => void;
    const adapter: InProcessScientificJobAdapter = {
      operationType: "complex.long-contour",
      execute: () => new Promise((resolve) => { finish = resolve; }),
    };
    const service = makeService(runtime, [adapter]);
    const events: ScientificJobEvent[] = [];
    service.subscribe((event) => events.push(event));

    const pending = service.submit(request(runtime, "job-cancel", "complex.long-contour"));
    await waitForAdapterStart();
    expect(service.cancel("job-cancel")).toBe(true);
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, code: "cancelled" });
    expect(events.map((event) => event.type)).toEqual([
      "scientific-job.submitted",
      "scientific-job.cancelled",
    ]);

    finish({ late: true });
    await waitForAdapterStart();
    expect(events.map((event) => event.type)).not.toContain("scientific-job.completed");
    expect(service.cancel("job-cancel")).toBe(false);
  });

  it("enforces a hard deadline without waiting for adapter completion", async () => {
    const runtime = new ManualRuntime();
    const adapter: InProcessScientificJobAdapter = {
      operationType: "topology.never-finishes",
      execute: () => new Promise(() => undefined),
    };
    const service = makeService(runtime, [adapter]);
    const eventTypes: string[] = [];
    service.subscribe((event) => eventTypes.push(event.type));

    const pending = service.submit(request(runtime, "job-timeout", "topology.never-finishes"));
    await waitForAdapterStart();
    runtime.advance(1_000);
    const outcome = await pending;

    expect(outcome).toMatchObject({ ok: false, code: "deadline-exceeded" });
    expect(eventTypes).toEqual(["scientific-job.submitted", "scientific-job.timed-out"]);
  });

  it("returns a structured adapter failure and exactly one terminal event", async () => {
    const runtime = new ManualRuntime();
    const service = makeService(runtime, [{
      operationType: "complex.adapter-failure",
      execute: () => { throw new Error("fixture backend failure"); },
    }]);
    const eventTypes: string[] = [];
    service.subscribe((event) => eventTypes.push(event.type));

    const outcome = await service.submit(request(runtime, "job-failure", "complex.adapter-failure"));

    expect(outcome).toMatchObject({
      ok: false,
      code: "adapter-failed",
      message: "Scientific adapter failed: fixture backend failure",
    });
    expect(eventTypes).toEqual(["scientific-job.submitted", "scientific-job.failed"]);
  });

  it("rejects stale requests before execution", async () => {
    const runtime = new ManualRuntime();
    let invoked = false;
    const service = makeService(runtime, [{
      operationType: "topology.stale",
      execute: () => { invoked = true; return {}; },
    }], () => source(2, 2));

    const outcome = await service.submit(request(runtime, "job-stale-start", "topology.stale"));

    expect(outcome).toMatchObject({ ok: false, code: "stale-source" });
    expect(invoked).toBe(false);
  });

  it("rejects a late result after source revision or generation changes", async () => {
    const runtime = new ManualRuntime();
    let current = source();
    let finish!: (value: CanonicalJsonValue) => void;
    const service = makeService(runtime, [{
      operationType: "topology.late-result",
      execute: () => new Promise((resolve) => { finish = resolve; }),
    }], () => current);
    const eventTypes: string[] = [];
    service.subscribe((event) => eventTypes.push(event.type));

    const pending = service.submit(request(runtime, "job-late", "topology.late-result"));
    await waitForAdapterStart();
    current = source(2, 2);
    finish({ invalidLatePublication: true });
    const outcome = await pending;

    expect(outcome).toMatchObject({ ok: false, code: "stale-source" });
    expect(eventTypes).toEqual([
      "scientific-job.submitted",
      "scientific-job.stale-rejected",
    ]);
  });

  it("enforces canonical input and output byte limits", async () => {
    const runtime = new ManualRuntime();
    let invoked = 0;
    const service = makeService(runtime, [{
      operationType: "complex.bounded-output",
      execute: () => { invoked += 1; return { samples: "0123456789" }; },
    }]);

    const inputFailure = await service.submit(request(
      runtime,
      "job-input-limit",
      "complex.bounded-output",
      { input: "too large" },
      { maxInputBytes: 1 }
    ));
    expect(inputFailure).toMatchObject({ ok: false, code: "input-limit-exceeded" });
    expect(invoked).toBe(0);

    const outputFailure = await service.submit(request(
      runtime,
      "job-output-limit",
      "complex.bounded-output",
      {},
      { maxOutputBytes: 2 }
    ));
    expect(outputFailure).toMatchObject({ ok: false, code: "output-limit-exceeded" });
    expect(invoked).toBe(1);
  });

  it("enforces cooperative work and memory limits", async () => {
    const runtime = new ManualRuntime();
    const service = makeService(runtime, [
      {
        operationType: "topology.work-heavy",
        execute: (_input, context) => { context.consumeWork(2); return {}; },
      },
      {
        operationType: "topology.memory-heavy",
        execute: (_input, context) => { context.reserveMemory(2); return {}; },
      },
    ]);

    const work = await service.submit(request(
      runtime, "job-work-limit", "topology.work-heavy", {}, { maxWorkUnits: 1 }
    ));
    const memory = await service.submit(request(
      runtime, "job-memory-limit", "topology.memory-heavy", {}, { maxMemoryBytes: 1 }
    ));

    expect(work).toMatchObject({ ok: false, code: "work-limit-exceeded" });
    expect(memory).toMatchObject({ ok: false, code: "memory-limit-exceeded" });
  });

  it("rejects unsupported and non-JSON requests without invoking an adapter", async () => {
    const runtime = new ManualRuntime();
    const service = makeService(runtime, []);
    const unsupported = await service.submit(request(runtime, "job-unsupported", "sage.unknown"));
    const invalid = await service.submit({
      jobId: "job-invalid",
      operation: { type: "bad", payload: { fn: () => true } },
    });

    expect(unsupported).toMatchObject({ ok: false, code: "unsupported-operation" });
    expect(invalid).toMatchObject({ ok: false, code: "invalid-request" });
  });
});
