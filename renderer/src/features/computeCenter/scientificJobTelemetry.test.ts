import { describe, expect, it } from "vitest";
import type { ScientificBackendCapabilitySnapshot, ScientificBrokerOutcome } from "@math3d/kernel";
import { discoverScientificBackendReport, getComputeJobs, linkComputeJobResult, observeBrokerJob, presentComputeJob, recordScientificJobEvent, registerBrokerDiscovery,
  type ComputeJobRecord } from "./scientificJobTelemetry";

const job = (changes: Partial<ComputeJobRecord>): ComputeJobRecord => ({ jobId: "job",
  operationType: "curve.analyze", status: "routing", progress: null, updatedAt: 0, ...changes });
const failure = (jobId: string, code: string): ScientificBrokerOutcome => ({ ok: false, jobId,
  code, message: `Backend returned ${code}`, attempts: [], schemaVersion: 1 } as ScientificBrokerOutcome);

describe("Compute Center job lifecycle", () => {
  it("reports failed discovery and duplicate backend identities without duplicating routes", async () => {
    const backend = { backendId: "unique-test-backend", backendVersion: "1", transport: "worker",
      availability: "available", operations: [] } as ScientificBackendCapabilitySnapshot;
    registerBrokerDiscovery("test-first", async () => [backend]);
    registerBrokerDiscovery("test-duplicate", async () => [backend]);
    registerBrokerDiscovery("test-rejected", async () => { throw Error("private credential must not leak"); });
    const report = await discoverScientificBackendReport();
    expect(report.backends.filter(item => item.backendId === "unique-test-backend")).toHaveLength(1);
    expect(report.failures).toEqual(expect.arrayContaining([
      { name: "test-duplicate", reason: "duplicate-backend" },
      { name: "test-rejected", reason: "probe-failed" },
    ]));
    expect(JSON.stringify(report)).not.toContain("credential");
  });
  it("distinguishes route refusal, stale source, timeout, cancellation and completion", () => {
    expect(presentComputeJob(job({ status: "routing" })).label).toBe("Checking route");
    expect(presentComputeJob(job({ status: "failed", failureCode: "capability-unavailable" })).label).toBe("Not admitted");
    expect(presentComputeJob(job({ status: "failed", failureCode: "invalid-request" })).label).toBe("Not admitted");
    expect(presentComputeJob(job({ status: "failed", failureCode: "stale-source" })).label).toBe("Source changed");
    expect(presentComputeJob(job({ status: "failed", failureCode: "deadline-exceeded" })).label).toBe("Timed out");
    expect(presentComputeJob(job({ status: "cancelled" })).label).toBe("Cancelled");
    expect(presentComputeJob(job({ status: "complete" })).detail).toContain("no saved Result reference");
    expect(presentComputeJob(job({ status: "complete", resultId: "saved-result" })).detail).toContain("Saved Result saved-result");
  });
  it("records broker admission refusal and cancellation as separate outcomes", async () => {
    for (const [id, code, status] of [["job-admission", "capability-unavailable", "failed"],
      ["job-cancel", "cancelled", "cancelled"]] as const) {
      await observeBrokerJob(id, "curve.analyze", Promise.resolve(failure(id, code)));
      const recorded = getComputeJobs().find(item => item.jobId === id);
      expect(recorded).toMatchObject({ status, failureCode: code, attemptCount: 0 });
    }
  });
  it("keeps the final broker outcome after late worker events", async () => {
    const id = "job-late-event";
    await observeBrokerJob(id, "curve.analyze", Promise.resolve(failure(id, "stale-source")));
    recordScientificJobEvent({ jobId: id, operationType: "curve.analyze",
      type: "scientific-job.progressed", sequence: 9, schemaVersion: 1,
      source: { documentId: "source", revision: 1, generation: 1, structuralHash: "hash" },
      progress: { completed: 1, total: 1 } } as Parameters<typeof recordScientificJobEvent>[0]);
    expect(getComputeJobs().find(item => item.jobId === id)).toMatchObject({
      status: "failed", failureCode: "stale-source",
    });
  });
  it("retains actual fallback attempts, source generation, and only a saved Result link", async () => {
    const id = "job-fallback-trace";
    const source = { documentId: "curve-source", revision: 3, generation: 2, structuralHash: "source-hash" };
    const attempts = [
      { backendId: "worker-a", backendVersion: "1", transport: "worker", attempt: 1, outcome: "transport-failed", retryable: true },
      { backendId: "worker-b", backendVersion: "2", transport: "worker", attempt: 1, outcome: "succeeded", retryable: false },
    ];
    await observeBrokerJob(id, "curve.analyze", Promise.resolve({ ok: true, jobId: id, schemaVersion: 1,
      backend: { backendId: "worker-b", backendVersion: "2", transport: "worker" }, attempts,
      result: { ok: true, jobId: id, schemaVersion: 1, operationType: "curve.analyze", source, output: {}, outputBytes: 2 },
    } as ScientificBrokerOutcome));
    expect(getComputeJobs().find(item => item.jobId === id)).toMatchObject({
      status: "complete", backendId: "worker-b", source, attemptCount: 2, attempts,
    });
    expect(getComputeJobs().find(item => item.jobId === id)?.resultId).toBeUndefined();
    linkComputeJobResult(id, "saved-result-1");
    expect(getComputeJobs().find(item => item.jobId === id)?.resultId).toBe("saved-result-1");
    const failedId = "job-no-result";
    await observeBrokerJob(failedId, "curve.analyze", Promise.resolve(failure(failedId, "scientific-failure")));
    linkComputeJobResult(failedId, "invalid-result");
    expect(getComputeJobs().find(item => item.jobId === failedId)?.resultId).toBeUndefined();
  });
});
