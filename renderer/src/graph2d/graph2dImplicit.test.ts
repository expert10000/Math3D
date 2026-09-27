import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, pickGraph2DProbe,
  sampleGraph2DImplicit, selectionForGraph2DObject } from "@math3d/core";

const domain = { min: -3, max: 3, includeMin: true, includeMax: true };
const viewport = { xMin: -3, xMax: 3, yMin: -3, yMax: 3, aspect: "free" as const };
const size = { width: 480, height: 480 };
const create = (expression: string) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("implicit:" + expression), {
    type: "create-implicit", draft: { label: "contour", expression, domain, yDomain: domain,
      style: { color: "#059669", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    selection: scene.selection, stableKey: "implicit:" + expression });
};
const policy = { maxSamples: 5000, maxDepth: 10, tolerancePx: 0.75 };

describe("Graph2D implicit contours", () => {
  it("persists F(x,y), bounds, and capability", () => {
    const document = create("x^2+y^2-1");
    expect(document.requiredCapabilities).toContain("graph2d.implicit.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(document.source.objects[0]?.kind).toBe("implicit");
  });

  it("stitches a circle and picks its sampled contour within budget", () => {
    const document = create("x^2+y^2-1");
    const object = document.source.objects[0]!;
    if (object.kind !== "implicit") throw new Error("Expected implicit contour.");
    const artifact = sampleGraph2DImplicit({ object, viewport, ...size, policy });
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(policy.maxSamples);
    expect(artifact.segments.length).toBeGreaterThan(0);
    expect(artifact.segments.some((segment) => segment.points.length > 20)).toBe(true);
    const selected = pickGraph2DProbe({ document, series: [{ objectId: object.id, artifact }],
      viewport, size, screen: { x: 320, y: 240 } }).selection;
    expect(selected.probe?.x).toBeCloseTo(1, 1);
    expect(selectionForGraph2DObject(document, [{ objectId: object.id, artifact }], object.id).probe).not.toBeNull();
  });

  it("reports ambiguous and singular cells without joining unresolved branches", () => {
    const saddle = create("(x-0.02)*(y-0.02)").source.objects[0]!;
    const pole = create("1/x").source.objects[0]!;
    if (saddle.kind !== "implicit" || pole.kind !== "implicit") throw new Error("Expected implicit contours.");
    const ambiguous = sampleGraph2DImplicit({ object: saddle, viewport, ...size, policy });
    expect(ambiguous.diagnostics.some((entry) => entry.code === "ambiguous-cell" || entry.code === "unresolved-cell")).toBe(true);
    const singular = sampleGraph2DImplicit({ object: pole, viewport, ...size, policy });
    expect(singular.diagnostics.some((entry) => entry.code === "invalid-sample")).toBe(true);
    expect(singular.segments).toHaveLength(0);
  });
});
