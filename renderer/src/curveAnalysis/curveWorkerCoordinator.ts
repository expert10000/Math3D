import type { CanonicalCurveDefinition } from "./contracts";
import { CURVE_OUTPUT_LIMITS, CURVE_PERFORMANCE_BUDGETS, CurveDependencyCache, curveDependencyCacheKey, type CurveComputationArtifact, type CurveWorkerInbound, type CurveWorkerOperation, type CurveWorkerOutbound, type CurveWorkerProgress, type CurveWorkerRequest, type CurveWorkloadClass } from "./curveComputation";

export type CurveWorkerLike = {
  postMessage: (message: CurveWorkerInbound, transfer?: Transferable[]) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent<CurveWorkerOutbound>) => void) => void;
  terminate: () => void;
};
export type CurveWorkerSubmitOptions = { timeoutMs?: number; onProgress?: (progress: CurveWorkerProgress) => void };
export type CurveWorkerHandle = { requestId: string; promise: Promise<CurveComputationArtifact>; cancel: () => void };
type Pending = { request: CurveWorkerRequest; cacheKey: string; resolve: (artifact: CurveComputationArtifact) => void; timer: ReturnType<typeof setTimeout>; onProgress?: CurveWorkerSubmitOptions["onProgress"] };

const failedArtifact = (request: CurveWorkerRequest, cacheKey: string, state: CurveComputationArtifact["state"], failure: NonNullable<CurveComputationArtifact["failure"]>): CurveComputationArtifact => ({ artifactId: `${request.requestId}:${state}`, cacheKey, state, operation: request.operation, curveId: request.curveId, curveRevision: request.curveRevision, output: new Float64Array(), statistics: {}, warnings: [failure.message], runtimeMs: 0, consumers: request.consumers, createdAt: Date.now(), failure });
const estimateSerializedBytes = (request: CurveWorkerRequest) => JSON.stringify({ ...request, positions: undefined }).length * 2;

