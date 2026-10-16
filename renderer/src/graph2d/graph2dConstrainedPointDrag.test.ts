import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, evaluateGraph2DParametric,
  graph2DPointConstructionFromProbe, graph2DDerivedConstructionFromPoint,
  graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint,
  graph2DWorldToScreen, projectGraph2DConstructionVector, previewGraph2DConstrainedPoint, projectGraph2DConstrainedPoint,
  resolveGraph2DConstructions, type Graph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const size = { width: 600, height: 600 };
const circle = (turns = 1) => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument(`drag-circle-${turns}`));
  adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "create-parametric", draft: {
    label: "Circle", xExpression: "cos(t)", yExpression: "sin(t)",
    domain: { min: 0, max: turns * 2 * Math.PI, includeMin: true, includeMax: true }, style,
  } }), "create-parametric");
  const source = adapter.document().source.objects[0];
  if (source?.kind !== "parametric") throw new Error("Missing circle.");
  const parameter = turns === 1 ? 2.202629 : 2 * Math.PI + .2;
  const point = evaluateGraph2DParametric(source, {}, parameter)!;
  adapter.commitSelection({ objectId: source.id, probe: { objectId: source.id, ...point } });
  adapter.commitConstruction({ type: "create", object: graph2DPointConstructionFromProbe(adapter.document(), "Point 1") });
  return adapter;
};

