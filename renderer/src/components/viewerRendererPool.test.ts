import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => ({
  WebGLRenderer: class {
    disposed = false;
    renderLists = { dispose() {} };
    domElement = { remove() {} };
    constructor(readonly options: { antialias: boolean }) {}
    resetState() {}
    setAnimationLoop() {}
    setRenderTarget() {}
    dispose() { this.disposed = true; }
    forceContextLoss() {}
  },
}));

import { acquireViewerRenderer, releaseViewerRenderer } from "./viewerRendererPool";

describe("viewer renderer pool", () => {
  it("reuses a compatible context and destroys an incompatible idle context", () => {
    const sharp = acquireViewerRenderer();
    releaseViewerRenderer(sharp);
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
