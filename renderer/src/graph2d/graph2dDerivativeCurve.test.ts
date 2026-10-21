import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  sampleGraph2DDerivativeCurve } from "@math3d/core";

const documentFor = (expression: string) => {
  const empty = createEmptyGraph2DDocument(`derivative-curve:${expression}`);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression,
    domain: { min: -2, max: 2, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    stableKey: `derivative-curve:${expression}` });
};

describe("Graph derivative curve overlay", () => {
  it("samples the symbolic derivative with a separate bounded budget", () => {
    const document = documentFor("x^2");
    const result = sampleGraph2DDerivativeCurve(document, "function_1", { width: 640, height: 480 });
    expect(result.status).toBe("approximate");
    expect(result.sourceHash).toBe(document.identity.structuralHash);
    expect(result.artifact?.samplesEvaluated).toBeLessThanOrEqual(2048);
    const points = result.artifact?.segments.flatMap(segment => segment.points) ?? [];
    expect(points.length).toBeGreaterThan(5);
    expect(points.every(point => Math.abs(point.y - 2 * point.x) < 1e-9)).toBe(true);
  });

  it("explains unsupported symbolic derivatives instead of drawing a fabricated line", () => {
    const result = sampleGraph2DDerivativeCurve(documentFor("abs(x)"), "function_1",
      { width: 640, height: 480 });
    expect(result).toMatchObject({ status: "unavailable", artifact: null,
      reason: expect.stringContaining("symbolic derivative") });
  });
});
