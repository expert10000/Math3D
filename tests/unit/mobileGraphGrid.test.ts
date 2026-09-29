import { expect, it } from "vitest";
import { Graph2DCommandAdapter } from "../../packages/kernel/src/graph2dCommandAdapter";
import { instantiateGraph2DPreset, getGraph2DPresetCatalog, graph2DGridFields, graph2DAxesFromGridFields, GRAPH2D_DEFAULT_GRID_OPTIONS,
  createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff, parseWorkspaceProjectHandoff, projectGraph2DGrid } from "../../packages/core/src";
import { readMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { mobileGraphDisplayScene } from "../../apps/mobile/src/models/mobileGraphDisplay";
import { projectMobileGraphGrid } from "../../apps/mobile/src/viewer/mobileGraphProjection";
const scene = () => instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "native-grid").document;
it("G2D41 native settings survive storage/handoff/history without editing source", () => {
  const original = scene(), adapter = new Graph2DCommandAdapter(original), axes = graph2DAxesFromGridFields(original, { ...graph2DGridFields(original), xStep: "0.5", density: "dense", contrast: "strong" });
  const next = adapter.commitScene(mobileGraphDisplayScene(original, { type: "grid", axes }), "style");
  expect(next.identity).toEqual(original.identity); expect(readMobileGraph(storeMobileGraph(next)).display.axes).toEqual(axes);
  const handoff = createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(next), { producer: { platform: "mobile", name: "Math3D", version: "1.5.1" }, baseRevision: null });
  expect(parseWorkspaceProjectHandoff(serializeWorkspaceProjectHandoff(handoff)).requiredCapabilities).toContain("graph2d.grid.v1");
  expect(adapter.undo()!.display.axes).toEqual(original.display.axes); expect(adapter.redo()!.display.axes).toEqual(axes);
});
it("G2D41 native uses the same ticks and dense-spacing notice, bounded independently of curves", () => {
  const doc = scene(), viewport = doc.display.viewport, size = { width: 320, height: 320 }, axes = { ...doc.display.axes, gridOptions: { ...GRAPH2D_DEFAULT_GRID_OPTIONS, xStep: 1e-100 } };
  const native = projectMobileGraphGrid(axes, viewport, size), shared = projectGraph2DGrid(viewport, size, axes.gridOptions);
  expect(native.x).toEqual(shared.verticalMajor.map(t => t.value)); expect(native.warnings.join(" ")).toMatch(/Manual X.*omitted/);
  expect(native.lines.length).toBeLessThanOrEqual(512); expect(native.lines.every(line => [line.a.x, line.a.y, line.b.x, line.b.y].every(Number.isFinite))).toBe(true);
});
it("G2D41 native renders polar geometry as bounded clipped lines, not a mislabeled Cartesian grid", () => {
  const doc = scene(), size = { width: 320, height: 320 }, axes = { ...doc.display.axes, gridMode: "polar" as const, gridOptions: GRAPH2D_DEFAULT_GRID_OPTIONS };
  const native = projectMobileGraphGrid(axes, doc.display.viewport, size);
  expect(native.lines.length).toBeGreaterThan(0); expect(native.lines.length).toBeLessThanOrEqual(512); expect(native.warnings.join(" ")).toMatch(/approximations/);
  expect(projectMobileGraphGrid({ ...axes, grid: false }, doc.display.viewport, size).lines).toEqual([]);
});
