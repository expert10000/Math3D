import { describe, expect, it } from "vitest";
import { sampleGraph2DScene } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { mobileGraphSamplingPolicy, mobileGraphDisplayScene, MOBILE_GRAPH_DEFAULT_OVERLAYS } from "../../apps/mobile/src/models/mobileGraphDisplay";
import { mobileGraphAreaRects, mobileGraphFillRect } from "../../apps/mobile/src/viewer/mobileGraphOverlays";
import { runMobileGraphAnalysis, mobileGraphAnalysisDraft } from "../../apps/mobile/src/models/mobileGraphAnalysis";
describe("MOB-G08 display policies and overlays", () => {
  it("commits axes and quality without changing source identity and undoes", () => {
    const document = createMobileGraph("Display", true, "display"), adapter = new Graph2DCommandAdapter(document);
    const changed = adapter.commitScene(mobileGraphDisplayScene(document, { type: "axis", key: "grid" }), "style");
    expect(changed.display.axes.grid).toBe(false); expect(changed.display.axes.labels).toBe(true); expect(changed.identity).toEqual(document.identity);
    adapter.commitScene(mobileGraphDisplayScene(changed, { type: "quality", quality: "fine" }), "style");
    expect(adapter.document().display.sampling.maxSamples).toBe(2048); expect(adapter.undo()?.display).toEqual(changed.display);
    expect(MOBILE_GRAPH_DEFAULT_OVERLAYS).toEqual({ tangent: false, area: false, features: false });
  });
  it("caps imported policy and scene samples, without mutating the saved intent", () => {
    const document = createMobileGraph("Budget", true, "budget"), before = document.display.sampling;
    for (const interacting of [false, true]) {
      const sampling = mobileGraphSamplingPolicy(document, interacting);
      expect(sampling.maxSamples).toBeLessThanOrEqual(interacting ? 256 : 2048);
      const series = sampleGraph2DScene({ document: { ...document, display: { ...document.display, sampling } },
        viewport: document.display.viewport, width: 320, height: 320, interaction: interacting });
      expect(series.reduce((sum, item) => sum + item.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(sampling.maxSamples);
    }
    expect(document.display.sampling).toEqual(before);
  });
  it("clips at most 256 approximate area strips and excludes offscreen/nonfinite rectangles", () => {
    const document = createMobileGraph("Area", true, "area"), size = { width: 320, height: 320 };
    const result = runMobileGraphAnalysis(document, { ...mobileGraphAnalysisDraft(document), kind: "integral" });
    const rects = mobileGraphAreaRects(result, document.display.viewport, size);
    expect(rects.length).toBeGreaterThan(0); expect(rects.length).toBeLessThanOrEqual(256);
    expect(rects.every((rect) => rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= 320 && rect.top + rect.height <= 320)).toBe(true);
    expect(mobileGraphFillRect(document.display.viewport, size, { xMin: NaN, xMax: 1, yMin: 0, yMax: 1 }, "red")).toBeNull();
  });
});