describe("constrained point dragging", () => {
  it("projects onto the exact unit circle and previews all derivatives without editing the document", () => {
    const adapter = circle();
    adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "tangent") });
    adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "normal") });
    adapter.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(adapter.document(), "construction_1") });
    adapter.commitConstruction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(adapter.document(), "construction_1") });
    const original = adapter.document();
    const viewport = { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5, aspect: "equal" as const };
    const screen = graph2DWorldToScreen(viewport, size, { x: Math.cos(1), y: Math.sin(1) });
    const projection = projectGraph2DConstrainedPoint(original, "construction_1", viewport, size, screen, 2.202629)!;
    expect(projection.parameter).toBeCloseTo(1, 2);
    expect(projection.point.x).toBeCloseTo(Math.cos(projection.parameter), 10);
    expect(projection.point.y).toBeCloseTo(Math.sin(projection.parameter), 10);
    const preview = previewGraph2DConstrainedPoint(original, "construction_1", projection.parameter);
    expect(original.source.constructions?.objects[0]?.anchor).toEqual({ parameter: "t", value: 2.202629 });
    expect(preview.source.objects).toEqual(original.source.objects);
    const [point, tangent, normal, curvature, osculating] = resolveGraph2DConstructions(preview).objects;
    expect([point, tangent, normal, curvature, osculating].map(item => item?.state)).toEqual(Array(5).fill("ready"));
    expect(point?.point?.x).toBeCloseTo(projection.point.x, 10);
    expect(tangent?.direction?.x).toBeCloseTo(-Math.sin(projection.parameter), 8);
    expect(tangent!.direction!.x * normal!.direction!.x + tangent!.direction!.y * normal!.direction!.y).toBeCloseTo(0, 8);
    expect(curvature?.measurement?.value).toBeCloseTo(1, 8);
    expect(osculating?.circle?.center.x).toBeCloseTo(0, 8);
    expect(osculating?.circle?.center.y).toBeCloseTo(0, 8);
    expect(osculating?.circle?.radius).toBeCloseTo(1, 8);
    const tangentArrow = projectGraph2DConstructionVector(viewport, size, point!.point!, tangent!.direction!)!;
    const normalArrow = projectGraph2DConstructionVector(viewport, size, point!.point!, normal!.direction!)!;
    const tangentDelta = { x: tangentArrow.tip.x - tangentArrow.start.x, y: tangentArrow.tip.y - tangentArrow.start.y };
    const normalDelta = { x: normalArrow.tip.x - normalArrow.start.x, y: normalArrow.tip.y - normalArrow.start.y };
    expect(tangentDelta.x * normalDelta.x + tangentDelta.y * normalDelta.y).toBeCloseTo(0, 7);
    const center = graph2DWorldToScreen(viewport, size, { x: 0, y: 0 });
    expect(normalDelta.x * (center.x - normalArrow.start.x) + normalDelta.y * (center.y - normalArrow.start.y)).toBeGreaterThan(0);
  });

  it("projects mathematical direction through unequal screen scales and suppresses unrepresentable arrows", () => {
    const stretched = { xMin: -2, xMax: 2, yMin: -1, yMax: 1, aspect: "free" as const };
    const vector = projectGraph2DConstructionVector(stretched, { width: 400, height: 400 },
      { x: 0, y: 0 }, { x: 1, y: 1 })!;
    expect(vector.tip.x - vector.start.x).toBeCloseTo((vector.start.y - vector.tip.y) / 2, 8);
    expect(projectGraph2DConstructionVector(stretched, size, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
    expect(projectGraph2DConstructionVector({ ...stretched, xMin: .1, xMax: 10, xScale: "log10" }, size,
      { x: 1, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(projectGraph2DConstructionVector(stretched, { width: 400, height: 400 },
      { x: 1.99, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it("keeps the previous loop at coincident points and clamps to an authored endpoint", () => {
    const adapter = circle(2), document = adapter.document();
    const viewport = { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5, aspect: "equal" as const };
    const seam = graph2DWorldToScreen(viewport, size, { x: 1, y: 0 });
    const projection = projectGraph2DConstrainedPoint(document, "construction_1", viewport, size, seam, 2 * Math.PI + .2)!;
    expect(projection.parameter).toBeCloseTo(2 * Math.PI, 1);
    const endpoint = projectGraph2DConstrainedPoint(document, "construction_1", viewport, size,
      { x: -1000, y: 300 }, 2 * Math.PI + .2)!;
    expect(endpoint.parameter).toBeGreaterThanOrEqual(0);
    expect(endpoint.parameter).toBeLessThanOrEqual(4 * Math.PI);
  });

  it("projects explicit and polar saved points in screen space without changing either source", () => {
    const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "equal" as const };
    for (const kind of ["explicit", "polar"] as const) {
      const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument(`drag-${kind}`));
      const domain = kind === "explicit" ? { min: -2, max: 2, includeMin: true, includeMax: true } :
        { min: 0, max: Math.PI, includeMin: true, includeMax: true };
      adapter.commitScene(applyGraph2DAuthoring(adapter.document(), kind === "explicit" ?
        { type: "create", draft: { label: "Parabola", expression: "x^2", domain, style } } :
        { type: "create-polar", draft: { label: "Circle", rExpression: "1", domain, style } }), "create");
      const source = adapter.document().source.objects[0]!;
      adapter.commitSelection({ objectId: source.id, probe: kind === "explicit" ?
        { objectId: source.id, x: 0, y: 0 } : { objectId: source.id, x: 1, y: 0, parameter: 0 } });
      adapter.commitConstruction({ type: "create", object: graph2DPointConstructionFromProbe(adapter.document()) });
      const original = adapter.document();
      const target = kind === "explicit" ? { x: 1, y: 1 } : { x: 0, y: 1 };
      const projection = projectGraph2DConstrainedPoint(original, "construction_1", viewport, size,
        graph2DWorldToScreen(viewport, size, target), 0)!;
      expect(projection.parameter).toBeCloseTo(kind === "explicit" ? 1 : Math.PI / 2, 2);
      expect(projection.point.x).toBeCloseTo(target.x, 2);
      expect(projection.point.y).toBeCloseTo(target.y, 2);
      expect(previewGraph2DConstrainedPoint(original, "construction_1", projection.parameter).source.objects).toEqual(original.source.objects);
    }
  });

  it("does not accept a non-finite preview or an unrelated construction", () => {
    const document: Graph2DDocument = circle().document();
    expect(() => previewGraph2DConstrainedPoint(document, "construction_1", Number.NaN)).toThrow(/finite/);
    expect(projectGraph2DConstrainedPoint(document, "missing", document.display.viewport, size, { x: 1, y: 1 }, 1)).toBeNull();
  });
});
