import { describe, expect, it } from "vitest";
import { buildSageAlgebraDomainInput, buildSageAlgebraReconstructionInput, buildSageNumberFieldInput, buildSageGaloisInput,
  createAlgebraObjectRecord, createMath3DProject,
  createMixedWorkspaceDocument, createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { getComputeJobs } from "../features/computeCenter/scientificJobTelemetry";
import { SAGE_OPERATIONS, SAGE_SYMBOLIC_OPERATIONS } from "../integrations/sage/sageSchemas";
import { scientificOperationsFor } from "../features/scientificServices/operationCatalog";
import { createSageExecutionRegistry, SAGE_CONSOLE_OPERATION, SAGE_JOB_OPERATIONS, type BrokeredSageOperation, type SageExecutionRegistryOptions } from "./sageOperationExecution";

const health: NonNullable<SageExecutionRegistryOptions["health"]> = async () => ({
  engine: "sagemath", engineVersion: "10.6", status: "ok", available: true, operations: SAGE_OPERATIONS,
});
const runSageJob = (
  request: Parameters<ReturnType<typeof createSageExecutionRegistry>["run"]>[0],
  options: Pick<SageExecutionRegistryOptions, "run" | "cancel"> = {},
) => createSageExecutionRegistry({ ...options, health }).run(request);

const operations = Object.keys(SAGE_JOB_OPERATIONS) as BrokeredSageOperation[];
const dockerOnlyOperations = new Set<BrokeredSageOperation>([
  "sage.matrix.eigen_exact", "sage.matrix.charpoly", "sage.groebner.compute",
  "sage.numberTheory.gcd", "sage.numberTheory.modInverse",
  "sage.algebra.reconstruct",
  "sage.algebra.inspectDomains",
  "sage.numberField.elementDossier", "sage.numberField.primeDecomposition",
  "sage.polynomial.dossier",
  "sage.galois.analyze",
  "sage.matrix.linear_dossier",
  "sage.matrix.integer_forms",
  "sage.ideal.groebner", "sage.ideal.eliminate", "sage.ideal.membership", "sage.ideal.quotientDimension",
  "sage.ideal.syzygies", "sage.ideal.hilbertSeries",
]);
const algebraParams = (domains = false) => {
  const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] });
  let project = createMath3DProject(workspace, { stableKey: "sage-a04-broker" });
  const id = createProjectAlgebraObjectId(project.identity.id, "Q");
  project = upsertMath3DProjectAlgebraObject(project, createAlgebraObjectRecord({ id, label: "Q", revision: 1,
    definition: { kind: "rational-field" } }));
  const ref = { objectId: id, revision: 1 };
  return JSON.parse(JSON.stringify(domains ? buildSageAlgebraDomainInput(project, ref, ref)
    : buildSageAlgebraReconstructionInput(project, ref))) as Record<string, unknown>;
};
const numberFieldParams = (operation: "sage.numberField.elementDossier" | "sage.numberField.primeDecomposition") => {
  const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] });
  let project = createMath3DProject(workspace, { stableKey: "sage-d03-broker" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    label: "Q", revision: 1, definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const k = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "K"),
    label: "K", revision: 1, definition: { kind: "number-field", baseField: { objectId: q.id, revision: 1 },
      definingPolynomial: ["-5", "0", "1"], generator: "a" } });
  project = upsertMath3DProjectAlgebraObject(project, k);
  return buildSageNumberFieldInput(project, { objectId: k.id, revision: 1 }, operation,
    operation === "sage.numberField.elementDossier" ? ["1", "1"] : 5) as unknown as Record<string, unknown>;
};
const galoisParams = () => {
  const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] });
  let project = createMath3DProject(workspace, { stableKey: "sage-d06-broker" });
  const q = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Q"),
    label: "Q", revision: 1, definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, q);
  const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    label: "R", revision: 1, definition: { kind: "polynomial-ring",
      coefficientDomain: { objectId: q.id, revision: 1 }, variables: ["x"], monomialOrder: "lex" } });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  return buildSageGaloisInput(project, { objectId: ring.id, revision: 1 }, "x^4-2") as unknown as Record<string, unknown>;
};
const paramsFor = (operation: BrokeredSageOperation, backend: "local" | "docker") =>
  operation === "sage.algebra.reconstruct" ? algebraParams()
    : operation === "sage.algebra.inspectDomains" ? algebraParams(true)
    : operation === "sage.numberField.elementDossier" || operation === "sage.numberField.primeDecomposition"
      ? numberFieldParams(operation)
    : operation === "sage.galois.analyze" ? galoisParams()
    : operation === "sage.matrix.linear_dossier" ? { format: "math3d.sage-matrix-dossier", schemaVersion: 1,
      matrix: [["1", "2"], ["2", "4"]] }
    : operation === "sage.matrix.integer_forms" ? { format: "math3d.sage-integer-matrix-forms", schemaVersion: 1,
      matrix: [["2", "0"], ["0", "6"]] }
    : operation.startsWith("sage.ideal.") ? { format: "math3d.sage-ideal-operation", schemaVersion: 1,
      target: { objectId: "math3d:algebra:fixture", revision: 1 }, targetHash: "sha256:fixture",
      ideal: { objectId: "math3d:algebra:ideal", revision: 1 }, idealHash: "sha256:fixture",
      ambientRing: { objectId: "math3d:algebra:ring", revision: 1 }, ambientHash: "sha256:fixture",
      variables: ["x", "y"], monomialOrder: "lex", generators: ["x*y-1", "y-1"],
      ...(operation === "sage.ideal.eliminate" ? { eliminate: ["x"] } : {}),
      ...(operation === "sage.ideal.membership" ? { polynomial: "x-1" } : {}) }
    : operation.startsWith("sage.matrix.") ? { matrix: [[1, 2], [3, 4]], variable: "lambda" }
    : operation === "sage.groebner.compute" ? { polynomials: ["x^2+y^2-1", "x-y"], variables: ["x", "y"] }
    : operation === "sage.numberTheory.gcd" ? { values: ["84", "30"] }
    : operation === "sage.numberTheory.modInverse" ? { a: "3", modulus: "11" }
    : operation.startsWith("sage.polynomial.")
    ? backend === "local"
      ? { coefficients: ["-2", "0", "1"] }
      : { polynomial: "(-2)*x^0 + (0)*x^1 + (1)*x^2", variables: ["x"] }
    : { expression: "x^2+y^2+z^2", variables: ["x", "y", "z"] };

