import { describe, expect, it } from "vitest";
import type { VolumeDataset } from "../scene/datasets";
import {
  VOLUME_MEMORY_LIMITS,
  VolumeJobCache,
  createVolumeJobRequest,
  createVolumeMemoryPlan,
  executeVolumeJobRequest,
  profileVolumeAllocation,
  volumeJobCacheKey,
  type VolumeJobRequest,
  type VolumeWorkerInbound,
  type VolumeWorkerOutbound,
} from "./computation";
import { adaptAnalyticVolume, type VolumeRevisionTracker } from "./infrastructure";
import { VolumeWorkerCoordinator, type VolumeWorkerLike } from "./workerCoordinator";

const dataset: VolumeDataset = {
  kind: "volume",
  label: "Worker fixture",
  grid: {
    dims: [3, 3, 3],
    origin: [-1, -1, -1],
    spacing: [1, 1, 1],
    scalars: Float32Array.from({ length: 27 }, (_, index) => index - 13),
  },
};

const tracker: VolumeRevisionTracker = new Map();
const volume = adaptAnalyticVolume({
  id: "worker-volume",
  label: "Worker volume",
  presetId: "fixture",
  expression: "x+y+z",
  dataset,
  grid: dataset.grid,
  tracker,
});

const request = (operation: VolumeJobRequest["operation"], requestId = `job-${operation}`, parameters: VolumeJobRequest["parameters"] = {}) =>
  createVolumeJobRequest({ requestId, operation, volume, grid: dataset.grid, parameters });

