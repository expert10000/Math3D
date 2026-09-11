import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "./exactSurfaceAnalysis";
import { analyzeCharacteristicGeometry, classifyGeometryIntersection, promoteCharacteristicLayer } from "./characteristicGeometry";

describe("characteristic geometry", () => {
  it("finds sphere umbilics, silhouettes, poles, and display-only layers", () => {
    const result = analyzeCharacteristicGeometry({ definition: getGeometryExactSurfacePreset("sphere"), uCount: 25, vCount: 17 });
    expect(result.counts.umbilic).toBeGreaterThan(0);
    expect(result.counts.silhouette).toBeGreaterThan(0);
    expect(result.singularities.some((entry) => entry.kind === "pole")).toBe(true);
    expect(result.layers.every((entry) => entry.displayOnly)).toBe(true);
  });

  it("separates elliptic and hyperbolic torus regions with parabolic isolines", () => {
    const result = analyzeCharacteristicGeometry({ definition: getGeometryExactSurfacePreset("torus"), uCount: 33, vCount: 33 });
    expect(result.counts["elliptic-region"]).toBeGreaterThan(0);
    expect(result.counts["hyperbolic-region"]).toBeGreaterThan(0);
    expect(result.counts.parabolic).toBeGreaterThan(0);
  });

  it("classifies analytic crossings, tangencies, overlaps and perturbed near-contact", () => {
    expect(classifyGeometryIntersection({ pair: "curve-curve", distance: 0, directionA: [1, 0, 0], directionB: [0, 1, 0] }).type).toBe("transverse");
    expect(classifyGeometryIntersection({ pair: "curve-surface", distance: 0, directionA: [1, 0, 0], normalB: [0, 0, 1] }).type).toBe("tangent");
    expect(classifyGeometryIntersection({ pair: "surface-surface", distance: 0, normalA: [0, 0, 1], normalB: [0, 1, 0], overlapMeasure: 2 }).type).toBe("overlap");
    expect(classifyGeometryIntersection({ pair: "surface-solid", distance: 5e-6, normalA: [0, 0, 1], normalB: [0, 0, 1] }, 1e-6)).toMatchObject({ type: "near-contact", uncertainty: 1e-6 });
    expect(classifyGeometryIntersection({ pair: "self-intersection", distance: 0, rank: 1, expectedRank: 2 }).type).toBe("degenerate");
  });

  it("requires explicit promotion of a reusable overlay", () => {
    const result = analyzeCharacteristicGeometry({ definition: getGeometryExactSurfacePreset("saddle") });
    expect(() => promoteCharacteristicLayer(result, "hyperbolic", false)).toThrow("explicit user action");
    expect(promoteCharacteristicLayer(result, "hyperbolic", true)).toMatchObject({ id: "geometry-characteristic-hyperbolic", sourceRevision: 1 });
  });
});
