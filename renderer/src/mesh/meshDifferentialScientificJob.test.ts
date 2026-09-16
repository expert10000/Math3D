import { describe, expect, it } from "vitest";
import { createMeshAnalysisMeshIdentity } from "./analysisResultStore";
import { MeshAnalysisKernelBridge } from "./meshAnalysisKernelBridge";
import { MeshDifferentialScientificJob } from "./meshDifferentialScientificJob";
import { computeMeshDifferentialGeometry } from "./meshDifferentialGeometry";
import { MeshDocumentAdapter } from "./meshDocumentAdapter";
import type { SurfaceMeshData } from "./surfaceMesh";
import type { MeshAnalysisWorkerMessage, MeshAnalysisWorkerRequest } from "../workers/meshAnalysisWorkerTypes";

const triangle = (): SurfaceMeshData => ({
  label: "Triangle", source: { kind: "polyhedronPreset", id: "triangle" },
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
});

class FakeWorker extends EventTarget {
  request: MeshAnalysisWorkerRequest | null = null;
  terminated = false;
  postMessage(request: MeshAnalysisWorkerRequest) { this.request = request; }
  terminate() { this.terminated = true; }
  emit(message: MeshAnalysisWorkerMessage) {
    const event = new Event("message") as MessageEvent<MeshAnalysisWorkerMessage>;
    Object.defineProperty(event, "data", { value: message });
    this.dispatchEvent(event);
  }
}

const setup = () => {
  const mesh = triangle();
  const adapter = MeshDocumentAdapter.fromMesh(mesh);
  const bridge = new MeshAnalysisKernelBridge(() => adapter);
  const worker = new FakeWorker();
  const jobs = new MeshDifferentialScientificJob(bridge, () => worker);
  const identity = createMeshAnalysisMeshIdentity(mesh);
  return { mesh, adapter, bridge, worker, jobs, identity };
};

