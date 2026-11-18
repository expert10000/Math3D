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
    info = { memory: { geometries: 0, textures: 0 }, programs: [] };
    domElement = { dataset: {} as Record<string, string>, remove() {} };
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
    expect(slices.every(renderer => (renderer as unknown as { bufferResizes: number }).bufferResizes === 0)).toBe(true);

    const reusedSlices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const reusedSpatial = acquireViewerRenderer(true, "volume-spatial");
    const reusedGeneral = acquireViewerRenderer(true);
    expect(reusedSlices).toEqual(slices);
    expect(reusedSpatial).toBe(spatial);
    expect(reusedGeneral).toBe(general);
    expect((reusedGeneral.domElement.dataset as Record<string, string>).viewerPoolSerial).toMatch(/^\d+$/);
    expect((reusedGeneral.domElement.dataset as Record<string, string>).viewerPoolRole).toBe("general");
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
  it("does not replace a pooled drawing buffer for identical size and pixel ratio", () => {
    const renderer = acquireViewerRenderer(true, "volume-spatial");
    const pixelRatioChanges = Number(renderer.domElement.dataset.viewerPoolPixelRatioChanges ?? 0);
    setViewerRendererPixelRatio(renderer, 1.75);
    setViewerRendererSize(renderer, 640, 480);
    const sizeChanges = Number(renderer.domElement.dataset.viewerPoolSizeChanges ?? 0);
    expect(Number(renderer.domElement.dataset.viewerPoolPixelRatioChanges)).toBe(pixelRatioChanges + 1);
    const resizes = (renderer as unknown as { bufferResizes: number }).bufferResizes;
    releaseViewerRenderer(renderer);
    const reused = acquireViewerRenderer(true, "volume-spatial");
    expect(reused).toBe(renderer);
    setViewerRendererPixelRatio(reused, 1.75);
    setViewerRendererSize(reused, 640, 480);
    expect((reused as unknown as { bufferResizes: number }).bufferResizes).toBe(resizes);
    expect(Number(reused.domElement.dataset.viewerPoolSizeChanges ?? 0)).toBe(sizeChanges);
    setViewerRendererSize(reused, 800, 480);
    expect((reused as unknown as { bufferResizes: number }).bufferResizes).toBe(resizes + 1);
    expect(Number(reused.domElement.dataset.viewerPoolSizeChanges)).toBe(sizeChanges + 1);
    releaseViewerRenderer(reused);
  });
  it("retires the general context after bounded reuse while retaining Volume contexts", () => {
    const slices = Array.from({ length: 3 }, () => acquireViewerRenderer(false, "volume-slice"));
    const spatial = acquireViewerRenderer(true, "volume-spatial");
    const general = acquireViewerRenderer(true);
    const target = acquireViewerRenderer(false);
    for (let visit = 1; visit < 250; visit++) {
      releaseViewerRenderer(target);
      expect((target as unknown as { disposed: boolean }).disposed).toBe(false);
      expect(acquireViewerRenderer(false)).toBe(target);
    }
    releaseViewerRenderer(target);
    expect((target as unknown as { disposed: boolean }).disposed).toBe(true);
    for (const renderer of [...slices, spatial, general]) releaseViewerRenderer(renderer);
    expect((spatial as unknown as { disposed: boolean }).disposed).toBe(false);
  });
});
