import { describe, expect, it } from "vitest";
import { createGraph2DDocument, parseGraph2DExpression, promoteGraph2DToCurve,
  revolveGraph2DProfile, extrudeGraph2DProfile, evaluateGraph2DPromotionGeometry,
  replaceCurveDocumentSource, regenerateGraph2DPromotion, isGraph2DPromotionTargetEdited } from "@math3d/core";
import { graph2DPromotionStatus, replaceSurfaceDocumentSource, validateGraph2DCapProfile } from "@math3d/core";

const expression = (source: string, variable: "x" | "t") => {
  const parsed = parseGraph2DExpression(source, [variable, "a"]);
  if (!parsed.ok) throw new Error(parsed.errors.join(" "));
  return { source, variable, ast: parsed.ast };
};
const explicit = (source = "a*x") => createGraph2DDocument({ stableKey: "geometry-test",
  source: { objects: [{ id: "f", kind: "explicit-cartesian", label: "f",
    expression: expression(source, "x"), domain: { min: -1, max: 1, includeMin: true, includeMax: true } }],
    variables: [{ name: "a", value: 2 }], assumptions: [] } });

describe("renderable Graph2D promotions", () => {
  it("captures named variables and evaluates the ordinary Curve and Surface sources", () => {
    const graph = explicit();
    const curve = promoteGraph2DToCurve(graph, "f");
    const geometry = evaluateGraph2DPromotionGeometry(curve.document);
    expect(geometry.kind).toBe("curve");
    expect(geometry.positions.slice(0, 3)).toEqual([-1, -2, 0]);
    const surface = revolveGraph2DProfile(graph, "f", { axis: "x", orientation: "positive", angleMax: Math.PI });
    const mesh = evaluateGraph2DPromotionGeometry(surface.document);
    expect(mesh.positions.slice(0, 3)).toEqual([-1, -2, -0]);
    expect(mesh.indices.length).toBeGreaterThan(1000);
    expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length / 3)).toBe(true);
  });

  it("protects independent target edits and preserves them when forking", () => {
    const graph = explicit(), original = promoteGraph2DToCurve(graph, "f");
    const edited = { ...original, document: replaceCurveDocumentSource(original.document, {
      ...original.document.source, definition: { ...original.document.source.definition,
        expressions: { x: "x", y: "3*x" } } }) };
    expect(isGraph2DPromotionTargetEdited(edited)).toBe(true);
    expect(() => regenerateGraph2DPromotion(edited, graph, "replace")).toThrow(/independently edited/);
    const fork = regenerateGraph2DPromotion(edited, graph, "fork");
    expect(fork.document.identity.id).not.toBe(edited.document.identity.id);
    expect(edited.document.source.definition.expressions?.y).toBe("3*x");
  });

  it("rejects singular Surface profiles and caps on open graphs", () => {
    expect(() => revolveGraph2DProfile(explicit("1/x"), "f", { axis: "x", orientation: "positive" })).toThrow(/undefined/);
    expect(() => extrudeGraph2DProfile(explicit(), "f", { direction: [0, 0, 1], length: 2, caps: "both" })).toThrow(/closed profile/);
  });

  it("retains a usable target snapshot when its source object is deleted", () => {
    const graph = explicit(), promotion = promoteGraph2DToCurve(graph, "f");
    const missing = createGraph2DDocument({ stableKey: "geometry-test", source: { objects: [], variables: [], assumptions: [] } });
    expect(graph2DPromotionStatus(promotion, missing)).toBe("unavailable");
    expect(evaluateGraph2DPromotionGeometry(promotion.document).positions.length).toBeGreaterThan(0);
  });

  it("evaluates caps on a convex closed parametric profile", () => {
    const graph = createGraph2DDocument({ stableKey: "closed-profile", source: { objects: [{ id: "circle",
      kind: "parametric", label: "circle", xExpression: expression("cos(t)", "t"), yExpression: expression("sin(t)", "t"),
      domain: { min: 0, max: Math.PI * 2, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
    const mesh = (caps: "none" | "both") => evaluateGraph2DPromotionGeometry(extrudeGraph2DProfile(graph, "circle",
      { direction: [0, 0, 2], length: 3, caps }).document);
    const uncapped = mesh("none"), capped = mesh("both");
    expect(capped.positions).toEqual(uncapped.positions);
    expect(capped.indices.length - uncapped.indices.length).toBe(2 * 126 * 3);
    expect(capped.positions.at(-1)).toBe(3);
    const original = extrudeGraph2DProfile(graph, "circle", { direction: [0, 0, 1], length: 3, caps: "both" });
    const edited = replaceSurfaceDocumentSource(original.document, { ...original.document.source,
      definition: { ...original.document.source.definition, expressions: { x: "cos(t)", y: "t" } } });
    expect(() => evaluateGraph2DPromotionGeometry(edited)).toThrow(/closed profile/);
    const twiceWound = Array.from({ length: 129 }, (_, index) => ({ x: Math.cos(index / 128 * 4 * Math.PI), y: Math.sin(index / 128 * 4 * Math.PI) }));
    expect(() => validateGraph2DCapProfile(twiceWound)).toThrow(/one winding/);
  });
});
