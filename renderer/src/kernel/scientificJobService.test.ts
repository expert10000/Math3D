import { describe, expect, it } from "vitest";
import {
  analyzeGraph2DDerivative,
  applyGraph2DAuthoring,
  canonicalJsonStringify,
  createAnalysisResultFromScientificJob,
  createEmptyGraph2DDocument,
  createGraph2DWorkspaceProject,
  createMath3DProject,
  createMixedWorkspaceDocument,
  isAnalysisResultCurrent,
  parseMath3DProject,
  replaceMath3DProjectWorkspace,
  serializeMath3DProject,
  sha256Checksum,
  viewerSourceFromDocument,
  createScientificJobRequest,
  createStableDocumentId,
  structuralHash,
  type CanonicalJsonValue,
  type ScientificJobEvent,
  type ScientificJobLimits,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createInMemoryArtifactRegistry,
  Graph2DCommandAdapter,
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

  it.each([
    ["revision", { ...source(), revision: 2 }],
    ["structural hash", { ...source(), structuralHash: structuralHash({ changedBytes: true }) }],
    ["generation", { ...source(), generation: 2 }],
    ["revision and generation", source(2, 2)],
  ])("rejects a late result after source %s changes", async (_change, changedSource) => {
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
    current = changedSource;
    finish({ invalidLatePublication: true });
    const outcome = await pending;

    expect(outcome).toMatchObject({ ok: false, code: "stale-source" });
    expect(eventTypes).toEqual([
      "scientific-job.submitted",
      "scientific-job.stale-rejected",
    ]);
  });

  it("retains historical Graph analysis and artifact references while rejecting an edited source's late Job", async () => {
    const runtime = new ManualRuntime();
    const graph = new Graph2DCommandAdapter(createEmptyGraph2DDocument("job-project-integration"));
    const draft = {
      label: "f", expression: "x^2",
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true },
    };
    graph.commitScene(applyGraph2DAuthoring(graph.document(), { type: "create", draft }), "create");
    const original = graph.document();
    const originalSource = viewerSourceFromDocument(original);
    const currentSource = () => viewerSourceFromDocument(graph.document());
    const derivative = analyzeGraph2DDerivative({ document: original, objectId: "function_1", x: 1, order: 1 });
    expect(derivative.value).toBeCloseTo(2, 7);
    let finish!: (value: CanonicalJsonValue) => void;
    let first = true;
    const service = makeService(runtime, [{
      operationType: "graph2d.derivative",
      execute: () => {
        if (first) {
          first = false;
          return analyzeGraph2DDerivative({ document: graph.document(), objectId: "function_1", x: 1, order: 1 }).publication.summary;
        }
        return new Promise(resolve => { finish = resolve; });
      },
    }], currentSource);
    const completed = await service.submit(request(runtime, "graph-success", "graph2d.derivative", {}, {}, originalSource));
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error("Baseline derivative Job did not finish.");
    expect(completed.output).toEqual(derivative.publication.summary);
    const handle = { artifactId: "artifact:graph-derivative", kind: "binary" as const, role: "worker-output" };
    const registry = createInMemoryArtifactRegistry({ maxArtifactBytes: 8192, resolveSource: currentSource });
    const ownerId = "graph2d:derivative";
    registry.declare({ handle, source: originalSource, ownerId, encoding: "application/json" });
    const bytes = new TextEncoder().encode(canonicalJsonStringify(completed.output));
    const metadata = registry.publish({ artifactId: handle.artifactId, source: originalSource, ownerId, bytes });
    expect(metadata.checksum).toBe(sha256Checksum(bytes));
    expect(registry.resolve(handle, originalSource)).toMatchObject({ ok: true, bytes });
    const publication = {
      resultId: "result:graph-derivative", status: "numerical" as const, jobResult: completed,
      currentSource: originalSource,
      algorithm: derivative.publication.provenance.operation.algorithm,
      algorithmVersion: derivative.publication.provenance.operation.algorithmVersion,
      parameters: derivative.publication.provenance.operation.parameters,
      numericContext: derivative.publication.provenance.numericContext,
      engine: derivative.publication.provenance.engine, elapsedMs: 0,
      summary: derivative.publication.summary, artifacts: [handle],
    };
    const result = createAnalysisResultFromScientificJob(publication);
    expect(isAnalysisResultCurrent(result, originalSource)).toBe(true);
    const descriptor = { handle, contentHash: metadata.checksum, byteLength: bytes.byteLength };
    const project = createMath3DProject(createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(original),
      results: [result], artifacts: [descriptor] }), { stableKey: "job-project-integration" });
    const events: ScientificJobEvent[] = [];
    service.subscribe(event => events.push(event));
    const pending = service.submit(request(runtime, "graph-late", "graph2d.derivative", {}, {}, originalSource));
    await waitForAdapterStart();
    graph.commitScene(applyGraph2DAuthoring(graph.document(), {
      type: "edit", objectId: "function_1", draft: { ...draft, expression: "x^3" },
    }), "edit");
    const edited = graph.document();
    expect(edited.identity.id).toBe(original.identity.id);
    expect(edited.identity.revision).toBeGreaterThan(original.identity.revision);
    expect(edited.identity.structuralHash).not.toBe(original.identity.structuralHash);
    expect(registry.invalidateDocumentSource(currentSource())).toEqual([handle.artifactId]);
    finish(derivative.publication.summary);
    expect(await pending).toMatchObject({ ok: false, code: "stale-source" });
    expect(events.map(event => event.type)).toEqual(["scientific-job.submitted", "scientific-job.stale-rejected"]);
    expect(() => createAnalysisResultFromScientificJob({ ...publication, currentSource: currentSource() })).toThrow(/source is stale/);
    expect(() => registry.publish({ artifactId: handle.artifactId, source: originalSource, ownerId, bytes })).toThrow(/not the current scientific source generation/);
    expect(registry.resolve(handle, originalSource)).toMatchObject({ ok: false, reason: "stale-source" });
    const changed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...createGraph2DWorkspaceProject(edited), results: [result], artifacts: [descriptor],
    }));
    const reopened = parseMath3DProject(serializeMath3DProject(changed));
    expect(reopened.identity).toEqual(changed.identity);
    expect(reopened.identity.id).toBe(project.identity.id);
    expect(reopened.workspace.entries[0]!.expected).toEqual(edited.identity);
    expect(reopened.workspace.results).toEqual([result]);
    expect(reopened.workspace.artifacts).toEqual([descriptor]);
    expect(isAnalysisResultCurrent(result, currentSource())).toBe(false);
    const freshRegistry = createInMemoryArtifactRegistry({ maxArtifactBytes: 8192, resolveSource: currentSource });
    expect(freshRegistry.resolve(handle, originalSource)).toMatchObject({ ok: false, reason: "stale-source" });
    expect(freshRegistry.resolve(handle, currentSource())).toMatchObject({ ok: false, reason: "missing" });
    expect(freshRegistry.listMetadata()).toEqual([]);
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
