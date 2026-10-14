import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, graph2DDerivedConstructionFromPoint,
  graph2DCurvatureConstructionFromPoint, graph2DPointConstructionFromProbe,
  GRAPH2D_CURVATURE_CONSTRUCTIONS_CAPABILITY, isGraph2DConstructionArtifactCurrent, resolveGraph2DConstructions,
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
