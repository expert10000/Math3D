export type Graph2DSamplingJobHandle = Readonly<{
  jobId: string;
  objectId: string;
  generationKey: string;
  cancelled: () => boolean;
}>;
export type Graph2DSamplingJobDisposition = "accepted" | "stale" | "cancelled";

/** Small platform-neutral lifecycle guard for rejecting stale sampling output and releasing job records. */
export class Graph2DSamplingJobController {
  readonly #jobs = new Map<string, { objectId: string; generationKey: string; cancelled: boolean }>();
  readonly #current = new Map<string, string>();
  #sequence = 0;

  begin(objectId: string, generationKey: string): Graph2DSamplingJobHandle {
    if (!objectId || !generationKey) throw new TypeError("Sampling jobs require object and generation keys.");
    const previous = this.#current.get(objectId);
    if (previous) { const job = this.#jobs.get(previous); if (job) job.cancelled = true; }
    const jobId = `graph2d-sampling-${++this.#sequence}`;
    const job = { objectId, generationKey, cancelled: false };
    this.#jobs.set(jobId, job); this.#current.set(objectId, jobId);
    return Object.freeze({ jobId, objectId, generationKey, cancelled: () => job.cancelled });
  }

  cancel(jobId: string): boolean {
    const job = this.#jobs.get(jobId);
    if (!job) return false;
    job.cancelled = true;
    return true;
  }

  settle(handle: Graph2DSamplingJobHandle, currentGenerationKey: string): Graph2DSamplingJobDisposition {
    const job = this.#jobs.get(handle.jobId);
    if (!job) return "cancelled";
    const current = this.#current.get(job.objectId) === handle.jobId;
    const disposition = job.cancelled ? "cancelled" :
      !current || job.generationKey !== currentGenerationKey ? "stale" : "accepted";
    this.#jobs.delete(handle.jobId);
    if (current) this.#current.delete(job.objectId);
    return disposition;
  }

  get activeCount(): number { return this.#jobs.size; }
}
