import { validateGeometryWorkerPublication, type GeometrySampledFieldProgress, type GeometrySampledFieldRequest } from "./sampledFieldAnalysis";

type WorkerLike = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
export class GeometrySamplingWorkerClient {
  private worker: WorkerLike;
  private progress: ((progress: GeometrySampledFieldProgress) => void) | null = null;
  private active: { requestId: string; sourceObjectId: string; sourceRevision: number; resolve: (value: GeometrySampledFieldProgress) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor(worker?: WorkerLike) {
    this.worker = worker ?? new Worker(new URL("../workers/geometryAnalysisWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<GeometrySampledFieldProgress>) => this.receive(event.data);
    this.worker.onerror = (event) => this.fail(new Error(event.message || "Geometry analysis worker failed."));
  }
  run(request: GeometrySampledFieldRequest, onProgress: (progress: GeometrySampledFieldProgress) => void, timeoutMs = 30_000): Promise<GeometrySampledFieldProgress> {
    if (this.active) {
      this.worker.postMessage({ type: "cancel", requestId: this.active.requestId });
      clearTimeout(this.active.timer);
      this.active.reject(new Error("Geometry sampling request superseded."));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.worker.postMessage({ type: "cancel", requestId: request.requestId }); this.fail(new Error(`Geometry sampling timed out after ${timeoutMs} ms.`)); }, timeoutMs);
      this.active = { requestId: request.requestId, sourceObjectId: request.sourceObjectId, sourceRevision: request.sourceRevision, resolve, reject, timer };
      this.progress = onProgress;
      this.worker.postMessage({ type: "run", request });
    });
  }
  cancel(): void { if (this.active) this.worker.postMessage({ type: "cancel", requestId: this.active.requestId }); }
  dispose(): void { if (this.active) { clearTimeout(this.active.timer); this.active.reject(new Error("Geometry sampling worker disposed.")); this.active = null; } this.worker.terminate(); }
  private receive(progress: GeometrySampledFieldProgress): void {
    const verdict = validateGeometryWorkerPublication(this.active, progress);
    if (verdict !== "accept" || !this.active) return;
    this.progress?.(progress);
    if (["complete", "cancelled", "failed", "stale", "superseded"].includes(progress.status)) {
      clearTimeout(this.active.timer);
      const active = this.active;
      this.active = null;
      this.progress = null;
      progress.status === "failed" ? active.reject(new Error(progress.warnings.join(" "))) : active.resolve(progress);
    }
  }
  private fail(error: Error): void { if (!this.active) return; clearTimeout(this.active.timer); const active = this.active; this.active = null; this.progress = null; active.reject(error); }
}
