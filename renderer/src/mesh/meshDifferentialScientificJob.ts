import {
  createAnalysisResultFromScientificJob, createScientificJobRequest, matchesScientificSourceGeneration,
  type AnalysisResultEnvelope, type ScientificJobLimits, type ScientificSourceGeneration,
} from "@math3d/core";
import {
  createInProcessScientificJobService, createScientificExecutionBroker,
  type ScientificBrokerOutcome, type ScientificExecutionBackend, type ScientificExecutionBroker,
  type ScientificJobExecutionContext,
} from "@math3d/kernel";
import { TRIANGLE_MESH_CURVATURE_PARAMETERS, type MeshDifferentialGeometryResult } from "./meshDifferentialGeometry";
import type { MeshAnalysisMeshIdentity } from "./analysisResultStore";
import type { SurfaceMeshData } from "./surfaceMesh";
import type { MeshAnalysisWorkerMessage, MeshAnalysisWorkerRequest } from "../workers/meshAnalysisWorkerTypes";
import type { MeshAnalysisKernelBridge } from "./meshAnalysisKernelBridge";

export const MESH_DIFFERENTIAL_OPERATION = "mesh.analyze.differential";
const BACKEND = "mesh-analysis-worker";
const VERSION = "1";
type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
type Pending = {
  mesh: SurfaceMeshData;
  identity: MeshAnalysisMeshIdentity;
  onProgress?: (phase: string, progress: number) => void;
};
export type MeshDifferentialJobOutcome =
  | { ok: true; result: AnalysisResultEnvelope; payload: MeshDifferentialGeometryResult; broker: Extract<ScientificBrokerOutcome, { ok: true }> }
  | { ok: false; broker: Extract<ScientificBrokerOutcome, { ok: false }> };

const limitsFor = (mesh: SurfaceMeshData): ScientificJobLimits => ({
  deadlineAt: Date.now() + 90_000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  maxMemoryBytes: Math.max(16 * 1024 * 1024, Math.min(512 * 1024 * 1024, mesh.positions.byteLength * 24 + (mesh.indices?.byteLength ?? 0) * 4)),
  maxWorkUnits: 1_000_000_000,
});

export class MeshDifferentialScientificJob {
  readonly #bridge: MeshAnalysisKernelBridge;
  readonly #makeWorker: () => WorkerPort;
  readonly #pending = new Map<string, Pending>();
  readonly #workers = new Map<string, WorkerPort>();
  readonly #service;
  readonly #broker: ScientificExecutionBroker;
  readonly #results = new Map<string, AnalysisResultEnvelope>();
  readonly #outcomes = new Map<string, ScientificBrokerOutcome>();
  #sequence = 0;

