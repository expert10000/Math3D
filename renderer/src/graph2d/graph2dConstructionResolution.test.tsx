import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, graph2DDerivedConstructionFromPoint,
  graph2DPointConstructionFromProbe, isGraph2DConstructionArtifactCurrent, resolveGraph2DConstructions,
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