describe("Sage scientific execution contract", () => {
  it("discovers trusted local console execution and records output provenance through the shared service", async () => {
    const calls: { jobId: string; code: string; scope?: string }[] = [];
    const registry = createSageExecutionRegistry({ health, consoleAvailable: () => true,
      consoleRun: async (request) => {
        calls.push(request);
        return { jobId: request.jobId, success: true, backendId: "sage-local-wsl", engineVersion: "10.6",
          stdout: "hello\n", result: "2", warnings: [], inputHash: "abc", elapsedMs: 3 };
      },
    });
    expect((await registry.probeBackend("local")).operations.map((item) => item.operationType)).toContain(SAGE_CONSOLE_OPERATION);
    expect((await registry.probeBackend("docker")).operations.map((item) => item.operationType)).not.toContain(SAGE_CONSOLE_OPERATION);
    expect(() => registry.runConsole({ code: "1+1", trusted: false })).toThrow("Trust an available local Sage runtime");
    const handle = registry.runConsole({ code: "1+1", trusted: true, scope: "workbook:one:cell" });
    const { broker, response } = await handle.promise;
    expect(broker.ok).toBe(true);
    expect(calls).toEqual([{ jobId: handle.jobId, code: "1+1", scope: "workbook:one:cell" }]);
    expect(response).toMatchObject({ inputHash: "abc", result: "2", backendId: "sage-local-wsl" });
    expect(getComputeJobs().find((job) => job.jobId === handle.jobId)).toMatchObject({
      operationType: SAGE_CONSOLE_OPERATION, status: "complete", backendId: "sage-local-wsl",
    });
  });

  it("cancels a console job through its dedicated local transport", async () => {
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const cancelled: string[] = [];
    const registry = createSageExecutionRegistry({ health, consoleAvailable: () => true,
      consoleRun: async () => { started(); return new Promise<never>(() => undefined); },
      consoleCancel: (jobId) => { cancelled.push(jobId); },
    });
    const handle = registry.runConsole({ code: "while True: pass", trusted: true });
    await running;
    expect(handle.cancel()).toBe(true);
    expect((await handle.promise).broker).toMatchObject({ ok: false, code: "cancelled" });
    expect(cancelled).toEqual([handle.jobId]);
  });

  it("exposes the same version and limits used by backend discovery", async () => {
    const registry = createSageExecutionRegistry({ health });
    const probe = await registry.probeBackend("docker");
    const discovered = (await registry.discoverBackends()).find((item) => item.backendId === probe.backendId)!;
    expect(probe.health.engineVersion).toBe("10.6");
    expect(probe.operations).toEqual(discovered.operations);
    expect(probe.operations[0]).toMatchObject({ maxInputBytes: 64 * 1024,
      maxOutputBytes: 256 * 1024, maxMemoryBytes: 512 * 1024 * 1024,
      maxWorkUnits: 1_000, retrySafety: "never" });
  });

  it("keeps declared limits and a diagnostic when a health probe fails", async () => {
    const registry = createSageExecutionRegistry({ health: async () => { throw new Error("service unreachable"); } });
    const probe = await registry.probeBackend("docker");
    expect(probe.health).toMatchObject({ available: false, status: "service unreachable" });
    expect(probe.limits.maxInputBytes).toBe(64 * 1024);
    expect((await registry.discoverBackends()).find((item) => item.backendId === "sage-docker"))
      .toMatchObject({ availability: "unavailable", unavailableReason: "service unreachable" });
  });

  it("shares capability discovery and execution across Surface and Geometry", async () => {
    const calls: unknown[] = [];
    const registry = createSageExecutionRegistry({
      health: async (backend) => ({ engine: "sagemath", status: backend === "docker" ? "ok" : backend === "private" ? "Gateway unavailable" : "WSL unavailable",
        available: backend === "docker", operations: ["sage.symbolic.simplify"] }),
      run: async (request) => {
        calls.push(request);
        return { engine: "sagemath", operation: request.operation, success: true,
          latex: "1", result: { text: "shared result" }, warnings: [] };
      },
    });
    const snapshots = await registry.discoverBackends();
    expect(snapshots).toHaveLength(3);
    expect(snapshots.find((item) => item.backendId === "sage-local-wsl")).toMatchObject({
      availability: "unavailable", unavailableReason: "WSL unavailable",
    });
    expect(snapshots.find((item) => item.backendId === "sage-docker")?.operations.map((item) => item.operationType))
      .toContain("symbolic.simplify");
    for (const context of ["surface", "geometry"] as const) {
      const operation = scientificOperationsFor(context, "Basic").find((item) => item.id === "sage.symbolic.simplify")!.id;
      const handle = registry.run({ operation, backend: "docker", params: paramsFor(operation, "docker") });
      const { response, broker } = await handle.promise;
      expect(broker.ok).toBe(true);
      expect(response.result.text).toBe("shared result");
    }
    expect(calls).toHaveLength(2);
    const unavailable = registry.run({ operation: "sage.symbolic.simplify", backend: "local",
      params: paramsFor("sage.symbolic.simplify", "local") });
    expect((await unavailable.promise).broker).toMatchObject({ ok: false, code: "capability-unavailable" });
    expect(getComputeJobs().find((job) => job.jobId === unavailable.jobId)).toMatchObject({
      status: "failed", backendId: "sage-local-wsl",
    });
  });

  it("discovers only bounded Number Theory on the private gateway and routes through the same broker", async () => {
    const calls: unknown[] = [];
    const registry = createSageExecutionRegistry({
      health: async (backend) => ({ engine: "sagemath", engineVersion: "10.10", status: "ok", available: backend === "private",
        operations: SAGE_SYMBOLIC_OPERATIONS }),
      run: async (request) => { calls.push(request); return { engine: "sagemath", engineVersion: "10.10",
        operation: request.operation, success: true, result: { value: "6" }, latex: "6", warnings: [] }; },
    });
    const probe = await registry.probeBackend("private");
    expect(probe.backendId).toBe("sage-private-gateway");
    expect(probe.limits.maxInputBytes).toBe(8 * 1024);
    expect(probe.operations.map((item) => item.operationType)).toEqual(["number-theory.gcd", "number-theory.mod-inverse"]);
    expect(() => registry.run({ operation: "sage.symbolic.simplify", backend: "private",
      params: { expression: "x", variables: ["x"] } })).toThrow();
    const handle = registry.run({ operation: "sage.numberTheory.gcd", backend: "private", params: { values: ["84", "30"] } });
    const { broker, response } = await handle.promise;
    expect(broker).toMatchObject({ ok: true, backend: { backendId: "sage-private-gateway" } });
    expect(response.result.value).toBe("6");
    expect(calls).toMatchObject([{ operation: "sage.numberTheory.gcd", backend: "private" }]);
  });

  it("advertises typed algebra reconstruction only on Docker and rejects code-bearing payloads", async () => {
    const registry = createSageExecutionRegistry({ health });
    expect((await registry.probeBackend("docker")).operations.map((item) => item.operationType)).toContain("algebra.reconstruct");
    expect((await registry.probeBackend("local")).operations.map((item) => item.operationType)).not.toContain("algebra.reconstruct");
    expect((await registry.probeBackend("private")).operations.map((item) => item.operationType)).not.toContain("algebra.reconstruct");
    const params = algebraParams();
    expect(() => registry.run({ operation: "sage.algebra.reconstruct", backend: "local", params })).toThrow(/Invalid Sage/);
    expect(() => registry.run({ operation: "sage.algebra.reconstruct", backend: "private", params })).toThrow(/Invalid Sage/);
    expect(() => registry.run({ operation: "sage.algebra.reconstruct", backend: "docker",
      params: { ...params, code: "print(1)" } })).toThrow(/envelope/);
  });

  it("cancels independent jobs through one shared service", async () => {
    let started = 0;
    let bothStarted!: () => void;
    const running = new Promise<void>((resolve) => { bothStarted = resolve; });
    const cancelled: string[] = [];
    const registry = createSageExecutionRegistry({ health,
      run: async () => {
        started += 1;
        if (started === 2) bothStarted();
        return new Promise<never>(() => undefined);
      },
      cancel: (jobId) => { cancelled.push(jobId); },
    });
    const surface = registry.run({ operation: "sage.symbolic.simplify", backend: "local",
      params: { expression: "x", variables: ["x"] } });
    const geometry = registry.run({ operation: "sage.symbolic.simplify", backend: "docker",
      params: { expression: "y", variables: ["y"] } });
    await running;
    expect(surface.cancel()).toBe(true);
    expect(geometry.cancel()).toBe(true);
    expect((await surface.promise).broker).toMatchObject({ ok: false, code: "cancelled" });
    expect((await geometry.promise).broker).toMatchObject({ ok: false, code: "cancelled" });
    expect(cancelled).toEqual([surface.jobId, geometry.jobId]);
  });

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

  it("advertises the B02 dossier only on Docker and rejects a multivariate recipe", async () => {
    const registry = createSageExecutionRegistry({ health });
    expect((await registry.probeBackend("docker")).operations.map((item) => item.operationType)).toContain("polynomial.dossier");
    expect((await registry.probeBackend("local")).operations.map((item) => item.operationType)).not.toContain("polynomial.dossier");
    expect(() => registry.run({ operation: "sage.polynomial.dossier", backend: "docker",
      params: { polynomial: "x+y", variables: ["x", "y"] } })).toThrow(/polynomial dossier parameters/);
  });

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
