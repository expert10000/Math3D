import { describe, expect, it, vi } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, defaultGraph2DParameterDraft,
  graph2DParameterNumber, isGraph2DParameterControl, isGraph2DParameterName, validateGraph2DParameterDraft,
  previewGraph2DParameterValues, quantizeGraph2DParameterValue, parseGraph2DDocument, serializeGraph2DDocument,
  getGraph2DPresetCatalog, instantiateGraph2DPreset, inspectGraph2DCompatibility, structuralHash, sampleGraph2DScene,
  createGraph2DAnimationPlan, graph2DAnimationFrame, Graph2DAnimationPlayer, Graph2DAnimationExportBuilder,
  graph2DSamplingPresentationContext, presentGraph2DSampling, type Graph2DSampledSeries, type Graph2DAuthoringAction } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const configured = () => {
  const document = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "parameters-test").document;
  const adapter = new Graph2DCommandAdapter(document);
  return adapter.commitScene(applyGraph2DAuthoring(document, { type: "parameter-configure", name: "a", draft: { name: "a", value: 2, min: -5, max: 5, step: .1, unit: "m/s" } }), "parameter-configure");
};
const control = { min: -1, max: 1, step: .3, unit: "m" };
describe("G2D38 bounded portable parameters", () => {
  it.each(["x", "y", "t", "theta", "pi", "e", "tau", "sin", "log", "A", "a-b", "_a", "a".repeat(33)])("rejects reserved/invalid control name %s", name => expect(isGraph2DParameterName(name)).toBe(false));
  it("checks inclusive finite ranges, representability, work budgets and declared labels", () => {
    expect(validateGraph2DParameterDraft({ name: "rate_2", value: 1, ...control })).toEqual([]);
    for (const patch of [{ min: 1 }, { max: Infinity }, { step: 0 }, { step: 1e-20 }, { min: -1e10 }, { unit: "a\n" }, { extra: true }])
      expect(isGraph2DParameterControl({ ...control, ...patch })).toBe(false);
    for (const value of [NaN, Infinity, -2, 2]) expect(validateGraph2DParameterDraft({ name: "a", ...control, value }).length).toBeGreaterThan(0);
    expect(defaultGraph2DParameterDraft({ name: "a", value: 500 })).toMatchObject({ name: "a", value: 500 });
    expect(validateGraph2DParameterDraft(defaultGraph2DParameterDraft({ name: "a", value: 500 }))).toEqual([]);
    expect(() => graph2DParameterNumber(" ")).toThrow(); expect(() => graph2DParameterNumber("1,2")).toThrow(); expect(graph2DParameterNumber(" -1.25e2 ")).toBe(-125);
  });
  it("quantizes sliders from min with a reachable non-grid max, while typed values stay exact", () => {
    expect(quantizeGraph2DParameterValue(control, .02)).toBe(-.1); expect(quantizeGraph2DParameterValue(control, 1)).toBe(1);
    expect(quantizeGraph2DParameterValue(control, -4)).toBe(-1);
    const document = configured(); expect(previewGraph2DParameterValues(document, { a: .123 }).source.variables[0].value).toBe(.123);
  });
  it("leaves legacy gallery bytes/capabilities unchanged and capability-checks controlled documents", () => {
    const legacy = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "legacy-controls").document;
    const bytes = serializeGraph2DDocument(legacy); expect(legacy.requiredCapabilities).not.toContain("graph2d.parameters.v1");
    expect(serializeGraph2DDocument(parseGraph2DDocument(bytes))).toBe(bytes);
    const document = configured(); expect(document.requiredCapabilities).toContain("graph2d.parameters.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current"); expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    expect(() => parseGraph2DDocument(JSON.stringify({ ...document, requiredCapabilities: document.requiredCapabilities.filter(c => c !== "graph2d.parameters.v1") }))).toThrow();
  });
  it("previews without mutation/history; applies once and reverses through kernel commands", () => {
    const document = configured(), before = serializeGraph2DDocument(document), adapter = new Graph2DCommandAdapter(document);
    for (let i = 0; i < 40; i++) {
      const preview = previewGraph2DParameterValues(document, { a: i / 10 });
      expect(preview.identity.structuralHash).toBe(structuralHash(preview.source)); expect(preview.identity.id).toBe(document.identity.id);
    }
    expect(serializeGraph2DDocument(document)).toBe(before); expect(adapter.history().undoDepth).toBe(0);
    const committed = adapter.commitScene(applyGraph2DAuthoring(document, { type: "parameter-value", name: "a", value: 3 }), "parameter-value");
    expect(committed.identity.revision).toBe(document.identity.revision + 1); expect(committed.identity.structuralHash).not.toBe(document.identity.structuralHash);
    expect(adapter.history().undoDepth).toBe(1); expect(adapter.undo()?.source.variables[0].value).toBe(2); expect(adapter.redo()?.source.variables[0].value).toBe(3);
  });
  it("does not remove referenced names, rename bindings, overflow bounds or add duplicates", () => {
    const document = configured();
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-delete", name: "a" })).toThrow();
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-configure", name: "a", draft: { ...defaultGraph2DParameterDraft(document.source.variables[0]), name: "c" } })).toThrow();
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-value", name: "a", value: 10 })).toThrow();
    expect(() => applyGraph2DAuthoring(document, { type: "parameter-create", draft: defaultGraph2DParameterDraft(document.source.variables[0]) })).toThrow();
    const empty = createEmptyGraph2DDocument("unused-parameter"), scene = applyGraph2DAuthoring(empty, { type: "parameter-create", draft: defaultGraph2DParameterDraft() });
    const created = createGraph2DDocument({ ...scene, stableKey: "unused-parameter" });
    expect(applyGraph2DAuthoring(created, { type: "parameter-delete", name: "a" }).source.variables).toEqual([]);
  });
  it("shared sampling evaluates changed parameter values, not display metadata", () => {
    const document = configured(), preview = previewGraph2DParameterValues(document, { a: -2 });
    const series = sampleGraph2DScene({ document: preview, viewport: preview.display.viewport, width: 640, height: 480, interaction: false });
    for (const point of series[1].artifact.segments.flatMap(s => s.points)) expect(point.y).toBeCloseTo(-2 * point.x + 1, 12);
    expect(series[1].artifact.segments.length).toBeGreaterThan(0);
  });
  const domain = { min: -3, max: 3, includeMin: true, includeMax: true }, style = { color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const, visible: true };
  const cases: Graph2DAuthoringAction[] = [
    { type: "create-parametric", draft: { label: "p", xExpression: "a*cos(t)", yExpression: "a*sin(t)", domain: { ...domain, min: 0, max: Math.PI * 2 }, style } },
    { type: "create-polar", draft: { label: "r", rExpression: "a", domain: { ...domain, min: 0, max: Math.PI * 2 }, style } },
    { type: "create-implicit", draft: { label: "c", expression: "x^2+y^2-a^2", domain, yDomain: domain, style } },
    { type: "create-inequality", draft: { label: "d", clauses: [{ expression: "x^2+y^2-a^2", comparator: "<=" }], operator: "all", domain, yDomain: domain, style } },
    { type: "create-piecewise", draft: { label: "w", pieces: [{ expression: "a*x", domain: { ...domain, max: 0, includeMax: false } }, { expression: "a*x^2", domain: { ...domain, min: 0 } }], style } },
  ];
  it.each(cases)("evaluates shared bindings for $type without changing expression text/AST", action => {
    const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument(action.type));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "parameter-create", draft: { name: "a", value: 1, min: .5, max: 3, step: .1, unit: "" } }), "parameter-create");
    const document = adapter.commitScene(applyGraph2DAuthoring(adapter.document(), action), action.type);
    const sample = (a: number) => { const preview = previewGraph2DParameterValues(document, { a }); return sampleGraph2DScene({ document: preview,
      viewport: preview.display.viewport, width: 320, height: 240, interaction: false })[0].artifact; };
    const first = sample(1), second = sample(2); expect(first.segments.length).toBeGreaterThan(0); expect(second.segments.length).toBeGreaterThan(0);
    expect(second).not.toEqual(first); expect(previewGraph2DParameterValues(document, { a: 2 }).source.objects).toEqual(document.source.objects);
    if (action.type === "create-parametric" || action.type === "create-polar") for (const p of second.segments.flatMap(s => s.points)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 9);
  });
});

