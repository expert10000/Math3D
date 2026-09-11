import { describe, expect, it, vi } from "vitest";
import { GeometrySamplingWorkerClient } from "./geometrySamplingWorkerClient";
import type { GeometrySampledFieldProgress, GeometrySampledFieldRequest } from "./sampledFieldAnalysis";

class FakeWorker {
  onmessage: ((event: MessageEvent<GeometrySampledFieldProgress>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  postMessage(message: unknown) { this.messages.push(message); }
  terminate() {}
  emit(progress: GeometrySampledFieldProgress) { this.onmessage?.({ data: progress } as MessageEvent<GeometrySampledFieldProgress>); }
}
const request: GeometrySampledFieldRequest = { requestId: "a", sourceObjectId: "surface", sourceRevision: 2, surfaceId: "sphere", requestedSamples: 100, quantity: "K", density: 1 };
const complete = (id = "a", revision = 2): GeometrySampledFieldProgress => ({ requestId: id, sourceObjectId: "surface", sourceRevision: revision, stage: "full", progress: 1, status: "complete", sampleCount: 100, durationMs: 1, overlays: [], warnings: [], budgets: { maxSamples: 100000, maxGlyphs: 2000, maxLabels: 300, maxPolylines: 1000, maxUploadBytes: 1, targetFrameMs: 8 } });

describe("Geometry sampling worker client", () => {
  it("accepts matching progress and ignores stale revision responses", async () => {
    const worker = new FakeWorker();
    const client = new GeometrySamplingWorkerClient(worker as unknown as Worker);
    const seen: GeometrySampledFieldProgress[] = [];
    const promise = client.run(request, (progress) => seen.push(progress));
    worker.emit(complete("a", 3));
    expect(seen).toHaveLength(0);
    worker.emit(complete());
    await expect(promise).resolves.toMatchObject({ status: "complete" });
    expect(seen).toHaveLength(1);
  });
  it("cancels and rejects the old request when superseded", async () => {
    const worker = new FakeWorker();
    const client = new GeometrySamplingWorkerClient(worker as unknown as Worker);
    const old = client.run(request, () => undefined);
    const next = client.run({ ...request, requestId: "b" }, () => undefined);
    await expect(old).rejects.toThrow("superseded");
    expect(worker.messages).toContainEqual({ type: "cancel", requestId: "a" });
    worker.emit(complete("b"));
    await expect(next).resolves.toMatchObject({ requestId: "b" });
  });
  it("cancels on timeout", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new GeometrySamplingWorkerClient(worker as unknown as Worker);
    const result = client.run(request, () => undefined, 5);
    const rejection = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(6);
    await rejection;
    expect(worker.messages).toContainEqual({ type: "cancel", requestId: "a" });
    vi.useRealTimers();
  });
});
