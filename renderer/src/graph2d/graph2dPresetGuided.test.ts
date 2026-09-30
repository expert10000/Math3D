import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createGraph2DDocument, getGraph2DPresetCatalog,
  getGraph2DGuidedConcepts, getGraph2DGuidedPreset, getGraph2DGuidedDocumentGuidance, graph2DPinnedProbeState,
  instantiateGraph2DPreset, parseGraph2DDocument, serializeGraph2DDocument,
  parseGraph2DPreset, serializeGraph2DPreset, type Graph2DDocument } from "@math3d/core";

describe("GGL13 guided concepts", () => {
  it("keeps frozen v1 scenes unchanged and produces four bounded, independently editable guides", () => {
    const catalog = getGraph2DPresetCatalog(), before = catalog.entries.map(serializeGraph2DPreset);
    const concepts = getGraph2DGuidedConcepts();
    expect(concepts.map(concept => concept.level)).toEqual(["beginner", "intermediate", "intermediate", "advanced"]);
    expect(new Set(concepts.map(concept => concept.id)).size).toBe(concepts.length);
    for (const concept of concepts) {
      const preset = getGraph2DGuidedPreset(concept.id);
      expect(preset.id).toBe(`guide-${concept.id}`);
      expect(parseGraph2DPreset(serializeGraph2DPreset(preset))).toEqual(preset);
      expect(preset.requiredCapabilities).toContain("graph2d.probes.v1");
      expect(preset.template.display.pinnedProbes).toHaveLength(concept.markers.length);
      expect(preset.template.display.pinnedProbes!.every(probe => graph2DPinnedProbeState(preset.template, probe) === "current")).toBe(true);
      const a = instantiateGraph2DPreset(preset, "one").document, b = instantiateGraph2DPreset(preset, "two").document;
      expect(a.identity.id).not.toBe(b.identity.id);
      expect(a.source).toEqual(b.source);
      expect(a.display).toEqual(b.display);
      expect(getGraph2DGuidedDocumentGuidance(a)).toEqual({ concept, state: "current" });
      expect(parseGraph2DDocument(serializeGraph2DDocument(a))).toEqual(a);
      for (const step of concept.steps) { expect(step.explanation.length).toBeGreaterThan(40); expect(step.tryThis).toBeTruthy(); }
      expect(preset.template.source.objects.length).toBeLessThanOrEqual(6);
    }
    expect(catalog.entries.map(serializeGraph2DPreset)).toEqual(before);
    expect(catalog.entries).toHaveLength(20);
    expect(() => getGraph2DGuidedPreset("unknown")).toThrow();
  });
  it("links markers to the canonical source and makes them stale after an edit", () => {
    const preset = getGraph2DGuidedPreset("derivative");
    const document = instantiateGraph2DPreset(preset, "edit").document;
    const object = document.source.objects.find(item => item.label === "Function")!;
    if (object.kind !== "explicit-cartesian") throw new Error("Expected explicit guided source.");
    const display = document.display.objects.find(item => item.objectId === object.id)!;
    const edited = applyGraph2DAuthoring(document, { type: "edit", objectId: object.id, draft: {
      label: "Function", expression: "2*sin(x)", domain: object.domain,
      style: { color: display.color, lineWidth: display.lineWidth, lineStyle: display.lineStyle, visible: display.visible },
    } });
    const changed: Graph2DDocument = createGraph2DDocument({ ...edited, stableKey: "guide-edited",
      display: { ...edited.display, pinnedProbes: document.display.pinnedProbes } });
    expect(changed.display.pinnedProbes!.every(probe => graph2DPinnedProbeState(changed, probe) === "stale")).toBe(true);
    expect(getGraph2DGuidedDocumentGuidance(changed)?.state).toBe("stale");
  });
  it("authors Taylor comparisons without claiming an error bound or changing the original scene", () => {
    const original = getGraph2DPresetCatalog().get("sine-derivative")!;
    const guided = getGraph2DGuidedPreset("taylor");
    expect(original.template.source.objects).toHaveLength(2);
    expect(guided.template.source.objects.map(object => object.label)).toEqual(["Function", "Derivative comparison", "P1 linear", "P3 cubic"]);
    expect(guided.template.source.objects.find(object => object.label === "P3 cubic")).toMatchObject({ expression: { source: "x-x^3/6" } });
    expect(getGraph2DGuidedConcepts().find(item => item.id === "taylor")!.steps.some(step => step.explanation.includes("does not bound the error"))).toBe(true);
  });
});
