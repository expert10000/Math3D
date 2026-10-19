import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, sampleGraph2DScene, sampleGraph2DTrajectory,
  selectionForGraph2DObject, type Graph2DDocument } from "@math3d/core";

const domain = { min: -2, max: 2, includeMin: true, includeMax: true };
const yDomain = { min: -100, max: 100, includeMin: true, includeMax: true };
const style = { color: "#e11d48", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const viewport = { xMin: -2, xMax: 2, yMin: -4, yMax: 4, aspect: "free" as const };
const create = (expression: string, x = 0, y = 0): Graph2DDocument => {
  const empty = createEmptyGraph2DDocument(`trajectory:${expression}`);
  const field = applyGraph2DAuthoring(empty, { type: "create-slope-field", draft: {
    label: "field", expression, domain, yDomain, style } });
  const document = createGraph2DDocument({ ...field, stableKey: `trajectory:${expression}` });
  const trajectory = applyGraph2DAuthoring(document, { type: "create-trajectory", draft: {
    label: "solution", sourceFieldId: "slope_field_1", seed: { x, y }, style } });
  return createGraph2DDocument({ ...trajectory, stableKey: `trajectory:${expression}` });
};
const solve = (document: Graph2DDocument) => {
  const field = document.source.objects[0]!, object = document.source.objects[1]!;
  if (field.kind !== "slope-field" || object.kind !== "trajectory") throw new Error("Expected linked field and trajectory.");
  return sampleGraph2DTrajectory({ field, object, variables: {}, viewport, maxSamples: 12000 });
};
const nearest = (points: readonly { x: number; y: number }[], x: number) =>
  points.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best);

describe("GRA-11.2 initial-value trajectories", () => {
  it("solves exact reference equations in both x directions", () => {
    for (const [expression, seedY, expected] of [
      ["0", 2, (_x: number) => 2], ["x", 0, (x: number) => x * x / 2],
      ["y", 1, (x: number) => Math.exp(x)],
    ] as const) {
      const artifact = solve(create(expression, 0, seedY));
      expect(artifact.stops).toEqual({ backward: "domain-boundary", forward: "domain-boundary" });
      expect(artifact.converged).toBe(true);
      const points = artifact.segments[0]!.points;
      expect(points[0]!.x).toBeCloseTo(-2, 7);
      expect(points.at(-1)!.x).toBeCloseTo(2, 7);
      for (const x of [-1, 0, 1]) {
        const point = nearest(points, x);
        expect(Math.abs(point.y - expected(point.x))).toBeLessThan(2e-5);
      }
    }
  });

  it("keeps source linkage, rejects deletion and invalid seeds, and recomputes after field edit", () => {
    const document = create("0", 0, 1);
    expect(document.requiredCapabilities).toContain("graph2d.trajectory.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(normalizeGraph2DDocument({ ...document, selection: { objectId: "trajectory_1",
      probe: { objectId: "trajectory_1", x: 0, y: 1 } } }).ok).toBe(false);
    expect(() => applyGraph2DAuthoring(document, { type: "delete", objectId: "slope_field_1" })).toThrow(/trajectories/);
    expect(() => applyGraph2DAuthoring(document, { type: "create-trajectory", draft: {
      label: "bad", sourceFieldId: "slope_field_1", seed: { x: 5, y: 0 }, style } })).toThrow(/Initial point/);
    expect(() => applyGraph2DAuthoring(document, { type: "edit-slope-field", objectId: "slope_field_1", draft: {
      label: "field", expression: "0", domain: { ...domain, min: 0.5 }, yDomain, style } })).toThrow(/linked trajectory seeds/);
    const edited = applyGraph2DAuthoring(document, { type: "edit-slope-field", objectId: "slope_field_1", draft: {
      label: "field", expression: "x", domain, yDomain, style } });
    const recomputed = solve(createGraph2DDocument({ ...edited, stableKey: "edited" }));
    const point = nearest(recomputed.segments[0]!.points, 1);
    expect(Math.abs(point.y - (1 + point.x * point.x / 2))).toBeLessThan(2e-5);
    expect(normalizeGraph2DDocument({ ...document, source: { ...document.source,
      objects: document.source.objects.filter(object => object.kind !== "slope-field") } }).ok).toBe(false);
  });

  it("stops before a pole, obeys work budgets, and never treats sampled trajectory points as exact probes", () => {
    const document = create("1/(x-1)");
    const result = solve(document);
    expect(result.segments[0]!.points.every(point => point.x < 1)).toBe(true);
    expect(result.stops.forward).not.toBe("domain-boundary");
    const field = document.source.objects[0]!, object = document.source.objects[1]!;
    if (field.kind !== "slope-field" || object.kind !== "trajectory") throw new Error("Expected linked field and trajectory.");
    const limited = sampleGraph2DTrajectory({ field, object, variables: {}, viewport, maxSamples: 48 });
    expect(limited.samplesEvaluated).toBeLessThanOrEqual(48);
    expect(limited.converged).toBe(false);
    const series = sampleGraph2DScene({ document, viewport, width: 500, height: 500, interaction: false });
    expect(series[1]!.artifact.segments.length).toBeGreaterThan(0);
    expect(selectionForGraph2DObject(document, series, "trajectory_1")).toEqual({ objectId: "trajectory_1", probe: null });
  });
});
