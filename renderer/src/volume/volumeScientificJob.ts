import { createScientificJobRequest, decodeM3DMeshResource, encodeM3DMeshResource, matchesScientificSourceGeneration, type ScientificSourceGeneration } from "@math3d/core";
import { createExecutionService, createInMemoryM3DResourceStore, createInProcessScientificJobService, createScientificExecutionBroker, type ScientificBrokerOutcome, type ScientificExecutionBroker, type ScientificJobExecutionContext } from "@math3d/kernel";
import { createVolumeMemoryPlan, VOLUME_MEMORY_LIMITS, type VolumeJobArtifact, type VolumeJobProgress, type VolumeJobRequest, type VolumeJobLifecycle } from "./computation";
import { VolumeWorkerCoordinator, type VolumeWorkerHandle } from "./workerCoordinator";
import type { VolumeDocumentAdapter } from "./volumeDocumentAdapter";

export const VOLUME_ISOSURFACE_OPERATION = "volume.contour";
type Pending = { request: VolumeJobRequest; source: ScientificSourceGeneration; onProgress?: (progress: VolumeJobProgress) => void; onLifecycle?: (lifecycle: VolumeJobLifecycle) => void; artifact?: VolumeJobArtifact };
export type VolumeScientificOutcome = { artifact: VolumeJobArtifact | null; broker: ScientificBrokerOutcome };
export type VolumeScientificHandle = { requestId: string; promise: Promise<VolumeScientificOutcome>; cancel: () => void };

/** F05/F08 admission, cancellation and backend discovery around the existing Volume worker. */
export class VolumeIsosurfaceScientificJob {
  readonly #adapter: () => VolumeDocumentAdapter;
  readonly #coordinator: VolumeWorkerCoordinator;
  readonly #pending = new Map<string, Pending>();
  readonly #handles = new Map<string, VolumeWorkerHandle>();
  readonly #service;
  readonly #broker: ScientificExecutionBroker;
  readonly #execution;
  readonly #resources = createInMemoryM3DResourceStore();
  readonly #resourceOwners = new Map<string, ScientificSourceGeneration>();

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
    this.#execution = createExecutionService(this.#broker);
  }
  capabilities() { return this.#broker.discoverCapabilities(); }
  executionCapabilities() { return this.#execution.discoverCapabilities(); }
  cancel(jobId: string) { return this.#execution.cancel(jobId); }
  resources() { this.#pruneStaleResources(this.#adapter().sourceGeneration()); return this.#resources.list(); }
  dispose() {
    for (const jobId of this.#pending.keys()) this.cancel(jobId);
    for (const ownerId of this.#resourceOwners.keys()) this.#resources.releaseOwner(ownerId);
    this.#resourceOwners.clear();
    this.#coordinator.dispose();
  }

  submit(request: VolumeJobRequest, options: Pick<Pending, "onProgress" | "onLifecycle"> = {}): VolumeScientificHandle {
    const plan = createVolumeMemoryPlan(request.operation, request.dimensions, request.scalars.byteLength);
    if (plan.level === "rejected") throw new RangeError(plan.message);
    const jobId = request.requestId;
    const source = this.#adapter().sourceGeneration();
    this.#pruneStaleResources(source);
    const pending: Pending = { request, source, ...options };
    this.#pending.set(jobId, pending);
    const job = createScientificJobRequest({
      jobId, source,
      operation: { type: VOLUME_ISOSURFACE_OPERATION, payload: { volumeId: request.volumeId, volumeRevision: request.volumeRevision, sampledGridRevision: request.sampledGridRevision, isoValue: Number(request.parameters.isoValue ?? 0), backend: request.backend } },
      limits: { deadlineAt: Date.now() + VOLUME_MEMORY_LIMITS.defaultTimeoutMs + 1_000, maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024,
        maxMemoryBytes: Math.max(16 * 1024 * 1024, plan.peakWorkingSetBytes), maxWorkUnits: 100_000_000 },
    });
    const promise = this.#execution.submit(job).then((broker): VolumeScientificOutcome => {
      if (!broker.ok) {
        this.#resources.releaseOwner(jobId);
        this.#resourceOwners.delete(jobId);
      }
      return { artifact: broker.ok ? pending.artifact ?? null : null, broker };
    }).finally(() => {
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
      let artifact = await handle.promise;
      if (artifact.state === "complete" && artifact.output.positions && artifact.output.indices) {
        const stored = this.#resources.retain(jobId, encodeM3DMeshResource({
          positions: artifact.output.positions,
          indices: artifact.output.indices,
        }));
        this.#resourceOwners.set(jobId, pending.source);
        const lease = this.#resources.acquire(stored.resourceId);
        if (!lease) throw new Error("Volume mesh resource was collected before publication.");
        try {
          const decoded = decodeM3DMeshResource(lease.bytes);
          artifact = {
            ...artifact,
            meshResourceId: stored.resourceId,
            output: { ...artifact.output, positions: decoded.positions, indices: decoded.indices },
          };
        } finally {
          lease.release();
        }
      }
      pending.artifact = artifact;
      context.checkpoint();
      if (artifact.state !== "complete") throw new Error(artifact.failure?.message ?? `Volume extraction ${artifact.state}.`);
      return { artifactId: artifact.artifactId, vertexCount: (artifact.output.positions?.length ?? 0) / 3, faceCount: (artifact.output.indices?.length ?? 0) / 3 };
    } catch (error) {
      this.#resources.releaseOwner(pending.request.requestId);
      this.#resourceOwners.delete(pending.request.requestId);
      throw error;
    } finally { context.releaseMemory(plan.peakWorkingSetBytes); }
  }

  #pruneStaleResources(source: ScientificSourceGeneration): void {
    for (const [ownerId, retainedSource] of this.#resourceOwners) {
      if (!matchesScientificSourceGeneration(retainedSource, source)) {
        this.#resources.releaseOwner(ownerId);
        this.#resourceOwners.delete(ownerId);
      }
    }
  }
}
