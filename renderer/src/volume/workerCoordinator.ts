import {
  VOLUME_MEMORY_LIMITS,
  VolumeJobCache,
  createVolumeMemoryPlan,
  volumeJobCacheKey,
  type VolumeJobArtifact,
  type VolumeJobFailure,
  type VolumeJobLifecycle,
  type VolumeJobProgress,
  type VolumeJobRequest,
  type VolumeWorkerInbound,
  type VolumeWorkerOutbound,
} from "./computation";

export type VolumeWorkerLike = {
  postMessage: (message: VolumeWorkerInbound, transfer?: Transferable[]) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) => void;
  terminate: () => void;
};

export type VolumeRevisionSnapshot = { volumeRevision: number; sampledGridRevision: number };
export type VolumeWorkerSubmitOptions = {
  timeoutMs?: number;
  onProgress?: (progress: VolumeJobProgress) => void;
  onLifecycle?: (state: VolumeJobLifecycle) => void;
};
export type VolumeWorkerHandle = { requestId: string; promise: Promise<VolumeJobArtifact>; cancel: () => void };
type Pending = { request: VolumeJobRequest; cacheKey: string; resolve: (artifact: VolumeJobArtifact) => void; timer: ReturnType<typeof setTimeout>; options: VolumeWorkerSubmitOptions };

const failureArtifact = (request: VolumeJobRequest, cacheKey: string, state: "cancelled" | "stale" | "failed", failure: VolumeJobFailure): VolumeJobArtifact => ({
  artifactId: `${request.requestId}:${state}`,
  cacheKey,
  state,
  operation: request.operation,
  volumeId: request.volumeId,
  volumeRevision: request.volumeRevision,
  sampledGridRevision: request.sampledGridRevision,
  output: {},
  profile: { wallTimeMs: 0, peakWorkingSetBytes: 0, transferredBytes: 0, cacheHit: false, backend: request.backend },
  warnings: [failure.message],
  failure,
  createdAt: Date.now(),
});

export class VolumeWorkerCoordinator {
  private worker: VolumeWorkerLike | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly latestByOperation = new Map<string, string>();
  private readonly lastValidByOperation = new Map<string, VolumeJobArtifact>();
  private readonly listener = (event: MessageEvent<VolumeWorkerOutbound>) => this.receive(event.data);
  private readonly workerFactory: () => VolumeWorkerLike;
  readonly cache: VolumeJobCache;
  private readonly currentRevision: (volumeId: string) => VolumeRevisionSnapshot | null;

  constructor(
    workerFactory: () => VolumeWorkerLike,
    cache = new VolumeJobCache(),
    currentRevision: (volumeId: string) => VolumeRevisionSnapshot | null = () => null,
  ) {
    this.workerFactory = workerFactory;
    this.cache = cache;
    this.currentRevision = currentRevision;
  }

