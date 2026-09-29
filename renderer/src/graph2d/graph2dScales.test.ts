import { describe, expect, it } from "vitest";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createGraph2DDocument, getGraph2DPresetCatalog, instantiateGraph2DPreset, graph2DWorldToScreen, graph2DScreenToWorld,
  panGraph2DViewport, zoomGraph2DViewport, fitGraph2DViewport, isGraph2DViewport, projectGraph2DGrid, sampleGraph2DScene,
  serializeGraph2DDocument, parseGraph2DDocument, inspectGraph2DCompatibility, graph2DScaleFields, graph2DViewportFromScaleFields,
  projectGraph2DPublicationGeometry, pickGraph2DProbe, type Graph2DViewport } from "@math3d/core";
const size = { width: 800, height: 600 };
const scene = (id = "translated-quadratic") => instantiateGraph2DPreset(getGraph2DPresetCatalog().get(id)!, `scales-${id}`).document;
const log: Graph2DViewport = { xMin: .01, xMax: 100, yMin: .1, yMax: 1000, aspect: "free", xScale: "log10", yScale: "log10" };
describe("G2D37 scale policies and visual-only continuation", () => {
  it.each(["x", "y", "xy"])("round trips and retains the cursor anchor on %s log axes", axes => {
    const v = { ...log, xScale: axes.includes("x") ? "log10" as const : "linear" as const, yScale: axes.includes("y") ? "log10" as const : "linear" as const };
    const anchor = { x: 237, y: 183 }, world = graph2DScreenToWorld(v, size, anchor);
    expect(graph2DWorldToScreen(v, size, world).x).toBeCloseTo(anchor.x, 10);
    const next = zoomGraph2DViewport(v, size, anchor, 2.7), after = graph2DScreenToWorld(next, size, anchor);
    expect(after.x).toBeCloseTo(world.x, 10); expect(after.y).toBeCloseTo(world.y, 10);
    const panned = panGraph2DViewport(v, size, { x: 100, y: 60 });
    expect(graph2DWorldToScreen(panned, size, world).x).toBeCloseTo(anchor.x + 100, 10);
    expect(graph2DWorldToScreen(panned, size, world).y).toBeCloseTo(anchor.y + 60, 10);
  });
  it.each([{ ...log, xMin: 0 }, { ...log, aspect: "equal" }, { ...log, xMax: 1e101 }, { ...log, yScale: "ln" }, { ...log, extra: true }])("rejects malformed or misleading log viewport %j", v => expect(isGraph2DViewport(v)).toBe(false));
  it("labels powers and multiplicative minor ticks; no false zero axis", () => {
    const grid = projectGraph2DGrid(log, size); expect(grid.xAxis).toBeNull(); expect(grid.yAxis).toBeNull();
    expect(grid.verticalMajor.map(t => t.value)).toContain(1);
    const one = grid.verticalMajor.find(t => t.value === 1)!; expect(one.pixel).toBe(400);
    expect(grid.verticalMinor.some(p => Math.abs(p - (Math.log10(2) + 2) / 4 * 800) < 1e-9)).toBe(true);
  });
  it("fits in scale space, retains policies and refuses nonpositive fit bounds", () => {
    const v = fitGraph2DViewport({ xMin: 1, xMax: 100, yMin: 1, yMax: 100 }, size, "free", .1, log);
    expect(v.xMin).toBeCloseTo(10 ** -.25); expect(v.xMax).toBeCloseTo(10 ** 2.25); expect(v.xScale).toBe("log10");
    expect(() => fitGraph2DViewport({ xMin: -1, xMax: 100, yMin: 1, yMax: 2 }, size, "free", .1, log)).toThrow(/positive/);
  });
  it("keeps equal linear world units circular on non-square layouts", () => {
    const v: Graph2DViewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "equal" };
    const o = graph2DWorldToScreen(v, size, { x: 0, y: 0 }), x = graph2DWorldToScreen(v, size, { x: 1, y: 0 }), y = graph2DWorldToScreen(v, size, { x: 0, y: 1 });
    expect(x.x - o.x).toBeCloseTo(o.y - y.y);
  });
  it("preserves legacy bytes and source identity; new policy is reversible, capability-gated and portable", () => {
    const original = scene(), bytes = serializeGraph2DDocument(original), adapter = new Graph2DCommandAdapter(original);
    expect(parseGraph2DDocument(bytes).requiredCapabilities).not.toContain("graph2d.scales.v1");
    const next = adapter.commitViewport(log); expect(next.identity).toEqual(original.identity); expect(next.source).toEqual(original.source);
    expect(next.requiredCapabilities).toContain("graph2d.scales.v1"); expect(inspectGraph2DCompatibility(next).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(next)).display.viewport).toEqual(log);
    expect(serializeGraph2DDocument(adapter.undo()!)).toBe(bytes); expect(adapter.redo()!.display.viewport).toEqual(log);
    expect(() => parseGraph2DDocument(JSON.stringify({ ...next, requiredCapabilities: original.requiredCapabilities }))).toThrow();
  });
  it("gives explicit invalid-domain/equal/polar guidance without editing source", () => {
    const d = scene(), f = graph2DScaleFields(d.display.viewport);
    expect(() => graph2DViewportFromScaleFields(d, { ...f, xScale: "log10", aspect: "equal" })).toThrow(/Equal/);
    expect(() => graph2DViewportFromScaleFields(d, { ...f, xScale: "log10", aspect: "free" })).toThrow(/positive/);
    expect(() => graph2DViewportFromScaleFields({ ...d, display: { ...d.display, axes: { ...d.display.axes, gridMode: "polar" } } }, { ...f, xScale: "log10", aspect: "free", xMin: ".1" })).toThrow(/Cartesian/);
  });
  it("samples log explicit geometry without connecting through invalid y", () => {
    const d = scene("line-comparison"), v = { ...log, xMin: .01, xMax: 10 };
    const items = sampleGraph2DScene({ document: d, viewport: v, ...size, interaction: false, deterministic: true });
    for (const item of items) for (const seg of item.artifact.segments) for (const p of seg.points) {
      expect(p.x).toBeGreaterThan(0); expect(p.y).toBeGreaterThan(0); expect(Number.isFinite(graph2DWorldToScreen(v, size, p).x)).toBe(true);
    }
  });
  it.each(["implicit-conics", "strict-disk", "lissajous", "circle-ellipse", "polar-rose", "piecewise-data-gaps"])("samples bounded %s under log policies", id => {
    const preset = getGraph2DPresetCatalog().get(id)!;
    const d = instantiateGraph2DPreset(preset, `log-${id}`).document;
    const series = sampleGraph2DScene({ document: d, viewport: { ...log, xMin: .1, xMax: 2, yMin: .1, yMax: 2 }, ...size, interaction: false });
    expect(series.reduce((n, s) => n + s.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(d.display.sampling.maxSamples);
    expect(JSON.stringify(series)).not.toContain("null, null");
  });
  it("extends only explicit functions outside authored domains, within budget, without changing fit/probes/export", () => {
    const d = scene(), v: Graph2DViewport = { xMin: -8, xMax: 8, yMin: -2, yMax: 12, aspect: "free", continuation: true };
    const input = { document: d, viewport: v, ...size, interaction: false }, bytes = serializeGraph2DDocument(d);
    const series = sampleGraph2DScene(input); expect(series.some(s => s.continuation?.segments.length)).toBe(true);
    const evaluated = series.reduce((n, s) => n + s.artifact.samplesEvaluated + (s.continuation?.samplesEvaluated ?? 0), 0);
    expect(evaluated).toBeLessThanOrEqual(d.display.sampling.maxSamples);
    for (const s of series) {
      const object = d.source.objects.find(o => o.id === s.objectId)!; if (object.kind !== "explicit-cartesian") continue;
      for (const seg of s.continuation?.segments ?? []) for (const p of seg.points) expect(p.x <= object.domain.min || p.x >= object.domain.max).toBe(true);
    }
    const picked = pickGraph2DProbe({ document: d, series, viewport: v, size, screen: graph2DWorldToScreen(v, size, { x: 6, y: 36 }), radiusPx: 3 });
    expect(picked.selection.probe).toBeNull(); expect(serializeGraph2DDocument(d)).toBe(bytes);
    const pub = createGraph2DDocument({ ...d, display: { ...d.display, viewport: v }, stableKey: "publication" });
    expect(projectGraph2DPublicationGeometry(pub, series, size)).toEqual(projectGraph2DPublicationGeometry(pub, series.map(({ continuation: _, ...s }) => s), size));
    expect(sampleGraph2DScene({ ...input, deterministic: true }).every(s => !s.continuation)).toBe(true);
  });
});
