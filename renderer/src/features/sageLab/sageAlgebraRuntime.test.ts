import { describe, expect, it } from "vitest";
import { createSageExecutionRegistry } from "../../services/sageOperationExecution";
import { describeAlgebraRuntime } from "./sageAlgebraRuntime";

describe("SAGE-A08 algebra capability reporting", () => {
  it("uses the app route, not just a worker's raw advertised operations", async () => {
    const registry = createSageExecutionRegistry({ health: async () => ({ engine: "sagemath",
      engineVersion: "9.5", status: "ok", available: true, operations: ["sage.algebra.reconstruct"] }) });
    const local = describeAlgebraRuntime(await registry.probeBackend("local"));
    const docker = describeAlgebraRuntime(await registry.probeBackend("docker"));
    const gateway = describeAlgebraRuntime(await registry.probeBackend("private"));
    expect(local).toMatchObject({ supported: false, label: "Local WSL SageMath 9.5" });
    expect(local.detail).toContain("Local WSL app route does not advertise");
    expect(docker).toMatchObject({ supported: true, label: "Docker SageMath 9.5" });
    expect(gateway.detail).toContain("only bounded Number Theory");
  });

  it("explains an offline worker and an online worker missing reconstruction", async () => {
    const offline = createSageExecutionRegistry({ health: async () => ({ engine: "sagemath", status: "connection refused",
      available: false, operations: ["sage.algebra.reconstruct"] }) });
    const unavailable = await offline.probeBackend("docker");
    expect(unavailable.operations).toEqual([]);
    expect(describeAlgebraRuntime(unavailable)).toMatchObject({ supported: false,
      detail: "Docker SageMath is unavailable: connection refused" });
    const oldWorker = createSageExecutionRegistry({ health: async () => ({ engine: "sagemath", engineVersion: "10.10",
      status: "ok", available: true, operations: ["sage.symbolic.simplify"] }) });
    expect(describeAlgebraRuntime(await oldWorker.probeBackend("docker")).detail)
      .toContain("does not advertise sage.algebra.reconstruct");
  });
});
