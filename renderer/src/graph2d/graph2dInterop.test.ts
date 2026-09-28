import { describe, expect, it } from "vitest";
import { createGraph2DDocument, locateGraph2DPromotionSource, locateGraph2DPromotionTarget,
  parseGraph2DExpression, promoteGraph2DToCurve, type Graph2DGraphObject } from "@math3d/core";
import { previewGraph2DRevolution, revolveGraph2DProfile } from "@math3d/core";
import { extrudeGraph2DProfile, previewGraph2DExtrusion } from "@math3d/core";
import { advanceDocumentIdentity, compareGraph2DPromotionGenerations, graph2DPromotionStatus,
  regenerateGraph2DPromotion } from "@math3d/core";

const parsed = (source: string, variables: string[]) => {
  const result = parseGraph2DExpression(source, variables);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.ast;
};
const domain = { min: -2, max: 3, includeMin: false, includeMax: true } as const;
const graph = (object: Graph2DGraphObject) => createGraph2DDocument({ stableKey: "interop",
  source: { objects: [object], variables: [], assumptions: [] } });

describe("Graph2D Curve promotion", () => {
  it("promotes explicit sources with exact expressions, domains, and trace mapping", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "quadratic",
      expression: { source: "x^2+1", variable: "x", ast: parsed("x^2+1", ["x"]) }, domain });
    const promotion = promoteGraph2DToCurve(source, "function_1");
    expect(promotion.document.source.representation).toBe("explicit");
    expect(promotion.document.source.definition.expressions).toEqual({ x: "x", y: "x^2+1" });
    expect(promotion.document.source.domain).toMatchObject({ parameter: "x", min: -2, max: 3 });
    expect(promotion.document.source.definition.settings).toMatchObject({ includeMin: false, includeMax: true });
    expect(promotion.relation.kind).toBe("promoted-from");
    expect(locateGraph2DPromotionSource(promotion)).toMatchObject({ objectId: "function_1", revision: source.identity.revision });
    expect(locateGraph2DPromotionTarget(promotion).documentId).toBe(promotion.document.identity.id);
  });

  it("promotes parametric sources as normal two-dimensional Curve documents", () => {
    const source = graph({ id: "parametric_1", kind: "parametric", label: "arc",
      xExpression: { source: "cos(t)", variable: "t", ast: parsed("cos(t)", ["t"]) },
      yExpression: { source: "sin(t)", variable: "t", ast: parsed("sin(t)", ["t"]) }, domain });
    const promotion = promoteGraph2DToCurve(source, "parametric_1");
    expect(promotion.document.source).toMatchObject({ representation: "parametric", dimension: 2,
      definition: { expressions: { x: "cos(t)", y: "sin(t)" } } });
    expect(() => promoteGraph2DToCurve(source, "missing")).toThrow(/explicit or parametric/);
  });
});

describe("Graph2D promotion lineage", () => {
  it("marks source edits stale and supports explicit replacement or forking", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "line",
      expression: { source: "x", variable: "x", ast: parsed("x", ["x"]) }, domain });
    const promotion = promoteGraph2DToCurve(source, "function_1");
    const nextSource = { ...source.source, objects: [{ ...source.source.objects[0]!,
      expression: { source: "2*x", variable: "x" as const, ast: parsed("2*x", ["x"]) } }] };
    const current = createGraph2DDocument({ stableKey: "interop", source: nextSource,
      identity: advanceDocumentIdentity(source.identity, nextSource), display: source.display, selection: source.selection });
    expect(graph2DPromotionStatus(promotion, current)).toBe("stale");
    expect(compareGraph2DPromotionGenerations(promotion, current)).toMatchObject({ status: "changed", structuralChange: true });
    const replacement = regenerateGraph2DPromotion(promotion, current, "replace");
    expect(replacement.document.identity.id).toBe(promotion.document.identity.id);
    expect(replacement.document.identity.revision).toBeGreaterThan(promotion.document.identity.revision);
    expect(graph2DPromotionStatus(replacement, current)).toBe("current");
    const fork = regenerateGraph2DPromotion(promotion, current, "fork");
    expect(fork.document.identity.id).not.toBe(promotion.document.identity.id);
  });
});

describe("Graph2D profile extrusion", () => {
  it("reuses the standard Surface infrastructure with normalized direction and cap policy", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "profile",
      expression: { source: "x^2", variable: "x", ast: parsed("x^2", ["x"]) }, domain });
    const preview = previewGraph2DExtrusion(source, "function_1", { direction: [0, 0, 2], length: 5, caps: "both" });
    expect(preview).toMatchObject({ representation: "constructed", domain: { kind: "extrusion" },
      orientation: { direction: [0, 0, 1] }, definition: { familyId: "graph2d.extrusion",
        settings: { capPolicy: "both", length: 5 } } });
    const promotion = extrudeGraph2DProfile(source, "function_1", { direction: [1, 0, 0], length: 3, caps: "none" });
    expect(promotion.document.format).toBe("math3d.surface-document");
    expect(promotion.relation.operation).toBe("graph2d.extrude-surface");
    expect(promotion.document.source.definition.sourceIds).toEqual([source.identity.id, "function_1"]);
  });

  it("rejects zero directions and invalid lengths before target creation", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "profile",
      expression: { source: "x", variable: "x", ast: parsed("x", ["x"]) }, domain });
    expect(() => extrudeGraph2DProfile(source, "function_1", { direction: [0, 0, 0], length: 1, caps: "none" }))
      .toThrow(/Invalid extrusion/);
  });
});

describe("Graph2D profile revolution", () => {
  it("creates a standard constructed Surface with preview, domain, orientation, and provenance", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "radius",
      expression: { source: "x+2", variable: "x", ast: parsed("x+2", ["x"]) }, domain });
    const preview = previewGraph2DRevolution(source, "function_1", { axis: "x", orientation: "positive" });
    expect(preview).toMatchObject({ representation: "constructed", domain: { kind: "revolution" },
      definition: { familyId: "graph2d.revolution", settings: { axis: "x", orientation: "positive" } } });
    const promotion = revolveGraph2DProfile(source, "function_1", { axis: "y", orientation: "negative",
      angleMin: 0, angleMax: Math.PI });
    expect(promotion.document.format).toBe("math3d.surface-document");
    expect(promotion.relation).toMatchObject({ kind: "promoted-from", operation: "graph2d.revolve-surface" });
    expect(promotion.document.source.definition.expressions).toEqual({ x: "x", y: "x+2" });
  });

  it("rejects invalid inputs atomically before constructing a target", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "radius",
      expression: { source: "x", variable: "x", ast: parsed("x", ["x"]) }, domain });
    expect(() => revolveGraph2DProfile(source, "function_1", { axis: "x", orientation: "positive",
      angleMin: 2, angleMax: 1 })).toThrow(/Invalid revolution/);
  });
});
