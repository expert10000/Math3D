import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, graph2DDerivedConstructionFromPoint,
  graph2DCurvatureConstructionFromPoint, graph2DOsculatingCircleConstructionFromPoint, graph2DPointConstructionFromProbe,
  GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY, GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY,
  isGraph2DConstructionArtifactCurrent, resolveGraph2DConstructions, evaluateGraph2DParametric,
  inspectGraph2DCompatibility, normalizeGraph2DDocument, parseGraph2DDocument, serializeGraph2DDocument,
  type Graph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { Graph2DPlot } from "./Graph2DPlot";

const style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const domain = { min: -4, max: 4, includeMin: true, includeMax: true };
const scene = (kind: "explicit" | "parametric" | "polar", expression: string) => {
  const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument(`g2d48-${kind}-${expression}`));
  const action = kind === "explicit" ? { type: "create" as const, draft: { label: "f", expression, domain, style } } :
    kind === "parametric" ? { type: "create-parametric" as const, draft: { label: "p", xExpression: "t", yExpression: expression, domain, style } } :
      { type: "create-polar" as const, draft: { label: "r", rExpression: expression, domain, style } };
  adapter.commitScene(applyGraph2DAuthoring(adapter.document(), action), action.type);
  const objectId = adapter.document().source.objects[0]!.id;
  const parameter = kind === "explicit" ? "x" : kind === "parametric" ? "t" : "theta";
  const value = kind === "polar" ? 0 : 2;
  adapter.commitSelection({ objectId, probe: { objectId, x: value, y: value, ...(kind !== "explicit" ? { parameter: value } : {}) } });
  adapter.commitConstruction({ type: "create", object: graph2DPointConstructionFromProbe(adapter.document()) });
  adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "tangent") });
  adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "normal") });
  return adapter;
};
const ready = (document: Graph2DDocument) => resolveGraph2DConstructions(document).objects;

describe("G2D48 source-derived Graph constructions", () => {
  it("resolves explicit point, tangent, normal and projects clipped geometry", () => {
    const adapter = scene("explicit", "x^2");
    const document = adapter.document(), artifact = resolveGraph2DConstructions(document);
    expect(artifact.objects.map(item => item.state)).toEqual(["ready", "ready", "ready"]);
    expect(artifact.objects.map(item => item.confidence)).toEqual(["source-defined", "approximate", "approximate"]);
    expect(artifact.objects[0]?.point).toEqual({ x: 2, y: 4 });
    expect(artifact.objects[1]?.direction?.y).toBeCloseTo(4, 4);
    expect(artifact.objects[2]?.direction?.x).toBeCloseTo(-4, 4);
    expect(artifact.evaluations).toBeLessThan(12000);
    expect(artifact.bytes).toBeLessThan(1024 * 1024);
    expect(JSON.stringify(document.source.constructions)).not.toContain('"direction"');
    const svg = renderToStaticMarkup(<Graph2DPlot display={document.display} size={{ width: 600, height: 400 }}
      series={[]} constructions={artifact} />);
    expect(svg).toContain('data-graph2d-construction="construction_1"');
    expect(svg).toContain('data-graph2d-construction="construction_2"');
    expect(svg).toContain('data-graph2d-construction="construction_3"');
  });

  it("preserves signed polar radius and derives a tangent in Cartesian world space", () => {
    const objects = ready(scene("polar", "-2").document());
    expect(objects[0]?.point).toEqual({ x: -2, y: -0 });
    expect(objects[1]?.state).toBe("ready");
    expect(objects[1]?.direction?.x).toBeCloseTo(0, 4);
    expect(objects[1]?.direction?.y).toBeCloseTo(-2, 4);
  });

  it("uses the parametric derivative rather than treating t as a Cartesian x slope", () => {
    const objects = ready(scene("parametric", "t^2").document());
    expect(objects[0]?.point).toEqual({ x: 2, y: 4 });
    expect(objects[1]?.direction?.x).toBeCloseTo(1, 4);
    expect(objects[1]?.direction?.y).toBeCloseTo(4, 4);
  });

  it("recomputes after a source edit or anchor move and rejects old generations", () => {
    const adapter = scene("explicit", "x^2"), previous = resolveGraph2DConstructions(adapter.document());
    const before = adapter.document();
    adapter.commitScene(applyGraph2DAuthoring(before, { type: "edit", objectId: "function_1", draft: {
      label: "f", expression: "x^3", domain, style,
    } }), "edit");
    expect(isGraph2DConstructionArtifactCurrent(previous, adapter.document())).toBe(false);
    expect(ready(adapter.document())[0]?.point).toEqual({ x: 2, y: 8 });
    const point = adapter.document().source.constructions?.objects[0];
    if (point?.kind !== "point-on-curve") throw new Error("Missing point fixture.");
    adapter.commitConstruction({ type: "update", object: { ...point, anchor: { parameter: "x", value: 3 } } });
    expect(ready(adapter.document())[0]?.point).toEqual({ x: 3, y: 27 });
    expect(adapter.undo()?.source.constructions?.objects[0]).toEqual(point);
    expect(ready(adapter.document())[0]?.point).toEqual({ x: 2, y: 8 });
  });

  it("marks undefined, outside-domain, cusp and stationary-parameter lines unavailable", () => {
    const undefinedPoint = scene("explicit", "1/(x-2)");
    expect(ready(undefinedPoint.document()).map(item => item.state)).toEqual(["unavailable", "unavailable", "unavailable"]);
    const cusp = scene("explicit", "abs(x-2)");
    expect(ready(cusp.document()).map(item => item.state)).toEqual(["ready", "unavailable", "unavailable"]);
    const stationary = scene("parametric", "(t-2)^3");
    stationary.commitScene(applyGraph2DAuthoring(stationary.document(), { type: "edit-parametric", objectId: "parametric_1",
      draft: { label: "p", xExpression: "(t-2)^2", yExpression: "(t-2)^3", domain, style } }), "edit-parametric");
    expect(ready(stationary.document()).map(item => item.state)).toEqual(["ready", "unavailable", "unavailable"]);
    const before = undefinedPoint.document();
    undefinedPoint.commitScene(applyGraph2DAuthoring(before, { type: "edit", objectId: "function_1", draft: {
      label: "f", expression: "x", domain: { min: -4, max: 1, includeMin: true, includeMax: true }, style,
    } }), "edit");
    expect(ready(undefinedPoint.document())[0]?.reason).toMatch(/outside the domain/);
  });
});

