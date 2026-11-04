import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeVectorField3DLIC, parseMath3DProject,
  sampleVectorField3DSlice, type VectorField3DDocument } from "@math3d/core";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const source = () => parseMath3DProject(readFileSync(fixture, "utf8"))
  .workspace.entries.find(item => item.module === "vector3d")!.checkpoint as VectorField3DDocument;
const slice = () => {
  const document = source(), axis = document.source.axes[2];
  return sampleVectorField3DSlice(document, 2, (axis.min + axis.max) / 2);
};
const options = { width: 24, height: 24, steps: 6, noiseSeed: 73,
  maxWork: 10_000, timeBudgetMs: 5000 } as const;

describe("GF-15 bounded orthogonal CPU LIC", () => {
  it("has deterministic pixels, source lineage, boundary stops, and measured work", () => {
    const plane = slice();
    const first = computeVectorField3DLIC(plane, options);
    const second = computeVectorField3DLIC(plane, options);
    expect(first.source).toEqual(plane.source);
    expect(first.method).toBe("cpu-bilinear-lic-rk2");
    expect(first.state).toBe("complete");
    expect(first.coveredPixels).toBeGreaterThan(0);
    expect(first.stoppedAtBoundary).toBeGreaterThan(0);
    expect(first.elapsedMs).toBeGreaterThanOrEqual(0);
    const interaction = computeVectorField3DLIC(plane, { ...options,
      width: 96, height: 96, maxWork: 200_000, timeBudgetMs: 300 });
    console.info("GF-15 CPU LIC interaction", interaction.elapsedMs.toFixed(1),
      "ms", interaction.state, interaction.coveredPixels, "pixels");
    expect(first.pixels).toEqual(second.pixels);
  });

  it("masks missing data and stops on declared work and time caps", () => {
    const plane = slice();
    const vectors = [...plane.vectors!];
    vectors[0] = null;
    const missing = computeVectorField3DLIC({ ...plane, vectors }, options);
    expect(missing.stoppedAtMissing).toBeGreaterThan(0);
    expect(missing.mask[0]).toBe(0);
    expect(computeVectorField3DLIC(plane, { ...options, maxWork: 10 }).state)
      .toBe("work-budget");
    let tick = 0;
    expect(computeVectorField3DLIC(plane, { ...options, timeBudgetMs: 1 },
      () => ++tick).state).toBe("time-budget");
    expect(() => computeVectorField3DLIC({ ...plane, planeUnits: ["m", "s"] },
      options)).toThrow(/matching physical axis units/);
  });
});
