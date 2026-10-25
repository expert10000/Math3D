import { describe, expect, it } from "vitest";
import { createVectorField3DDocument, sampleVectorField3DArrows,
  vectorField3DExpression } from "@math3d/core";
import { selectVectorField3DPreview } from "./vectorField3DProgressivePreview";

const axes = (["x", "y", "z"] as const).map(role => ({ role, label: role,
  unit: "m", min: -4, max: 4 })) as [
    { role: "x"; label: string; unit: string; min: number; max: number },
    { role: "y"; label: string; unit: string; min: number; max: number },
    { role: "z"; label: string; unit: string; min: number; max: number },
  ];
const document = createVectorField3DDocument({ axes, timeUnit: "s", field: {
  kind: "expressions", components: [vectorField3DExpression("1", "m/s"),
    vectorField3DExpression("0", "m/s"), vectorField3DExpression("0", "m/s")],
}, seeds: [], display: { density: [10, 10, 10], maxGlyphs: 1000,
  magnitudeScale: 1, colorBy: "speed" }, solver: { absoluteTolerance: 1e-6,
  relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 } },
{ stableKey: "progressive-arrow-preview" });

describe("SCI-04 progressive 3D arrow display", () => {
  it("selects a bounded, repeatable spatial overview from unchanged evaluated samples", () => {
    const artifact = sampleVectorField3DArrows(document);
    const original = artifact.arrows;
    const overview = selectVectorField3DPreview(artifact, axes, "overview");
    const again = selectVectorField3DPreview(artifact, axes, "overview");
    const full = selectVectorField3DPreview(artifact, axes, "full");
    expect(overview.detail).toBe("overview");
    expect(overview.count).toBeLessThanOrEqual(192);
    expect(overview.count).toBeGreaterThan(100);
    expect(overview.selectionHash).toBe(again.selectionHash);
    expect(overview.arrows).toEqual(again.arrows);
    expect(overview.arrows.every(arrow => original.includes(arrow))).toBe(true);
    expect(full.count).toBe(artifact.accepted);
    expect(full.arrows).toEqual(original);
    expect(full.selectionHash).not.toBe(overview.selectionHash);
    expect(artifact.arrows).toBe(original);
    expect(artifact.verifiedSamples).toBeNull();
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.min(...overview.arrows.map(arrow => arrow.position[axis]!))).toBeLessThan(-2.5);
      expect(Math.max(...overview.arrows.map(arrow => arrow.position[axis]!))).toBeGreaterThan(2.5);
    }
  });
});
