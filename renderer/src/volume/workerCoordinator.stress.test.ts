import { describe, expect, it } from "vitest";
import { VolumeJobCache, type VolumeJobRequest, type VolumeWorkerInbound, type VolumeWorkerOutbound } from "./computation";
import { VolumeWorkerCoordinator, type VolumeWorkerLike } from "./workerCoordinator";

class ControlledWorker implements VolumeWorkerLike {
  readonly listeners = new Set<(event: MessageEvent<VolumeWorkerOutbound>) => void>();
  readonly messages: VolumeWorkerInbound[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  postMessage(message: VolumeWorkerInbound) { this.messages.push(message); }
  addEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent<VolumeWorkerOutbound>) => void) { this.listeners.delete(listener); }
  terminate() { this.terminated = true; }
  result(requestId: string, value: number, revision = 1) {
    const data: VolumeWorkerOutbound = { type: "result", requestId, volumeRevision: revision,
      sampledGridRevision: revision, output: { histogram: Uint32Array.of(value) },
      wallTimeMs: 1, peakWorkingSetBytes: 16, warnings: [] };
    for (const listener of this.listeners) listener({ data } as MessageEvent<VolumeWorkerOutbound>);
  }
}

const request = (index: number, revision = 1): VolumeJobRequest => ({
  requestId: `storm-${index}`, operation: "histogram", volumeId: "stress-volume",
  volumeRevision: revision, sampledGridRevision: revision, volumeFingerprint: `stress-${revision}`,
  dependencies: [], algorithmVersion: "stress-v1", backend: "native-worker",
  dimensions: [4, 4, 4], origin: [0, 0, 0], spacing: [1, 1, 1],
  scalars: new Float32Array(64), parameters: { bins: index + 2 },
});

describe("M3D20-10 Volume worker stress", () => {
  it("cancels 99 superseded requests and ignores all late completions", async () => {
    const worker = new ControlledWorker();
    const coordinator = new VolumeWorkerCoordinator(() => worker, new VolumeJobCache(1024),
      () => ({ volumeRevision: 1, sampledGridRevision: 1 }));
    const handles = Array.from({ length: 100 }, (_, index) => coordinator.submit(request(index)));
    const old = await Promise.all(handles.slice(0, -1).map(handle => handle.promise));
    expect(old.every(artifact => artifact.state === "cancelled")).toBe(true);
    expect(worker.messages.filter(message => message.type === "cancel")).toHaveLength(99);
    for (let index = 98; index >= 0; index--) worker.result(`storm-${index}`, -1);
    expect(coordinator.diagnostics().activeJobs).toBe(1);
    worker.result("storm-99", 100);
    expect((await handles[99]!.promise).output.histogram?.[0]).toBe(100);
    expect(coordinator.getLastValid("stress-volume", "histogram")?.output.histogram?.[0]).toBe(100);
    expect(coordinator.diagnostics()).toMatchObject({ activeJobs: 0, cache: { entries: 1 } });
    coordinator.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("refuses a rapid source edit and fails all in-flight operations on worker exit", async () => {
    let revision = 1;
    const workers = [new ControlledWorker(), new ControlledWorker()];
    let created = 0;
    const coordinator = new VolumeWorkerCoordinator(() => workers[created++]!, new VolumeJobCache(),
      () => ({ volumeRevision: revision, sampledGridRevision: revision }));
    const old = coordinator.submit(request(0));
    revision = 2;
    const stale = coordinator.submit(request(1));
    expect(await stale.promise).toMatchObject({ state: "stale", failure: { code: "STALE_REVISION" } });
    workers[0]!.result("storm-0", 1);
    expect(await old.promise).toMatchObject({ state: "stale", failure: { code: "STALE_REVISION" } });
    const first = coordinator.submit(request(2, 2));
    const second = coordinator.submit({ ...request(3, 2), operation: "gradientVolume" });
    workers[0]!.onerror?.({ message: "injected exit", preventDefault: () => undefined } as ErrorEvent);
    expect((await Promise.all([first.promise, second.promise])).every(value =>
      value.state === "failed" && value.failure?.code === "WORKER_FAILURE")).toBe(true);
    expect(workers[0]!.terminated).toBe(true);
    const retry = coordinator.submit(request(4, 2));
    workers[1]!.result("storm-4", 4, 2);
    expect((await retry.promise).output.histogram?.[0]).toBe(4);
    coordinator.dispose();
  });
});
