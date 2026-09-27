import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  evaluateGraph2DParametric, inspectGraph2DCompatibility, parseGraph2DDocument,
  pickGraph2DProbe, sampleGraph2DParametric, serializeGraph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "./Graph2DCommandAdapter";

const create = (xExpression: string, yExpression: string) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("parametric"), {
    type: "create-parametric", draft: { label: "p", xExpression, yExpression,
      domain: { min: 0, max: 2 * Math.PI, includeMin: true, includeMax: true },
      style: { color: "#e11d48", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, selection: scene.selection,
    stableKey: "parametric" });
};
const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" as const };
const size = { width: 800, height: 800 };

describe("Graph2D parametric objects", () => {
  it("preserves compact source, parameter domain, and capability through serialization", () => {
    const document = create("cos(t)", "sin(t)");
    expect(document.source.objects[0]?.kind).toBe("parametric");
    expect(document.requiredCapabilities).toContain("graph2d.parametric.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    const object = document.source.objects[0]!;
    if (object.kind !== "parametric") throw new Error("Expected parametric object.");
    const point = evaluateGraph2DParametric(object, {}, Math.PI / 2);
    expect(point?.x).toBeCloseTo(0, 8);
    expect(point?.y).toBeCloseTo(1, 8);
    expect(point?.parameter).toBeCloseTo(Math.PI / 2, 8);
  });

  it("adaptively samples a loop with bounded output", () => {
    const object = create("cos(t)", "sin(t)").source.objects[0]!;
    if (object.kind !== "parametric") throw new Error("Expected parametric object.");
    const artifact = sampleGraph2DParametric({ object, viewport, ...size,
      policy: { maxSamples: 4000, maxDepth: 12, tolerancePx: 0.75 } });
    expect(artifact.segments.length).toBeGreaterThan(0);
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(4000);
    expect(artifact.segments.flatMap((segment) => segment.points).some((point) =>
      point.parameter !== undefined && Math.abs(point.parameter - Math.PI / 2) < 0.1)).toBe(true);
  });

  it("cycles parameter branches at a self-intersection", () => {
    const document = create("sin(t)", "sin(2*t)");
    const object = document.source.objects[0]!;
    if (object.kind !== "parametric") throw new Error("Expected parametric object.");
    const artifact = sampleGraph2DParametric({ object, viewport, ...size,
      policy: { maxSamples: 8000, maxDepth: 14, tolerancePx: 0.5 } });
    const input = { document, series: [{ objectId: object.id, artifact }], viewport, size,
      screen: { x: 400, y: 400 }, radiusPx: 12 };
    const first = pickGraph2DProbe(input).selection;
    const second = pickGraph2DProbe({ ...input, previous: first }).selection;
    expect(first.probe?.parameter).toBeTypeOf("number");
    expect(second.probe?.parameter).toBeTypeOf("number");
    expect(Math.abs(first.probe!.parameter! - second.probe!.parameter!)).toBeGreaterThan(0.1);
  });

  it("updates required capabilities in a reversible scene command", () => {
    const initial = createEmptyGraph2DDocument("parametric-command");
    const adapter = new Graph2DCommandAdapter(initial);
    const source = create("cos(t)", "sin(t)");
    adapter.commitScene({ source: source.source, display: source.display, selection: source.selection }, "create-parametric");
    expect(adapter.document().requiredCapabilities).toContain("graph2d.parametric.v1");
    adapter.undo();
    expect(adapter.document().source.objects).toHaveLength(0);
    expect(adapter.document().requiredCapabilities).toEqual(["graph2d.explicit.v1"]);
  });
});
