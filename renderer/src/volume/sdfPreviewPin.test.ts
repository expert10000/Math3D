import { describe, expect, it } from "vitest";
import type { VolumeDataset } from "../scene/datasets";
import { createSdfPreviewPin, qualifySdfPreview, type SdfPreviewSettings } from "./sdfPreviewPin";

describe("SDF preview pin", () => {
  it("rejects changed source bytes, secondary operand and settings", () => {
    const source: VolumeDataset = { kind: "volume", sourceId: "distance-a", grid: { dims: [2, 2, 1], scalars: new Float32Array([1, 2, 3, 4]) } };
    const operand = { dims: [2, 2, 1] as [number, number, number], scalars: new Float32Array([0, 1, 0, 1]) };
    const settings: SdfPreviewSettings = { operation: "union", amount: 0.1, smoothness: 0.2, presetId: "sphere" };
    const pin = createSdfPreviewPin(source, operand, settings);
    expect(qualifySdfPreview(pin, source, operand, settings).current).toBe(true);
    expect(qualifySdfPreview(pin, source, operand, { ...settings, amount: 0.3 }).current).toBe(false);
    operand.scalars[0] = 2;
    expect(qualifySdfPreview(pin, source, operand, settings).reason).toMatch(/operand changed/);
    operand.scalars[0] = 0;
    source.grid.scalars[1] = 8;
    expect(qualifySdfPreview(pin, source, operand, settings).reason).toMatch(/source grid/);
  });
});
