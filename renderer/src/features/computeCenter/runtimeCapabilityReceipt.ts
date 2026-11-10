import type { BrokerDiscoveryFailure, ComputeJobRecord } from "./scientificJobTelemetry";
import type { RuntimeCapabilityReport } from "./runtimeCapabilityReport";

const safeId = (value: string | null | undefined) => value && value.length <= 80 &&
  /^[a-z0-9][a-z0-9._-]*$/i.test(value) ? value : null;
const safeVersion = (value: string | null | undefined) => value && value.length <= 32 &&
  /^[0-9][0-9a-z.+_-]*$/i.test(value) ? value : null;
const safeHash = (value: string | null | undefined) => value && /^[a-f0-9]{64}$/i.test(value) ? value : null;

/** Only structured, bounded fields enter this export; freeform diagnostics and source IDs stay local. */
export function createRuntimeCapabilityReceipt(report: RuntimeCapabilityReport,
  jobs: readonly ComputeJobRecord[], discoveryFailures: readonly BrokerDiscoveryFailure[] = []) {
  const backendAliases = new Map<string, string>();
  const backendAlias = (id: string | null | undefined) => {
    if (!id) return null;
    if (!backendAliases.has(id)) backendAliases.set(id, `backend-${backendAliases.size + 1}`);
    return backendAliases.get(id)!;
  };
  return {
    schemaVersion: 1,
    kind: "math3d.runtime-capability-receipt",
    checkedAt: Number.isFinite(report.checkedAt) && report.checkedAt > 0 ? report.checkedAt : null,
    discoveryFailures: {
      probeFailed: discoveryFailures.filter(item => item.reason === "probe-failed").length,
      duplicateBackend: discoveryFailures.filter(item => item.reason === "duplicate-backend").length,
    },
    routes: report.routes.map((route, index) => ({
      id: `route-${index + 1}`, group: route.group, state: route.state,
      backendAlias: route.group === "broker" ? backendAlias(route.id.slice("broker-".length)) : null,
      version: safeVersion(route.version), transport: safeId(route.transport),
      packageVersion: safeVersion(route.packageVersion),
      launchOrigin: route.launchOrigin ?? null,
      artifactSha256: safeHash(route.artifactSha256),
      operations: (route.operations ?? []).map(safeId).filter((item): item is string => !!item),
    })),
    jobs: jobs.slice(0, 50).map((job, index) => ({
      jobId: `job-${index + 1}`, operationType: safeId(job.operationType), status: job.status,
      backendAlias: backendAlias(job.backendId), failureCode: safeId(job.failureCode),
      sourceRevision: job.source?.revision ?? null, sourceGeneration: job.source?.generation ?? null,
      hasResultReference: !!job.resultId,
      attempts: (job.attempts ?? []).slice(0, 16).map(attempt => ({
        backendAlias: backendAlias(attempt.backendId), backendVersion: safeVersion(attempt.backendVersion),
        transport: attempt.transport, attempt: attempt.attempt, outcome: attempt.outcome,
      })),
    })),
  };
}
