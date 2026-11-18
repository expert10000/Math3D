import { describe, expect, it, vi } from "vitest";

vi.mock("three", () => ({
  Vector2: class {
    constructor(public x = 0, public y = 0) {}
    set(x: number, y: number) { this.x = x; this.y = y; return this; }
  },
  WebGLRenderer: class {
    disposed = false;
    size: [number, number] = [300, 150];
    pixelRatio = 1;
    bufferResizes = 0;
    renderLists = { dispose() {} };
    domElement = { remove() {} };
    constructor(readonly options: { antialias: boolean }) {}
    resetState() {}
    setAnimationLoop() {}
    setRenderTarget() {}
    getSize(target: { set: (width: number, height: number) => unknown }) { target.set(...this.size); return target; }
    getPixelRatio() { return this.pixelRatio; }
    setSize(width: number, height: number) { this.size = [width, height]; this.bufferResizes++; }
    setPixelRatio(ratio: number) { this.pixelRatio = ratio; this.bufferResizes++; }
    dispose() { this.disposed = true; }
    forceContextLoss() {}
  },
}));

import { acquireViewerRenderer, releaseViewerRenderer, setViewerRendererPixelRatio, setViewerRendererSize } from "./viewerRendererPool";

describe("viewer renderer pool", () => {
  it("reuses separate Volume, parametric, and implicit/Mesh contexts without resizing idle buffers", () => {
    const slices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const spatial = acquireViewerRenderer(true, "volume-spatial");
    const general = acquireViewerRenderer(true);
    const parametric = acquireViewerRenderer(true, "parametric");
    expect(general).not.toBe(spatial);
    expect(parametric).not.toBe(general);
    (spatial as unknown as { setSize: (width: number, height: number) => void }).setSize(640, 480);
    (spatial as unknown as { setPixelRatio: (ratio: number) => void }).setPixelRatio(1.25);
    setViewerRendererSize(general, 800, 600);
    setViewerRendererSize(parametric, 640, 480);
    for (const renderer of [...slices, spatial, general, parametric]) releaseViewerRenderer(renderer);
    expect((spatial as unknown as { size: [number, number] }).size).toEqual([640, 480]);
    expect((spatial as unknown as { pixelRatio: number }).pixelRatio).toBe(1.25);
    expect(slices.every(renderer => (renderer as unknown as { bufferResizes: number }).bufferResizes === 0)).toBe(true);

    const reusedSlices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const reusedSpatial = acquireViewerRenderer(true, "volume-spatial");
    const reusedGeneral = acquireViewerRenderer(true);
    const reusedParametric = acquireViewerRenderer(true, "parametric");
    expect(reusedSlices).toEqual(slices);
    expect(reusedSpatial).toBe(spatial);
    expect(reusedGeneral).toBe(general);
    expect(reusedParametric).toBe(parametric);
    expect([...slices, spatial, general, parametric].every(renderer => !(renderer as unknown as { disposed: boolean }).disposed)).toBe(true);
    const generalResizes = (general as unknown as { bufferResizes: number }).bufferResizes;
    const parametricResizes = (parametric as unknown as { bufferResizes: number }).bufferResizes;
    setViewerRendererSize(reusedGeneral, 800, 600);
    setViewerRendererSize(reusedParametric, 640, 480);
    expect((general as unknown as { bufferResizes: number }).bufferResizes).toBe(generalResizes);
    expect((parametric as unknown as { bufferResizes: number }).bufferResizes).toBe(parametricResizes);

    const overflow = acquireViewerRenderer(false);
    for (const renderer of [...reusedSlices, reusedSpatial, reusedGeneral, reusedParametric]) releaseViewerRenderer(renderer);
    releaseViewerRenderer(overflow);
    expect((overflow as unknown as { disposed: boolean }).disposed).toBe(true);
  });
  it("refuses incompatible Volume roles", () => {
    expect(() => acquireViewerRenderer(false, "volume-spatial")).toThrow();
    expect(() => acquireViewerRenderer(true, "volume-slice")).toThrow();
  });
  it("does not replace a pooled drawing buffer for identical size and pixel ratio", () => {
    const renderer = acquireViewerRenderer(true, "volume-spatial");
    setViewerRendererPixelRatio(renderer, 1.25);
    setViewerRendererSize(renderer, 640, 480);
    const resizes = (renderer as unknown as { bufferResizes: number }).bufferResizes;
    releaseViewerRenderer(renderer);
    const reused = acquireViewerRenderer(true, "volume-spatial");
    expect(reused).toBe(renderer);
    setViewerRendererPixelRatio(reused, 1.25);
    setViewerRendererSize(reused, 640, 480);
    expect((reused as unknown as { bufferResizes: number }).bufferResizes).toBe(resizes);
    setViewerRendererSize(reused, 800, 480);
    expect((reused as unknown as { bufferResizes: number }).bufferResizes).toBe(resizes + 1);
    releaseViewerRenderer(reused);
  });
});
