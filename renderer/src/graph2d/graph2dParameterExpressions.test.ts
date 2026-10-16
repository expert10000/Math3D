import { describe, expect, it } from "vitest";
import {
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DAnimationPlan, Graph2DAnimationExportBuilder,
  createGraph2DDocument, graph2DAnimationFrame, inspectGraph2DCompatibility,
  parseGraph2DDocument, previewGraph2DParameterValues, sampleGraph2DScene,
  serializeGraph2DDocument, structuralHash,
} from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const base = () => {
  let document = createEmptyGraph2DDocument("gra-n09");
  document = createGraph2DDocument({ ...applyGraph2DAuthoring(document, {
    type: "parameter-create", draft: { name: "a", value: 1, min: -5, max: 5, step: .1, unit: "" },
  }), stableKey: "gra-n09" });
  document = createGraph2DDocument({ ...applyGraph2DAuthoring(document, {
    type: "parameter-expression-create", name: "b", expression: "2*a",
  }), stableKey: "gra-n09" });
  return createGraph2DDocument({ ...applyGraph2DAuthoring(document, {
    type: "parameter-expression-create", name: "c", expression: "b+1",
  }), stableKey: "gra-n09" });
};

describe("GRA-N09 expression-driven parameters", () => {
  it("resolves multiple hops in dependency order during preview, commit, sampling and undo", () => {
    const document = base(), adapter = new Graph2DCommandAdapter(document);
    expect(document.source.variables.map(p => p.value)).toEqual([1, 2, 3]);
    const reordered = createGraph2DDocument({ source: { ...document.source,
      variables: [document.source.variables[2]!, document.source.variables[0]!, document.source.variables[1]!] },
      stableKey: "reordered" });
    expect(reordered.source.variables.map(p => [p.name, p.value])).toEqual([["c", 3], ["a", 1], ["b", 2]]);
    const preview = previewGraph2DParameterValues(document, { a: 3 });
    expect(preview.source.variables.map(p => p.value)).toEqual([3, 6, 7]);
    expect(document.source.variables.map(p => p.value)).toEqual([1, 2, 3]);
    expect(adapter.history().undoDepth).toBe(0);
    const committed = adapter.commitScene(applyGraph2DAuthoring(document, { type: "parameter-value", name: "a", value: 3 }), "parameter-value");
    expect(committed.source.variables.map(p => p.value)).toEqual([3, 6, 7]);
    expect(adapter.undo()?.source.variables.map(p => p.value)).toEqual([1, 2, 3]);
    expect(adapter.redo()?.source.variables.map(p => p.value)).toEqual([3, 6, 7]);
    const curve = createGraph2DDocument({ ...applyGraph2DAuthoring(preview, { type: "create", draft: {
      label: "Derived line", expression: "c*x", domain: { min: -1, max: 1, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
    } }), stableKey: "derived-curve" });
    const sampled = sampleGraph2DScene({ document: curve, viewport: curve.display.viewport, width: 320, height: 240, interaction: false });
    expect(sampled[0]!.artifact.segments.flatMap(segment => segment.points).some(point => Math.abs(point.x) > .5 && Math.abs(point.y - 7 * point.x) < 1e-8)).toBe(true);
  });

  it("rejects cycles, missing inputs, undefined math, oversized values and deleting dependencies", () => {
    const document = base();
    for (const action of [
      { type: "parameter-expression-configure", name: "b", expression: "c+1" },
      { type: "parameter-expression-configure", name: "b", expression: "b+1" },
    ] as const) expect(() => applyGraph2DAuthoring(document, action)).toThrow(/cycle/);
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-expression-create", name: "d", expression: "missing+1" })).toThrow(/Unknown symbol/);
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-expression-configure", name: "b", expression: "1/(a-1)" })).toThrow(/Division by zero/);
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-expression-configure", name: "b", expression: "1e10*a" })).toThrow(/1e9/);
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-delete", name: "a" })).toThrow(/Unknown symbol/);
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-value", name: "b", value: 5 })).toThrow(/Configure a parameter/);
  });

  it("converts a derived value to a slider and back without changing its name", () => {
    const document = base();
    const slider = createGraph2DDocument({ ...applyGraph2DAuthoring(document, {
      type: "parameter-configure", name: "c",
      draft: { name: "c", value: 3, min: -5, max: 10, step: .5, unit: "" },
    }), stableKey: "converted-slider" });
    expect(slider.source.variables[2]).toMatchObject({ name: "c", value: 3, control: { min: -5, max: 10 } });
    const derived = createGraph2DDocument({ ...applyGraph2DAuthoring(slider, {
      type: "parameter-expression-configure", name: "c", expression: "b+2",
    }), stableKey: "converted-derived" });
    expect(derived.source.variables[2]).toEqual({ name: "c", value: 4, expression: "b+2" });
    expect(previewGraph2DParameterValues(derived, { a: 2 }).source.variables[2]?.value).toBe(6);
  });

  it("round-trips with a capability and rejects stale derived values even with a matching source hash", () => {
    const document = base(), bytes = serializeGraph2DDocument(document);
    expect(document.requiredCapabilities).toContain("graph2d.parameters.v1");
    expect(document.requiredCapabilities).toContain("graph2d.parameter-expressions.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(bytes)).toEqual(document);
    const tampered = JSON.parse(bytes);
    tampered.source.variables[1].value = 999;
    tampered.identity.structuralHash = structuralHash(tampered.source);
    expect(() => parseGraph2DDocument(JSON.stringify(tampered))).toThrow(/Invalid Graph2D source/);
    tampered.requiredCapabilities = ["graph2d.explicit.v1", "graph2d.parameters.v1"];
    expect(() => parseGraph2DDocument(JSON.stringify(tampered))).toThrow();
  });

  it("preflights each deterministic animation frame and recomputes derived values", () => {
    const document = base();
    const plan = createGraph2DAnimationPlan(document, { parameter: "a", from: 0, to: 2, frames: 3, fps: 10 });
    expect([0, 1, 2].map(index => graph2DAnimationFrame(document, plan, index).document.source.variables.map(p => p.value)))
      .toEqual([[0, 0, 1], [1, 2, 3], [2, 4, 5]]);
    const exportBuilder = new Graph2DAnimationExportBuilder({ publication: { document, size: { width: 320, height: 240 } }, plan });
    while (!exportBuilder.complete) exportBuilder.appendNext();
    expect(exportBuilder.finish()).toHaveLength(2);
    expect(() => new Graph2DAnimationExportBuilder({ publication: { document, size: { width: 320, height: 240 } },
      plan: { ...plan, frames: 61 } })).toThrow(/2–60/);
    const constrained = createGraph2DDocument({ ...applyGraph2DAuthoring(document, {
      type: "parameter-expression-configure", name: "c", expression: "sqrt(a)",
    }), stableKey: "sqrt" });
    expect(() => createGraph2DAnimationPlan(constrained, { parameter: "a", from: -1, to: 1, frames: 3, fps: 10 }))
      .toThrow(/Animation frame 1/);
  });
});
