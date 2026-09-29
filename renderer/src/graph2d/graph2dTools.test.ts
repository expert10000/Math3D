import { expect, it } from "vitest";
import { GRAPH2D_TOOLS, graph2DToolUnavailable, getGraph2DPresetCatalog, instantiateGraph2DPreset, serializeGraph2DDocument } from "@math3d/core";
it("routes only supported analyses without altering source, display or selection", () => {
  const original = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("translated-quadratic")!, "tools").document;
  const bytes = serializeGraph2DDocument(original);
  for (const t of GRAPH2D_TOOLS) graph2DToolUnavailable(original, t.id);
  expect(serializeGraph2DDocument(original)).toBe(bytes);
  expect(graph2DToolUnavailable({ ...original, selection: { objectId: null, probe: null } }, "roots")).toContain("Select");
  const selected = { ...original, selection: { objectId: original.source.objects[0]!.id, probe: null } };
  expect(graph2DToolUnavailable(selected, "roots")).toBeNull();
  expect(graph2DToolUnavailable(selected, "extrema")).toBeNull();
  expect(graph2DToolUnavailable(selected, "tangent")).toContain("probe");
  expect(graph2DToolUnavailable(selected, "regression")).toContain("point series");
  expect(graph2DToolUnavailable({ ...selected, source: { ...selected.source, objects: [selected.source.objects[0]!] } }, "intersections")).toContain("second");
  expect(graph2DToolUnavailable({ ...selected, selection: { ...selected.selection, probe: { objectId: selected.selection.objectId, x: 0, y: 0 } } }, "tangent")).toBeNull();
});