const awaitRequest = async (worker: FakeWorker): Promise<MeshAnalysisWorkerRequest> => {
  for (let attempt = 0; attempt < 30 && !worker.request; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  if (!worker.request) throw new Error("Worker did not receive a job request.");
  return worker.request;
};

describe("GK09 Mesh differential scientific job", () => {
  it("routes a worker result through F05, F06, F07, and F08 with compact provenance", async () => {
    const { mesh, bridge, worker, jobs, identity } = setup();
    const capabilities = await jobs.capabilities();
    expect(capabilities[0]).toMatchObject({ backendId: "mesh-analysis-worker", transport: "worker", availability: "available" });
    const pending = jobs.submit(mesh, identity, undefined, { jobId: "mesh-differential/test-success" });
    const request = await awaitRequest(worker);
    if (request.type !== "compute-differential") throw new Error("Wrong worker request.");
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ status: "computing", availability: "unavailable" });
    const result = computeMeshDifferentialGeometry(mesh)!;
    worker.emit({ type: "differential-result", jobId: request.jobId, meshRevision: request.meshRevision, ok: true, result, computeTimeMs: 12 });
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.broker.backend).toMatchObject({ backendId: "mesh-analysis-worker", transport: "worker" });
    expect(outcome.result.provenance.source).toEqual(bridge.source());
    expect(outcome.result.artifacts).toHaveLength(1);
    expect(outcome.payload.K).toEqual(result.K);
    expect(JSON.stringify(outcome.result)).not.toContain('"K"');
    expect(bridge.artifactRegistry().resolve(outcome.result.artifacts[0]!, bridge.source()!).ok).toBe(true);
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ status: "clean", availability: "available" });
    expect(worker.terminated).toBe(true);
  });

  it("cancels an active worker and rejects its late message", async () => {
    const { mesh, bridge, worker, jobs, identity } = setup();
    const pending = jobs.submit(mesh, identity, undefined, { jobId: "mesh-differential/test-cancel" });
    const request = await awaitRequest(worker);
    expect(jobs.cancel(request.jobId)).toBe(true);
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, broker: { code: "cancelled" } });
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ status: "dirty", availability: "unavailable" });
    expect(worker.terminated).toBe(true);
  });

  it("rejects a changed source rather than publishing a late field", async () => {
    const { mesh, adapter, bridge, worker, jobs, identity } = setup();
    const pending = jobs.submit(mesh, identity, undefined, { jobId: "mesh-differential/test-stale" });
    const request = await awaitRequest(worker);
    const edited = triangle(); edited.positions[5] = 0.5;
    adapter.replaceMesh(edited);
    bridge.invalidateCurrentSource();
    worker.emit({ type: "differential-result", jobId: request.jobId, meshRevision: request.meshRevision, ok: true, result: computeMeshDifferentialGeometry(mesh)!, computeTimeMs: 12 });
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: false, broker: { code: "stale-source" } });
    expect(bridge.results()).toHaveLength(0);
  });

  it("returns a scientific failure without a current artifact", async () => {
    const { mesh, bridge, worker, jobs, identity } = setup();
    const pending = jobs.submit(mesh, identity, undefined, { jobId: "mesh-differential/test-error" });
    const request = await awaitRequest(worker);
    worker.emit({ type: "error", jobId: request.jobId, meshRevision: request.meshRevision, ok: false, error: "synthetic worker failure" });
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    expect(bridge.results()).toHaveLength(0);
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ status: "failed", availability: "unavailable" });
  });

  it("enforces the F05/F08 deadline and terminates the worker", async () => {
    const { mesh, worker, jobs, identity } = setup();
    const pending = jobs.submit(mesh, identity, undefined, {
      jobId: "mesh-differential/test-deadline",
      limits: { deadlineAt: Date.now() + 150, maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024, maxMemoryBytes: 32 * 1024 * 1024, maxWorkUnits: 1_000_000 },
    });
    await awaitRequest(worker);
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect([outcome.broker.code, outcome.broker.scientificFailure?.code]).toContain("deadline-exceeded");
    expect(worker.terminated).toBe(true);
  });

  it("exposes unavailable optional native capability and routes to the available worker", async () => {
    const { mesh, bridge, worker, identity } = setup();
    const jobs = new MeshDifferentialScientificJob(bridge, () => worker, [{
      backendId: "mesh-native", backendVersion: "1", transport: "in-process", priority: 200,
      supportsCancellation: false,
      discover: () => ({ available: false, operations: [], unavailableReason: "Native adapter is not installed." }),
      execute: () => { throw new Error("Unavailable backend must not execute."); },
    }]);
    expect(await jobs.capabilities()).toEqual(expect.arrayContaining([
      expect.objectContaining({ backendId: "mesh-native", availability: "unavailable" }),
      expect.objectContaining({ backendId: "mesh-analysis-worker", availability: "available" }),
    ]));
    const pending = jobs.submit(mesh, identity, undefined, { jobId: "mesh-differential/test-capability" });
    const request = await awaitRequest(worker);
    worker.emit({ type: "differential-result", jobId: request.jobId, meshRevision: request.meshRevision, ok: true, result: computeMeshDifferentialGeometry(mesh)!, computeTimeMs: 12 });
    const outcome = await pending;
    expect(outcome).toMatchObject({ ok: true, broker: { backend: { backendId: "mesh-analysis-worker" } } });
    expect(jobs.outcomes()).toHaveLength(1);
  });

  it("cancels a large fixture without publishing its dense buffers", async () => {
    const vertexCount = 30_000;
    const positions = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(vertexCount);
    for (let index = 0; index < vertexCount; index += 1) {
      positions[index * 3] = index % 200;
      positions[index * 3 + 1] = Math.floor(index / 200);
      indices[index] = index;
    }
    const mesh: SurfaceMeshData = { label: "Stress fixture", source: { kind: "polyhedronPreset", id: "stress" }, positions, indices };
    const adapter = MeshDocumentAdapter.fromMesh(mesh);
    const bridge = new MeshAnalysisKernelBridge(() => adapter);
    const worker = new FakeWorker();
    const jobs = new MeshDifferentialScientificJob(bridge, () => worker);
    const pending = jobs.submit(mesh, createMeshAnalysisMeshIdentity(mesh), undefined, { jobId: "mesh-differential/test-stress-cancel" });
    const request = await awaitRequest(worker);
    expect(request.type).toBe("compute-differential");
    jobs.cancel(request.jobId);
    expect(await pending).toMatchObject({ ok: false, broker: { code: "cancelled" } });
    expect(bridge.results()).toHaveLength(0);
    expect(bridge.artifactRegistry().listMetadata()[0]).toMatchObject({ availability: "unavailable" });
  });
});
