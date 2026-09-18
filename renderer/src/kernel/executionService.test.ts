import { describe, expect, it } from "vitest";
import {
  canonicalJsonByteLength,
  createScientificJobRequest,
  createStableDocumentId,
  getMath3DWorkerOperationForLegacyRequest,
  structuralHash,
} from "@math3d/core";
import {
  createExecutionService,
  createScientificExecutionBroker,
  type ScientificExecutionBackend,
} from "@math3d/kernel";

const source = {
  documentId: createStableDocumentId("worker-platform", { fixture: "phase-1" }),
  revision: 1,
  structuralHash: structuralHash({ fixture: "phase-1" }),
  generation: 1,
};

const request = () => createScientificJobRequest({
  jobId: "job:phase-1",
  source,
  operation: { type: "mesh.normals.compute", payload: { mesh: "fixture" } },
  limits: {
    deadlineAt: Date.now() + 10_000,
    maxInputBytes: 1_024,
    maxOutputBytes: 1_024,
    maxMemoryBytes: 1_024,
    maxWorkUnits: 1_024,
  },
});

const backend: ScientificExecutionBackend = {
  backendId: "python-vtk",
  backendVersion: "fixture",
  transport: "worker",
  priority: 1,
  supportsCancellation: false,
  discover: () => ({
    available: true,
    operations: [{
      operationType: "mesh.normals.compute",
      retrySafety: "idempotent",
      maxInputBytes: 1_024,
      maxOutputBytes: 1_024,
      maxMemoryBytes: 1_024,
      maxWorkUnits: 1_024,
    }],
  }),
  execute: (job) => {
    const output = { normals: "computed" };
    return {
      ok: true,
      schemaVersion: 1,
      jobId: job.jobId,
      operationType: job.operation.type,
      source: job.source,
      output,
      outputBytes: canonicalJsonByteLength(output),
    };
  },
};

describe("worker platform phase 1", () => {
  it("maps current request kinds to one canonical operation owner", () => {
    expect(getMath3DWorkerOperationForLegacyRequest("vtk.clean-normals")).toMatchObject({
      id: "mesh.normals.compute",
      canonicalOwner: "math3d-js",
    });
    expect(getMath3DWorkerOperationForLegacyRequest("cgal.boolean")).toMatchObject({
      id: "mesh.boolean",
      canonicalOwner: "native-cgal",
      method: "exact",
    });
  });

  it("surfaces capability diagnostics without bypassing the scientific broker", async () => {
    const broker = createScientificExecutionBroker({
      backends: [backend],
      resolveSource: () => source,
    });
    const service = createExecutionService(broker);
    const capabilities = await service.discoverCapabilities();
    const normals = capabilities.find((entry) => entry.operation.id === "mesh.normals.compute");

    expect(normals?.availableBackends.map((entry) => entry.backendId)).toEqual(["python-vtk"]);
    expect(normals?.operation.canonicalOwner).toBe("math3d-js");
    expect(await service.submit(request())).toMatchObject({
      ok: true,
      backend: { backendId: "python-vtk" },
    });
  });

  it("rejects unregistered operations before a feature can select a transport", async () => {
    const broker = createScientificExecutionBroker({ backends: [backend], resolveSource: () => source });
    const service = createExecutionService(broker);
    const unknown = createScientificJobRequest({
      ...request(),
      jobId: "job:unknown-operation",
      operation: { type: "mesh.unregistered", payload: {} },
    });

    await expect(service.submit(unknown)).rejects.toThrow(/not registered/);
  });
});
