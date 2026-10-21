import { describe, expect, it } from "vitest";
import { acceptGraph2DComplexContour, applyGraph2DAuthoring, createComplexAnalysisDocument,
  createEmptyGraph2DDocument, createGraph2DDocument, deserializeComplexAnalysisDocument,
  graph2DComplexContourSourceStatus, refreshGraph2DComplexContour, reviewGraph2DComplexContour,
  serializeComplexAnalysisDocument } from "@math3d/core";

const path = (xExpression = "cos(t)", yExpression = "sin(t)") => {
  const draft = { label: "Complex contour", xExpression, yExpression,
    domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true } };
  const source = applyGraph2DAuthoring(createEmptyGraph2DDocument("complex-graph-source"),
    { type: "create-parametric", draft });
  const document = createGraph2DDocument({ ...source, stableKey: "complex-graph-source" });
  return { document, draft, objectId: document.source.objects[0]!.id };
};

describe("GRA-17 sampled Graph path to Complex Analysis contour", () => {
  it("reviews a circle, commits only a fresh source and persists source lineage", () => {
    const { document, objectId } = path();
    const review = reviewGraph2DComplexContour(document, objectId);
    expect(review.target.contours[0]!.points).toHaveLength(257);
    expect(review.target.contours[0]!.closed).toBe(true);
    expect(review.target.function.sourceText).toBe("z");
    expect(review.maximumSegmentLength).toBeLessThan(.03);
    expect(review.warnings.join(" ")).toMatch(/not an analytic complex function/i);
    const target = acceptGraph2DComplexContour(review, document);
    expect(graph2DComplexContourSourceStatus(target, document)).toBe("current");
    const restored = deserializeComplexAnalysisDocument(serializeComplexAnalysisDocument(target));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.provenance.graphSource?.structuralHash).toBe(document.identity.structuralHash);
    expect(graph2DComplexContourSourceStatus(restored.value, document)).toBe("current");
  });

  it("detects changed and missing sources, re-reviews refresh and protects edited targets", () => {
    const { document, draft, objectId } = path();
    const review = reviewGraph2DComplexContour(document, objectId, { sampleCount: 129, closure: "auto" });
    const changedSource = createGraph2DDocument({
      ...applyGraph2DAuthoring(document, { type: "edit-parametric", objectId,
        draft: { ...draft, xExpression: "2*cos(t)" } }), stableKey: "complex-graph-source" });
    expect(() => acceptGraph2DComplexContour(review, changedSource)).toThrow(/changed after contour preview/i);
    const target = acceptGraph2DComplexContour(review, document);
    expect(graph2DComplexContourSourceStatus(target, changedSource)).toBe("changed");
    expect(graph2DComplexContourSourceStatus(target, null)).toBe("missing");
    const refreshed = refreshGraph2DComplexContour(target, changedSource);
    expect(refreshed.identity.id).toBe(target.identity.id);
    expect(refreshed.identity.revision).toBe(target.identity.revision + 1);
    expect(refreshed.contours[0]!.points).toHaveLength(129);
    expect(graph2DComplexContourSourceStatus(refreshed, changedSource)).toBe("current");
    const edited = createComplexAnalysisDocument({ function: target.function,
      parameters: target.parameters, assumptions: target.assumptions, domain: target.domain,
      sampling: target.sampling, contours: [], branchPolicy: target.branchPolicy,
      covering: target.covering, mobius: target.mobius }, {
      id: target.identity.id, revision: target.identity.revision + 1, provenance: target.provenance });
    expect(graph2DComplexContourSourceStatus(edited, changedSource)).toBe("target-edited");
    expect(() => refreshGraph2DComplexContour(edited, changedSource)).toThrow(/target was edited/i);
  });

  it("rejects undefined paths and unsupported closure rather than fabricating a contour", () => {
    const { document, objectId } = path("1/t", "t");
    expect(() => reviewGraph2DComplexContour(document, objectId)).toThrow(/undefined at sample/i);
    const line = path("t", "0");
    expect(() => reviewGraph2DComplexContour(line.document, line.objectId,
      { sampleCount: 32, closure: "closed" })).toThrow(/endpoints do not meet/i);
    const stationary = path("1", "0");
    expect(() => reviewGraph2DComplexContour(stationary.document, stationary.objectId))
      .toThrow(/degenerate/i);
  });
});
