import { describe, expect, it } from "vitest";
import { getComputeJobs } from "../features/computeCenter/scientificJobTelemetry";
import { runSageSimplifyJob } from "./sageSimplifyExecution";

const request = (jobId: string, backend: "local" | "docker" = "local") => ({
  operation: "sage.symbolic.simplify" as const,
  backend,
  jobId,
  params: { expression: "sin(x)^2 + cos(x)^2", variables: ["x"] },
});

describe("Sage simplification execution contract", () => {
  it("routes a successful Sage result through the scientific broker and reports it to Compute", async () => {
    const calls: unknown[] = [];
    const handle = runSageSimplifyJob(request("sage-simplify-test-success", "docker"), {
      run: async (input) => {
        calls.push(input);
        return { engine: "sagemath", operation: input.operation, success: true,
          latex: "1", result: { text: "1" }, warnings: [] };
      },
    });
    const { response, broker } = await handle.promise;
    expect(calls).toMatchObject([{ operation: "sage.symbolic.simplify", backend: "docker",
      params: { expression: "sin(x)^2 + cos(x)^2", variables: ["x"] } }]);
    expect(broker.ok).toBe(true);
    if (broker.ok) expect(broker.backend.backendId).toBe("sage-docker");
    expect(response.result.text).toBe("1");
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
      operationType: "symbolic.simplify", status: "complete", backendId: "sage-docker",
    });
  });

  it("preserves scientific rejection diagnostics as a failed job", async () => {
    const handle = runSageSimplifyJob(request("sage-simplify-test-rejection"), {
      run: async (input) => ({ engine: "sagemath", operation: input.operation, success: false,
        latex: "", result: {}, warnings: [], error: "unsupported syntax" }),
    });
    const { response, broker } = await handle.promise;
    expect(response.error).toBe("unsupported syntax");
    expect(broker).toMatchObject({ ok: false, code: "scientific-failure" });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.status).toBe("failed");
  });

  it("cancels the broker job and propagates cancellation to the WSL worker", async () => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    let cancelCount = 0;
    const handle = runSageSimplifyJob(request("sage-simplify-test-cancel"), {
      run: async () => { started(); return new Promise<never>(() => undefined); },
      cancel: () => { cancelCount += 1; },
    });
    await running;
    expect(handle.cancel()).toBe(true);
    const { response, broker } = await handle.promise;
    expect(broker).toMatchObject({ ok: false, code: "cancelled" });
    expect(response.error).toBe("Sage symbolic job cancelled.");
    expect(cancelCount).toBe(1);
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.status).toBe("cancelled");
  });
});
