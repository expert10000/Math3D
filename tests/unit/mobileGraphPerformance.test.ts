import { describe, expect, it, vi } from "vitest";
import { Graph2DPointTableStore, sampleGraph2DScene } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { INITIAL_MOBILE_GRAPH_PERFORMANCE, MOBILE_GRAPH_DEVICE_PROFILES, MobileGraphSamplingEpoch,
  boundMobileGraphArtifacts, measureMobileGraphPerformance, mobileGraphBudget, pressureMobileGraphPerformance } from "../../apps/mobile/src/models/mobileGraphPerformance";
import { MobileGraphSamplingJobs } from "../../apps/mobile/src/models/mobileGraphSamplingJobs";
import { projectMobileGraphLines } from "../../apps/mobile/src/viewer/mobileGraphProjection";
import { mobileGraphKindEditor, mobileGraphKindAction } from "../../apps/mobile/src/models/mobileGraphAdvancedAuthoring";
import { applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";

const document = createMobileGraph("Performance", true, "performance-g12"), size = { width: 320, height: 320 };
const request = { document, ...size, viewport: document.display.viewport, interaction: false };
describe("MOB-G12 measured native workload policies", () => {
  it("never exceeds saved intent or reviewed native ceilings at any tier/phase", () => {
    const saved = structuredClone(document.display);
    for (const tier of ["low", "mid", "high"] as const) for (const phase of ["interaction", "preview", "refine"] as const) {
      const budget = mobileGraphBudget(document, tier, phase);
      expect(budget.sampling.maxSamples).toBeLessThanOrEqual(document.display.sampling.maxSamples);
      expect(budget.sampling.maxSamples).toBeLessThanOrEqual(phase === "interaction" ? 256 : 2048);
      expect(budget.lines).toBeLessThanOrEqual(4096); expect(budget.fills).toBeLessThanOrEqual(256);
      const sampled = sampleGraph2DScene({ ...request, document: { ...document, display: { ...document.display, sampling: budget.sampling } }, timeBudgetMs: budget.cpuMs });
      expect(sampled.reduce((sum, item) => sum + item.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(budget.sampling.maxSamples);
    }
    expect(document.display).toEqual(saved);
  });
  it("requires repeated measured slowdown and six fast workloads, with recovery holds", () => {
    let state = INITIAL_MOBILE_GRAPH_PERFORMANCE;
    state = measureMobileGraphPerformance(state, { samplingMs: 25, frameDelayMs: 50 }, 0);
    expect(state.tier).toBe("mid");
    state = measureMobileGraphPerformance(state, { samplingMs: 25, frameDelayMs: 50 }, 1);
    expect(state.tier).toBe("low");
    for (let i = 0; i < 10; i++) state = measureMobileGraphPerformance(state, { samplingMs: 1, frameDelayMs: 16 }, 2 + i);
    expect(state.tier).toBe("low");
    for (let i = 0; i < 5; i++) state = measureMobileGraphPerformance(state, { samplingMs: 1, frameDelayMs: 16 }, 10002 + i);
    expect(state.tier).toBe("low");
    state = measureMobileGraphPerformance(state, { samplingMs: 1, frameDelayMs: 16 }, 10007);
    expect(state.tier).toBe("mid");
    expect(measureMobileGraphPerformance(state, { samplingMs: NaN, frameDelayMs: 0 }, 0)).toBe(state);
    expect(pressureMobileGraphPerformance(100).holdUntil).toBe(30100);
  });
  it("rejects stale publications after source/viewport changes, pause and unmount", () => {
    const epoch = new MobileGraphSamplingEpoch(), first = epoch.issue(), second = epoch.issue();
    expect(epoch.current(first)).toBe(false); expect(epoch.current(second)).toBe(true);
    epoch.cancel(); expect(epoch.current(second)).toBe(false);
  });
  it("coalesces previews, cancels deferred refinement and rejects callbacks even after host cancellation races", () => {
    let next = 0; const frames = new Map<number, () => void>(), delays = new Map<number, () => void>();
    const jobs = new MobileGraphSamplingJobs({ frame: (callback) => { frames.set(++next, callback); return next; },
      cancelFrame: (handle) => { frames.delete(handle); }, delay: (callback) => { delays.set(++next, callback); return next as unknown as ReturnType<typeof setTimeout>; },
      cancelDelay: (handle) => { delays.delete(handle as unknown as number); } });
    const calls: string[] = [];
    jobs.request(() => calls.push("old"), () => { calls.push("old-refine"); });
    const stale = [...frames.values(), ...delays.values()];
    jobs.request(() => calls.push("new"), () => { calls.push("new-refine"); });
    stale.forEach((callback) => callback()); expect(calls).toEqual([]);
    const fire = (queue: Map<number, () => void>) => { const [handle, callback] = [...queue.entries()][0]!; queue.delete(handle); callback(); };
    fire(frames); expect(calls).toEqual(["new"]);
    fire(delays); jobs.cancel(); expect(frames.size).toBe(0); expect(delays.size).toBe(0);
    jobs.request(() => calls.push("resume")); fire(frames); expect(calls).toEqual(["new", "resume"]);
  });
  it("retries cold deadline-limited refinement twice, never spins or survives cancellation", () => {
    let next = 0; const frames = new Map<number, () => void>(), delays = new Map<number, () => void>();
    const jobs = new MobileGraphSamplingJobs({ frame: (callback) => { frames.set(++next, callback); return next; }, cancelFrame: (handle) => { frames.delete(handle); },
      delay: (callback) => { delays.set(++next, callback); return next as unknown as ReturnType<typeof setTimeout>; }, cancelDelay: (handle) => { delays.delete(handle as unknown as number); } });
    const fire = (queue: Map<number, () => void>) => { const [handle, callback] = [...queue.entries()][0]!; queue.delete(handle); callback(); };
    let attempts = 0; jobs.request(() => {}, () => { attempts++; return true; }); fire(frames);
    for (let i = 0; i < 3; i++) { fire(delays); fire(frames); }
    expect(attempts).toBe(3); expect(delays.size).toBe(0); expect(frames.size).toBe(0);
    jobs.request(() => {}, () => true); jobs.cancel(); expect(delays.size).toBe(0); expect(frames.size).toBe(0);
  });
  it("drops oversized sampled geometry with an explicit output-limit diagnostic", () => {
    const series = sampleGraph2DScene(request), budget = MOBILE_GRAPH_DEVICE_PROFILES.low;
    const bounded = boundMobileGraphArtifacts(series, { ...budget, segments: 0 });
    expect(bounded.truncated).toBe(true); expect(bounded.series[0]?.artifact.segments).toEqual([]);
    expect(bounded.series[0]?.artifact.diagnostics.at(-1)?.code).toBe("output-limit");
    expect(bounded.bytes).toBeLessThanOrEqual(budget.artifactBytes);
    expect(boundMobileGraphArtifacts(series, budget).truncated).toBe(false);
  });
  it("bounds solid and dashed native line projections using the active tier", () => {
    const series = sampleGraph2DScene(request);
    for (const lineStyle of ["solid", "dashed", "dotted"] as const) {
      const styled = series.map((item) => ({ ...item, style: { ...item.style, lineStyle } }));
      expect(projectMobileGraphLines(styled, document.display.viewport, size, null, 3).length).toBeLessThanOrEqual(3);
      expect(projectMobileGraphLines(styled, document.display.viewport, size, null, 0)).toEqual([]);
    }
  });
  it("evicts serialized point tables without deleting sidecars and reloads after lifecycle cleanup", () => {
    const disk = new Map<string, string>(), read = vi.fn((id: string) => disk.get(id) ?? null);
    const backing = { read, write: (id: string, data: string) => { disk.set(id, data); } };
    const store = new Graph2DPointTableStore(backing, 40);
    const a = store.publish([{ id: "row_1", x: 0, y: 1 }]), b = store.publish([{ id: "row_1", x: 1, y: 2 }]);
    expect(store.cachedBytes).toBeLessThanOrEqual(40); expect(store.resolve(a)?.[0]?.y).toBe(1); expect(read).toHaveBeenCalled();
    store.clearCache(); expect(store.cachedBytes).toBe(0); expect(disk.size).toBe(2); expect(store.resolve(b)?.[0]?.y).toBe(2);
    disk.set(a.id, "partial"); store.clearCache(); expect(store.resolve(a)).toBeNull();
    const uncached = new Graph2DPointTableStore(backing, 0); expect(uncached.resolve(b)).not.toBeNull(); expect(uncached.cachedBytes).toBe(0);
    expect(() => new Graph2DPointTableStore(backing, -1)).toThrow(/budget/);
  });
  it("reports over-budget tables as complexity-limited without unnecessary sidecar IO", () => {
    const empty = createMobileGraph("Rows", false, "rows-g12"), adapter = new Graph2DCommandAdapter(empty);
    const editor = mobileGraphKindEditor(empty, "point-series");
    editor.draft.data = "x,y\n" + Array.from({ length: 40 }, (_, i) => `${i},${i}`).join("\n");
    const action = mobileGraphKindAction(editor, new Graph2DPointTableStore());
    const doc = adapter.commitScene(applyMobileGraphAuthoring(empty, action), action.type);
    const limited = { ...doc, display: { ...doc.display, sampling: { ...doc.display.sampling, maxSamples: 32 } } };
    expect(sampleGraph2DScene({ ...request, document: limited })[0]?.artifact.diagnostics[0]?.code).toBe("sample-limit");
    expect(sampleGraph2DScene({ ...request, document: doc })[0]?.artifact.diagnostics[0]?.code).toBe("missing-table");
  });
  it("validates host deadlines and retains default desktop sampling policy", () => {
    for (const timeBudgetMs of [0, NaN, Infinity, 1501]) expect(() => sampleGraph2DScene({ ...request, timeBudgetMs })).toThrow(/time budget/);
    expect(sampleGraph2DScene(request)[0]?.artifact.converged).toBe(true);
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(2);
    try { expect(sampleGraph2DScene({ ...request, timeBudgetMs: 1 })[0]?.artifact.diagnostics[0]?.code).toBe("deadline"); }
    finally { clock.mockRestore(); }
  });
});
