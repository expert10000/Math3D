import { describe, expect, it } from "vitest";
import { adaptCurveDefinition } from "./infrastructure";
import { CurveDocumentAdapter, curveDocumentFromLegacyDefinition } from "./curveDocumentAdapter";
import { CurveAnalysisKernelBridge } from "./curveAnalysisKernelBridge";
import { CurveScientificJob, CURVE_SCIENTIFIC_OPERATION } from "./curveScientificJob";
import { executeCurveWorkerRequest, type CurveWorkerInbound, type CurveWorkerOutbound } from "./curveComputation";
import { CurveWorkerCoordinator, type CurveWorkerLike } from "./curveWorkerCoordinator";

class InlineWorker implements CurveWorkerLike {
  readonly listeners = new Set<(event: MessageEvent<CurveWorkerOutbound>) => void>();
  readonly cancelled = new Set<string>();
  runs = 0;
  postMessage(message: CurveWorkerInbound) {
    if (message.type === "cancel") { this.cancelled.add(message.requestId); return; }
    this.runs += 1;
    const request = message.request;
    void executeCurveWorkerRequest(request, (value) => this.emit(value), () => this.cancelled.has(request.requestId)).then((value) => this.emit(value));
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { /* no-op */ }
  emit(value: CurveWorkerOutbound) { queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: value } as MessageEvent<CurveWorkerOutbound>))); }
}
class ManualWorker extends InlineWorker {
  override postMessage(message: CurveWorkerInbound) {
    if (message.type === "cancel") this.cancelled.add(message.requestId);
  }
}

const definition = adaptCurveDefinition({
  id: "scientific-curve", revision: 1, label: "Scientific curve", representation: "bezier", dimension: 2,
  domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
  controlPoints: [[0, 0], [1, 1], [2, 0]], degree: 2,
});

describe("GK12 Curve scientific job", () => {
  it("discovers the worker backend, publishes a source-bound result, and reuses the cache", async () => {
    const adapter = new CurveDocumentAdapter(curveDocumentFromLegacyDefinition(definition));
    const bridge = new CurveAnalysisKernelBridge(() => adapter);
    const worker = new InlineWorker();
    const coordinator = new CurveWorkerCoordinator(() => worker, undefined, () => 1);
    const jobs = new CurveScientificJob(bridge, coordinator);
    expect((await jobs.capabilities()).some((backend) => backend.operations.some((operation) => operation.operationType === CURVE_SCIENTIFIC_OPERATION))).toBe(true);
    expect((await jobs.executionCapabilities()).find((capability) => capability.operation.id === CURVE_SCIENTIFIC_OPERATION)?.availableBackends.map((backend) => backend.backendId)).toEqual(["curve-worker"]);
    const request = coordinator.createRequest({ definition, operation: "sampling", positions: new Float64Array([0, 0, 0, 1, 1, 0, 2, 0, 0]), targetCount: 1_000, workload: "1k" });
    const progress: string[] = [];
    const first = await jobs.submit(request, (value) => progress.push(value.phase)).promise;
    expect(first.broker.ok).toBe(true);
    expect(first.artifact?.state).toBe("ready");
    expect(first.result?.status).toBe("numerical");
    expect(progress).toContain("coarse preview");
    expect(bridge.artifacts().resolve(first.result!.artifacts[0], adapter.sourceGeneration()).ok).toBe(true);
    const cached = await jobs.submit({ ...request, requestId: `${request.requestId}:cached` }).promise;
    expect(cached.broker.ok).toBe(true);
    expect(cached.artifact?.state).toBe("cached");
    expect(worker.runs).toBe(1);
    adapter.commitControlPoints([[0, 0], [1, 2], [2, 0]]);
    bridge.invalidate();
    expect(bridge.artifacts().resolve(first.result!.artifacts[0], adapter.sourceGeneration()).ok).toBe(false);
    jobs.dispose();
  });
  it("cancels through the broker and worker without publishing a result", async () => {
    const adapter = new CurveDocumentAdapter(curveDocumentFromLegacyDefinition(definition));
    const bridge = new CurveAnalysisKernelBridge(() => adapter);
    const coordinator = new CurveWorkerCoordinator(() => new ManualWorker(), undefined, () => 1);
    const jobs = new CurveScientificJob(bridge, coordinator);
    const request = coordinator.createRequest({ definition, operation: "sampling", positions: new Float64Array([0, 0, 0, 1, 1, 0]), targetCount: 1_000, workload: "1k" });
    const handle = jobs.submit(request);
    await new Promise((resolve) => setTimeout(resolve, 0));
    handle.cancel();
    const outcome = await handle.promise;
    expect(outcome.broker.ok).toBe(false);
    if (!outcome.broker.ok) expect(outcome.broker.code).toBe("cancelled");
    expect(bridge.results()).toEqual([]);
    jobs.dispose();
  });
});
