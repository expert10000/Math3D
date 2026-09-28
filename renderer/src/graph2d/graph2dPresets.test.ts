import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, createGraph2DPreset,
  createGraph2DPresetRegistry, instantiateGraph2DPreset, parseGraph2DPreset, serializeGraph2DPreset,
  serializeGraph2DDocument, parseGraph2DDocument, Graph2DPointTableStore, type Graph2DPresetInput } from "@math3d/core";

const input = (): Graph2DPresetInput => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("preset-test"), { type: "create", draft: {
    label: "f", expression: "x", domain: { min: -2, max: 2, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return { id: "line", version: 1, title: "Line", description: "Inspect a line.", category: "Algebra", tags: ["linear"],
    difficulty: "basic", learningGoals: ["Compare slope."], featuredOrder: 0, costClass: "starter",
    template: createGraph2DDocument({ ...scene, stableKey: "line-template" }), sidecars: [],
    attribution: { author: "Math3D", source: "Original mathematical example", license: "GPL-3.0-or-later" } };
};
describe("portable Graph preset contract", () => {
  it("launches independent normal documents, preserving source/display without ancestry", () => {
    const preset = createGraph2DPreset(input());
    const a = instantiateGraph2DPreset(preset, "a"), b = instantiateGraph2DPreset(preset, "b");
    expect(a.document.identity.id).not.toBe(b.document.identity.id);
    expect(a.document.identity.id).not.toBe(preset.template.identity.id);
    expect(a.document.source).toEqual(preset.template.source);
    expect(a.document.display).toEqual(preset.template.display);
    expect(parseGraph2DDocument(serializeGraph2DDocument(a.document))).toEqual(a.document);
    expect(Object.isFrozen(preset.template.source.objects)).toBe(true);
    expect(parseGraph2DPreset(serializeGraph2DPreset(preset))).toEqual(preset);
  });
  it("rejects unknown versions, keys, hash, AST, capabilities and bounds", () => {
    const good = createGraph2DPreset(input());
    for (const patch of [{ schemaVersion: 2 }, { extra: true }, { digest: "sha256:bad" },
      { requiredCapabilities: ["graph2d.future.v2"] }, { tags: Array(17).fill("tag") }, { version: 0 }])
      expect(() => parseGraph2DPreset(JSON.stringify({ ...good, ...patch }))).toThrow();
    const corrupt = JSON.parse(serializeGraph2DPreset(good)); corrupt.template.source.objects[0].expression.source = "2*x";
    expect(() => parseGraph2DPreset(JSON.stringify(corrupt))).toThrow();
    expect(() => instantiateGraph2DPreset(good, "")).toThrow();
  });
  it("validates point sidecars including checksum, row keys and references", () => {
    const rows = [{ id: "row_1", x: 0, y: 1 }, { id: "row_2", x: 1, y: null }];
    const table = new Graph2DPointTableStore().publish(rows);
    const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("points"), { type: "create-point-series", draft: {
      label: "data", table, mode: "points", domain: { min: -1, max: 2, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    const data = { ...input(), template: createGraph2DDocument({ ...scene, stableKey: "points" }), sidecars: [{ id: table.id, rows }] };
    expect(createGraph2DPreset(data).sidecars[0]?.rows).toEqual(rows);
    expect(() => createGraph2DPreset({ ...data, sidecars: [] })).toThrow(/Missing/);
    expect(() => createGraph2DPreset({ ...data, sidecars: [{ id: table.id, rows: [{ ...rows[0]!, y: 2 }] }] })).toThrow();
    const extraRows = [{ ...rows[0]!, extra: true }];
    expect(() => createGraph2DPreset({ ...data, sidecars: [{ id: table.id, rows: extraRows }] })).toThrow();
  });
  it("filters deterministic immutable registry and refuses duplicate IDs/order", () => {
    const preset = createGraph2DPreset(input()), registry = createGraph2DPresetRegistry([preset]);
    expect(registry.get("line")).toEqual(preset);
    expect(registry.filter("SLOPE linear", "Algebra")).toHaveLength(0);
    expect(registry.filter("line linear", "Algebra")).toHaveLength(1);
    expect(registry.filter("", "Polar")).toHaveLength(0);
    expect(() => createGraph2DPresetRegistry([preset, preset])).toThrow();
    expect(() => createGraph2DPresetRegistry([preset, createGraph2DPreset({ ...input(), id: "other" })])).toThrow(/featured/);
  });
});
