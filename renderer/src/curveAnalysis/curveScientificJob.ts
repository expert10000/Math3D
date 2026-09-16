import { createScientificJobRequest, matchesScientificSourceGeneration, type AnalysisResultEnvelope, type ScientificSourceGeneration } from "@math3d/core";
import { createInProcessScientificJobService, createScientificExecutionBroker, type ScientificBrokerOutcome, type ScientificJobExecutionContext } from "@math3d/kernel";
import { CURVE_PERFORMANCE_BUDGETS, type CurveComputationArtifact, type CurveWorkerProgress, type CurveWorkerRequest } from "./curveComputation";
import { CurveWorkerCoordinator } from "./curveWorkerCoordinator";
import { CurveAnalysisKernelBridge } from "./curveAnalysisKernelBridge";

export const CURVE_SCIENTIFIC_OPERATION = "curve.analyze.worker";
type Pending = { request: CurveWorkerRequest; onProgress?: (progress: CurveWorkerProgress) => void; artifact?: CurveComputationArtifact; result?: AnalysisResultEnvelope };
export type CurveScientificOutcome = { artifact: CurveComputationArtifact | null; result: AnalysisResultEnvelope | null; broker: ScientificBrokerOutcome };
export type CurveScientificHandle = { requestId: string; promise: Promise<CurveScientificOutcome>; cancel: () => void };

/** F05/F08 lifecycle and backend selection around the existing revision-guarded Curve worker. */
export class CurveScientificJob {
  readonly #bridge: CurveAnalysisKernelBridge;
  readonly #coordinator: CurveWorkerCoordinator;
  readonly #pending = new Map<string, Pending>();
  readonly #workerHandles = new Map<string, ReturnType<CurveWorkerCoordinator["submit"]>>();
  readonly #resultsByCacheKey = new Map<string, AnalysisResultEnvelope>();
  readonly #service;
  readonly #broker;

  constructor(bridge: CurveAnalysisKernelBridge, coordinator: CurveWorkerCoordinator) {
    this.#bridge = bridge;
    this.#coordinator = coordinator;
    const resolveSource = (id: ScientificSourceGeneration["documentId"]) => {
      const current = bridge.source();
      return current?.documentId === id ? current : null;
    };
    this.#service = createInProcessScientificJobService({
      resolveSource,
      adapters: [{ operationType: CURVE_SCIENTIFIC_OPERATION, execute: (input, context) => this.#execute(input.jobId, input.source, context) }],
    });
    this.#broker = createScientificExecutionBroker({
      resolveSource,
      backends: [{
        backendId: "curve-worker", backendVersion: "1", transport: "worker", priority: 100, supportsCancellation: true,
        discover: () => ({ available: true, operations: [{ operationType: CURVE_SCIENTIFIC_OPERATION, retrySafety: "never", maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: 256 * 1024 * 1024, maxWorkUnits: 100_000_000 }] }),
        execute: (request) => this.#service.submit(request),
        cancel: (jobId) => { this.#service.cancel(jobId); this.#workerHandles.get(jobId)?.cancel(); },
      }],
    });
  }

  capabilities() { return this.#broker.discoverCapabilities(); }
  cache() { return this.#coordinator.cache; }
  cancel(jobId: string) { return this.#broker.cancel(jobId); }
  dispose() { for (const jobId of this.#pending.keys()) this.cancel(jobId); this.#coordinator.dispose(); }

  submit(request: CurveWorkerRequest, onProgress?: Pending["onProgress"]): CurveScientificHandle {
    const source = this.#bridge.source();
    if (!source) throw new TypeError("Curve worker job requires an active CurveDocument source.");
    const jobId = request.requestId;
    const budget = CURVE_PERFORMANCE_BUDGETS[request.workload];
    const pending: Pending = { request, onProgress };
    this.#pending.set(jobId, pending);
    const job = createScientificJobRequest({
      jobId, source,
      operation: { type: CURVE_SCIENTIFIC_OPERATION, payload: { operation: request.operation, curveId: request.curveId, curveRevision: request.curveRevision, workload: request.workload, targetCount: request.targetCount, tolerance: request.tolerance } },
      limits: { deadlineAt: Date.now() + budget.timeoutMs + 1_000, maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: Math.max(16 * 1024 * 1024, budget.maximumTransferBytes * 2), maxWorkUnits: 100_000_000 },
    });
    const promise = this.#broker.submit(job).then((broker): CurveScientificOutcome => ({ artifact: pending.artifact ?? null, result: pending.result ?? null, broker })).finally(() => {
      this.#pending.delete(jobId);
      this.#workerHandles.delete(jobId);
    });
    return { requestId: jobId, promise, cancel: () => { this.cancel(jobId); } };
  }

  async #execute(jobId: string, source: ScientificSourceGeneration, context: ScientificJobExecutionContext) {
    const pending = this.#pending.get(jobId);
    if (!pending) throw new TypeError("Curve worker input is unavailable.");
    context.consumeWork(Math.max(1, pending.request.targetCount));
    const handle = this.#coordinator.submit(pending.request, { onProgress: (progress) => {
      context.reportProgress({ completed: progress.fraction, total: 1, message: progress.phase });
      pending.onProgress?.(progress);
    } });
    this.#workerHandles.set(jobId, handle);
    const artifact = await handle.promise;
    pending.artifact = artifact;
    context.checkpoint();
    if (artifact.state !== "ready" && artifact.state !== "cached") throw new Error(artifact.failure?.message ?? `Curve worker ${artifact.state}.`);
    let result = this.#resultsByCacheKey.get(artifact.cacheKey) ?? null;
    if (result && !matchesScientificSourceGeneration(result.provenance.source, source)) result = null;
    if (!result) {
      result = this.#bridge.publish(pending.request, artifact.state === "cached" ? { ...artifact, state: "ready" } : artifact, source);
      if (result) this.#resultsByCacheKey.set(artifact.cacheKey, result);
    }
    if (!result) throw new Error("Curve source changed before artifact publication.");
    pending.result = result;
    return { artifactId: result.artifacts[0].artifactId, valueCount: artifact.output.length, runtimeMs: artifact.runtimeMs };
  }
}