  submit(request: VolumeJobRequest, options: VolumeWorkerSubmitOptions = {}): VolumeWorkerHandle {
    const { requestId: _requestId, scalars: _scalars, meshPositions: _meshPositions, meshIndices: _meshIndices, ...cacheInput } = request;
    const cacheKey = volumeJobCacheKey(cacheInput);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      options.onLifecycle?.("complete");
      return { requestId: request.requestId, promise: Promise.resolve(cached), cancel: () => undefined };
    }
    const memory = createVolumeMemoryPlan(request.operation, request.dimensions, request.scalars.byteLength);
    if (memory.level === "rejected") {
      options.onLifecycle?.("failed");
      return {
        requestId: request.requestId,
        promise: Promise.resolve(failureArtifact(request, cacheKey, "failed", { code: "MEMORY_LIMIT", message: memory.message, retryable: false })),
        cancel: () => undefined,
      };
    }
    const operationKey = `${request.volumeId}:${request.operation}`;
    this.latestByOperation.set(operationKey, request.requestId);
    options.onLifecycle?.("queued");
    let cancel: () => void = () => undefined;
    const promise = new Promise<VolumeJobArtifact>((resolve) => {
      const timer = setTimeout(() => {
        const active = this.pending.get(request.requestId);
        if (!active) return;
        this.worker?.postMessage({ type: "cancel", requestId: request.requestId });
        this.pending.delete(request.requestId);
        active.options.onLifecycle?.("failed");
        resolve(failureArtifact(request, cacheKey, "failed", { code: "TIMEOUT", message: `Volume worker timed out after ${options.timeoutMs ?? VOLUME_MEMORY_LIMITS.defaultTimeoutMs} ms.`, retryable: true }));
      }, options.timeoutMs ?? VOLUME_MEMORY_LIMITS.defaultTimeoutMs);
      this.pending.set(request.requestId, { request, cacheKey, resolve, timer, options });
      if (!this.worker) {
        this.worker = this.workerFactory();
        this.worker.addEventListener("message", this.listener);
      }
      const scalars = new Float32Array(request.scalars);
      const meshPositions = request.meshPositions ? new Float32Array(request.meshPositions) : undefined;
      const meshIndices = request.meshIndices ? new Uint32Array(request.meshIndices) : undefined;
      const transfer: Transferable[] = [scalars.buffer];
      if (meshPositions) transfer.push(meshPositions.buffer);
      if (meshIndices) transfer.push(meshIndices.buffer);
      this.worker.postMessage({ type: "run", request: { ...request, scalars, meshPositions, meshIndices } }, transfer);
      options.onLifecycle?.("running");
      cancel = () => this.cancel(request.requestId);
    });
    return { requestId: request.requestId, promise, cancel };
  }

  cancel(requestId: string): void {
    const active = this.pending.get(requestId);
    if (!active) return;
    clearTimeout(active.timer);
    this.pending.delete(requestId);
    this.worker?.postMessage({ type: "cancel", requestId });
    active.options.onLifecycle?.("cancelled");
    active.resolve(failureArtifact(active.request, active.cacheKey, "cancelled", { code: "CANCELLED", message: "Volume worker request cancelled.", retryable: true }));
  }

  getLastValid(volumeId: string, operation: VolumeJobRequest["operation"]): VolumeJobArtifact | null {
    return this.lastValidByOperation.get(`${volumeId}:${operation}`) ?? null;
  }

  diagnostics() {
    return { activeJobs: this.pending.size, cache: this.cache.summary(), backend: this.worker ? "native-worker" as const : "idle" as const };
  }

  dispose(): void {
    for (const requestId of [...this.pending.keys()]) this.cancel(requestId);
    if (this.worker) {
      this.worker.removeEventListener("message", this.listener);
      this.worker.terminate();
      this.worker = null;
    }
  }

  private receive(message: VolumeWorkerOutbound): void {
    const active = this.pending.get(message.requestId);
    if (!active) return;
    const revision = this.currentRevision(active.request.volumeId);
    const operationKey = `${active.request.volumeId}:${active.request.operation}`;
    const stale = this.latestByOperation.get(operationKey) !== message.requestId || (revision != null && (revision.volumeRevision !== message.volumeRevision || revision.sampledGridRevision !== message.sampledGridRevision));
    if (message.type === "progress") {
      if (!stale) {
        active.options.onLifecycle?.("progressive");
        active.options.onProgress?.(message);
      }
      return;
    }
    clearTimeout(active.timer);
    this.pending.delete(message.requestId);
    if (stale) {
      active.options.onLifecycle?.("stale");
      active.resolve(failureArtifact(active.request, active.cacheKey, "stale", { code: "STALE_REVISION", message: "A newer Volume revision or request superseded this worker result.", retryable: true }));
      return;
    }
    if (message.type === "error") {
      const state = message.code === "CANCELLED" ? "cancelled" : "failed";
      active.options.onLifecycle?.(state);
      active.resolve(failureArtifact(active.request, active.cacheKey, state, { code: message.code, message: message.message, retryable: message.retryable }));
      return;
    }
    const artifact: VolumeJobArtifact = {
      artifactId: `${active.cacheKey}:${message.requestId}`,
      cacheKey: active.cacheKey,
      state: "complete",
      operation: active.request.operation,
      volumeId: active.request.volumeId,
      volumeRevision: active.request.volumeRevision,
      sampledGridRevision: active.request.sampledGridRevision,
      output: message.output,
      profile: {
        wallTimeMs: message.wallTimeMs,
        peakWorkingSetBytes: message.peakWorkingSetBytes,
        transferredBytes: active.request.scalars.byteLength + Object.values(message.output).reduce((sum, value) => ArrayBuffer.isView(value) ? sum + value.byteLength : sum, 0),
        cacheHit: false,
        backend: active.request.backend,
      },
      warnings: [...message.warnings],
      createdAt: Date.now(),
    };
    this.cache.set(active.cacheKey, artifact);
    this.lastValidByOperation.set(operationKey, artifact);
    active.options.onLifecycle?.("complete");
    active.resolve(artifact);
  }
}

export const createBrowserVolumeWorkerCoordinator = (currentRevision?: (volumeId: string) => VolumeRevisionSnapshot | null) =>
  new VolumeWorkerCoordinator(
    () => new Worker(new URL("../workers/volumeComputationWorker.ts", import.meta.url), { type: "module" }) as unknown as VolumeWorkerLike,
    new VolumeJobCache(),
    currentRevision,
  );
