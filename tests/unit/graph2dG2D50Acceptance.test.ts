import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections, analyzeGraph2DPolarMeasurement,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, graph2DConstructionFromCandidate,
  isGraph2DConstructionArtifactCurrent, parseGraph2DDocument, resolveGraph2DConstructions,
  serializeGraph2DDocument, type Graph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { isMobileGraphAnalysisCurrent, runMobileGraphAnalysis, type MobileGraphAnalysisDraft } from
  "../../apps/mobile/src/models/mobileGraphAnalysis";

const style = { visible: true, color: "#7c3aed", lineWidth: 2, lineStyle: "solid" as const };
const domain = { min: -3, max: 3, includeMin: true, includeMax: true };
const interval = { min: -2, max: 2 };
const draft = (kind: "features" | "intersections" | "polar-area" | "polar-arc-length",
  objectId: string, secondId = "", min = "-2", max = "2"): MobileGraphAnalysisDraft =>
  ({ kind, objectId, secondId, x: "0", min, max, tolerance: "0.00001", mode: "signed" });
const scene = (...expressions: string[]) => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("g2d50-acceptance"));
  for (const [index, expression] of expressions.entries()) adapter.commitScene(applyGraph2DAuthoring(adapter.document(), {
    type: "create", draft: { label: `f${index}`, expression, domain, style },
  }), "create");
  return adapter;
};
const candidateIds = (items: readonly { candidateId: string }[]) => items.map(item => item.candidateId).sort();

describe("G2D50 shared analysis and construction acceptance corpus", () => {
  it("publishes the same polar analytic results and provenance through core and mobile", () => {
    const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("g2d50-polar"));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "create-polar", draft: {
      label: "circle", rExpression: "2*cos(theta)",
      domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true }, style,
    } }), "create-polar");
    const document = adapter.document();
    for (const [kind, expected] of [["swept-area", Math.PI], ["arc-length", 2 * Math.PI]] as const) {
      const direct = analyzeGraph2DPolarMeasurement({ document, objectId: "polar_1", kind,
        interval: { min: 0, max: Math.PI }, tolerance: 1e-5 });
      const mobileDraft = draft(kind === "swept-area" ? "polar-area" : "polar-arc-length", "polar_1", "", "0", String(Math.PI));
      const mobile = runMobileGraphAnalysis(document, mobileDraft);
      expect(direct.value).toBeCloseTo(expected, 6);
      expect(mobile.publications[0]?.resultId).toBe(direct.publication.resultId);
      expect(mobile.publications[0]?.provenance.source.structuralHash).toBe(document.identity.structuralHash);
      expect(mobile.publications[0]?.provenance.operation.parameters.angleUnit).toBe("radian");
      expect(isMobileGraphAnalysisCurrent(mobile, document, mobileDraft)).toBe(true);
    }
    const invalid = draft("polar-area", "polar_1", "", "13", "16.283185307");
    expect(() => runMobileGraphAnalysis(document, invalid)).toThrow(/authored angular domain/i);
  });

  it("matches desktop and mobile candidate IDs, then replays source-linked resolution", () => {
    const adapter = scene("x^2-1", "0");
    const original = adapter.document();
    const directFeatures = analyzeGraph2DCriticalPoints({ document: original, objectId: "function_1", interval });
    const mobileFeatures = runMobileGraphAnalysis(original, draft("features", "function_1"));
    expect(candidateIds(mobileFeatures.rows.flatMap(row => row.candidate ? [row.candidate] : [])))
      .toEqual(candidateIds(directFeatures.candidates));
    const roots = directFeatures.candidates.filter(item => item.kind === "zero").map(item => item.x);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(-1, 5);
    expect(roots[1]).toBeCloseTo(1, 5);
    const directIntersections = analyzeGraph2DIntersections({ document: original,
      firstObjectId: "function_1", secondObjectId: "function_2", interval });
    const mobileIntersections = runMobileGraphAnalysis(original, draft("intersections", "function_1", "function_2"));
    expect(candidateIds(mobileIntersections.rows.flatMap(row => row.candidate ? [row.candidate] : [])))
      .toEqual(candidateIds(directIntersections.candidates));
    const root = directFeatures.candidates.find(item => item.kind === "zero" && item.x < 0)!;
    const crossing = directIntersections.candidates.find(item => item.x > 0)!;
    adapter.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(adapter.document(), directFeatures, root) });
    const currentCrossings = analyzeGraph2DIntersections({ document: adapter.document(),
      firstObjectId: "function_1", secondObjectId: "function_2", interval });
    adapter.commitConstruction({ type: "create", object: graph2DConstructionFromCandidate(adapter.document(),
      currentCrossings, currentCrossings.candidates.find(item => item.x > 0)!) });
    const saved = adapter.document(), artifact = resolveGraph2DConstructions(saved);
    expect(artifact.objects.map(item => item.state)).toEqual(["ready", "ready"]);
    expect(artifact.objects.map(item => item.confidence)).toEqual(["approximate", "approximate"]);
    expect(artifact.objects[0]?.point?.x).toBeCloseTo(-1, 5);
    expect(artifact.objects[1]?.point?.x).toBeCloseTo(crossing.x, 5);
    expect(parseGraph2DDocument(serializeGraph2DDocument(saved))).toEqual(saved);
    adapter.commitScene(applyGraph2DAuthoring(saved, { type: "edit", objectId: "function_1", draft: {
      label: "f0", expression: "x^2+1", domain, style,
    } }), "edit");
    expect(isGraph2DConstructionArtifactCurrent(artifact, adapter.document())).toBe(false);
    expect(resolveGraph2DConstructions(adapter.document()).objects.map(item => item.state))
      .toEqual(["unavailable", "unavailable"]);
    const restored: Graph2DDocument = adapter.undo()!;
    expect(resolveGraph2DConstructions(restored).objects.map(item => item.state)).toEqual(["ready", "ready"]);
  });
});