export class CurveWorkerCoordinator {
  private worker: CurveWorkerLike | null = null;
  private counter = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly latestByCurve = new Map<string, string>();
  private readonly listener = (event: MessageEvent<CurveWorkerOutbound>) => this.receive(event.data);
  private readonly workerFactory: () => CurveWorkerLike;
  readonly cache: CurveDependencyCache;
  private readonly currentRevision: (curveId: string) => number | null;
  constructor(workerFactory: () => CurveWorkerLike, cache = new CurveDependencyCache(), currentRevision: (curveId: string) => number | null = () => null) { this.workerFactory = workerFactory; this.cache = cache; this.currentRevision = currentRevision; }
  submit(request: CurveWorkerRequest, options: CurveWorkerSubmitOptions = {}): CurveWorkerHandle {
    const cacheInput = { operation: request.operation, curveId: request.curveId, curveRevision: request.curveRevision, curveFingerprint: request.curveFingerprint, dependencies: request.dependencies, backendVersion: request.backendVersion, tolerance: request.tolerance, targetCount: request.targetCount, workload: request.workload, parameters: request.parameters };
    const cacheKey = curveDependencyCacheKey(cacheInput); const cached = this.cache.get(cacheKey, request.consumers);
    if (cached) return { requestId: request.requestId, promise: Promise.resolve(cached), cancel: () => undefined };
    const budget = CURVE_PERFORMANCE_BUDGETS[request.workload]; const serializedBytes = estimateSerializedBytes(request); const transferBytes = request.positions.byteLength + request.targetCount * 3 * Float64Array.BYTES_PER_ELEMENT;
    if (request.targetCount > budget.maximumSamples || serializedBytes > CURVE_OUTPUT_LIMITS.serializedBytes || transferBytes > Math.min(CURVE_OUTPUT_LIMITS.transferBytes, budget.maximumTransferBytes)) {
      const reason = request.targetCount > budget.maximumSamples ? `Target ${request.targetCount} exceeds ${request.workload} budget ${budget.maximumSamples}.` : serializedBytes > CURVE_OUTPUT_LIMITS.serializedBytes ? `Serialized request metadata ${serializedBytes} bytes exceeds ${CURVE_OUTPUT_LIMITS.serializedBytes}.` : `Transfer ${transferBytes} bytes exceeds ${request.workload} envelope ${budget.maximumTransferBytes}.`;
      const artifact = failedArtifact(request, cacheKey, "failed", { code: "BUDGET_EXCEEDED", message: reason, retryable: false, detail: "Choose a larger reviewed workload budget or reduce the input." });
      return { requestId: request.requestId, promise: Promise.resolve(artifact), cancel: () => undefined };
    }
    this.latestByCurve.set(request.curveId, request.requestId);
    let cancel: () => void = () => undefined;
    const promise = new Promise<CurveComputationArtifact>((resolve) => {
      const timer = setTimeout(() => { const active = this.pending.get(request.requestId); if (!active) return; this.worker?.postMessage({ type: "cancel", requestId: request.requestId }); this.pending.delete(request.requestId); resolve(failedArtifact(request, cacheKey, "timed-out", { code: "TIMEOUT", message: `Curve worker timed out after ${options.timeoutMs ?? budget.timeoutMs} ms.`, retryable: true, detail: `Operation ${request.operation}; workload ${request.workload}.` })); }, options.timeoutMs ?? budget.timeoutMs);
      this.pending.set(request.requestId, { request, cacheKey, resolve, timer, onProgress: options.onProgress });
      if (!this.worker) { this.worker = this.workerFactory(); this.worker.addEventListener("message", this.listener); }
      const positions = new Float64Array(request.positions); this.worker.postMessage({ type: "run", request: { ...request, positions } }, [positions.buffer]);
      cancel = () => this.cancel(request.requestId);
    });
    return { requestId: request.requestId, promise, cancel };
  }
  createRequest(args: { definition: CanonicalCurveDefinition; operation: CurveWorkerOperation; positions: Float64Array; targetCount?: number; workload?: CurveWorkloadClass; tolerance?: number; backendVersion?: string; parameters?: CurveWorkerRequest["parameters"]; consumers?: CurveWorkerRequest["consumers"] }): CurveWorkerRequest {
    const workload = args.workload ?? "10k"; const requestId = `curve-job:${args.definition.identity.curveId}:${args.definition.identity.curveRevision}:${++this.counter}`;
    return { requestId, operation: args.operation, curveId: args.definition.identity.curveId, curveRevision: args.definition.identity.curveRevision, curveFingerprint: args.definition.fingerprint, dependencies: args.definition.dependencies, backendVersion: args.backendVersion ?? "curve-worker-v1", tolerance: args.tolerance ?? args.definition.sampling.tolerance ?? 1e-4, targetCount: args.targetCount ?? Math.min(CURVE_PERFORMANCE_BUDGETS[workload].maximumSamples, Math.max(2, args.positions.length / 3)), workload, positions: args.positions, parameters: args.parameters, consumers: args.consumers ?? ["viewport"] };
  }
  retry(request: CurveWorkerRequest, options?: CurveWorkerSubmitOptions) { return this.submit({ ...request, requestId: `${request.requestId}:retry:${++this.counter}` }, options); }
  cancel(requestId: string) { const active = this.pending.get(requestId); if (!active) return; clearTimeout(active.timer); this.worker?.postMessage({ type: "cancel", requestId }); this.pending.delete(requestId); active.resolve(failedArtifact(active.request, active.cacheKey, "cancelled", { code: "CANCELLED", message: "Curve worker request cancelled.", retryable: true, detail: `Cancelled ${active.request.operation}.` })); }
  dispose() { [...this.pending.keys()].forEach((requestId) => this.cancel(requestId)); if (this.worker) { this.worker.removeEventListener("message", this.listener); this.worker.terminate(); this.worker = null; } }
  private receive(message: CurveWorkerOutbound) {
    const active = this.pending.get(message.requestId); if (!active) return;
    const current = this.currentRevision(active.request.curveId); const stale = this.latestByCurve.get(active.request.curveId) !== message.requestId || (current != null && current !== message.curveRevision);
    if (message.type === "progress") { if (!stale) active.onProgress?.(message); return; }
    clearTimeout(active.timer); this.pending.delete(message.requestId);
    if (stale) { active.resolve(failedArtifact(active.request, active.cacheKey, "stale-rejected", { code: "STALE_REVISION", message: `Rejected ${message.requestId}; current Curve revision no longer matches ${message.curveRevision}.`, retryable: true, detail: "A newer request or Curve edit superseded this worker result." })); return; }
    if (message.type === "error") { active.resolve(failedArtifact(active.request, active.cacheKey, message.code === "CANCELLED" ? "cancelled" : "failed", { code: message.code, message: message.message, retryable: message.retryable, detail: message.detail })); return; }
    const artifact: CurveComputationArtifact = { artifactId: `${active.cacheKey}:${message.requestId}`, cacheKey: active.cacheKey, state: "ready", operation: active.request.operation, curveId: active.request.curveId, curveRevision: active.request.curveRevision, output: message.output, statistics: message.statistics, warnings: message.warnings, runtimeMs: message.runtimeMs, consumers: active.request.consumers, createdAt: Date.now() };
    this.cache.set(active.cacheKey, artifact); active.resolve(artifact);
  }
}

export const createBrowserCurveWorkerCoordinator = (currentRevision?: (curveId: string) => number | null) => new CurveWorkerCoordinator(() => new Worker(new URL("../workers/curveComputationWorker.ts", import.meta.url), { type: "module" }) as unknown as CurveWorkerLike, new CurveDependencyCache(), currentRevision);