  constructor(
    bridge: MeshAnalysisKernelBridge,
    makeWorker: () => WorkerPort = () => new Worker(new URL("../workers/meshAnalysisWorker.ts", import.meta.url), { type: "module" }),
    additionalBackends: readonly ScientificExecutionBackend[] = [],
  ) {
    this.#bridge = bridge;
    this.#makeWorker = makeWorker;
    const resolveSource = (id: ScientificSourceGeneration["documentId"]) => {
      const current = bridge.source();
      return current?.documentId === id ? current : null;
    };
    this.#service = createInProcessScientificJobService({
      resolveSource,
      adapters: [{ operationType: MESH_DIFFERENTIAL_OPERATION, execute: (input, context) => this.#execute(input.jobId, input.source, context) }],
    });
    this.#broker = createScientificExecutionBroker({
      resolveSource,
      backends: [...additionalBackends, {
        backendId: BACKEND, backendVersion: VERSION, transport: "worker", priority: 100, supportsCancellation: true,
        discover: () => ({ available: true, operations: [{ operationType: MESH_DIFFERENTIAL_OPERATION, retrySafety: "never", maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: 512 * 1024 * 1024, maxWorkUnits: 1_000_000_000 }] }),
        execute: (request) => this.#service.submit(request),
        cancel: (jobId) => { this.#service.cancel(jobId); this.#workers.get(jobId)?.terminate(); },
      }],
    });
  }

  async capabilities() { return this.#broker.discoverCapabilities(); }
  results(): readonly AnalysisResultEnvelope[] { return [...this.#results.values()]; }
  outcomes(): readonly ScientificBrokerOutcome[] { return [...this.#outcomes.values()]; }
  cancel(jobId: string): boolean {
    const cancelled = this.#broker.cancel(jobId);
    if (cancelled) this.#workers.get(jobId)?.terminate();
    return cancelled;
  }

  cancelAll(): void {
    for (const jobId of this.#pending.keys()) this.cancel(jobId);
  }

  async submit(mesh: SurfaceMeshData, identity: MeshAnalysisMeshIdentity, onProgress?: Pending["onProgress"], options: { jobId?: string; limits?: ScientificJobLimits } = {}): Promise<MeshDifferentialJobOutcome> {
    const source = this.#bridge.source();
    if (!source) throw new TypeError("Mesh differential job requires a MeshDocument source.");
    this.#sequence += 1;
    const jobId = options.jobId ?? `mesh-differential/${this.#sequence}`;
    const artifactId = this.#bridge.beginDense(source, "curvature", "discrete-differential-geometry-v2", TRIANGLE_MESH_CURVATURE_PARAMETERS);
    this.#pending.set(jobId, { mesh, identity, onProgress });
    const job = createScientificJobRequest({
      jobId, source,
      operation: { type: MESH_DIFFERENTIAL_OPERATION, payload: { meshId: identity.meshId, meshRevision: identity.revision, method: "discrete-differential-geometry-v2" } },
      limits: options.limits ?? limitsFor(mesh),
    });
    try {
      const broker = await this.#broker.submit(job);
      this.#outcomes.set(jobId, broker);
      if (this.#outcomes.size > 24) this.#outcomes.delete(this.#outcomes.keys().next().value!);
      if (!broker.ok) {
        if (broker.code === "cancelled" || broker.code === "stale-source") this.#bridge.invalidateDense(artifactId);
        else {
          try { this.#bridge.failDense(artifactId, source, broker.scientificFailure?.code ?? broker.code, broker.message); }
          catch { this.#bridge.invalidateDense(artifactId); }
        }
        return { ok: false, broker };
      }
      const output = broker.result.output as { artifactId: string; computeTimeMs: number };
      const payload = this.#bridge.resolveDense(output.artifactId, source) as MeshDifferentialGeometryResult | null;
      if (!payload) throw new TypeError("Completed Mesh differential artifact is unavailable.");
      const handle = { artifactId: output.artifactId, kind: "binary" as const, role: "curvature-field" };
      const result = createAnalysisResultFromScientificJob({
        resultId: `mesh-job-result:${jobId}`, status: "numerical", jobResult: broker.result,
        currentSource: this.#bridge.source()!, algorithm: "discrete-differential-geometry", algorithmVersion: "2",
        parameters: TRIANGLE_MESH_CURVATURE_PARAMETERS, numericContext: { tolerance: { absolute: 0 } },
        engine: { name: BACKEND, version: VERSION }, elapsedMs: output.computeTimeMs,
        summary: { vertexCount: identity.vertexCount, faceCount: identity.faceCount }, artifacts: [handle],
      });
      this.#results.set(result.resultId, result);
      if (this.#results.size > 24) this.#results.delete(this.#results.keys().next().value!);
      return { ok: true, result, payload, broker };
    } finally {
      this.#pending.delete(jobId);
      this.#workers.get(jobId)?.terminate();
      this.#workers.delete(jobId);
    }
  }

  #execute(jobId: string, source: ScientificSourceGeneration, context: ScientificJobExecutionContext): Promise<{ artifactId: string; computeTimeMs: number }> {
    const pending = this.#pending.get(jobId);
    if (!pending) throw new TypeError("Mesh differential job input is unavailable.");
    context.consumeWork(Math.max(1, pending.identity.vertexCount + pending.identity.faceCount));
    return new Promise((resolve, reject) => {
      const worker = this.#makeWorker();
      this.#workers.set(jobId, worker);
      let settled = false;
      let timer: ReturnType<typeof setInterval> | null = null;
      const finish = (error: unknown, output?: { artifactId: string; computeTimeMs: number }) => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        worker.removeEventListener("message", onMessage as EventListener);
        worker.removeEventListener("error", onError as EventListener);
        worker.terminate();
        this.#workers.delete(jobId);
        if (error) reject(error); else resolve(output!);
      };
      const onError = (event: Event) => finish(new Error((event as ErrorEvent).message || "Mesh analysis worker failed."));
      const onMessage = (event: MessageEvent<MeshAnalysisWorkerMessage>) => {
        const message = event.data;
        if (!message || message.jobId !== jobId || message.meshRevision !== pending.identity.revision) return;
        try {
          context.checkpoint();
          if (message.type === "progress") {
            context.reportProgress({ completed: Math.max(0, Math.min(1, message.progress)), total: 1, message: message.phase });
            pending.onProgress?.(message.phase, message.progress);
          } else if (message.type === "differential-result" && message.ok) {
            const currentSource = this.#bridge.source();
            if (!currentSource || !matchesScientificSourceGeneration(source, currentSource)) throw new Error("Mesh source changed before differential publication.");
            const artifactId = this.#bridge.publishDense({
              kind: "curvature", variant: "discrete-differential-geometry-v2", mesh: pending.identity,
              parameters: TRIANGLE_MESH_CURVATURE_PARAMETERS, state: "ready", payload: message.result,
              backend: BACKEND, computeTimeMs: message.computeTimeMs,
            });
            context.checkpoint();
            finish(null, { artifactId, computeTimeMs: message.computeTimeMs });
          } else if (message.type === "error") finish(new Error(message.error));
        } catch (error) { finish(error); }
      };
      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", onError as EventListener);
      timer = setInterval(() => { try { context.checkpoint(); } catch (error) { finish(error); } }, 20);
      const request: MeshAnalysisWorkerRequest = {
        type: "compute-differential", jobId, meshRevision: pending.identity.revision,
        mesh: { positions: pending.mesh.positions, indices: pending.mesh.indices ?? null },
      };
      worker.postMessage(request);
    });
  }
}
