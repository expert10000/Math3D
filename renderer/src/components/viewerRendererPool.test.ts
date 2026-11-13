import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => ({
  WebGLRenderer: class {
    disposed = false;
    size: [number, number] | null = null;
    pixelRatio: number | null = null;
    renderLists = { dispose() {} };
    domElement = { remove() {} };
    constructor(readonly options: { antialias: boolean }) {}
    resetState() {}
    setAnimationLoop() {}
    setRenderTarget() {}
    setSize(width: number, height: number) { this.size = [width, height]; }
    setPixelRatio(ratio: number) { this.pixelRatio = ratio; }
    dispose() { this.disposed = true; }
    forceContextLoss() {}
  },
}));

import { acquireViewerRenderer, releaseViewerRenderer } from "./viewerRendererPool";

describe("viewer renderer pool", () => {
  it("retains the four compatible Volume contexts and bounds extra idle contexts", () => {
    const slices = Array.from({ length: 3 }, () => acquireViewerRenderer(false));
    const spatial = acquireViewerRenderer(true);
    for (const renderer of [...slices, spatial]) releaseViewerRenderer(renderer);
    expect((spatial as unknown as { size: [number, number] }).size).toEqual([1, 1]);
    expect((spatial as unknown as { pixelRatio: number }).pixelRatio).toBe(1);
    expect(slices.every(renderer => (renderer as unknown as { size: null }).size === null)).toBe(true);

    const reusedSlices = Array.from({ length: 3 }, () => acquireViewerRenderer(false));
    const reusedSpatial = acquireViewerRenderer(true);
    expect(reusedSlices).toEqual(slices);
    expect(reusedSpatial).toBe(spatial);
    expect([...slices, spatial].every(renderer => !(renderer as unknown as { disposed: boolean }).disposed)).toBe(true);

    const overflow = acquireViewerRenderer(false);
    for (const renderer of [...reusedSlices, reusedSpatial]) releaseViewerRenderer(renderer);
    releaseViewerRenderer(overflow);
    expect((overflow as unknown as { disposed: boolean }).disposed).toBe(true);
  });
});
