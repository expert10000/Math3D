import { describe, expect, it, vi } from "vitest";
import { applyGraph2DAuthoring, createGraph2DDocument, getGraph2DPresetCatalog, getGraph2DInteractivePreset,
  getGraph2DInteractivePresetGuidance, instantiateGraph2DPreset, serializeGraph2DPreset, parseGraph2DPreset,
  serializeGraph2DDocument, parseGraph2DDocument, sampleGraph2DScene, previewGraph2DParameterValues,
  createGraph2DAnimationPlan, graph2DAnimationFrame, Graph2DAnimationPlayer, inspectGraph2DCompatibility, type Graph2DRegionArtifact } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const originals = getGraph2DPresetCatalog().entries;
const variants = originals.flatMap(preset => { const variant = getGraph2DInteractivePreset(preset); return variant ? [variant] : []; });
const sample = (document: ReturnType<typeof instantiateGraph2DPreset>["document"], maxSamples = 1024) => sampleGraph2DScene({
  document: { ...document, display: { ...document.display, sampling: { maxSamples, maxDepth: 12, tolerancePx: .75 } } },
  viewport: document.display.viewport, width: 320, height: 180, interaction: false, timeBudgetMs: 1500, deterministic: true });
const reference = (id: string, document: ReturnType<typeof instantiateGraph2DPreset>["document"], series: ReturnType<typeof sample>) => {
  const v = Object.fromEntries(document.source.variables.map(p => [p.name, p.value]));
  for (const [i, item] of series.entries()) for (const point of item.artifact.segments.flatMap(s => s.points)) {
    const { x, y } = point, t = point.parameter!;
    if (id === "line-comparison") expect(y).toBeCloseTo(i ? v.a * x + v.b : x, 8);
    if (id === "translated-quadratic") expect(y).toBeCloseTo(i ? (x - v.h) ** 2 + v.k : x * x, 8);
    if (id === "damped-wave") expect(y).toBeCloseTo(Math.exp(-v.d * x) * (i === 0 ? Math.sin(3 * x) : i === 1 ? 1 : -1), 8);
    if (id === "wave-beats") expect(y).toBeCloseTo(i ? 2 * Math.cos((v.f - 4) * x / 2) : Math.sin(4 * x) + Math.sin(v.f * x), 8);
    if (id === "circle-ellipse") { expect(x).toBeCloseTo((i ? v.a : 1) * Math.cos(t), 8); expect(y).toBeCloseTo(Math.sin(t), 8); }
    if (id === "lissajous") { expect(x).toBeCloseTo(Math.sin(3 * t + v.phi), 8); expect(y).toBeCloseTo(Math.sin(2 * t), 8); }
    if (id === "polar-rose" || id === "cardioid") {
      const r = id === "polar-rose" ? Math.sin(v.n * t) : v.c + Math.cos(t);
      expect(x).toBeCloseTo(r * Math.cos(t), 8); expect(y).toBeCloseTo(r * Math.sin(t), 8);
    }
    if (id === "implicit-conics") expect(Math.abs(x * x + (i ? -1 : 1) * y * y - (i ? 1 : v.r * v.r))).toBeLessThan(.2);
    if (id === "strict-disk") expect(Math.abs(x * x + y * y - v.r * v.r)).toBeLessThan(.2);
  }
};