describe("G2D57 saved osculating circle", () => {
  it("keeps the exact unit-circle geometry synchronized when its saved point moves", () => {
    const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("unit-circle-constructions"));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "create-parametric", draft: {
      label: "unit circle", xExpression: "cos(t)", yExpression: "sin(t)",
      domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true }, style,
    } }), "create-parametric");
    const source = adapter.document().source.objects;
    const curve = source[0];
    if (curve?.kind !== "parametric") throw new Error("Missing unit-circle source.");
    const initialParameter = 2.202629;
    const initialPoint = evaluateGraph2DParametric(curve, {}, initialParameter)!;
    adapter.commitSelection({ objectId: curve.id, probe: { objectId: curve.id,
      x: initialPoint.x, y: initialPoint.y, parameter: initialParameter } });
    adapter.commitConstruction({ type: "create", object: graph2DPointConstructionFromProbe(adapter.document()) });
    adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "tangent") });
    adapter.commitConstruction({ type: "create", object: graph2DDerivedConstructionFromPoint(adapter.document(), "construction_1", "normal") });
    adapter.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(adapter.document(), "construction_1") });
    adapter.commitConstruction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(adapter.document(), "construction_1") });

    const assertCircleAt = (parameter: number) => {
      const [point, tangent, normal, curvature, osculating] = ready(adapter.document());
      expect([point, tangent, normal, curvature, osculating].map(item => item?.state)).toEqual(Array(5).fill("ready"));
      expect(point?.point?.x).toBeCloseTo(Math.cos(parameter), 10);
      expect(point?.point?.y).toBeCloseTo(Math.sin(parameter), 10);
      expect(tangent?.point).toEqual(point?.point);
      expect(normal?.point).toEqual(point?.point);
      expect(tangent?.direction?.x).toBeCloseTo(-Math.sin(parameter), 9);
      expect(tangent?.direction?.y).toBeCloseTo(Math.cos(parameter), 9);
      expect(tangent!.direction!.x * normal!.direction!.x + tangent!.direction!.y * normal!.direction!.y).toBeCloseTo(0, 10);
      expect(curvature?.measurement?.value).toBeCloseTo(1, 10);
      expect(osculating?.circle?.center.x).toBeCloseTo(0, 10);
      expect(osculating?.circle?.center.y).toBeCloseTo(0, 10);
      expect(osculating?.circle?.radius).toBeCloseTo(1, 10);
      return resolveGraph2DConstructions(adapter.document());
    };

    const original = assertCircleAt(initialParameter);
    expect(original.objects[0]?.point?.x).toBeCloseTo(-0.591, 2);
    expect(original.objects[0]?.point?.y).toBeCloseTo(0.807, 2);
    const savedPoint = adapter.document().source.constructions?.objects[0];
    if (savedPoint?.kind !== "point-on-curve") throw new Error("Missing saved point.");
    const movedParameter = Math.PI / 3;
    adapter.commitConstruction({ type: "update", object: { ...savedPoint, anchor: { parameter: "t", value: movedParameter } } });
    expect(adapter.document().source.objects).toEqual(source);
    expect(isGraph2DConstructionArtifactCurrent(original, adapter.document())).toBe(false);
    const moved = assertCircleAt(movedParameter);
    expect(moved.objects[0]?.point).not.toEqual(original.objects[0]?.point);
    expect(moved.objects[1]?.direction).not.toEqual(original.objects[1]?.direction);
    const reopened = parseGraph2DDocument(serializeGraph2DDocument(adapter.document()));
    expect(reopened).toEqual(adapter.document());
    expect(resolveGraph2DConstructions(reopened).objects).toEqual(moved.objects);
    adapter.undo();
    expect(adapter.document().source.objects).toEqual(source);
    assertCircleAt(initialParameter);
  });
  it("derives finite geometry for explicit, parametric, and negative-radius polar curves", () => {
    for (const [kind, expression] of [["explicit", "x^2"], ["parametric", "t^2"], ["polar", "-2"]] as const) {
      const adapter = scene(kind, expression);
      adapter.commitConstruction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(adapter.document(), "construction_1") });
      const saved = adapter.document(), artifact = resolveGraph2DConstructions(saved);
      const circle = artifact.objects[3]?.circle;
      expect(saved.requiredCapabilities).toContain(GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY);
      expect(normalizeGraph2DDocument({ ...saved, requiredCapabilities: saved.requiredCapabilities.filter(capability =>
        capability !== GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY) }).ok).toBe(false);
      expect(circle).toBeTruthy();
      expect(circle!.radius).toBeGreaterThan(0);
      expect(Math.abs(Math.hypot(artifact.objects[0]!.point!.x - circle!.center.x,
        artifact.objects[0]!.point!.y - circle!.center.y) - circle!.radius)).toBeLessThan(1e-8);
      if (kind === "polar") { expect(circle!.center.x).toBeCloseTo(0, 6); expect(circle!.radius).toBeCloseTo(2, 6); }
      expect(parseGraph2DDocument(serializeGraph2DDocument(saved))).toEqual(saved);
      expect(artifact.evaluations).toBeLessThanOrEqual(12000);
      const svg = renderToStaticMarkup(<Graph2DPlot display={saved.display} size={{ width: 600, height: 400 }}
        series={[]} constructions={artifact} />);
      expect(svg).toContain('data-graph2d-construction="construction_4"');
    }
  });

  it("recomputes after source edits and withholds flat or singular geometry", () => {
    const adapter = scene("explicit", "x^2");
    adapter.commitConstruction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(adapter.document(), "construction_1") });
    const original = resolveGraph2DConstructions(adapter.document());
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "edit", objectId: "function_1",
      draft: { label: "f", expression: "-x^2", domain, style } }), "edit");
    expect(isGraph2DConstructionArtifactCurrent(original, adapter.document())).toBe(false);
    expect(ready(adapter.document())[3]?.circle?.center.y).not.toBeCloseTo(original.objects[3]!.circle!.center.y);
    adapter.undo();
    expect(ready(adapter.document())[3]?.circle).toEqual(original.objects[3]?.circle);
    adapter.commitConstruction({ type: "delete", objectId: "construction_4" });
    expect(adapter.document().requiredCapabilities).not.toContain(GRAPH2D_OSCULATING_CIRCLE_CONSTRUCTIONS_CAPABILITY);

    for (const [kind, expression] of [["explicit", "x"], ["explicit", "abs(x-2)"], ["polar", "0"]] as const) {
      const singular = scene(kind, expression);
      singular.commitConstruction({ type: "create", object: graph2DOsculatingCircleConstructionFromPoint(singular.document(), "construction_1") });
      expect(ready(singular.document())[3]).toMatchObject({ state: "unavailable", circle: null });
    }
  });
});

