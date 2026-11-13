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
  it("reuses a compatible context and destroys an incompatible idle context", () => {
    const sharp = acquireViewerRenderer();
    releaseViewerRenderer(sharp);
    expect((sharp as unknown as { size: [number, number] }).size).toEqual([1, 1]);
    expect((sharp as unknown as { pixelRatio: number }).pixelRatio).toBe(1);
    expect(acquireViewerRenderer()).toBe(sharp);
    releaseViewerRenderer(sharp);

    const performance = acquireViewerRenderer(false);
    expect(performance).not.toBe(sharp);
    expect((sharp as unknown as { disposed: boolean }).disposed).toBe(true);
    releaseViewerRenderer(performance);
    expect(acquireViewerRenderer(false)).toBe(performance);
    releaseViewerRenderer(performance);
  });
});
