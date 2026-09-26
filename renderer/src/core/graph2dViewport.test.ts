import { describe, expect, it } from "vitest";
import {
  applyGraph2DViewportCommand, classifyGraph2DViewportCommand, fitGraph2DViewport,
  graph2DScreenToWorld, graph2DWorldToScreen, panGraph2DViewport,
  resolveGraph2DViewport, zoomGraph2DViewport, GRAPH2D_DEFAULT_VIEWPORT, GRAPH2D_MIN_SPAN,
} from "@math3d/core";

const size = { width: 800, height: 600 };

describe("Graph2D viewport transforms", () => {
  it("round trips world and screen points across aspect and resize", () => {
    for (const aspect of ["equal", "free"] as const) {
      const viewport = { xMin: -7, xMax: 3, yMin: -2, yMax: 11, aspect };
      for (const dimensions of [size, { width: 450, height: 900 }]) {
        for (const point of [{ x: -7, y: -2 }, { x: 0, y: 0 }, { x: 3, y: 11 }]) {
          const screen = graph2DWorldToScreen(viewport, dimensions, point);
          const restored = graph2DScreenToWorld(viewport, dimensions, screen);
          expect(restored.x).toBeCloseTo(point.x, 10);
          expect(restored.y).toBeCloseTo(point.y, 10);
        }
      }
    }
  });

  it("preserves zoom anchors, pans in screen direction, and clamps extreme zoom", () => {
    const anchor = { x: 243, y: 172 };
    const before = graph2DScreenToWorld(GRAPH2D_DEFAULT_VIEWPORT, size, anchor);
    const zoomed = zoomGraph2DViewport(GRAPH2D_DEFAULT_VIEWPORT, size, anchor, 2);
    const after = graph2DScreenToWorld(zoomed, size, anchor);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    const panned = panGraph2DViewport(zoomed, size, { x: 80, y: 0 });
    expect(graph2DWorldToScreen(panned, size, before).x).toBeCloseTo(anchor.x + 80, 8);
    const tiny = zoomGraph2DViewport(GRAPH2D_DEFAULT_VIEWPORT, size, anchor, 1e200);
    expect(tiny.xMax - tiny.xMin).toBeGreaterThanOrEqual(GRAPH2D_MIN_SPAN * 0.99);
    expect(() => zoomGraph2DViewport(GRAPH2D_DEFAULT_VIEWPORT, size, anchor, 0)).toThrow();
  });

  it("fits bounds, preserves equal scale, and classifies preview versus commit", () => {
    const fitted = fitGraph2DViewport({ xMin: -2, xMax: 4, yMin: 1, yMax: 3 }, size);
    const resolved = resolveGraph2DViewport(fitted, size);
    expect((resolved.xMax - resolved.xMin) / size.width).toBeCloseTo((resolved.yMax - resolved.yMin) / size.height, 10);
    expect(resolved.xMin).toBeLessThan(-2);
    expect(resolved.xMax).toBeGreaterThan(4);
    expect(classifyGraph2DViewportCommand("preview")).toBe("transient-display");
    expect(classifyGraph2DViewportCommand("commit")).toBe("persistent-display");
    expect(applyGraph2DViewportCommand(fitted, size, { type: "graph2d.viewport.reset" })).toEqual(GRAPH2D_DEFAULT_VIEWPORT);
    expect(() => resolveGraph2DViewport(fitted, { width: 0, height: 600 })).toThrow();
  });
});
