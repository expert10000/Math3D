import { describe, expect, it } from "vitest";
import { getGraph2DPresetCatalog, GRAPH2D_OBJECT_KINDS, instantiateGraph2DPreset, sampleGraph2DScene,
  parseGraph2DDocument, serializeGraph2DDocument, applyGraph2DAuthoring, createGraph2DDocument,
  type Graph2DRegionArtifact, type Graph2DPiecewiseArtifact } from "@math3d/core";
import { mobileGraphBudget } from "../../../apps/mobile/src/models/mobileGraphPerformance";
import { mobileGraphAdvancedGeometry } from "../../../apps/mobile/src/viewer/mobileGraphAdvancedProjection";
import { projectMobileGraphLines } from "../../../apps/mobile/src/viewer/mobileGraphProjection";

const functions: Record<string, ((x: number) => number)[]> = {
  "line-comparison": [x => x, x => 2*x+1], "translated-quadratic": [x => x*x, x => (x-1)**2-1],
  "cubic-extrema": [x => x**3-3*x], "repeated-root": [x => (x-1)**2*(x+2)], "reciprocal-pole": [x => 1/x, x => 1/x],
  "exponential-log": [Math.exp, Math.log, x => x], "sine-cosine": [Math.sin, Math.cos],
  "damped-wave": [x => Math.exp(-.2*x)*Math.sin(3*x), x => Math.exp(-.2*x), x => -Math.exp(-.2*x)],
  "wave-beats": [x => Math.sin(4*x)+Math.sin(4.5*x), x => 2*Math.cos(.25*x)],
  "sine-derivative": [Math.sin, Math.cos], "parabola-tangent": [x => x*x, x => 2*x-1],
};
describe("curated seven-kind catalog", () => {
  it("provides 20 scenes, six Featured entries and multi-object comparisons", () => {
    const catalog = getGraph2DPresetCatalog();
    expect(catalog.entries).toHaveLength(20);
    expect(catalog.entries.filter(p => p.featuredOrder !== null)).toHaveLength(6);
    expect(catalog.entries.filter(p => p.template.source.objects.length > 1).length).toBeGreaterThanOrEqual(6);
    expect([...new Set(catalog.entries.flatMap(p => p.template.source.objects.map(o => o.kind)))].sort()).toEqual([...GRAPH2D_OBJECT_KINDS].sort());
  });
  for (const preset of getGraph2DPresetCatalog().entries) it(`${preset.id}: reference math, bounded low profile, editable portable copy`, () => {
    const { document, sidecars } = instantiateGraph2DPreset(preset, "catalog-oracle");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    const tables = Object.fromEntries(sidecars.map(s => [s.id, s.rows]));
    for (const maxSamples of [1024, 512]) {
      const sampled = { ...document, display: { ...document.display, sampling: { maxSamples, maxDepth: 12, tolerancePx: .75 } } };
      const series = sampleGraph2DScene({ document: sampled, viewport: document.display.viewport, width: 320, height: 180, interaction: false, pointTables: tables, timeBudgetMs: 1500 });
      expect(series.reduce((n, s) => n + s.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(maxSamples);
      for (const [index, item] of series.entries()) {
        const points = item.artifact.segments.flatMap(s => s.points);
        expect(points.length, `${preset.id} object ${index} at ${maxSamples}`).toBeGreaterThan(0);
        expect(item.artifact.diagnostics.some(d => d.code === "deadline")).toBe(false);
        for (const p of points) {
          expect([p.x,p.y].every(Number.isFinite)).toBe(true);
          const f = functions[preset.id]?.[index]; if (f) expect(Math.abs(p.y-f(p.x))).toBeLessThan(1e-8);
          const t = p.parameter;
          if (preset.id === "circle-ellipse") expect(Math.abs(p.x**2/(index ? 4 : 1)+p.y**2-1)).toBeLessThan(1e-8);
          if (preset.id === "lissajous") { expect(p.x).toBeCloseTo(Math.sin(3*t!), 8); expect(p.y).toBeCloseTo(Math.sin(2*t!), 8); }
          if (preset.id === "cycloid") { expect(p.x).toBeCloseTo(t!-Math.sin(t!), 8); expect(p.y).toBeCloseTo(1-Math.cos(t!), 8); }
          if (["polar-rose", "archimedean-spiral", "cardioid"].includes(preset.id)) {
            const r = preset.id === "polar-rose" ? Math.sin(3*t!) : preset.id === "cardioid" ? 1+Math.cos(t!) : t!/4;
            expect(p.x).toBeCloseTo(r*Math.cos(t!), 8); expect(p.y).toBeCloseTo(r*Math.sin(t!), 8);
          }
          if (preset.id === "implicit-conics") expect(Math.abs(p.x**2+(index ? -1 : 1)*p.y**2-1)).toBeLessThan(.18);
          if (preset.id === "strict-disk") expect(Math.abs(p.x**2+p.y**2-1)).toBeLessThan(.18);
          if (preset.id === "piecewise-data-gaps") expect(index ? p.y : Math.abs(p.y)).toBeCloseTo(index ? p.x/2 : 1, 8);
        }
        if (preset.id === "reciprocal-pole" || preset.id === "piecewise-data-gaps") for (const segment of item.artifact.segments)
          expect(segment.points.some(p => p.x < 0) && segment.points.some(p => p.x > 0)).toBe(false);
      }
      if (preset.id === "strict-disk") {
        const region = series[0]!.artifact as Graph2DRegionArtifact;
        expect(region.fills.length).toBeGreaterThan(0); expect(region.boundaries.every(b => b.strict)).toBe(true);
        for (const f of region.fills) expect(((f.xMin+f.xMax)/2)**2+((f.yMin+f.yMax)/2)**2).toBeLessThan(1);
      }
      if (preset.id === "piecewise-data-gaps") expect((series[0]!.artifact as Graph2DPiecewiseArtifact).endpoints.some(e => e.open)).toBe(true);
      const budget = mobileGraphBudget(document, "low", "refine"), geometry = mobileGraphAdvancedGeometry(series, document.display.viewport, { width: 320, height: 180 }, budget);
      const lines = projectMobileGraphLines(geometry.boundaries, document.display.viewport, { width: 320, height: 180 }, null, budget.lines);
      expect(lines.length).toBeLessThanOrEqual(budget.lines); expect(lines.length).toBeGreaterThan(0);
      expect(geometry.fills.length).toBeLessThanOrEqual(budget.fills);
    }
    const edited = createGraph2DDocument({ ...applyGraph2DAuthoring(document, { type: "visibility", objectId: document.source.objects[0]!.id }), stableKey: document.identity.id });
    expect(edited.display.objects[0]!.visible).toBe(false);
    expect(preset.template.display.objects[0]!.visible).toBe(true);
  });
});
