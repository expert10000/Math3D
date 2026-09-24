import type {
  VtkPreviewJobRequest,
  VtkPreviewJobSnapshot,
  WorkerComputeJobStatus,
  WorkerEngineIdentity,
} from "@math3d/core";

export type MobileComputeJob = {
  jobId: string;
  surfaceId: string;
  workerBaseUrl: string;
  request: VtkPreviewJobRequest;
  status: WorkerComputeJobStatus;
  progress: number;
  phase?: string;
  message?: string;
  error?: string;
  diagnostics: string[];
  engine?: WorkerEngineIdentity;
  createdAt: number;
  updatedAt: number;
  attempt: number;
};

export const createMobileComputeJobId = (now = Date.now()): string =>
  `mobile-vtk-preview-${now}-${Math.random().toString(36).slice(2, 10)}`;

export const createMobileComputeJob = (input: {
  surfaceId: string;
  workerBaseUrl: string;
  request: VtkPreviewJobRequest;
  attempt?: number;
  now?: number;
}): MobileComputeJob => {
  const now = input.now ?? Date.now();
  return {
    jobId: input.request.jobId,
    surfaceId: input.surfaceId,
    workerBaseUrl: input.workerBaseUrl,
    request: input.request,
    status: "queued",
    progress: 0,
    phase: "queued",
    message: "Waiting for desktop worker.",
    diagnostics: [],
    createdAt: now,
    updatedAt: now,
    attempt: Math.max(1, input.attempt ?? 1),
  };
};

export const mergeMobileComputeJobSnapshot = (
  job: MobileComputeJob,
  snapshot: VtkPreviewJobSnapshot
): MobileComputeJob => {
  if (snapshot.jobId !== job.jobId) return job;
  return {
    ...job,
    status: snapshot.status,
    progress: Math.max(0, Math.min(100, Math.round(snapshot.progress))),
    phase: snapshot.phase,
    message: snapshot.message,
    error: snapshot.error,
    diagnostics: snapshot.diagnostics ?? [],
    engine: snapshot.engine,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
};

export const isMobileComputeJobTerminal = (status: WorkerComputeJobStatus): boolean =>
  status === "succeeded" || status === "failed" || status === "cancelled";

export const canResumeMobileComputeJob = (
  job: MobileComputeJob,
  workerBaseUrl: string,
  inputHash: string
): boolean =>
  job.workerBaseUrl === workerBaseUrl &&
  job.request.inputHash === inputHash &&
  (job.status === "queued" || job.status === "running");
