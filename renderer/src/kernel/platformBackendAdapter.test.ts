import { describe, expect, it, vi } from "vitest";
import { createPlatformCapabilitySnapshot, createScientificJobRequest, createStableDocumentId, PLATFORM_FACILITIES,
  structuralHash, type PlatformFacility, type ScientificSourceGeneration } from "@math3d/core";
import { createScientificExecutionBroker, guardScientificBackendForPlatform,
  type ScientificExecutionBackend } from "@math3d/kernel";

const source: ScientificSourceGeneration = { documentId: createStableDocumentId("gk19", "backend"), revision: 1,
  structuralHash: structuralHash({ value: 1 }), generation: 1 };
const snapshot = (runtime: "browser" | "desktop" | "mobile" | "worker" | "remote-fixture", enabled: readonly PlatformFacility[]) =>
  createPlatformCapabilitySnapshot({ runtime, adapterId: `fixture.${runtime}`, adapterVersion: "1.0.0",
    facilities: Object.fromEntries(PLATFORM_FACILITIES.map((facility) => [facility, enabled.includes(facility)
      ? { available: true, reason: null } : { available: false, reason: `${facility} unavailable` }])) as ReturnType<typeof createPlatformCapabilitySnapshot>["facilities"] });
const capability = { operationType: "fixture.compute", retrySafety: "idempotent" as const,
  maxInputBytes: 1_000, maxOutputBytes: 1_000, maxMemoryBytes: 1_000_000, maxWorkUnits: 1_000 };
const request = () => createScientificJobRequest({ jobId: "gk19-job", source,
  operation: { type: "fixture.compute", payload: {} }, limits: { deadlineAt: Date.now() + 60_000,
    maxInputBytes: 1_000, maxOutputBytes: 1_000, maxMemoryBytes: 1_000_000, maxWorkUnits: 1_000 } });

describe("GK19 platform guard at the F08 broker boundary", () => {
  it("rejects unsupported host facilities before transport and advertises the reason", async () => {
    const execute = vi.fn(async () => ({ ok: true as const, schemaVersion: 1 as const, jobId: "gk19-job",
      operationType: "fixture.compute", source, output: { value: 1 }, outputBytes: 11 }));
    const backend: ScientificExecutionBackend = { backendId: "desktop-native", backendVersion: "1.0.0", transport: "in-process",
      priority: 1, supportsCancellation: false, discover: () => ({ available: true, operations: [capability] }), execute };
    const guarded = guardScientificBackendForPlatform(backend, snapshot("browser", ["dom", "network"]), ["hostFileSystem"]);
    const broker = createScientificExecutionBroker({ backends: [guarded], resolveSource: () => source });
    expect(await broker.discoverCapabilities()).toMatchObject([{ availability: "unavailable", operations: [] }]);
    expect(await broker.submit(request())).toMatchObject({ ok: false, code: "capability-unavailable", attempts: [] });
    expect(execute).not.toHaveBeenCalled();
    expect(() => guarded.execute(request())).toThrow(/hostFileSystem/);
  });

  it("keeps a supported backend available to the broker", async () => {
    const backend: ScientificExecutionBackend = { backendId: "desktop-native", backendVersion: "1.0.0", transport: "in-process",
      priority: 1, supportsCancellation: false, discover: () => ({ available: true, operations: [capability] }),
      execute: async (job) => ({ ok: true, schemaVersion: 1, jobId: job.jobId, operationType: job.operation.type,
        source: job.source, output: { value: 1 }, outputBytes: 11 }) };
    const guarded = guardScientificBackendForPlatform(backend, snapshot("desktop", ["dom", "hostFileSystem", "nativeDialog", "network"]), ["hostFileSystem"]);
    const broker = createScientificExecutionBroker({ backends: [guarded], resolveSource: () => source });
    expect(await broker.discoverCapabilities()).toMatchObject([{ availability: "available" }]);
    expect(await broker.submit(request())).toMatchObject({ ok: true, backend: { backendId: "desktop-native" } });
  });

  it.each(["browser", "desktop", "mobile", "worker", "remote-fixture"] as const)(
    "%s adapter fixture rejects a missing facility before executing a job", async (runtime) => {
      const execute = vi.fn();
      const backend: ScientificExecutionBackend = { backendId: `fixture.${runtime}`, backendVersion: "1.0.0",
        transport: "worker", priority: 1, supportsCancellation: false,
        discover: () => ({ available: true, operations: [capability] }), execute };
      const guarded = guardScientificBackendForPlatform(backend, snapshot(runtime, ["network"]), ["hostFileSystem"]);
      const broker = createScientificExecutionBroker({ backends: [guarded], resolveSource: () => source });
      const advertised = await broker.discoverCapabilities();
      expect(advertised[0]).toMatchObject({ availability: "unavailable", operations: [] });
      expect(await broker.submit(request())).toMatchObject({ ok: false, code: "capability-unavailable", attempts: [] });
      expect(execute).not.toHaveBeenCalled();
    });
});
