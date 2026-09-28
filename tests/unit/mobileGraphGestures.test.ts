import { describe, expect, it } from "vitest";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { GRAPH2D_DEFAULT_VIEWPORT, graph2DScreenToWorld, sampleGraph2DScene, pickGraph2DProbe } from "@math3d/core";
import { MobileGraphGesture, mobileGraphProbeRadius } from "../../apps/mobile/src/models/mobileGraphGestures";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { clipMobileGraphLine, projectMobileGraphLines, mobileGraphTicks } from "../../apps/mobile/src/viewer/mobileGraphProjection";
const size = { width: 320, height: 240 }, initial = GRAPH2D_DEFAULT_VIEWPORT;
describe("native Graph touch input", () => {
  it("commits one shared history step for a many-event pan and restores it on undo", () => {
    const session = new MobileGraphGesture(), history = new Graph2DCommandAdapter(createMobileGraph("pan", true, "pan"));
    session.begin(initial, size, [{ id: "a", x: 100, y: 100 }]);
    for (let x = 110; x <= 200; x += 10) session.update([{ id: "a", x, y: 100 }]);
    expect(history.history().undoDepth).toBe(0);
    const result = session.finish(); expect(result.tap).toBeNull(); expect(result.viewport).not.toEqual(initial);
    history.commitViewport(result.viewport!); expect(history.history().undoDepth).toBe(1);
    expect(history.undo()?.display.viewport).toEqual(initial); expect(history.redo()?.display.viewport).toEqual(result.viewport);
  });
  it("anchors a pinch, allows remaining-finger pan, and never treats a pinch as a tap", () => {
    const session = new MobileGraphGesture(), anchor = { x: 100, y: 80 };
    session.begin(initial, size, [{ id: 1, x: 50, y: 80 }, { id: 2, x: 150, y: 80 }]);
    const zoomed = session.update([{ id: 1, x: 0, y: 80 }, { id: 2, x: 200, y: 80 }])!;
    const before = graph2DScreenToWorld(initial, size, anchor), after = graph2DScreenToWorld(zoomed, size, anchor);
    expect(after.x).toBeCloseTo(before.x, 12); expect(after.y).toBeCloseTo(before.y, 12);
    session.update([{ id: 2, x: 200, y: 80 }]);
    expect(session.update([{ id: 2, x: 210, y: 80 }])!.xMin).toBeLessThan(zoomed.xMin);
    expect(session.finish().tap).toBeNull();
  });
  it("cancels termination/background, ignores third pointers, and distinguishes taps from drags", () => {
    const session = new MobileGraphGesture(); session.begin(initial, size, [{ id: 1, x: 50, y: 50 }]);
    session.update([{ id: 1, x: 100, y: 50 }]); expect(session.cancel()).toEqual(initial);
    expect(session.finish()).toEqual({ viewport: null, tap: null });
    session.begin(initial, size, [{ id: 1, x: 50, y: 50 }]);
    session.update([{ id: 1, x: 50, y: 50 }, { id: 2, x: 70, y: 50 }, { id: 3, x: 90, y: 50 }]);
    expect(session.finish()).toEqual({ viewport: null, tap: null });
    session.begin(initial, size, [{ id: 1, x: 50, y: 50 }]); session.update([{ id: 1, x: 53, y: 51 }]);
    expect(session.finish()).toEqual({ viewport: null, tap: { id: 1, x: 50, y: 50 } });
  });
  it("uses finger-sized picking, overlap cycling and empty-space clear from the shared picker", () => {
    const starter = createMobileGraph("probe", true, "probe");
    const doc = { ...starter, source: { ...starter.source, objects: [starter.source.objects[0]!, { ...starter.source.objects[0]!, id: "g", label: "g" }] },
      display: { ...starter.display, objects: [starter.display.objects[0]!, { ...starter.display.objects[0]!, objectId: "g" }] } };
    const series = sampleGraph2DScene({ document: doc, viewport: initial, ...size, interaction: false });
    const input = { document: doc, series, viewport: initial, size, screen: { x: 160, y: 120 }, radiusPx: mobileGraphProbeRadius(320) };
    const first = pickGraph2DProbe(input), second = pickGraph2DProbe({ ...input, previous: first.selection });
    expect(first.selection.objectId).toBe("function_1"); expect(second.selection.objectId).toBe("g");
    expect(pickGraph2DProbe({ ...input, screen: { x: 20, y: 20 } }).selection).toEqual({ objectId: null, probe: null });
    expect(mobileGraphProbeRadius(100)).toBe(22); expect(mobileGraphProbeRadius(1000)).toBe(34);
  });
  it("clips native geometry and bounds grid density on narrow/short layouts", () => {
    expect(clipMobileGraphLine({ x: -1e12, y: 120 }, { x: 1e12, y: 120 }, size)).toEqual({ a: { x: 0, y: 120 }, b: { x: 320, y: 120 } });
    expect(clipMobileGraphLine({ x: -100, y: 10 }, { x: -50, y: 20 }, size)).toBeNull();
    const graph = createMobileGraph("line", true, "line"), series = sampleGraph2DScene({ document: graph, viewport: initial, ...size, interaction: false });
    for (const compact of [{ width: 280, height: 100 }, { width: 600, height: 180 }]) {
      const ticks = mobileGraphTicks(initial, compact); expect(ticks.x.length).toBeLessThan(12); expect(ticks.y.length).toBeLessThan(12);
      const lines = projectMobileGraphLines(series, initial, compact);
      expect(lines.every((line) => [line.a, line.b].every((p) => p.x >= -1e-6 && p.x <= compact.width + 1e-6 && p.y >= -1e-6 && p.y <= compact.height + 1e-6))).toBe(true);
    }
  });
});
