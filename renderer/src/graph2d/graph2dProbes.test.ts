import { expect, it } from "vitest";
import { editGraph2DProbes, graph2DPinnedProbeState, projectGraph2DProbeMarkers, instantiateGraph2DPreset, getGraph2DPresetCatalog,
  parseGraph2DDocument, serializeGraph2DDocument, normalizeGraph2DDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
it("saved probe visibility is portable reversible display intent and coordinates are evaluated from source", () => {
  const original = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "pins").document;
  const adapter = new Graph2DCommandAdapter(original);
  adapter.commitSelection({ objectId: original.source.objects[0]!.id, probe: { objectId: original.source.objects[0]!.id, x: 1, y: 999 } });
  const pin = editGraph2DProbes(adapter.document(), { type: "pin", label: "A" }); expect(pin[0]!.y).toBe(1);
  const commit = (pinnedProbes: typeof pin) => { const d = adapter.document(); return adapter.commitScene({ source: d.source, selection: d.selection, display: { ...d.display, pinnedProbes } }, "pinned-probes"); };
  const pinned = commit(pin), hidden = commit(editGraph2DProbes(pinned, { type: "visibility", id: pin[0]!.id }));
  expect(hidden.identity).toEqual(original.identity); expect(hidden.requiredCapabilities).toContain("graph2d.probe-visibility.v1");
  expect(parseGraph2DDocument(serializeGraph2DDocument(hidden))).toEqual(hidden);
  expect(projectGraph2DProbeMarkers(hidden, { width: 800, height: 600 })).toEqual([]);
  expect(adapter.undo()!.display.pinnedProbes![0]!.visible).toBeUndefined(); expect(adapter.redo()).toEqual(hidden);
  expect(normalizeGraph2DDocument({ ...hidden, display: { ...hidden.display, pinnedProbes: [{ ...pin[0], visible: "false" }] } }).ok).toBe(false);
  expect(() => parseGraph2DDocument(JSON.stringify({ ...hidden, requiredCapabilities: pinned.requiredCapabilities }))).toThrow();
});
it("stale, forged, out-of-domain and non-positive log probes never produce marker evidence", () => {
  const d = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "safe-pins").document;
  const p = { id: "probe_1", label: "A", objectId: d.source.objects[0]!.id, x: 1, y: 1, sourceHash: d.identity.structuralHash };
  expect(graph2DPinnedProbeState(d, p)).toBe("current");
  for (const bad of [{ ...p, sourceHash: "old" }, { ...p, x: Infinity }, { ...p, y: 999 }, { ...p, x: 999 }])
    expect(projectGraph2DProbeMarkers({ ...d, display: { ...d.display, pinnedProbes: [bad] } }, { width: 300, height: 180 })).toEqual([]);
  expect(graph2DPinnedProbeState({ ...d, display: { ...d.display, viewport: { xMin: .1, xMax: 10, yMin: .1, yMax: 10, aspect: "free", xScale: "log10" } } }, { ...p, x: 0, y: 0 })).toBe("invalid");
  const pins = Array.from({ length: 8 }, (_, i) => ({ ...p, id: `probe_${i + 1}` }));
  const markers = projectGraph2DProbeMarkers({ ...d, display: { ...d.display, pinnedProbes: pins } }, { width: 160, height: 100 });
  for (const marker of markers) if (marker.label) { expect(marker.label.x).toBeGreaterThanOrEqual(0); expect(marker.label.x + marker.label.width).toBeLessThanOrEqual(160); expect(marker.label.y + 20).toBeLessThanOrEqual(100); }
});
