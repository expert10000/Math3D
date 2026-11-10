import type { ComputeJobRecord } from "./scientificJobTelemetry";
import type { RuntimeCapabilityReport } from "./runtimeCapabilityReport";

const safeId = (value: string | null | undefined) => value && value.length <= 80 &&
  /^[a-z0-9][a-z0-9._-]*$/i.test(value) ? value : null;
const safeVersion = (value: string | null | undefined) => value && value.length <= 32 &&
  /^[0-9][0-9a-z.+_-]*$/i.test(value) ? value : null;
const safeHash = (value: string | null | undefined) => value && /^[a-f0-9]{64}$/i.test(value) ? value : null;

/** Only structured, bounded fields enter this export; freeform diagnostics and source IDs stay local. */
export function createRuntimeCapabilityReceipt(report: RuntimeCapabilityReport,
  jobs: readonly ComputeJobRecord[]) {
  return {
    schemaVersion: 1,
    kind: "math3d.runtime-capability-receipt",
    checkedAt: Number.isFinite(report.checkedAt) && report.checkedAt > 0 ? report.checkedAt : null,
    routes: report.routes.map(route => ({
      id: safeId(route.id), group: route.group, state: route.state,
      version: safeVersion(route.version), transport: safeId(route.transport),
      packageVersion: safeVersion(route.packageVersion),
      launchOrigin: route.launchOrigin ?? null,
      artifactSha256: safeHash(route.artifactSha256),
      operations: (route.operations ?? []).map(safeId).filter((item): item is string => !!item),
    })),
    jobs: jobs.slice(0, 50).map(job => ({
      jobId: safeId(job.jobId), operationType: safeId(job.operationType), status: job.status,
      backendId: safeId(job.backendId), failureCode: safeId(job.failureCode),
      sourceRevision: job.source?.revision ?? null, sourceGeneration: job.source?.generation ?? null,
      resultId: safeId(job.resultId),
      attempts: (job.attempts ?? []).slice(0, 16).map(attempt => ({
        backendId: safeId(attempt.backendId), backendVersion: safeVersion(attempt.backendVersion),
        transport: attempt.transport, attempt: attempt.attempt, outcome: attempt.outcome,
      })),
    })),
  };
}