class InlineWorker implements VolumeWorkerLike {
  private listeners = new Set<(event: MessageEvent<VolumeWorkerOutbound>) => void>();
  private cancelled = new Set<string>();
  runs = 0;
  terminated = false;
  postMessage(message: VolumeWorkerInbound) {
    if (message.type === "cancel") {
      this.cancelled.add(message.requestId);
      return;
    }
    this.runs += 1;
    void executeVolumeJobRequest(message.request, (result) => this.emit(result), () => this.cancelled.has(message.request.requestId))
      .then((result) => this.emit(result))
      .catch((error) => this.emit({
        type: "error",
        requestId: message.request.requestId,
        volumeRevision: message.request.volumeRevision,
        sampledGridRevision: message.request.sampledGridRevision,
        code: "WORKER_FAILURE",
        message: String(error),
        retryable: true,
      }));
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { this.terminated = true; }
  protected emit(data: VolumeWorkerOutbound) { queueMicrotask(() => this.listeners.forEach((listener) => listener({ data } as MessageEvent<VolumeWorkerOutbound>))); }
}

class ManualWorker extends InlineWorker {
  messages: VolumeWorkerInbound[] = [];
  override postMessage(message: VolumeWorkerInbound) { this.messages.push(message); }
  publish(data: VolumeWorkerOutbound) { this.emit(data); }
}

describe("Volume computation foundation", () => {
  it("defines and executes the shared deterministic grid operations", async () => {
    const histogram = await executeVolumeJobRequest(request("histogram", "hist", { bins: 8 }));
    expect(histogram.output.histogram).toHaveLength(8);
    expect(Array.from(histogram.output.histogram ?? []).reduce((sum, value) => sum + value, 0)).toBe(27);

    const slice = await executeVolumeJobRequest(request("sliceVolume", "slice", { axis: "z", index: 1 }));
    expect(slice.output.values).toEqual(dataset.grid.scalars.slice(9, 18));
    expect(slice.output.dimensions).toEqual([3, 3, 1]);

    const gradient = await executeVolumeJobRequest(request("gradientVolume"));
    expect(gradient.output.values).toHaveLength(81);

    const components = await executeVolumeJobRequest(request("connectedComponents", "components", { threshold: 0 }));
    expect(components.output.values?.[0]).toBe(1);
    expect(components.output.labels).toHaveLength(27);

    const voxelized = await executeVolumeJobRequest(createVolumeJobRequest({
      requestId: "voxelize",
      operation: "voxelizeMesh",
      volume,
      grid: dataset.grid,
      meshPositions: new Float32Array([0, 0, 0]),
    }));
    expect(voxelized.output.values?.[13]).toBe(1);
  });

  it("keys cache by revision, parameters, backend version, and ordered dependencies", () => {
    const base = request("histogram", "base", { bins: 16 });
    const { requestId: _a, scalars: _b, meshPositions: _c, meshIndices: _d, ...input } = base;
    const reversed = { ...input, dependencies: [...input.dependencies].reverse() };
    expect(volumeJobCacheKey(input)).toBe(volumeJobCacheKey(reversed));
    expect(volumeJobCacheKey(input)).not.toBe(volumeJobCacheKey({ ...input, volumeRevision: input.volumeRevision + 1 }));
    expect(volumeJobCacheKey(input)).not.toBe(volumeJobCacheKey({ ...input, parameters: { bins: 32 } }));
    expect(volumeJobCacheKey(input)).not.toBe(volumeJobCacheKey({ ...input, algorithmVersion: "v2" }));
  });

  it("uses transferable worker jobs, publishes lifecycle progress, and reuses cached artifacts", async () => {
    const worker = new InlineWorker();
    const coordinator = new VolumeWorkerCoordinator(() => worker, new VolumeJobCache(1_000_000), () => ({ volumeRevision: 1, sampledGridRevision: 1 }));
    const lifecycle: string[] = [];
    const source = request("histogram", "first", { bins: 12 });
    const first = await coordinator.submit(source, { onLifecycle: (state) => lifecycle.push(state) }).promise;
    expect(first).toMatchObject({ state: "complete", profile: { cacheHit: false, backend: "native-worker" } });
    expect(first.profile.transferredBytes).toBeGreaterThan(dataset.grid.scalars.byteLength);
    expect(lifecycle).toEqual(expect.arrayContaining(["queued", "running", "progressive", "complete"]));
    const cached = await coordinator.submit({ ...source, requestId: "cached" }).promise;
    expect(cached).toMatchObject({ state: "complete", profile: { cacheHit: true, wallTimeMs: 0, transferredBytes: 0 } });
    expect(worker.runs).toBe(1);
    coordinator.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects stale results and preserves the last valid artifact through cancellation and failure", async () => {
    const worker = new ManualWorker();
    let revision = { volumeRevision: 1, sampledGridRevision: 1 };
    const coordinator = new VolumeWorkerCoordinator(() => worker, new VolumeJobCache(), () => revision);
    const validRequest = request("histogram", "valid", { bins: 7 });
    const valid = coordinator.submit(validRequest);
    worker.publish({ type: "result", requestId: validRequest.requestId, volumeRevision: 1, sampledGridRevision: 1, output: { histogram: new Uint32Array([27]) }, wallTimeMs: 4, peakWorkingSetBytes: 512, warnings: [] });
    const validArtifact = await valid.promise;
    expect(validArtifact.state).toBe("complete");

    const staleRequest = request("histogram", "stale", { bins: 9 });
    const stale = coordinator.submit(staleRequest);
    revision = { volumeRevision: 2, sampledGridRevision: 2 };
    worker.publish({ type: "result", requestId: staleRequest.requestId, volumeRevision: 1, sampledGridRevision: 1, output: { histogram: new Uint32Array([1]) }, wallTimeMs: 5, peakWorkingSetBytes: 512, warnings: [] });
    expect(await stale.promise).toMatchObject({ state: "stale", failure: { code: "STALE_REVISION" } });
    expect(coordinator.getLastValid(volume.identity.volumeId, "histogram")?.artifactId).toBe(validArtifact.artifactId);

    revision = { volumeRevision: 1, sampledGridRevision: 1 };
    const cancelled = coordinator.submit(request("sliceVolume", "cancelled", { axis: "x", index: 1 }));
    cancelled.cancel();
    expect(await cancelled.promise).toMatchObject({ state: "cancelled", failure: { code: "CANCELLED" } });
    const failedRequest = request("gradientVolume", "failed");
    const failed = coordinator.submit(failedRequest);
    worker.publish({ type: "error", requestId: failedRequest.requestId, volumeRevision: 1, sampledGridRevision: 1, code: "WORKER_FAILURE", message: "injected worker failure", retryable: true });
    expect(await failed.promise).toMatchObject({ state: "failed", failure: { message: "injected worker failure" } });
    expect(coordinator.getLastValid(volume.identity.volumeId, "histogram")?.artifactId).toBe(validArtifact.artifactId);
    coordinator.dispose();
  });

  it("plans soft/hard memory guards, bricked storage, and 128³/256³ profiles", () => {
    const safe = createVolumeMemoryPlan("histogram", [128, 128, 128], 128 ** 3 * 4);
    expect(safe.level).toBe("safe");
    const bricked = createVolumeMemoryPlan("gradientVolume", [256, 256, 256], 256 ** 3 * 4);
    expect(bricked.brickLayout).toMatchObject({ brickDimensions: [64, 64, 64], halo: 1, order: "x-fastest" });
    const rejected = createVolumeMemoryPlan("marchingCubes", [512, 512, 512], 512 ** 3 * 4);
    expect(rejected.level).toBe("rejected");
    expect(rejected.peakWorkingSetBytes).toBeGreaterThan(VOLUME_MEMORY_LIMITS.hardBytes);
    for (const dimension of [128, 256] as const) {
      expect(profileVolumeAllocation(dimension)).toMatchObject({ dimension, wallTimeMs: 0, cacheBehavior: "cold-plan" });
      expect(profileVolumeAllocation(dimension).transferredBytes).toBeGreaterThan(0);
    }
  });
});
