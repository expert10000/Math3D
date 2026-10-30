import { describe, expect, it } from "vitest";
import { getComputeJobs } from "../features/computeCenter/scientificJobTelemetry";
import { runSageJob, SAGE_JOB_OPERATIONS, type BrokeredSageOperation } from "./sageOperationExecution";

const operations = Object.keys(SAGE_JOB_OPERATIONS) as BrokeredSageOperation[];
const dockerOnlyOperations = new Set<BrokeredSageOperation>([
  "sage.matrix.eigen_exact", "sage.matrix.charpoly", "sage.groebner.compute",
  "sage.numberTheory.gcd", "sage.numberTheory.modInverse",
]);
const paramsFor = (operation: BrokeredSageOperation, backend: "local" | "docker") =>
  operation.startsWith("sage.matrix.") ? { matrix: [[1, 2], [3, 4]], variable: "lambda" }
    : operation === "sage.groebner.compute" ? { polynomials: ["x^2+y^2-1", "x-y"], variables: ["x", "y"] }
    : operation === "sage.numberTheory.gcd" ? { values: ["84", "30"] }
    : operation === "sage.numberTheory.modInverse" ? { a: "3", modulus: "11" }
    : operation.startsWith("sage.polynomial.")
    ? backend === "local"
      ? { coefficients: ["-2", "0", "1"] }
      : { polynomial: "(-2)*x^0 + (0)*x^1 + (1)*x^2", variables: ["x"] }
    : { expression: "x^2+y^2+z^2", variables: ["x", "y", "z"] };

describe("Sage scientific execution contract", () => {
  for (const operation of operations) {
    for (const backend of (dockerOnlyOperations.has(operation) ? ["docker"] : ["local", "docker"]) as ("local" | "docker")[]) {
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

  it("reports a Docker symbolic-solve rejection with its diagnostic", async () => {
    const operation = "sage.symbolic.solve";
    const handle = runSageJob({ operation, backend: "docker", params: paramsFor(operation, "docker") }, {
      run: async (input) => ({ engine: "sagemath", operation: input.operation, success: false,
        latex: "", result: {}, warnings: [], error: "no finite solution set" }),
    });
    const { response, broker } = await handle.promise;
    expect(response.error).toBe("no finite solution set");
    expect(broker).toMatchObject({ ok: false, code: "scientific-failure" });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
      operationType: "symbolic.solve", status: "failed", backendId: "sage-docker",
    });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)?.failure).toContain("no finite solution set");
  });

  for (const operation of operations) {
    if (dockerOnlyOperations.has(operation)) continue;
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

  it("rejects a matrix operation on Local WSL before submitting a job", () => {
    expect(() => runSageJob({
      operation: "sage.matrix.charpoly", backend: "local",
      params: paramsFor("sage.matrix.charpoly", "local"),
    })).toThrow("Invalid Sage characteristic polynomial parameters.");
  });

  it("records a live-shaped Docker modular-inverse rejection and its diagnostic", async () => {
    const operation = "sage.numberTheory.modInverse";
    const handle = runSageJob({ operation, backend: "docker", params: { a: "2", modulus: "4" } }, {
      run: async (input) => ({ engine: "sagemath", operation: input.operation, success: false,
        latex: "", result: {}, warnings: [], error: "Inverse does not exist." }),
    });
    const { response, broker } = await handle.promise;
    expect(response.error).toBe("Inverse does not exist.");
    expect(broker).toMatchObject({ ok: false, code: "scientific-failure" });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
      operationType: "number-theory.mod-inverse", status: "failed", backendId: "sage-docker",
    });
  });
});