describe("GGL10 opt-in shared interactive presets", () => {
  it("keeps all frozen v1 catalog bytes unchanged, offers ten reviewed v2 variants, and rejects unreviewed manifests", () => {
    const bytes = originals.map(serializeGraph2DPreset);
    expect(variants).toHaveLength(10); expect(new Set(variants.map(p => p.id)).size).toBe(10);
    expect(getGraph2DInteractivePreset({ ...originals[0]!, digest: "tampered" })).toBeUndefined();
    expect(getGraph2DInteractivePreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!)).toBeUndefined();
    for (const variant of variants) {
      expect(getGraph2DInteractivePreset(variant)).toBeUndefined(); expect(variant.version).toBe(2);
      expect(Object.isFrozen(variant.template.source.variables[0]!.control)).toBe(true);
      expect(parseGraph2DPreset(serializeGraph2DPreset(variant))).toEqual(variant);
    }
    expect(originals.map(serializeGraph2DPreset)).toEqual(bytes);
  });
  for (const variant of variants) it(`${variant.id}: defaults match preview mathematics; endpoints/playback stay bounded and portable`, () => {
    const original = getGraph2DPresetCatalog().get(variant.id)!, document = instantiateGraph2DPreset(variant, "interactive-oracle").document;
    const other = instantiateGraph2DPreset(variant, "interactive-second").document;
    expect(document.identity.id).not.toBe(other.identity.id);
    expect(document.metadata.title).toBe(variant.title); expect(document.requiredCapabilities).toContain("graph2d.parameters.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    const guidance = getGraph2DInteractivePresetGuidance(document)!;
    expect(guidance.presetId).toBe(variant.id); expect(guidance.parameters.map(p => p.defaultValue)).toEqual(document.source.variables.map(p => p.value));
    const baseline = sample(original.template), interactive = sample(document);
    for (let i = 0; i < baseline.length; i++) {
      const before = baseline[i]!.artifact.segments.flatMap(s => s.points), after = interactive[i]!.artifact.segments.flatMap(s => s.points);
      expect(after.length).toBe(before.length);
      for (let j = 0; j < before.length; j++) { expect(after[j]!.x).toBeCloseTo(before[j]!.x, 8); expect(after[j]!.y).toBeCloseTo(before[j]!.y, 8); }
    }
    const before = serializeGraph2DDocument(document), adapter = new Graph2DCommandAdapter(document);
    for (const parameter of document.source.variables) for (const value of [parameter.control!.min, parameter.control!.max]) {
      const preview = previewGraph2DParameterValues(document, { [parameter.name]: value });
      expect(getGraph2DInteractivePresetGuidance(preview)).toEqual(guidance);
      for (const budget of [512, 1024]) {
        const series = sample(preview, budget); expect(series.reduce((n, s) => n + s.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(budget);
        expect(series.every(s => !s.artifact.diagnostics.some(d => d.code === "deadline"))).toBe(true);
        for (const item of series) {
          const points = item.artifact.segments.flatMap(s => s.points); expect(points.length, `${variant.id} ${parameter.name}=${value} at ${budget}: ${JSON.stringify(item.artifact.diagnostics)}`).toBeGreaterThan(0);
          expect(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
        }
        if (variant.id === "strict-disk") expect((series[0]!.artifact as Graph2DRegionArtifact).boundaries.every(b => b.strict)).toBe(true);
        reference(variant.id, preview, series);
      }
    }
    expect(serializeGraph2DDocument(document)).toBe(before); expect(adapter.history().undoDepth).toBe(0);
    const plan = createGraph2DAnimationPlan(document, guidance.animation);
    const values = Array.from({ length: plan.frames }, (_, i) => graph2DAnimationFrame(document, plan, i).value);
    expect(values).toEqual(Array.from({ length: plan.frames }, (_, i) => graph2DAnimationFrame(document, plan, i).value));
    expect(values[0]).toBe(plan.from); expect(values.at(-1)).toBe(plan.to);
    for (let i = 0; i < plan.frames; i++) {
      const frame = graph2DAnimationFrame(document, plan, i), series = sample(frame.document, 512);
      expect(series.reduce((n, s) => n + s.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(512);
      expect(series.every(s => s.artifact.segments.some(segment => segment.points.length > 0)), `${variant.id} frame ${i}`).toBe(true);
      reference(variant.id, frame.document, series);
    }
    const changed = adapter.commitScene(applyGraph2DAuthoring(document, { type: "parameter-value", name: plan.parameter, value: plan.to }), "parameter-value");
    expect(adapter.history().undoDepth).toBe(1); expect(getGraph2DInteractivePresetGuidance(changed)).toEqual(guidance);
    expect(adapter.undo()!.source).toEqual(document.source); expect(adapter.redo()!.source).toEqual(changed.source);
  });
  it("source-matches suggestions without claiming origin and removes them after recipe/control edits", () => {
    const document = instantiateGraph2DPreset(variants[0]!, "guidance").document;
    expect(getGraph2DInteractivePresetGuidance(createGraph2DDocument({ ...document, stableKey: "user-copy" }))).toBeDefined();
    const object = document.source.objects[0]!; if (object.kind !== "explicit-cartesian") throw new Error("Expected line");
    const changed = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "edit", objectId: object.id,
      draft: { label: object.label, expression: "2*x", domain: object.domain, style: document.display.objects[0]! } }), stableKey: "edited" });
    expect(getGraph2DInteractivePresetGuidance(changed)).toBeUndefined();
    const parameter = document.source.variables[0]!;
    const range = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "parameter-configure", name: parameter.name,
      draft: { name: parameter.name, value: parameter.value, ...parameter.control!, max: 4 } }), stableKey: "new-range" });
    expect(getGraph2DInteractivePresetGuidance(range)).toBeUndefined();
  });
  it("uses the existing opt-in player: cancel/background invalidates pending frames; reset replays exact indices", () => {
    vi.useFakeTimers();
    try {
      const document = variants[0]!.template, guidance = getGraph2DInteractivePresetGuidance(document)!;
      const plan = createGraph2DAnimationPlan(document, guidance.animation), indices: number[] = [];
      const player = new Graph2DAnimationPlayer(setTimeout, h => clearTimeout(h as ReturnType<typeof setTimeout>));
      expect(indices).toEqual([]); player.start(plan, i => indices.push(i), () => {}); player.settled(0); player.stop();
      vi.runAllTimers(); expect(indices).toEqual([0]);
      player.start(plan, i => indices.push(i), () => {}); player.settled(0); vi.advanceTimersByTime(1000 / plan.fps + 1);
      expect(indices).toEqual([0, 0, 1]); player.stop();
    } finally { vi.useRealTimers(); }
  });
});
