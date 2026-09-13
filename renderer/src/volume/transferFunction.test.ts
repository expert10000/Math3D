import { describe, expect, it } from "vitest";
import {
  VOLUME_TRANSFER_PRESETS,
  createVolumeTransferTextureData,
  planVolumeRendering,
  restoreVolumeTransferFunction,
  renderVolumeProjectionCpu,
  sampleVolumeTransferFunction,
  serializeVolumeTransferFunction,
  volumeRenderStepCount,
} from "./transferFunction";

describe("Volume transfer functions and rendering plans", () => {
  it("interpolates deterministic color and opacity points", () => {
    const transfer = VOLUME_TRANSFER_PRESETS[0];
    expect(sampleVolumeTransferFunction(transfer, 0)).toEqual([0, 0, 0, 0]);
    const middle = sampleVolumeTransferFunction(transfer, 0.5);
    expect(middle.slice(0, 3)).toEqual([0.5, 0.5, 0.5]);
    expect(middle[3]).toBeGreaterThan(0.05);
    const texture = createVolumeTransferTextureData(transfer, 32);
    expect(texture).toHaveLength(128);
    expect(texture[0]).toBe(0);
    expect(texture[127]).toBeGreaterThan(200);
  });

  it("round-trips exact normalized control points", () => {
    for (const preset of VOLUME_TRANSFER_PRESETS) {
      const restored = restoreVolumeTransferFunction(serializeVolumeTransferFunction(preset));
      expect(restored).toEqual(preset);
    }
  });

  it("chooses direct, bricked, and CPU fallback paths explicitly", () => {
    expect(planVolumeRendering([64, 64, 64], { webgl2: true, max3dTextureSize: 2048, budgetBytes: 4_000_000 }).path).toBe("gpu-3d-texture");
    expect(planVolumeRendering([256, 256, 256], { webgl2: true, max3dTextureSize: 2048, budgetBytes: 1_000_000 }).path).toBe("gpu-bricked");
    expect(planVolumeRendering([64, 64, 64], { webgl2: false, max3dTextureSize: 0, budgetBytes: 0 }).path).toBe("cpu-2d-fallback");
    expect(planVolumeRendering([4096, 64, 64], { webgl2: true, max3dTextureSize: 2048, budgetBytes: Number.MAX_SAFE_INTEGER }).path).toBe("unsupported");
    expect(volumeRenderStepCount("interactive")).toBeLessThan(volumeRenderStepCount("full"));
  });

  it("produces stable CPU projection baselines for all direct modes", () => {
    const scalars = new Float32Array([0, 0.25, 0.5, 0.75, 0.1, 0.4, 0.8, 1]);
    const transferFunction = VOLUME_TRANSFER_PRESETS[0];
    const summaries = (["mip", "minip", "average", "dvr"] as const).map((mode) => {
      const image = renderVolumeProjectionCpu({ scalars, dimensions: [2, 2, 2], mode, transferFunction });
      return [mode, image.rgba.reduce((sum, value) => sum + value, 0)];
    });
    expect(summaries).toEqual([["mip", 2207], ["minip", 1387], ["average", 1789], ["dvr", 2173]]);
  });
});
