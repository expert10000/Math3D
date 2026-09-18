import { describe, expect, it } from "vitest";
import { adaptAnalyticVolume } from "./infrastructure";
import { createVolumeJobRequest, executeVolumeJobRequest, type VolumeWorkerInbound, type VolumeWorkerOutbound } from "./computation";
import { VolumeWorkerCoordinator, type VolumeWorkerLike } from "./workerCoordinator";
import { VolumeDocumentAdapter, volumeDocumentFromLegacyObject } from "./volumeDocumentAdapter";
import { VolumeExtractionKernelBridge, locateVolumeExtractionVertex, parseVolumeExtraction, promoteVolumeExtraction, serializeVolumeExtraction, volumeExtractionStatus } from "./volumeExtractionKernel";
import { VolumeIsosurfaceScientificJob, VOLUME_ISOSURFACE_OPERATION } from "./volumeScientificJob";
import { computeVolumeIsosurfaceNormals } from "./isosurface";
import { createVolumeWorkspaceDocument, parseVolumeWorkspace, serializeVolumeWorkspace, type VolumeWorkspaceViewState } from "./persistence";
import { getVolumeTransferPreset } from "./transferFunction";

const grid = {
  dims: [5, 5, 5] as [number, number, number], origin: [-2, -2, -2] as [number, number, number], spacing: [1, 1, 1] as [number, number, number],
  scalars: Float32Array.from({ length: 125 }, (_, index) => {
    const x = index % 5 - 2, y = Math.floor(index / 5) % 5 - 2, z = Math.floor(index / 25) - 2;
    return x * x + y * y + z * z - 2.25;
  }),
};
const dataset = { kind: "volume" as const, grid };
const volume = adaptAnalyticVolume({ id: "volume-gk15", label: "Sphere", presetId: "sphere", expression: "x*x+y*y+z*z-2.25", dataset, grid, tracker: new Map(), now: 10 });
const view: VolumeWorkspaceViewState = {
  layout: "quad", viewMode: "slices", paneIndices: { x: 2, y: 2, z: 2 }, crosshair: null, orientation: "scientific",
  linkedNavigation: true, voxelSnap: true, renderMode: "dvr", renderQuality: "balanced", textureSampling: "linear",
  transferFunction: getVolumeTransferPreset("viridis"), renderWindow: [-3, 3], isoValue: 0, crop: null, camera: null,
};

class InlineWorker implements VolumeWorkerLike {
  readonly listeners = new Set<(event: MessageEvent<VolumeWorkerOutbound>) => void>();
  readonly cancelled = new Set<string>();
  postMessage(message: VolumeWorkerInbound) {
    if (message.type === "cancel") { this.cancelled.add(message.requestId); return; }
    void executeVolumeJobRequest(message.request, (value) => this.emit(value), () => this.cancelled.has(message.request.requestId))
      .then((value) => this.emit(value));
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { /* no-op */ }
  emit(value: VolumeWorkerOutbound) { queueMicrotask(() => this.listeners.forEach((listener) => listener({ data: value } as MessageEvent<VolumeWorkerOutbound>))); }
}

describe("GK15 Volume extraction kernel", () => {
  it("routes extraction through the broker and publishes a revision-bound Surface, artifact and GK01 lineage", async () => {
    const adapter = new VolumeDocumentAdapter(volumeDocumentFromLegacyObject(volume));
    const bridge = new VolumeExtractionKernelBridge(() => adapter);
    const coordinator = new VolumeWorkerCoordinator(() => new InlineWorker(), undefined, () => ({ volumeRevision: volume.identity.volumeRevision, sampledGridRevision: volume.identity.sampledGridRevision }));
    const jobs = new VolumeIsosurfaceScientificJob(() => adapter, coordinator);
    expect((await jobs.capabilities()).some((backend) => backend.operations.some((operation) => operation.operationType === VOLUME_ISOSURFACE_OPERATION))).toBe(true);
    expect((await jobs.executionCapabilities()).find((capability) => capability.operation.id === VOLUME_ISOSURFACE_OPERATION)?.availableBackends.map((backend) => backend.backendId)).toEqual(["volume-native-worker"]);
    const request = createVolumeJobRequest({ requestId: "volume-gk15-extract", operation: "marchingCubes", volume, grid, parameters: { isoValue: 0 }, backend: "native-worker", algorithmVersion: "marching-cubes-v1" });
    const source = adapter.sourceGeneration();
    const outcome = await jobs.submit(request).promise;
    expect(outcome.broker.ok).toBe(true);
    const artifact = outcome.artifact!;
    expect(artifact.output.positions!.length).toBeGreaterThan(0);
    const geometry = { positions: artifact.output.positions!, indices: artifact.output.indices!, normals: computeVolumeIsosurfaceNormals(volume, grid, artifact.output.positions!).normals };
    const record = bridge.publish(request, artifact, geometry, source, "iso:volume-gk15:1:0")!;
    expect(record.surface.source.representation).toBe("mesh-backed");
    expect(record.result.status).toBe("numerical");
    expect(record.relations).toHaveLength(3);
    expect(record.relations.every((relation) => relation.sources[0].structuralHash === source.structuralHash)).toBe(true);
    expect(locateVolumeExtractionVertex(record, geometry, 0)).toMatchObject({ state: "mapped", source });
    expect(bridge.artifacts().resolve(record.result.artifacts[0], source).ok).toBe(true);
    expect(JSON.stringify(record)).not.toContain("scalars");
    expect(parseVolumeExtraction(serializeVolumeExtraction(record))).toEqual(record);
    const workspace = createVolumeWorkspaceDocument({ volume, kernelDocument: adapter.document(), view, extractions: [record],
      artifacts: [{ id: record.artifactId, role: "derived-result", storage: "content-addressed", uri: `artifact:${record.artifactId}`,
        contentHash: record.contentHash, byteLength: record.byteLength, scalarType: "triangle-mesh", components: 3 }] });
    expect(parseVolumeWorkspace(serializeVolumeWorkspace(workspace)).extractions).toEqual([record]);
    expect(volumeExtractionStatus(record, source)).toBe("current");
    expect(volumeExtractionStatus(record, source, false)).toBe("unavailable");
    const snapshot = promoteVolumeExtraction(record, "iso:volume-gk15:1:0:snapshot");
    adapter.commitSource({ ...adapter.document().source, recipe: { ...adapter.document().source.recipe, expression: "x+y+z" } });
    bridge.invalidate();
    expect(volumeExtractionStatus(record, adapter.sourceGeneration())).toBe("stale");
    expect(volumeExtractionStatus(snapshot, adapter.sourceGeneration())).toBe("snapshot");
    expect(bridge.artifacts().resolve(record.result.artifacts[0], source).ok).toBe(false);
    jobs.dispose();
  });

  it("rejects unsafe memory plans before scheduling the worker", () => {
    const adapter = new VolumeDocumentAdapter(volumeDocumentFromLegacyObject(volume));
    const jobs = new VolumeIsosurfaceScientificJob(() => adapter, new VolumeWorkerCoordinator(() => { throw new Error("Worker should not start."); }));
    const request = createVolumeJobRequest({ requestId: "unsafe-volume", operation: "marchingCubes", volume, grid, parameters: { isoValue: 0 } });
    expect(() => jobs.submit({ ...request, dimensions: [10_000, 10_000, 10_000] })).toThrow();
    jobs.dispose();
  });
});
