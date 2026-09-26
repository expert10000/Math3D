import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, panGraph2DViewport, zoomGraph2DViewport } from "@math3d/core";
import { Graph2DCommandAdapter } from "./Graph2DCommandAdapter";

describe("Graph2D viewport kernel history", () => {
  it("keeps gesture previews outside history and commits one reversible viewport command", () => {
    const document = createEmptyGraph2DDocument("viewport-history");
    const adapter = new Graph2DCommandAdapter(document);
    const size = { width: 800, height: 600 };
    const preview1 = panGraph2DViewport(document.display.viewport, size, { x: 10, y: 0 });
    const preview2 = panGraph2DViewport(document.display.viewport, size, { x: 30, y: 0 });
    const preview3 = zoomGraph2DViewport(preview2, size, { x: 400, y: 300 }, 1.2);
    expect(preview1).not.toEqual(preview3);
    expect(adapter.history().undoDepth).toBe(0);
    const committed = adapter.commitViewport(preview3);
    expect(adapter.history().undoDepth).toBe(1);
    expect(committed.display.viewport).toEqual(preview3);
    expect(committed.identity).toEqual(document.identity);
    expect(adapter.undo()?.display.viewport).toEqual(document.display.viewport);
    expect(adapter.redo()?.display.viewport).toEqual(preview3);
  });
});
