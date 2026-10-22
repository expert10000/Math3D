import { analyzeGraph2DPhasePortrait, structuralHash,
  type Graph2DPhaseAnalysisResult } from "@math3d/core";
import { useEffect, useMemo, useState } from "react";
import type { PhaseAnalysisJob } from "./graph2dPhaseAnalysisWorker";

type Request = Omit<PhaseAnalysisJob, "jobId">;

/** Independently scheduled phase analysis; late worker replies cannot replace another source or budget. */
export function useGraph2DPhaseAnalysis(request: Request | null) {
  const key = useMemo(() => request ? structuralHash(request) : "", [request]);
  const [response, setResponse] = useState<{ key: string; result?: Graph2DPhaseAnalysisResult;
    error?: string } | null>(null);
  useEffect(() => {
    if (!request) return;
    let active = true, worker: Worker | null = null, timer: ReturnType<typeof setTimeout> | null = null;
    const publish = (result?: Graph2DPhaseAnalysisResult, error?: string) => {
      if (active) setResponse({ key, result, error });
    };
    const fallback = () => {
      timer = setTimeout(() => {
        try { publish(analyzeGraph2DPhasePortrait({ ...request, deadlineMs: Date.now() + 1500 })); }
        catch (error) { publish(undefined, (error as Error).message); }
      }, 0);
    };
    if (typeof Worker === "undefined") fallback();
    else try {
      worker = new Worker(new URL("./graph2dPhaseAnalysisWorker.ts", import.meta.url), { type: "module" });
      const jobId = key;
      worker.onmessage = (event: MessageEvent<{ jobId: string; result?: Graph2DPhaseAnalysisResult; error?: string }>) => {
        if (event.data.jobId !== jobId) return;
        publish(event.data.result, event.data.error);
      };
      worker.onerror = () => { worker?.terminate(); worker = null; fallback(); };
      worker.postMessage({ ...request, jobId });
    } catch { worker?.terminate(); worker = null; fallback(); }
    return () => { active = false; worker?.terminate(); if (timer) clearTimeout(timer); };
  }, [key]);
  return { key, ready: !!request && response?.key === key && !!response.result,
    result: response?.key === key ? response.result ?? null : null,
    error: response?.key === key ? response.error ?? null : null };
}
