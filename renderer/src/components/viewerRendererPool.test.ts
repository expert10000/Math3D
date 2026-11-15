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
  it("reuses separate Volume and Surface/Mesh contexts without resizing their idle buffers", () => {
    const slices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const spatial = acquireViewerRenderer(true, "volume-spatial");
    const general = acquireViewerRenderer(true);
    expect(general).not.toBe(spatial);
    (spatial as unknown as { setSize: (width: number, height: number) => void }).setSize(640, 480);
    (spatial as unknown as { setPixelRatio: (ratio: number) => void }).setPixelRatio(1.25);
    for (const renderer of [...slices, spatial, general]) releaseViewerRenderer(renderer);
    expect((spatial as unknown as { size: [number, number] }).size).toEqual([640, 480]);
    expect((spatial as unknown as { pixelRatio: number }).pixelRatio).toBe(1.25);
    expect(slices.every(renderer => (renderer as unknown as { size: null }).size === null)).toBe(true);

    const reusedSlices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const reusedSpatial = acquireViewerRenderer(true, "volume-spatial");
    const reusedGeneral = acquireViewerRenderer(true);
    expect(reusedSlices).toEqual(slices);
    expect(reusedSpatial).toBe(spatial);
    expect(reusedGeneral).toBe(general);
    expect([...slices, spatial, general].every(renderer => !(renderer as unknown as { disposed: boolean }).disposed)).toBe(true);

    const overflow = acquireViewerRenderer(false);
    for (const renderer of [...reusedSlices, reusedSpatial, reusedGeneral]) releaseViewerRenderer(renderer);
    releaseViewerRenderer(overflow);
    expect((overflow as unknown as { disposed: boolean }).disposed).toBe(true);
  });
  it("refuses incompatible Volume roles", () => {
    expect(() => acquireViewerRenderer(false, "volume-spatial")).toThrow();
    expect(() => acquireViewerRenderer(true, "volume-slice")).toThrow();
  });
});
