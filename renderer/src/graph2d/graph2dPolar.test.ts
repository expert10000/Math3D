import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  evaluateGraph2DPolar, inspectGraph2DCompatibility, parseGraph2DDocument,
  pickGraph2DProbe, queryGraph2DInspector, sampleGraph2DPolar,
  serializeGraph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "./Graph2DCommandAdapter";

const create = (expression: string) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("polar:" + expression), {
    type: "create-polar", draft: { label: "r", rExpression: expression,
      domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
      style: { color: "#7c3aed", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    selection: scene.selection, stableKey: "polar:" + expression });
};
const viewport = { xMin: -3, xMax: 3, yMin: -3, yMax: 3, aspect: "free" as const };
const size = { width: 600, height: 600 };

describe("Graph2D polar objects", () => {
  it("preserves r(θ), angular domain, capability, and signed-radius semantics", () => {
    const document = create("-2");
    expect(document.requiredCapabilities).toContain("graph2d.polar.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    const object = document.source.objects[0]!;
    if (object.kind !== "polar") throw new Error("Expected polar object.");
    const point = evaluateGraph2DPolar(object, {}, 0);
    expect(point?.x).toBeCloseTo(-2, 8);
    expect(point?.y).toBeCloseTo(0, 8);
    expect(point?.radius).toBe(-2);
    expect(evaluateGraph2DPolar(object, {}, Math.PI / 2)?.y).toBeCloseTo(-2, 8);
  });

  it("samples and picks a polar curve with a Cartesian probe and source angle", () => {
    const document = create("-2");
    const object = document.source.objects[0]!;
    if (object.kind !== "polar") throw new Error("Expected polar object.");
    const artifact = sampleGraph2DPolar({ object, viewport, ...size,
      policy: { maxSamples: 4000, maxDepth: 12, tolerancePx: 0.75 } });
    expect(artifact.segments.length).toBeGreaterThan(0);
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(4000);
    const selected = pickGraph2DProbe({ document, series: [{ objectId: object.id, artifact }],
      viewport, size, screen: { x: 100, y: 300 } }).selection;
    expect(selected.probe?.x).toBeCloseTo(-2, 1);
    expect(selected.probe?.parameter).toBeTypeOf("number");
    const withProbe = createGraph2DDocument({ source: document.source, display: document.display,
      selection: selected, stableKey: "polar:-2" });
    expect(queryGraph2DInspector(withProbe, { objectId: object.id, artifact })?.signedRadius).toBe(-2);
  });

  it("commits and undoes polar grid mode as display intent", () => {
    const adapter = new Graph2DCommandAdapter(create("1"));
    adapter.commitGridMode("polar");
    expect(adapter.document().display.axes.gridMode).toBe("polar");
    adapter.undo();
    expect(adapter.document().display.axes.gridMode ?? "cartesian").toBe("cartesian");
  });
});
