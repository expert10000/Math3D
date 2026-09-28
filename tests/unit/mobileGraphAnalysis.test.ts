import { describe, expect, it } from "vitest";
import { analyzeGraph2DDerivative, analyzeGraph2DIntegral, analyzeGraph2DArcLength, serializeGraph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { applyMobileGraphAuthoring, mobileGraphAuthoringAction, mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { runMobileGraphAnalysis, mobileGraphAnalysisDraft, isMobileGraphAnalysisCurrent, mobileGraphAnalysisProbe } from "../../apps/mobile/src/models/mobileGraphAnalysis";

const parabola = () => {
  const adapter = new Graph2DCommandAdapter(createMobileGraph("Analysis", true, "analysis"));
  const original = adapter.document();
  adapter.commitScene(applyMobileGraphAuthoring(original, mobileGraphAuthoringAction({ objectId: "function_1",
    draft: { ...mobileGraphFunctionDraft(original, "function_1"), expression: "x^2" } })), "edit");
  return adapter;
};
describe("MOB-G07 shared bounded touch analysis", () => {
  it("matches shared derivative, integral and arc length values and publication provenance", () => {
    const document = parabola().document(), base = { ...mobileGraphAnalysisDraft(document), x: "2", tolerance: "0.00001" };
    const before = serializeGraph2DDocument(document);
    const derivatives = runMobileGraphAnalysis(document, base);
    expect(derivatives.publications[0]?.summary.value).toBe(4);
    expect(derivatives.publications[0]?.summary).toEqual(analyzeGraph2DDerivative({ document, objectId: "function_1", x: 2, order: 1, tolerance: 1e-5 }).publication.summary);
    const interval = { min: -1, max: 1 };
    const integral = runMobileGraphAnalysis(document, { ...base, kind: "integral" });
    expect(integral.publications[0]?.summary.value).toBeCloseTo(2 / 3, 7);
    expect(integral.publications[0]?.summary).toEqual(analyzeGraph2DIntegral({ document, objectId: "function_1", interval, mode: "signed", tolerance: 1e-5 }).publication.summary);
    const arc = runMobileGraphAnalysis(document, { ...base, kind: "arc-length" });
    expect(arc.publications[0]?.summary).toEqual(analyzeGraph2DArcLength({ document, objectId: "function_1", interval, tolerance: 1e-5 }).publication.summary);
    expect(serializeGraph2DDocument(document)).toBe(before);
  });
  it("publishes tangent overlays and source-linked finite feature/intersection navigation", () => {
    const adapter = parabola(), document = adapter.document(), base = { ...mobileGraphAnalysisDraft(document), x: "1" };
    const tangent = runMobileGraphAnalysis(document, { ...base, kind: "tangent" });
    expect(tangent.overlays).toHaveLength(1); expect(tangent.overlays[0]?.direction.y).toBe(2);
    const features = runMobileGraphAnalysis(document, { ...base, kind: "features" });
    const zero = features.rows.find((row) => row.probe && row.label.startsWith("zero:")); expect(zero).toBeTruthy();
    expect(mobileGraphAnalysisProbe(document, zero!.probe!).y).toBeCloseTo(0, 7);
    adapter.commitScene(applyMobileGraphAuthoring(document, mobileGraphAuthoringAction({ objectId: null,
      draft: { ...mobileGraphFunctionDraft(document, null), label: "g", expression: "1" } })), "create");
    const pair = runMobileGraphAnalysis(adapter.document(), { ...base, kind: "intersections", min: "-2", max: "2", secondId: "function_2" });
    expect(pair.rows.filter((row) => row.probe)).toHaveLength(2);
    for (const row of pair.rows.filter((row) => row.probe)) expect(mobileGraphAnalysisProbe(adapter.document(), row.probe!).y).toBeCloseTo(1, 6);
  });
  it("stales results on input/source/revision/document changes but not viewport/selection changes", () => {
    const adapter = parabola(), document = adapter.document(), draft = mobileGraphAnalysisDraft(document), result = runMobileGraphAnalysis(document, draft);
    expect(isMobileGraphAnalysisCurrent(result, document, draft)).toBe(true);
    expect(isMobileGraphAnalysisCurrent(result, document, { ...draft, x: "5" })).toBe(false);
    adapter.commitViewport({ ...document.display.viewport, xMin: -5 });
    adapter.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 2, y: 4 } });
    expect(isMobileGraphAnalysisCurrent(result, adapter.document(), draft)).toBe(true);
    const before = adapter.document(); adapter.commitScene(applyMobileGraphAuthoring(before, { type: "duplicate", objectId: "function_1" }), "duplicate");
    expect(isMobileGraphAnalysisCurrent(result, adapter.document(), draft)).toBe(false);
    expect(isMobileGraphAnalysisCurrent(result, { ...document, identity: { ...document.identity, id: "another" } }, draft)).toBe(false);
  });
  it("rejects invalid inputs, self-intersections and unsafe requests without mutations; exposes singular gaps", () => {
    const adapter = parabola(), document = adapter.document(), base = mobileGraphAnalysisDraft(document);
    for (const changed of [{ x: "" }, { x: "Infinity" }, { tolerance: "0" }, { kind: "integral" as const, min: "2", max: "1" },
      { kind: "features" as const, min: "-1e8", max: "1e8" }, { kind: "intersections" as const, secondId: "function_1" }, { objectId: "missing" }])
      expect(() => runMobileGraphAnalysis(document, { ...base, ...changed })).toThrow();
    adapter.commitScene(applyMobileGraphAuthoring(document, mobileGraphAuthoringAction({ objectId: "function_1",
      draft: { ...mobileGraphFunctionDraft(document, "function_1"), expression: "1/x" } })), "edit");
    const singular = runMobileGraphAnalysis(adapter.document(), { ...base, kind: "integral" });
    expect(singular.rows[0]?.label).toContain("unavailable"); expect(singular.rows[0]?.detail).toContain("skipped cells");
    const derivative = runMobileGraphAnalysis(adapter.document(), { ...base, kind: "derivatives", x: "0" });
    expect(derivative.publications[0]?.status).toBe("unsupported");
  });
});