describe("G2D56 saved signed curvature", () => {
  it("recomputes the three curve conventions from source and survives save/reopen", () => {
    for (const [kind, expression, expected, convention] of [
      ["explicit", "x^2", 2 / 17 ** 1.5, "increasing-x"],
      ["parametric", "t^2", 2 / 17 ** 1.5, "increasing-t"],
      ["polar", "-2", 0.5, "increasing-theta"],
    ] as const) {
      const adapter = scene(kind, expression);
      adapter.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(adapter.document(), "construction_1") });
      const saved = adapter.document(), artifact = resolveGraph2DConstructions(saved);
      expect(saved.requiredCapabilities).toContain(GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY);
      expect(normalizeGraph2DDocument({ ...saved, requiredCapabilities: saved.requiredCapabilities.filter(capability =>
        capability !== GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY) }).ok).toBe(false);
      expect(inspectGraph2DCompatibility(saved).status).toBe("current");
      expect(artifact.objects[3]?.measurement).toMatchObject({ quantity: "signed-curvature", convention, certifiedErrorBound: null });
      expect(artifact.objects[3]?.measurement?.value).toBeCloseTo(expected, 6);
      expect(artifact.objects[3]?.confidence).toBe("approximate");
      expect(artifact.evaluations).toBeLessThanOrEqual(12000);
      expect(parseGraph2DDocument(serializeGraph2DDocument(saved))).toEqual(saved);
      const svg = renderToStaticMarkup(<Graph2DPlot display={saved.display} size={{ width: 600, height: 400 }}
        series={[]} constructions={artifact} />);
      expect(svg).not.toContain('data-graph2d-construction="construction_4"');
    }
  });

  it("updates after source and anchor edits, with one-step undo and unavailable singular states", () => {
    const adapter = scene("explicit", "x^2");
    adapter.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(adapter.document(), "construction_1") });
    const first = resolveGraph2DConstructions(adapter.document());
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "edit", objectId: "function_1", draft: {
      label: "f", expression: "-x^2", domain, style,
    } }), "edit");
    expect(isGraph2DConstructionArtifactCurrent(first, adapter.document())).toBe(false);
    expect(ready(adapter.document())[3]?.measurement?.value).toBeCloseTo(-2 / 17 ** 1.5, 6);
    const point = adapter.document().source.constructions?.objects[0];
    if (point?.kind !== "point-on-curve") throw new Error("Missing point fixture.");
    adapter.commitConstruction({ type: "update", object: { ...point, anchor: { parameter: "x", value: 0 } } });
    expect(ready(adapter.document())[3]?.measurement?.value).toBeCloseTo(-2, 6);
    expect(adapter.undo()?.source.constructions?.objects[0]).toEqual(point);
    expect(ready(adapter.document())[3]?.measurement?.value).toBeCloseTo(-2 / 17 ** 1.5, 6);
    adapter.commitConstruction({ type: "delete", objectId: "construction_4" });
    expect(adapter.document().requiredCapabilities).not.toContain(GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY);
    expect(adapter.undo()?.source.constructions?.objects.some(object => object.kind === "curvature")).toBe(true);

    const cusp = scene("explicit", "abs(x-2)");
    cusp.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(cusp.document(), "construction_1") });
    expect(ready(cusp.document())[3]).toMatchObject({ state: "unavailable", measurement: null });
    const polarZero = scene("polar", "0");
    polarZero.commitConstruction({ type: "create", object: graph2DCurvatureConstructionFromPoint(polarZero.document(), "construction_1") });
    expect(ready(polarZero.document())[3]).toMatchObject({ state: "unavailable", measurement: null });
  });
});
