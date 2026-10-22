import { analyzeGraph2DVectorField, structuralHash,
  type Graph2DVectorFieldAnalysis } from "@math3d/core";
import { useEffect, useMemo, useState } from "react";
import type { VectorFieldAnalysisJob } from "./graph2dVectorFieldAnalysisWorker";

type Request = Omit<VectorFieldAnalysisJob, "jobId">;

/** One independent vector-field job; source, viewport, and budget changes discard stale replies. */
export function useGraph2DVectorFieldAnalysis(request: Request | null) {
  const key = useMemo(() => request ? structuralHash(request) : "", [request]);
  const [response, setResponse] = useState<{ key: string; result?: Graph2DVectorFieldAnalysis;
    error?: string } | null>(null);
  useEffect(() => {
    if (!request) return;
    let active = true, worker: Worker | null = null, timer: ReturnType<typeof setTimeout> | null = null;
    const publish = (result?: Graph2DVectorFieldAnalysis, error?: string) => {
      if (active) setResponse({ key, result, error });
    };
    const fallback = () => {
      timer = setTimeout(() => {
        try { publish(analyzeGraph2DVectorField({ ...request, deadlineMs: Date.now() + 1500 })); }
        catch (error) { publish(undefined, (error as Error).message); }
      }, 0);
    };
    if (typeof Worker === "undefined") fallback();
    else try {
      worker = new Worker(new URL("./graph2dVectorFieldAnalysisWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ jobId: string; result?: Graph2DVectorFieldAnalysis;
        error?: string }>) => {
        if (event.data.jobId !== key) return;
        publish(event.data.result, event.data.error);
      };
      worker.onerror = () => { worker?.terminate(); worker = null; fallback(); };
      worker.postMessage({ ...request, jobId: key });
    } catch { worker?.terminate(); worker = null; fallback(); }
    return () => { active = false; worker?.terminate(); if (timer) clearTimeout(timer); };
  }, [key]);
  return { ready: !!request && response?.key === key && !!response.result,
    result: response?.key === key ? response.result ?? null : null,
    error: response?.key === key ? response.error ?? null : null };
}
