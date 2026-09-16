import { createScientificJobRequest, type ScientificSourceGeneration } from "@math3d/core";
import { createInProcessScientificJobService, createScientificExecutionBroker, type ScientificBrokerOutcome, type ScientificJobExecutionContext } from "@math3d/kernel";
import { createVolumeMemoryPlan, VOLUME_MEMORY_LIMITS, type VolumeJobArtifact, type VolumeJobProgress, type VolumeJobRequest, type VolumeJobLifecycle } from "./computation";
import { VolumeWorkerCoordinator, type VolumeWorkerHandle } from "./workerCoordinator";
import type { VolumeDocumentAdapter } from "./volumeDocumentAdapter";

export const VOLUME_ISOSURFACE_OPERATION = "volume.extract.isosurface";
type Pending = { request: VolumeJobRequest; onProgress?: (progress: VolumeJobProgress) => void; onLifecycle?: (lifecycle: VolumeJobLifecycle) => void; artifact?: VolumeJobArtifact };
export type VolumeScientificOutcome = { artifact: VolumeJobArtifact | null; broker: ScientificBrokerOutcome };
export type VolumeScientificHandle = { requestId: string; promise: Promise<VolumeScientificOutcome>; cancel: () => void };

/** F05/F08 admission, cancellation and backend discovery around the existing Volume worker. */
export class VolumeIsosurfaceScientificJob {
  readonly #adapter: () => VolumeDocumentAdapter;
  readonly #coordinator: VolumeWorkerCoordinator;
  readonly #pending = new Map<string, Pending>();
  readonly #handles = new Map<string, VolumeWorkerHandle>();
  readonly #service;
  readonly #broker;

  constructor(adapter: () => VolumeDocumentAdapter, coordinator: VolumeWorkerCoordinator) {
    this.#adapter = adapter;
    this.#coordinator = coordinator;
    const resolveSource = (id: ScientificSourceGeneration["documentId"]) => {
      const current = adapter().sourceGeneration();
      return current.documentId === id ? current : null;
    };
    this.#service = createInProcessScientificJobService({
      resolveSource,
      adapters: [{ operationType: VOLUME_ISOSURFACE_OPERATION, execute: (input, context) => this.#execute(input.jobId, context) }],
    });
    this.#broker = createScientificExecutionBroker({
      resolveSource,
      backends: [{
        backendId: "volume-native-worker", backendVersion: "1", transport: "worker", priority: 100, supportsCancellation: true,
        discover: () => ({ available: true, operations: [{ operationType: VOLUME_ISOSURFACE_OPERATION, retrySafety: "never", maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: VOLUME_MEMORY_LIMITS.hardBytes, maxWorkUnits: 100_000_000 }] }),
        execute: (request) => this.#service.submit(request),
        cancel: (jobId) => { this.#service.cancel(jobId); this.#handles.get(jobId)?.cancel(); },
      }],
    });
  }
  capabilities() { return this.#broker.discoverCapabilities(); }
  cancel(jobId: string) { return this.#broker.cancel(jobId); }
  dispose() { for (const jobId of this.#pending.keys()) this.cancel(jobId); this.#coordinator.dispose(); }

  submit(request: VolumeJobRequest, options: Pick<Pending, "onProgress" | "onLifecycle"> = {}): VolumeScientificHandle {
    const plan = createVolumeMemoryPlan(request.operation, request.dimensions, request.scalars.byteLength);
    if (plan.level === "rejected") throw new RangeError(plan.message);
    const jobId = request.requestId;
    const source = this.#adapter().sourceGeneration();
    const pending: Pending = { request, ...options };
    this.#pending.set(jobId, pending);
    const job = createScientificJobRequest({
      jobId, source,
      operation: { type: VOLUME_ISOSURFACE_OPERATION, payload: { volumeId: request.volumeId, volumeRevision: request.volumeRevision, sampledGridRevision: request.sampledGridRevision, isoValue: Number(request.parameters.isoValue ?? 0), backend: request.backend } },
      limits: { deadlineAt: Date.now() + VOLUME_MEMORY_LIMITS.defaultTimeoutMs + 1_000, maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024,
        maxMemoryBytes: Math.max(16 * 1024 * 1024, plan.peakWorkingSetBytes), maxWorkUnits: 100_000_000 },
    });
    const promise = this.#broker.submit(job).then((broker): VolumeScientificOutcome => ({ artifact: pending.artifact ?? null, broker })).finally(() => {
      this.#pending.delete(jobId); this.#handles.delete(jobId);
    });
    return { requestId: jobId, promise, cancel: () => { this.cancel(jobId); } };
  }

  async #execute(jobId: string, context: ScientificJobExecutionContext) {
    const pending = this.#pending.get(jobId);
    if (!pending) throw new TypeError("Volume extraction input is unavailable.");
    const plan = createVolumeMemoryPlan(pending.request.operation, pending.request.dimensions, pending.request.scalars.byteLength);
    context.consumeWork(pending.request.dimensions[0] * pending.request.dimensions[1] * pending.request.dimensions[2]);
    context.reserveMemory(plan.peakWorkingSetBytes);
    try {
      const handle = this.#coordinator.submit(pending.request, { onLifecycle: pending.onLifecycle, onProgress: (progress) => {
        context.reportProgress({ completed: progress.progress, total: 1, message: progress.phase });
        pending.onProgress?.(progress);
      } });
      this.#handles.set(jobId, handle);
      const artifact = await handle.promise;
      pending.artifact = artifact;
      context.checkpoint();
      if (artifact.state !== "complete") throw new Error(artifact.failure?.message ?? `Volume extraction ${artifact.state}.`);
      return { artifactId: artifact.artifactId, vertexCount: (artifact.output.positions?.length ?? 0) / 3, faceCount: (artifact.output.indices?.length ?? 0) / 3 };
    } finally { context.releaseMemory(plan.peakWorkingSetBytes); }
  }
}
