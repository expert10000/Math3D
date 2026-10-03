import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { sampleGraph2DScene, graph2DSamplingPresentationContext, presentGraph2DSampling, type DocumentIdentity,
  type Graph2DDocument, type Graph2DSampledSeries, type Graph2DViewport, type Graph2DScreenSize, type Graph2DPointTableStore } from "@math3d/core";
import { mobileGraphPointTables } from "./services/mobileGraphPointTables";
import { MobileGraphSamplingJobs } from "./models/mobileGraphSamplingJobs";
import { INITIAL_MOBILE_GRAPH_PERFORMANCE, MobileGraphSamplingEpoch, boundMobileGraphArtifacts, measureMobileGraphPerformance,
  mobileGraphBudget, mobileGraphTableRowAllowance, pressureMobileGraphPerformance, type MobileGraphSamplingPhase } from "./models/mobileGraphPerformance";

const now = () => performance.now();
const EMPTY: readonly Graph2DSampledSeries[] = [];
export const useMobileGraphSampling = (document: Graph2DDocument, viewport: Graph2DViewport, size: Graph2DScreenSize,
  interacting: boolean, onRelease: () => void, previewBase?: DocumentIdentity, tableStore: Graph2DPointTableStore = mobileGraphPointTables) => {
  const [active, setActive] = useState(AppState.currentState == null || AppState.currentState === "active");
  const [performanceState, setPerformanceState] = useState(INITIAL_MOBILE_GRAPH_PERFORMANCE);
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ context: string; input: string; series: readonly Graph2DSampledSeries[];
    phase: MobileGraphSamplingPhase; bytes: number; truncated: boolean; samplingMs: number; frameDelayMs: number } | null>(null);
  const [error, setError] = useState("");
  const previous = useRef<{ context: string; series: readonly Graph2DSampledSeries[] } | null>(null);
  const epoch = useRef(new MobileGraphSamplingEpoch());
  const jobs = useRef(new MobileGraphSamplingJobs({ frame: (callback) => requestAnimationFrame(callback),
    cancelFrame: cancelAnimationFrame, delay: setTimeout, cancelDelay: clearTimeout }));
  const metricFrame = useRef<number | null>(null);
  const releaseCallback = useRef(onRelease); releaseCallback.current = onRelease;
  const context = graph2DSamplingPresentationContext({ document, viewport, ...size, interaction: interacting }, previewBase);
  const input = JSON.stringify([context, document.identity, viewport, size]);
  const latestInput = useRef(input); latestInput.current = input;
  const stop = () => {
    epoch.current.cancel(); jobs.current.cancel();
    if (metricFrame.current !== null) cancelAnimationFrame(metricFrame.current);
    metricFrame.current = null;
  };
  const release = () => { stop(); previous.current = null; setResult(null); tableStore.clearCache(); releaseCallback.current(); };
  useEffect(() => {
    const change = AppState.addEventListener("change", (state) => {
      if (state !== "active") release();
      setActive(state === "active");
    });
    const pressure = AppState.addEventListener("memoryWarning", () => {
      release(); setPerformanceState(pressureMobileGraphPerformance(now())); setGeneration((value) => value + 1);
    });
    return () => { change.remove(); pressure.remove(); stop(); tableStore.clearCache(); };
  }, [tableStore]);
  useEffect(() => {
    stop(); if (previous.current?.context !== context) previous.current = null; if (!active) return;
    const token = epoch.current.issue();
    const current = () => epoch.current.current(token) && latestInput.current === input;
    const run = (phase: MobileGraphSamplingPhase) => {
      if (!current()) return;
      const started = now(), budget = mobileGraphBudget(document, performanceState.tier, phase);
      try {
        const allowance = mobileGraphTableRowAllowance(document, budget.sampling.maxSamples);
        const visible = new Set(document.display.objects.filter((style) => style.visible).map((style) => style.objectId));
        const pointTables = Object.fromEntries(document.source.objects.flatMap((object) =>
          object.kind === "point-series" && visible.has(object.id) && object.table.rowCount <= allowance
            ? [[object.table.id, tableStore.resolve(object.table)]] : []));
        // Native JS work is cooperative, not preemptive: samplers check their shared deadline.
        const sampled = sampleGraph2DScene({ document: { ...document, display: { ...document.display, sampling: budget.sampling } },
          viewport, ...size, interaction: phase === "interaction", pointTables,
          timeBudgetMs: Math.max(1, Math.ceil(budget.cpuMs - (now() - started))) });
        const bounded = boundMobileGraphArtifacts(sampled, budget), samplingMs = now() - started;
        if (!current()) return;
        previous.current = { context, series: presentGraph2DSampling(context, input, { context, key: input, series: bounded.series }, previous.current).series };
        setResult({ ...bounded, context, input, phase, samplingMs, frameDelayMs: 0 }); setError("");
        if (metricFrame.current !== null) cancelAnimationFrame(metricFrame.current);
        const submitted = now();
        metricFrame.current = requestAnimationFrame(() => {
          metricFrame.current = null; if (!current()) return;
          const frameDelayMs = now() - submitted;
          setResult((value) => value?.input === input ? { ...value, frameDelayMs } : value);
          setPerformanceState((state) => measureMobileGraphPerformance(state, { samplingMs, frameDelayMs }, now()));
        });
        return phase === "refine" && sampled.some((item) => item.artifact.diagnostics.some((diagnostic) => diagnostic.code === "deadline"));
      } catch (caught) {
        if (current()) { setResult(null); setError((caught as Error).message); }
      }
    };
    jobs.current.request(() => run(interacting ? "interaction" : "preview"), interacting ? undefined : () => run("refine"));
    return stop;
  }, [input, interacting, active, performanceState.tier, generation, tableStore]);
  const phase = active ? result?.input === input ? result.phase : interacting ? "interaction" : "preview" : "paused";
  const budget = useMemo(() => mobileGraphBudget(document, performanceState.tier, phase), [document.display.sampling, performanceState.tier, phase]);
  const presented = presentGraph2DSampling(context, input, result ? { context: result.context, key: result.input, series: result.series, error: error || undefined } : null, previous.current);
  return { series: active ? presented.series : EMPTY, ready: active && presented.ready, settled: active && presented.settled, retained: active && presented.retained,
    active, phase, budget, performanceState, error, truncated: result?.truncated ?? false,
    metrics: { bytes: result?.bytes ?? 0, samplingMs: result?.samplingMs ?? 0, frameDelayMs: result?.frameDelayMs ?? 0 },
    reduce: () => { release(); setPerformanceState(pressureMobileGraphPerformance(now(), "User requested reduced workload; 30-second recovery hold.")); setGeneration((value) => value + 1); },
    resume: () => { setPerformanceState(INITIAL_MOBILE_GRAPH_PERFORMANCE); setGeneration((value) => value + 1); } };
};
export type MobileGraphSamplingStatus = ReturnType<typeof useMobileGraphSampling>;
