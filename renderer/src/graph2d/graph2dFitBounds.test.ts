import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, fitGraph2DViewport, graph2DSceneFitBounds,
  resolveGraph2DViewport, sampleGraph2DScene } from "@math3d/core";

describe("Graph scene fitting", () => {
  it("frames a selected unit circle from its authored curve bounds at equal aspect", () => {
    const base = createEmptyGraph2DDocument("fit-unit-circle");
    const document = applyGraph2DAuthoring(base, { type: "create-parametric", draft: {
      label: "unit circle", xExpression: "cos(t)", yExpression: "sin(t)",
      domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
    } });
    const size = { width: 600, height: 600 };
    const bounded = { ...document, display: { ...document.display, sampling: { ...document.display.sampling, maxSamples: 4096 } } };
    const series = sampleGraph2DScene({ document: bounded, viewport: { xMin: -30, xMax: 30, yMin: -30, yMax: 30, aspect: "equal" },
      ...size, interaction: false, deterministic: true });
    const bounds = graph2DSceneFitBounds(series, null, "selection", document.source.objects[0]!.id)!;
    expect(bounds.xMin).toBeCloseTo(-1, 2); expect(bounds.xMax).toBeCloseTo(1, 2);
    expect(bounds.yMin).toBeCloseTo(-1, 2); expect(bounds.yMax).toBeCloseTo(1, 2);
    const fitted = fitGraph2DViewport(bounds, size, "equal", .12);
    expect(fitted.xMin).toBeCloseTo(-1.316, 2); expect(fitted.xMax).toBeCloseTo(1.316, 2);
    expect(fitted.yMin).toBeCloseTo(-1.316, 2); expect(fitted.yMax).toBeCloseTo(1.316, 2);
    const wide = resolveGraph2DViewport(fitGraph2DViewport(bounds, { width: 900, height: 600 }, "equal", .12), { width: 900, height: 600 });
    expect(wide.xMax - wide.xMin).toBeCloseTo((wide.yMax - wide.yMin) * 1.5, 10);
  });

  it("ignores hidden curves and frames visible saved circle geometry in Fit all", () => {
    const sample = (objectId: string, visible: boolean, x: number) => ({ objectId,
      style: { objectId, visible, color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const },
      artifact: { samplerVersion: 1 as const, samplesEvaluated: 2, converged: true, diagnostics: [],
        segments: [{ points: [{ x, y: 0 }, { x: x + 1, y: 1 }], openStart: false, openEnd: false }] } });
    const series = [sample("visible", true, 0), sample("hidden", false, 100)];
    const constructions = { source: { documentId: "test", revision: 1, structuralHash: "hash", generation: 1 }, generationKey: "test",
      objects: [{ id: "circle", kind: "osculating-circle" as const, label: "Circle", state: "ready" as const,
        reason: null, confidence: "approximate" as const, sourceObjectId: "visible", point: { x: 0, y: 0 }, direction: null,
        style: { visible: true, color: "#0d9488", lineWidth: 2, lineStyle: "dashed" as const },
        circle: { center: { x: 0, y: 0 }, radius: 2 } }], evaluations: 0, bytes: 0, truncated: false };
    expect(graph2DSceneFitBounds(series, constructions, "all", null)).toEqual({ xMin: -2, xMax: 2, yMin: -2, yMax: 2 });
    expect(graph2DSceneFitBounds(series, constructions, "selection", "visible")).toEqual({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  });
});
