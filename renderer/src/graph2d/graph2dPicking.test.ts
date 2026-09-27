import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  graph2DWorldToScreen, pickGraph2DProbe, sampleGraph2DExplicit, selectionForGraph2DObject } from "@math3d/core";

const draft = (label: string, expression: string) => ({ label, expression,
  domain: { min: -10, max: 10, includeMin: true, includeMax: true },
  style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true } });

describe("Graph2D picking", () => {
  const empty = createEmptyGraph2DDocument("picking");
  const one = applyGraph2DAuthoring(empty, { type: "create", draft: draft("rise", "x") });
  const two = applyGraph2DAuthoring({ ...empty, ...one }, { type: "create", draft: draft("fall", "-x") });
  const document = createGraph2DDocument({ source: two.source, display: two.display, selection: two.selection, stableKey: "picking" });
  const size = { width: 800, height: 600 };
  const series = document.source.objects.map((object) => ({ objectId: object.id, artifact: sampleGraph2DExplicit({
    ast: object.expression.ast, domain: object.domain, viewport: document.display.viewport,
    width: size.width, height: size.height, policy: document.display.sampling,
  }) }));

  it("refines a visible curve to mathematical coordinates and clears empty space", () => {
    const screen = graph2DWorldToScreen(document.display.viewport, size, { x: 2, y: 2 });
    const picked = pickGraph2DProbe({ document, series, viewport: document.display.viewport, size, screen });
    expect(picked.selection.objectId).toBe("function_1");
    expect(picked.selection.probe?.x).toBeCloseTo(2, 1);
    expect(picked.selection.probe?.y).toBeCloseTo(2, 1);
    const missed = pickGraph2DProbe({ document, series, viewport: document.display.viewport, size, screen: { x: 0, y: 0 } });
    expect(missed.selection.objectId).toBe(null);
  });

  it("cycles overlapping curves and excludes hidden ones", () => {
    const screen = graph2DWorldToScreen(document.display.viewport, size, { x: 0, y: 0 });
    const first = pickGraph2DProbe({ document, series, viewport: document.display.viewport, size, screen });
    const second = pickGraph2DProbe({ document, series, viewport: document.display.viewport, size, screen, previous: first.selection });
    expect(second.selection.objectId).not.toBe(first.selection.objectId);
    const hidden = { ...document, display: { ...document.display, objects: document.display.objects.map((entry) =>
      entry.objectId === first.selection.objectId ? { ...entry, visible: false } : entry) } };
    expect(pickGraph2DProbe({ document: hidden, series, viewport: hidden.display.viewport, size, screen }).selection.objectId)
      .toBe(second.selection.objectId);
  });

  it("provides a stable visible sample for keyboard selection", () => {
    const selection = selectionForGraph2DObject(document, series, "function_1", 3);
    expect(selection.objectId).toBe("function_1");
    expect(selection.probe?.x).toBeCloseTo(3, 0);
    expect(selection.probe?.y).toBeCloseTo(selection.probe!.x, 8);
  });
});
