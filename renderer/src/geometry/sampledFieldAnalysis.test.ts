import { describe, expect, it } from "vitest";
import { DEFAULT_GEOMETRY_SAMPLING_BUDGETS, runGeometrySampledFieldRequest, validateGeometryWorkerPublication, type GeometrySampledFieldProgress } from "./sampledFieldAnalysis";

const request = { requestId: "field-1", sourceObjectId: "surface-1", sourceRevision: 4, surfaceId: "sphere" as const, requestedSamples: 12_000, quantity: "K" as const, density: 0.5 };
describe("Geometry sampled field worker core", () => {
  it("publishes pointwise, coarse, refined and full stages", async () => {
    const stages: string[] = [];
    const result = await runGeometrySampledFieldRequest({ request, publish: (progress) => stages.push(progress.stage) });
    expect(stages).toEqual(["pointwise", "coarse", "refined", "full"]);
    expect(result).toMatchObject({ status: "complete", sampleCount: 12_000, sourceRevision: 4 });
    expect(new Set(result.overlays.map((overlay) => overlay.kind))).toEqual(new Set(["scalar-heatmap", "vector-field", "points", "polylines", "contours", "glyphs", "frames", "labels", "diagnostics"]));
  });
  it("enforces 100k and display budgets", async () => {
    const result = await runGeometrySampledFieldRequest({ request: { ...request, requestedSamples: 120_000 }, publish: () => undefined });
    expect(result.sampleCount).toBe(DEFAULT_GEOMETRY_SAMPLING_BUDGETS.maxSamples);
    expect(result.overlays.find((overlay) => overlay.kind === "glyphs")!.sampleCount).toBeLessThanOrEqual(DEFAULT_GEOMETRY_SAMPLING_BUDGETS.maxGlyphs);
    expect(result.warnings.join(" ")).toContain("clamped");
  }, 15_000);
  it("cancels cooperatively before publishing changed state", async () => {
    let checks = 0;
    const result = await runGeometrySampledFieldRequest({ request, publish: () => undefined, isCancelled: () => ++checks > 20 });
    expect(result.status).toBe("cancelled");
  });
  it("samples dense analytic curve fields in the same worker contract", async () => {
    const result = await runGeometrySampledFieldRequest({ request: { ...request, targetKind: "curve", surfaceId: undefined, curveId: "helix", requestedSamples: 10_000, quantity: "torsion" }, publish: () => undefined });
    expect(result).toMatchObject({ stage: "full", status: "complete", sampleCount: 10_000 });
    expect(result.overlays.find((entry) => entry.kind === "scalar-heatmap")?.scalarValues?.every(Number.isFinite)).toBe(true);
  });
  it("rejects stale and superseded responses", () => {
    const progress = { requestId: "field-1", sourceRevision: 4 } as GeometrySampledFieldProgress;
    expect(validateGeometryWorkerPublication({ requestId: "field-1", sourceRevision: 4 }, progress)).toBe("accept");
    expect(validateGeometryWorkerPublication({ requestId: "field-2", sourceRevision: 4 }, progress)).toBe("superseded");
    expect(validateGeometryWorkerPublication({ requestId: "field-1", sourceRevision: 5 }, progress)).toBe("stale");
  });
});
