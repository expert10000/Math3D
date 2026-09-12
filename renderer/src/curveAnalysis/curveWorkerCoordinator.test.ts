import { describe, expect, it } from "vitest";
import { adaptCurveDefinition } from "./infrastructure";
import { CURVE_OUTPUT_LIMITS, CurveDependencyCache, curveDependencyCacheKey, decimateCurveArtifact, executeCurveWorkerRequest, type CurveWorkerInbound, type CurveWorkerOutbound } from "./curveComputation";
import { CurveWorkerCoordinator, type CurveWorkerLike } from "./curveWorkerCoordinator";

const definition = adaptCurveDefinition({ id: "worker-curve", revision: 4, label: "Worker curve", representation: "polyline", dimension: 3, points: [[0, 0, 0], [0.5, 1, 0], [1, 0, 0]], domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false }, dependencies: [{ module: "geometry", objectId: "edge-b", revision: "2", relation: "input" }, { module: "surfaces", objectId: "surface-a", revision: "9", relation: "host" }] });
const positions = new Float64Array([0, 0, 0, 0.5, 1, 0, 1, 0, 0]);

class InlineWorker implements CurveWorkerLike {
  private listeners = new Set<(event: MessageEvent<CurveWorkerOutbound>) => void>(); private cancelled = new Set<string>(); terminated = false; runs = 0;
  postMessage(message: CurveWorkerInbound) { if (message.type === "cancel") { this.cancelled.add(message.requestId); return; } this.runs += 1; const request = message.request; void executeCurveWorkerRequest(request, (data) => this.emit(data), () => this.cancelled.has(request.requestId)).then((data) => this.emit(data)).catch((error) => this.emit({ type: "error", requestId: request.requestId, curveRevision: request.curveRevision, code: "WORKER_FAILURE", message: String(error), retryable: true, detail: "inline worker" })); }
  addEventListener(_type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { this.terminated = true; }
  protected emit(data: CurveWorkerOutbound) { queueMicrotask(() => this.listeners.forEach((listener) => listener({ data } as MessageEvent<CurveWorkerOutbound>))); }
}
class ManualWorker extends InlineWorker { messages: CurveWorkerInbound[] = []; override postMessage(message: CurveWorkerInbound) { this.messages.push(message); } publish(data: CurveWorkerOutbound) { this.emit(data); } }

describe("Curve worker coordinator", () => {
  it("runs heavy work outside React state, emits a labeled preview, and reuses the exact cache artifact", async () => {
    const worker = new InlineWorker(); const cache = new CurveDependencyCache(1_000_000); const coordinator = new CurveWorkerCoordinator(() => worker, cache, () => 4); const progress: CurveWorkerOutbound[] = [];
    const request = coordinator.createRequest({ definition, operation: "sampling", positions, targetCount: 1_000, workload: "1k", consumers: ["viewport", "plots"] });
    const first = await coordinator.submit(request, { onProgress: (value) => progress.push(value) }).promise;
    expect(first).toMatchObject({ state: "ready", curveRevision: 4, consumers: ["viewport", "plots"], statistics: { sampleCount: 1_000 } });
    expect(progress[0]).toMatchObject({ previewLabel: "coarse-preview", phase: "coarse preview" });
    expect(first.output).toHaveLength(3_000); expect(worker.runs).toBe(1);
    const cached = await coordinator.submit({ ...request, requestId: "cached", consumers: ["probes", "curve-mesh"] }).promise;
    expect(cached.state).toBe("cached"); expect(cached.consumers).toEqual(["viewport", "plots", "probes", "curve-mesh"]); expect(worker.runs).toBe(1);
    coordinator.dispose(); expect(worker.terminated).toBe(true);
  });

  it("keys cache deterministically across dependency order and invalidates revision, parameters, tolerance, and backend", () => {
    const request = new CurveWorkerCoordinator(() => new InlineWorker()).createRequest({ definition, operation: "diagnostics", positions, workload: "1k" });
    const base = { ...request, dependencies: [...request.dependencies].reverse() }; const strip = ({ requestId: _a, positions: _b, consumers: _c, ...value }: typeof request) => value;
    expect(curveDependencyCacheKey(strip(request))).toBe(curveDependencyCacheKey(strip(base)));
    expect(curveDependencyCacheKey(strip(request))).not.toBe(curveDependencyCacheKey(strip({ ...request, curveRevision: 5 })));
    expect(curveDependencyCacheKey(strip(request))).not.toBe(curveDependencyCacheKey(strip({ ...request, tolerance: 0.2 })));
    expect(curveDependencyCacheKey(strip(request))).not.toBe(curveDependencyCacheKey(strip({ ...request, backendVersion: "v2" })));
  });

  it("cancels, times out, retries, and exposes actionable failure details", async () => {
    const worker = new ManualWorker(); const coordinator = new CurveWorkerCoordinator(() => worker); const request = coordinator.createRequest({ definition, operation: "differential-field", positions, workload: "1k" });
    const cancelled = coordinator.submit(request); cancelled.cancel(); expect(await cancelled.promise).toMatchObject({ state: "cancelled", failure: { code: "CANCELLED", retryable: true } });
    const timeout = coordinator.submit({ ...request, requestId: "timeout" }, { timeoutMs: 5 }); expect(await timeout.promise).toMatchObject({ state: "timed-out", failure: { code: "TIMEOUT", retryable: true } });
    const retry = coordinator.retry({ ...request, requestId: "failed" }); const retryId = retry.requestId; worker.publish({ type: "error", requestId: retryId, curveRevision: 4, code: "BACKEND_FAILURE", message: "backend disconnected", retryable: true, detail: "Reconnect and retry." });
    expect(await retry.promise).toMatchObject({ state: "failed", failure: { code: "BACKEND_FAILURE", message: "backend disconnected", detail: "Reconnect and retry." } }); coordinator.dispose();
  });

  it("rejects stale revision and superseded results so they cannot overwrite current work", async () => {
    const worker = new ManualWorker(); let revision = 4; const coordinator = new CurveWorkerCoordinator(() => worker, new CurveDependencyCache(), () => revision); const request = coordinator.createRequest({ definition, operation: "diagnostics", positions, workload: "1k" });
    const stale = coordinator.submit(request); revision = 5; worker.publish({ type: "result", requestId: request.requestId, curveRevision: 4, output: new Float64Array([0]), statistics: {}, warnings: [], runtimeMs: 1 });
    expect(await stale.promise).toMatchObject({ state: "stale-rejected", failure: { code: "STALE_REVISION" } });
    revision = 4; const older = coordinator.submit({ ...request, requestId: "older", tolerance: 0.01 }); const newer = coordinator.submit({ ...request, requestId: "newer", tolerance: 0.02 });
    worker.publish({ type: "result", requestId: "older", curveRevision: 4, output: new Float64Array([1]), statistics: {}, warnings: [], runtimeMs: 1 });
    expect(await older.promise).toMatchObject({ state: "stale-rejected" });
    worker.publish({ type: "result", requestId: "newer", curveRevision: 4, output: new Float64Array([2]), statistics: {}, warnings: [], runtimeMs: 1 }); expect((await newer.promise).state).toBe("ready"); coordinator.dispose();
  });

  it("enforces workload and serialization budgets before transfer", async () => {
    const worker = new InlineWorker(); const coordinator = new CurveWorkerCoordinator(() => worker); const request = coordinator.createRequest({ definition, operation: "sampling", positions, targetCount: 1_001, workload: "1k" });
    expect(await coordinator.submit(request).promise).toMatchObject({ state: "failed", failure: { code: "BUDGET_EXCEEDED", retryable: false } }); expect(worker.runs).toBe(0);
  });

  it("bounds viewport, plot, and glyph artifacts", () => {
    const dense = new Float64Array(100_000 * 3); expect(decimateCurveArtifact(dense, "render")).toHaveLength(CURVE_OUTPUT_LIMITS.renderPoints * 3); expect(decimateCurveArtifact(dense, "plot")).toHaveLength(CURVE_OUTPUT_LIMITS.plotPoints * 3); expect(decimateCurveArtifact(dense, "glyph")).toHaveLength(CURVE_OUTPUT_LIMITS.frameGlyphs * 3);
  });
});
