import type { ScientificJobEvent, ScientificSourceGeneration } from "@math3d/core";
import type { ScientificBackendCapabilitySnapshot, ScientificBrokerAttempt, ScientificBrokerOutcome } from "@math3d/kernel";

export type ComputeJobStatus = "routing" | "running" | "complete" | "failed" | "cancelled";
export type ComputeJobRecord = Readonly<{
  jobId: string;
  operationType: string;
  status: ComputeJobStatus;
  progress: number | null;
  phase?: string;
  backendId?: string;
  failure?: string;
  failureCode?: string;
  attemptCount?: number;
  attempts?: readonly ScientificBrokerAttempt[];
  source?: ScientificSourceGeneration;
  resultId?: string;
  updatedAt: number;
}>;

export type ComputeJobPresentation = Readonly<{ label: string; detail: string;
  tone: "current" | "pending" | "warning" | "error" }>;
const admissionFailures = new Set(["invalid-request", "duplicate-job", "capability-unavailable",
  "transport-unavailable"]);

export function presentComputeJob(job: ComputeJobRecord): ComputeJobPresentation {
  if (job.status === "routing") return { label: "Checking route", detail: "Checking admission and backend capability.", tone: "pending" };
  if (job.status === "running") return { label: "Running", detail: job.phase ?? "The backend is processing this job.", tone: "pending" };
  if (job.status === "complete") return { label: "Completed", detail: job.resultId ?
    `The backend returned a result. Saved Result ${job.resultId} is available for scientific verification.` :
    "The backend returned a result. This job history has no saved Result reference.", tone: "current" };
  if (job.status === "cancelled") return { label: "Cancelled", detail: job.failure ?? "The job was cancelled before completion.", tone: "warning" };
  const code = job.failureCode;
  const label = code && admissionFailures.has(code) ? "Not admitted" : code === "stale-source" ?
    "Source changed" : code === "deadline-exceeded" ? "Timed out" : "Failed";
  return { label, detail: job.failure ?? code ?? "The job failed without a reported reason.", tone: "error" };
}

const listeners = new Set<() => void>();
let jobs: readonly ComputeJobRecord[] = [];
const brokerSettled = new Set<string>();
const brokerDiscoverers = new Map<string, () => Promise<readonly ScientificBackendCapabilitySnapshot[]>>();
export type BrokerDiscoveryFailure = Readonly<{ name: string; reason: "probe-failed" | "duplicate-backend" }>;

export function registerBrokerDiscovery(name: string, discover: () => Promise<readonly ScientificBackendCapabilitySnapshot[]>): () => void {
  brokerDiscoverers.set(name, discover);
  return () => { if (brokerDiscoverers.get(name) === discover) brokerDiscoverers.delete(name); };
}

export async function discoverScientificBackends(): Promise<readonly ScientificBackendCapabilitySnapshot[]> {
  return (await discoverScientificBackendReport()).backends;
}

export async function discoverScientificBackendReport(): Promise<{
  backends: readonly ScientificBackendCapabilitySnapshot[]; failures: readonly BrokerDiscoveryFailure[]
}> {
  const entries = [...brokerDiscoverers.entries()];
  const results = await Promise.allSettled(entries.map(([, discover]) => discover()));
  const backends: ScientificBackendCapabilitySnapshot[] = [];
  const failures: BrokerDiscoveryFailure[] = [];
  const seen = new Set<string>();
  results.forEach((result, index) => {
    const name = entries[index][0];
    if (result.status === "rejected") { failures.push({ name, reason: "probe-failed" }); return; }
    for (const backend of result.value) {
      if (seen.has(backend.backendId)) { failures.push({ name, reason: "duplicate-backend" }); continue; }
      seen.add(backend.backendId);
      backends.push(backend);
    }
  });
  return { backends, failures };
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

/** Attach an actual saved Result only after its producer has persisted it. */
export function linkComputeJobResult(jobId: string, resultId: string): void {
  const existing = jobs.find(item => item.jobId === jobId);
  if (existing?.status === "complete" && resultId) publish({ ...existing, resultId });
}

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
      event.type === "scientific-job.completed" ? "complete" :
        event.type === "scientific-job.submitted" ? "routing" : "running",
    progress,
    phase: event.progress?.message ?? existing.phase,
    failure: event.failureCode ?? existing.failure,
    failureCode: event.failureCode ?? existing.failureCode,
    source: event.source,
    updatedAt: Date.now(),
  });
}

/** Observes the existing broker promise; this store never schedules or executes work. */
export function observeBrokerJob<T extends ScientificBrokerOutcome>(
  jobId: string,
  operationType: string,
  promise: Promise<T>,
  preferredBackendId?: string,
): Promise<T> {
  brokerSettled.delete(jobId);
  publish({ jobId, operationType, status: "routing", progress: null,
    backendId: preferredBackendId, updatedAt: Date.now() });
  return promise.then((outcome) => {
    brokerSettled.add(jobId);
    const existing = jobs.find((item) => item.jobId === jobId);
    publish({
      jobId, operationType,
      status: outcome.ok ? "complete" : outcome.code === "cancelled" ? "cancelled" : "failed",
      progress: outcome.ok ? 1 : existing?.progress ?? null,
      phase: existing?.phase,
      backendId: outcome.ok ? outcome.backend.backendId : outcome.attempts.at(-1)?.backendId ?? existing?.backendId,
      failure: outcome.ok ? undefined : outcome.message,
      failureCode: outcome.ok ? undefined : outcome.code,
      attemptCount: outcome.attempts.length,
      attempts: [...outcome.attempts],
      source: outcome.ok ? outcome.result.source : existing?.source ?? outcome.scientificFailure?.source,
      updatedAt: Date.now(),
    });
    return outcome;
  }, (error: unknown) => {
    brokerSettled.add(jobId);
    const existing = jobs.find((item) => item.jobId === jobId);
    publish({ jobId, operationType, status: "failed", progress: existing?.progress ?? null,
      backendId: existing?.backendId, failure: error instanceof Error ? error.message : String(error),
      source: existing?.source,
      updatedAt: Date.now() });
    throw error;
  });
}
