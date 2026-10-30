import { describe, expect, it } from "vitest";
import { getComputeJobs } from "../features/computeCenter/scientificJobTelemetry";
import { runSageJob, SAGE_JOB_OPERATIONS, type BrokeredSageOperation } from "./sageOperationExecution";

const operations = Object.keys(SAGE_JOB_OPERATIONS) as BrokeredSageOperation[];
const paramsFor = (operation: BrokeredSageOperation, backend: "local" | "docker") =>
  operation.startsWith("sage.polynomial.")
    ? backend === "local"
      ? { coefficients: ["-2", "0", "1"] }
      : { polynomial: "(-2)*x^0 + (0)*x^1 + (1)*x^2", variables: ["x"] }
    : { expression: "x^2+y^2+z^2", variables: ["x", "y", "z"] };

describe("Sage scientific execution contract", () => {
  for (const operation of operations) {
    for (const backend of ["local", "docker"] as const) {
      it(`routes ${operation} on ${backend} with its exact payload and reports completion`, async () => {
        const params = paramsFor(operation, backend);
        const calls: unknown[] = [];
        const handle = runSageJob({ operation, backend, params }, {
          run: async (input) => {
            calls.push(input);
            return { engine: "sagemath", operation: input.operation, success: true,
              latex: "1", result: { text: "result" }, warnings: [] };
          },
        });
        const { response, broker } = await handle.promise;
        expect(calls).toMatchObject([{ operation, backend, params, jobId: handle.jobId }]);
        expect(broker.ok).toBe(true);
        if (broker.ok) expect(broker.backend.backendId).toBe(backend === "local" ? "sage-local-wsl" : "sage-docker");
        expect(response.result.text).toBe("result");
        expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
          operationType: SAGE_JOB_OPERATIONS[operation].type, status: "complete",
          backendId: backend === "local" ? "sage-local-wsl" : "sage-docker",
        });
      });
    }
  }

  it("preserves exact-roots rejection diagnostics as a failed Compute job", async () => {
    const operation = "sage.polynomial.roots_exact";
    const handle = runSageJob({ operation, backend: "local", params: paramsFor(operation, "local") }, {
      run: async (input) => ({ engine: "sagemath", operation: input.operation, success: false,
        latex: "", result: {}, warnings: [], error: "unsupported polynomial" }),
    });
    const { response, broker } = await handle.promise;
    expect(response.error).toBe("unsupported polynomial");
    expect(broker).toMatchObject({ ok: false, code: "scientific-failure" });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
      operationType: "polynomial.roots.exact", status: "failed",
    });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.failure).toContain("unsupported polynomial");
  });

  for (const operation of operations) {
    it(`cancels ${operation} through the broker and local worker`, async () => {
      let started!: () => void;
      const running = new Promise<void>((resolve) => { started = resolve; });
      const cancelled: string[] = [];
      const handle = runSageJob({ operation, backend: "local", params: paramsFor(operation, "local") }, {
        run: async () => { started(); return new Promise<never>(() => undefined); },
        cancel: (jobId) => { cancelled.push(jobId); },
      });
      await running;
      expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.status).toBe("running");
      expect(handle.cancel()).toBe(true);
      const { response, broker } = await handle.promise;
      expect(broker).toMatchObject({ ok: false, code: "cancelled" });
      expect(response.error).toBe(SAGE_JOB_OPERATIONS[operation].cancelled);
      expect(cancelled).toEqual([handle.jobId]);
      expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.status).toBe("cancelled");
    });
  }
});
