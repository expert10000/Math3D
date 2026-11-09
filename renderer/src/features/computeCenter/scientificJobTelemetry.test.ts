import { describe, expect, it } from "vitest";
import type { ScientificBrokerOutcome } from "@math3d/kernel";
import { getComputeJobs, observeBrokerJob, presentComputeJob, recordScientificJobEvent,
  type ComputeJobRecord } from "./scientificJobTelemetry";

const job = (changes: Partial<ComputeJobRecord>): ComputeJobRecord => ({ jobId: "job",
  operationType: "curve.analyze", status: "routing", progress: null, updatedAt: 0, ...changes });
const failure = (jobId: string, code: string): ScientificBrokerOutcome => ({ ok: false, jobId,
  code, message: `Backend returned ${code}`, attempts: [], schemaVersion: 1 } as ScientificBrokerOutcome);

describe("Compute Center job lifecycle", () => {
  it("distinguishes route refusal, stale source, timeout, cancellation and completion", () => {
    expect(presentComputeJob(job({ status: "routing" })).label).toBe("Checking route");
    expect(presentComputeJob(job({ status: "failed", failureCode: "capability-unavailable" })).label).toBe("Not admitted");
    expect(presentComputeJob(job({ status: "failed", failureCode: "invalid-request" })).label).toBe("Not admitted");
    expect(presentComputeJob(job({ status: "failed", failureCode: "stale-source" })).label).toBe("Source changed");
    expect(presentComputeJob(job({ status: "failed", failureCode: "deadline-exceeded" })).label).toBe("Timed out");
    expect(presentComputeJob(job({ status: "cancelled" })).label).toBe("Cancelled");
    expect(presentComputeJob(job({ status: "complete" })).detail).toContain("Inspect its Result record");
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
});
