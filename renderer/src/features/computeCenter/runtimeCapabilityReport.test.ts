import { describe, expect, it } from "vitest";
import type { SageRuntimeProbe } from "../../services/sageOperationExecution";
import { buildRuntimeCapabilityReport, type RuntimeReportInputs } from "./runtimeCapabilityReport";

const input = (overrides: Partial<RuntimeReportInputs> = {}): RuntimeReportInputs => ({
  webWorker: true, python: null, cgal: null, vtkBridge: true, engines: null,
  broker: [], sage: {}, checkedAt: 42, ...overrides,
});
const sageProbe = (available: boolean, operations = 1): SageRuntimeProbe => ({
  backend: "docker", backendId: "sage-docker", backendVersion: "1", transport: "remote",
  health: { available, status: available ? "ok" : "offline", engineVersion: "10.6" },
  manifest: { backendId: "sage-docker", adapterVersion: "1", sageVersion: "10.6",
    availability: available ? "available" : "unavailable",
    unavailableReason: available ? null : "Service offline" },
  operations: Array.from({ length: operations }, () => ({ operationType: "symbolic.factor" })),
} as unknown as SageRuntimeProbe);

describe("Runtime Center capability report", () => {
  it("keeps unprobed routes checking and does not infer Sage from Docker manager health", () => {
    const report = buildRuntimeCapabilityReport(input({ engines: {
      engines: [{ id: "sage", label: "SageMath", healthy: true, running: true,
        installed: true, statusText: "Container running", containerName: "sage", healthUrl: "" }],
    } as ComputeEngineSnapshot }));
    expect(report.routes.find(item => item.id === "sage-docker")?.state).toBe("checking");
    expect(report.routes.find(item => item.id === "manager-sage")?.state).toBe("ready");
    expect(report.routes.find(item => item.id === "python")?.state).toBe("checking");
  });
  it("reports a crashed Python worker and blocks the dependent VTK bridge", () => {
    const report = buildRuntimeCapabilityReport(input({ python: {
      startupChecked: true, available: false, statusMessage: "Worker crashed",
      logPath: "", lastCheckAt: 42,
    }, cgal: { ok: false, error: "Transport unavailable" } }));
    for (const id of ["python", "vtk", "cgal"])
      expect(report.routes.find(item => item.id === id)?.state).toBe("unavailable");
    expect(report.routes.find(item => item.id === "python")?.detail).toBe("Worker crashed");
  });
  it("qualifies Sage health by its own manifest and advertised operations", () => {
    const healthy = buildRuntimeCapabilityReport(input({ sage: { docker: { probe: sageProbe(true) } } }));
    expect(healthy.routes.find(item => item.id === "sage-docker")).toMatchObject({
      state: "ready", version: "10.6", operationCount: 1,
    });
    const empty = buildRuntimeCapabilityReport(input({ sage: { docker: { probe: sageProbe(true, 0) } } }));
    expect(empty.routes.find(item => item.id === "sage-docker")?.state).toBe("limited");
    const offline = buildRuntimeCapabilityReport(input({ sage: { docker: { probe: sageProbe(false) } } }));
    expect(offline.routes.find(item => item.id === "sage-docker")?.state).toBe("unavailable");
  });
  it("withholds a mismatched route version and a permission-denied private gateway", () => {
    const probe = sageProbe(true);
    const changed = { ...probe, manifest: { ...probe.manifest, sageVersion: "10.5" } };
    const report = buildRuntimeCapabilityReport(input({ sage: {
      docker: { probe: changed }, private: { error: "Gateway permission denied" },
    } }));
    expect(report.routes.find(item => item.id === "sage-docker")).toMatchObject({
      state: "unavailable", detail: "Route identity or version differs from its capability manifest",
    });
    expect(report.routes.find(item => item.id === "sage-private")).toMatchObject({
      state: "unavailable", detail: "Gateway permission denied",
    });
  });
  it("does not infer a broker operation from a reachable backend without advertised operations", () => {
    const report = buildRuntimeCapabilityReport(input({ broker: [{
      backendId: "remote-sage", backendVersion: "2", transport: "remote",
      availability: "available", operations: [],
    } as RuntimeReportInputs["broker"][number]] }));
    expect(report.routes.find(item => item.id === "broker-remote-sage")).toMatchObject({
      state: "limited", operationCount: 0,
    });
  });
});
