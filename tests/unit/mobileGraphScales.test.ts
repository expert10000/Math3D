import { expect, it } from "vitest";
import { Graph2DCommandAdapter } from "../../packages/kernel/src/graph2dCommandAdapter";
import { instantiateGraph2DPreset, getGraph2DPresetCatalog, graph2DScaleFields, graph2DViewportFromScaleFields, sampleGraph2DScene,
  graph2DWorldToScreen, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff, parseWorkspaceProjectHandoff } from "../../packages/core/src";
import { readMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { MobileGraphGesture } from "../../apps/mobile/src/models/mobileGraphGestures";
import { mobileGraphTicks, projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";
it("G2D37 native shared controls/history/storage/handoff retain source and exact scale policies", () => {
  const original = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "mobile-scales").document;
  const adapter = new Graph2DCommandAdapter(original), fields = { ...graph2DScaleFields(original.display.viewport), aspect: "free" as const,
    xScale: "log10" as const, yScale: "log10" as const, xMin: ".01", xMax: "10", yMin: ".01", yMax: "100" };
  const v = { ...graph2DViewportFromScaleFields(original, fields), continuation: true }, next = adapter.commitViewport(v);
  expect(next.identity).toEqual(original.identity); expect(next.source).toEqual(original.source);
  expect(readMobileGraph(storeMobileGraph(next)).display.viewport).toEqual(v); expect(adapter.undo()!.display.viewport).toEqual(original.display.viewport);
  expect(adapter.redo()!.display.viewport).toEqual(v);
  const manifest = createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(next), { producer: { platform: "mobile", name: "Math3D", version: "1.5.1" }, baseRevision: null });
  expect(parseWorkspaceProjectHandoff(serializeWorkspaceProjectHandoff(manifest)).requiredCapabilities).toContain("graph2d.scales.v1");
});
it("G2D37 native ticks/projection and touch pan use log world coordinates", () => {
  const original = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "native-log").document;
  const v = { xMin: .01, xMax: 100, yMin: .01, yMax: 100, aspect: "free" as const, xScale: "log10" as const, yScale: "log10" as const }, size = { width: 320, height: 320 };
  expect(mobileGraphTicks(v, size).x).toContain(1);
  const series = sampleGraph2DScene({ document: original, viewport: v, ...size, interaction: false });
  const lines = projectMobileGraphLines(series, v, size, null, 512); expect(lines.length).toBeGreaterThan(0);
  expect(lines.every(line => [line.a.x, line.a.y, line.b.x, line.b.y].every(Number.isFinite))).toBe(true);
  const gesture = new MobileGraphGesture(); gesture.begin(v, size, [{ id: 1, x: 120, y: 100 }]);
  const after = gesture.update([{ id: 1, x: 150, y: 120 }])!;
  const beforePoint = graph2DWorldToScreen(v, size, { x: 1, y: 1 }), afterPoint = graph2DWorldToScreen(after, size, { x: 1, y: 1 });
  expect(afterPoint.x - beforePoint.x).toBeCloseTo(30); expect(afterPoint.y - beforePoint.y).toBeCloseTo(20);
});