describe("G2D38 deterministic index frames and bounded export", () => {
  it("has exact endpoints/midpoint, no cumulative drift and rejects invalid/stale plans", () => {
    const document = configured(), plan = createGraph2DAnimationPlan(document, { parameter: "a", from: -2, to: 2, frames: 5, fps: 10 });
    expect([0, 1, 2, 3, 4].map(i => graph2DAnimationFrame(document, plan, i).value)).toEqual([-2, -1, 0, 1, 2]);
    expect(graph2DAnimationFrame(document, plan, 4).time).toBe(.4);
    expect(() => graph2DAnimationFrame(document, plan, 5)).toThrow(); expect(() => graph2DAnimationFrame(document, plan, .5)).toThrow();
    expect(() => graph2DAnimationFrame(previewGraph2DParameterValues(document, { a: 3 }), plan, 0)).toThrow(/changed/);
    expect(() => graph2DAnimationFrame({ ...document, display: { ...document.display, viewport: { ...document.display.viewport, xMin: -4 } } }, plan, 0)).toThrow(/changed/);
    for (const patch of [{ frames: 61 }, { fps: 0 }, { frames: 1 }, { from: -6 }, { to: NaN }, { parameter: "b" }])
      expect(() => createGraph2DAnimationPlan(document, { ...plan, ...patch })).toThrow();
  });
  it("waits for current sampling, cancels pending work and never skips indices", () => {
    vi.useFakeTimers(); try {
      const document = configured(), plan = createGraph2DAnimationPlan(document, { parameter: "a", from: -2, to: 2, frames: 3, fps: 10 });
      const publish = vi.fn(), done = vi.fn(), player = new Graph2DAnimationPlayer(setTimeout, h => clearTimeout(h as ReturnType<typeof setTimeout>));
      player.start(plan, publish, done); vi.advanceTimersByTime(2000); expect(publish.mock.calls).toEqual([[0]]);
      player.settled(9); expect(vi.getTimerCount()).toBe(0); player.settled(0); player.settled(0); expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(100); expect(publish.mock.calls).toEqual([[0], [1]]); player.settled(1); player.stop();
      vi.advanceTimersByTime(1000); expect(publish).toHaveBeenCalledTimes(2); expect(done).not.toHaveBeenCalled();
      player.start(plan, publish, done); player.settled(0); vi.advanceTimersByTime(100); player.settled(1); vi.advanceTimersByTime(100); player.settled(2);
      expect(done).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("exports byte-identical fresh SVG frames with unique IDs, checked math and no scripts", () => {
    const document = configured(), original = serializeGraph2DDocument(document), plan = createGraph2DAnimationPlan(document, { parameter: "a", from: -2, to: 2, frames: 3, fps: 10 });
    const make = () => new Graph2DAnimationExportBuilder({ publication: { document, size: { width: 320, height: 240 } }, plan });
    const first = make(), second = new Graph2DAnimationExportBuilder({ plan, publication: { size: { height: 240, width: 320 }, document } }); expect(() => first.finish()).toThrow(/incomplete/);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => 1e14 * Math.random());
    try { while (!first.complete) { const frame = first.appendNext(); expect(frame.value).toBe([-2, 0, 2][frame.index]); }
      while (!second.complete) second.appendNext(); } finally { clock.mockRestore(); }
    const outputs = first.finish(); expect(outputs).toEqual(second.finish()); expect(serializeGraph2DDocument(document)).toBe(original);
    const html = new TextDecoder().decode(outputs[0].bytes), csv = new TextDecoder().decode(outputs[1].bytes);
    expect(html.match(/<svg /g)).toHaveLength(3); expect(html).toContain('id="frame-2-clip"'); expect(html).not.toContain("<script");
    expect(html).toContain("bounded-evaluations-no-clock-truncation"); expect(html).toContain("m/s"); expect(csv).toContain('"0","0","a","-2"'); expect(csv).toContain('"2","0.2","a","2"');
    expect(() => first.appendNext()).toThrow();
  });
  it("owns its recipe and rejects oversized input instead of exporting a partial sequence", () => {
    const document = configured(), plan = createGraph2DAnimationPlan(document, { parameter: "a", from: 0, to: 1, frames: 2, fps: 10 });
    const request = { publication: { document: JSON.parse(JSON.stringify(document)), size: { width: 320, height: 240 } }, plan };
    const builder = new Graph2DAnimationExportBuilder(request); request.publication.document.source.variables[0].value = 999;
    expect(builder.appendNext().value).toBe(0);
    expect(() => new Graph2DAnimationExportBuilder({ ...request, publication: { ...request.publication, analysisNotes: ["a".repeat(3 * 1024 * 1024)] } })).toThrow(/budget/);
  });
});

describe("same-source graph presentation continuity", () => {
  const request = () => { const document = configured(); return { document, viewport: document.display.viewport, width: 640, height: 480, interaction: false }; };
  it("retains world geometry during viewport/size replacement but marks it not current", () => {
    const original = request(), context = graph2DSamplingPresentationContext(original), series = sampleGraph2DScene(original);
    const moved = { ...original, viewport: { ...original.viewport, xMin: -4 }, width: 800, interaction: true };
    expect(graph2DSamplingPresentationContext(moved)).toBe(context);
    const shown = presentGraph2DSampling(context, "moving", null, { context, series });
    expect(shown.series).toBe(series); expect(shown).toMatchObject({ ready: false, settled: false, retained: true });
    expect(presentGraph2DSampling(context, "settled", { key: "settled", context, series }, { context, series })).toMatchObject({ ready: true, retained: false });
  });
  it("does not bridge source/style/sidecar generations or retain truly empty geometry", () => {
    const original = request(), context = graph2DSamplingPresentationContext(original), series = sampleGraph2DScene(original), previous = { context, series };
    const changed = previewGraph2DParameterValues(original.document, { a: 3 });
    const nextContext = graph2DSamplingPresentationContext({ ...original, document: changed }); expect(nextContext).not.toBe(context);
    expect(presentGraph2DSampling(nextContext, "new", null, previous).series).toEqual([]);
    expect(graph2DSamplingPresentationContext({ ...original, pointTables: { table: null } })).not.toBe(context);
    const empty: Graph2DSampledSeries[] = series.map(item => ({ ...item, artifact: { ...item.artifact, segments: [], diagnostics: [{ code: "empty-domain", count: 1 }] } }));
    const shown = presentGraph2DSampling(context, "empty", { context, key: "empty", series: empty }, previous);
    expect(shown.series.every(item => item.artifact.segments.length === 0)).toBe(true); expect(shown.ready).toBe(true);
    const deadline = empty.map(item => ({ ...item, artifact: { ...item.artifact, diagnostics: [{ code: "deadline" as const, count: 1 }] } }));
    expect(presentGraph2DSampling(context, "late", { context, key: "late", series: deadline }, previous)).toMatchObject({ series, ready: false, retained: true, settled: true });
    expect(graph2DSamplingPresentationContext({ ...original, document: changed }, original.document.identity)).toBe(context);
  });
});
