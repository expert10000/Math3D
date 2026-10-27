import { describe, expect, it } from "vitest";
import { parseGraph2DExpression, sampleGraph2DImplicit } from "@math3d/core";
import { graph2DAuthoringPresets, graph2DImplicitCategories } from "./graph2dAuthoringPresets";

const policy = { maxSamples: 4000, maxDepth: 8, tolerancePx: 1.25 };
const size = { width: 360, height: 300 };

describe("implicit contour gallery", () => {
  it("covers every mathematical category with several examples", () => {
    for (const category of graph2DImplicitCategories)
      expect(graph2DAuthoringPresets.implicit.filter(preset => preset.category === category).length,
        category).toBeGreaterThanOrEqual(8);
  });

  it.each(graph2DAuthoringPresets.implicit)("samples $title within its declared viewport", preset => {
    const draft = preset.draft();
    const parsed = parseGraph2DExpression(draft.expression, ["x", "y"]);
    expect(parsed.ok, preset.title).toBe(true);
    if (!parsed.ok) return;
    const viewport = { xMin: draft.domain.min, xMax: draft.domain.max,
      yMin: draft.yDomain.min, yMax: draft.yDomain.max, aspect: "free" as const };
    const artifact = sampleGraph2DImplicit({ object: { id: preset.id, kind: "implicit", label: draft.label,
      expression: { source: draft.expression, variable: "xy", ast: parsed.ast },
      domain: draft.domain, yDomain: draft.yDomain }, viewport, ...size, policy });
    expect(artifact.samplesEvaluated, preset.title).toBeLessThanOrEqual(policy.maxSamples);
    expect(artifact.segments.length, preset.title).toBeGreaterThan(0);
    expect(artifact.segments.flatMap(segment => segment.points)
      .every(point => Number.isFinite(point.x) && Number.isFinite(point.y)), preset.title).toBe(true);
    if (preset.expectedComponents !== undefined)
      expect(artifact.segments.length, preset.title).toBe(preset.expectedComponents);
  });
});
