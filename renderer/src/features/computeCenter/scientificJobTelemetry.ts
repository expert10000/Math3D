import type { ScientificJobEvent } from "@math3d/core";
import type { ScientificBackendCapabilitySnapshot, ScientificBrokerOutcome } from "@math3d/kernel";

export type ComputeJobStatus = "routing" | "running" | "complete" | "failed" | "cancelled";
export type ComputeJobRecord = Readonly<{
  jobId: string;
  operationType: string;
  status: ComputeJobStatus;
  progress: number | null;
  phase?: string;
  backendId?: string;
  failure?: string;
  updatedAt: number;
}>;

const listeners = new Set<() => void>();
let jobs: readonly ComputeJobRecord[] = [];
const brokerSettled = new Set<string>();
const brokerDiscoverers = new Map<string, () => Promise<readonly ScientificBackendCapabilitySnapshot[]>>();

export function registerBrokerDiscovery(name: string, discover: () => Promise<readonly ScientificBackendCapabilitySnapshot[]>): void {
  brokerDiscoverers.set(name, discover);
}

export async function discoverScientificBackends(): Promise<readonly ScientificBackendCapabilitySnapshot[]> {
  const results = await Promise.allSettled([...brokerDiscoverers.values()].map((discover) => discover()));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

const publish = (record: ComputeJobRecord) => {
  jobs = [record, ...jobs.filter((item) => item.jobId !== record.jobId)].slice(0, 50);
  for (const jobId of brokerSettled) if (!jobs.some((item) => item.jobId === jobId)) brokerSettled.delete(jobId);
  for (const listener of listeners) listener();
};

export const subscribeComputeJobs = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getComputeJobs = () => jobs;

export function recordScientificJobEvent(event: ScientificJobEvent): void {
  if (brokerSettled.has(event.jobId)) return;
  const existing = jobs.find((item) => item.jobId === event.jobId);
  if (!existing) return;
  const progress = event.progress?.total
    ? Math.max(0, Math.min(1, event.progress.completed / event.progress.total))
    : existing.progress;
  publish({
    ...existing,
    status: event.type === "scientific-job.cancelled" ? "cancelled" :
      event.type === "scientific-job.failed" || event.type === "scientific-job.timed-out" || event.type === "scientific-job.stale-rejected" ? "failed" :
      event.type === "scientific-job.completed" ? "complete" : "running",
    progress,
    phase: event.progress?.message ?? existing.phase,
    failure: event.failureCode ?? existing.failure,
    updatedAt: Date.now(),
  });
}

/** Observes the existing broker promise; this store never schedules or executes work. */
export function observeBrokerJob<T extends ScientificBrokerOutcome>(
  jobId: string,
  operationType: string,
  promise: Promise<T>,
): Promise<T> {
  brokerSettled.delete(jobId);
  publish({ jobId, operationType, status: "routing", progress: null, updatedAt: Date.now() });
  return promise.then((outcome) => {
    brokerSettled.add(jobId);
    const existing = jobs.find((item) => item.jobId === jobId);
    publish({
      jobId, operationType,
      status: outcome.ok ? "complete" : outcome.code === "cancelled" ? "cancelled" : "failed",
      progress: outcome.ok ? 1 : existing?.progress ?? null,
      phase: existing?.phase,
      backendId: outcome.ok ? outcome.backend.backendId : outcome.attempts.at(-1)?.backendId,
      failure: outcome.ok ? undefined : outcome.message,
      updatedAt: Date.now(),
    });
    return outcome;
  }, (error: unknown) => {
    brokerSettled.add(jobId);
    publish({ jobId, operationType, status: "failed", progress: null, failure: error instanceof Error ? error.message : String(error), updatedAt: Date.now() });
    throw error;
  });
}
