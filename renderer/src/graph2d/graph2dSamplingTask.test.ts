import { describe, expect, it, vi } from "vitest";
import { createEmptyGraph2DDocument, type Graph2DSceneSamplingRequest } from "@math3d/core";
import { startGraph2DSamplingTask, type Graph2DSamplingWorker } from "./graph2dSamplingTask";

const request: Graph2DSceneSamplingRequest = { document: createEmptyGraph2DDocument("job-test"),
  viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, aspect: "free" }, width: 100, height: 100, interaction: false };
const worker = (): Graph2DSamplingWorker => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null });
describe("real sampling worker lifecycle", () => {
  it("terminates on replacement/unmount and ignores late captured callbacks", () => {
    const first = worker(), publish = vi.fn();
    const cancel = startGraph2DSamplingTask(first, "first", request, publish);
    const lateMessage = first.onmessage!;
    cancel(); cancel();
    lateMessage({ data: { jobId: "first", series: [] } } as MessageEvent);
    expect(first.terminate).toHaveBeenCalledTimes(1);
    expect(first.onmessage).toBeNull(); expect(publish).not.toHaveBeenCalled();
  });
  it("accepts only its current job and disposes after completion", () => {
    const current = worker(), publish = vi.fn();
    startGraph2DSamplingTask(current, "current", request, publish);
    current.onmessage!({ data: { jobId: "stale", series: [] } } as MessageEvent);
    expect(publish).not.toHaveBeenCalled();
    current.onmessage!({ data: { jobId: "current", series: [] } } as MessageEvent);
    expect(publish).toHaveBeenCalledTimes(1); expect(current.terminate).toHaveBeenCalledTimes(1);
  });
  it("enforces timeout and cleans worker errors", () => {
    vi.useFakeTimers();
    try {
      const slow = worker(), publish = vi.fn();
      startGraph2DSamplingTask(slow, "slow", request, publish, 20);
      vi.advanceTimersByTime(21);
      expect(slow.terminate).toHaveBeenCalledTimes(1); expect(publish.mock.calls[0]?.[1]).toMatch(/time budget/);
      const failed = worker(); startGraph2DSamplingTask(failed, "failed", request, publish);
      failed.onerror!(); expect(failed.terminate).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
