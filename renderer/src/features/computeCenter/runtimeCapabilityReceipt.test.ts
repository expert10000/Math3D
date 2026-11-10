import { describe, expect, it } from "vitest";
import { createRuntimeCapabilityReceipt } from "./runtimeCapabilityReceipt";
import type { RuntimeCapabilityReport } from "./runtimeCapabilityReport";
import type { ComputeJobRecord } from "./scientificJobTelemetry";

describe("runtime capability receipt", () => {
  it("exports route and job evidence without diagnostic paths, URLs, source IDs or messages", () => {
    const secret = "secret-token-42";
    const report: RuntimeCapabilityReport = { checkedAt: 42, routes: [{
      id: "python", label: "Python", group: "local", state: "unavailable",
      detail: `C:\\private\\${secret} https://example.test/?token=${secret}`,
      version: "1.7.0", transport: "bundled-exe", operationCount: null,
      launchOrigin: "override", packageVersion: "2.0.0", artifactSha256: "a".repeat(64),
    }] };
    const jobs: ComputeJobRecord[] = [{ jobId: "job-1", operationType: "curve.analyze",
      status: "failed", progress: null, backendId: "worker-a", failureCode: "transport-failed",
      failure: `Bearer ${secret}`, source: { documentId: `C:\\private\\${secret}`,
        revision: 3, generation: 2, structuralHash: secret }, updatedAt: 42,
      attempts: [{ backendId: "worker-a", backendVersion: "1", transport: "worker",
        attempt: 1, outcome: "transport-failed", retryable: true }],
    }];
    const receipt = createRuntimeCapabilityReceipt(report, jobs);
    const json = JSON.stringify(receipt);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("private");
    expect(json).not.toContain("example.test");
    expect(receipt.routes[0]).toMatchObject({ state: "unavailable", artifactSha256: "a".repeat(64) });
    expect(receipt.jobs[0]).toMatchObject({ failureCode: "transport-failed", sourceRevision: 3,
      sourceGeneration: 2, attempts: [{ backendId: "worker-a", outcome: "transport-failed" }] });
  });
});
