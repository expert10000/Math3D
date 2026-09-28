import { describe, expect, it } from "vitest";
import { mobileGraphLayout, mobileGraphPanelDestination } from "../../apps/mobile/src/models/mobileGraphLayout";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { MobileGraphGesture } from "../../apps/mobile/src/models/mobileGraphGestures";
import { Graph2DCommandAdapter } from "@math3d/kernel";

describe("MOB-G11 graph-first tablet layout", () => {
  it("keeps phones, short landscape, split windows and large text in the sheet layout", () => {
    for (const [width, height, fontScale] of [[320, 640, 1], [412, 800, 1], [900, 390, 1], [839, 900, 1], [1100, 800, 1.5], [NaN, 1000, 1]])
      expect(mobileGraphLayout({ width: width!, height: height!, fontScale: fontScale! }).split).toBe(false);
  });
  it("has explicit breakpoints and usable side-panel/graph widths in portrait and landscape", () => {
    for (const [width, height, fontScale] of [[840, 480, 1], [900, 1200, 1], [1200, 800, 1], [1260, 720, 1.5]]) {
      const layout = mobileGraphLayout({ width: width!, height: height!, fontScale: fontScale! });
      expect(layout.split).toBe(true); expect(layout.panelWidth).toBeGreaterThanOrEqual(340 * fontScale!);
      expect(width! - layout.panelWidth - 12).toBeGreaterThanOrEqual(layout.graphMinWidth);
      expect(layout.panelWidth).toBeLessThanOrEqual(440 * fontScale!);
    }
  });
  it("retains the requested tools across a breakpoint; Graph defaults to Functions on tablets", () => {
    expect(mobileGraphPanelDestination("Graph", false)).toBeNull(); expect(mobileGraphPanelDestination("Graph", true)).toBe("Functions");
    for (const destination of ["Functions", "Analyze", "Display", "Promote"] as const) {
      expect(mobileGraphPanelDestination(destination, true)).toBe(destination);
      expect(mobileGraphPanelDestination(destination, false)).toBe(destination);
    }
  });
  it("cancels resized gesture previews without a command and preserves selection/raw drafts", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Layout", true, "layout-g11"));
    adapter.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 1, y: 1 } });
    const before = adapter.document(), history = adapter.history();
    const editor = { objectId: "function_1", draft: { ...mobileGraphFunctionDraft(before, "function_1"), expression: "sin(" } };
    const gesture = new MobileGraphGesture(); gesture.begin(before.display.viewport, { width: 320, height: 640 }, [{ id: 1, x: 10, y: 10 }]);
    expect(gesture.update([{ id: 1, x: 60, y: 10 }])).not.toEqual(before.display.viewport);
    mobileGraphLayout({ width: 1200, height: 800 }); gesture.cancel();
    expect(gesture.finish().viewport).toBeNull(); expect(adapter.document()).toEqual(before); expect(adapter.history()).toEqual(history);
    expect(editor.draft.expression).toBe("sin(");
  });
});
