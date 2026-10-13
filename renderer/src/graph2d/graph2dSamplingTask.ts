import { type Graph2DSceneSamplingRequest, type Graph2DSampledSeries, type Graph2DConstructionArtifact } from "@math3d/core";

export type Graph2DSamplingWorker = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<{ jobId: string; series?: readonly Graph2DSampledSeries[];
    constructions?: Graph2DConstructionArtifact; error?: string }>) => void) | null;
  onerror: (() => void) | null;
};

/** A task owns its worker. Cancellation stops computation, not only result publication. */
export function startGraph2DSamplingTask(worker: Graph2DSamplingWorker, jobId: string,
  request: Graph2DSceneSamplingRequest, publish: (series: readonly Graph2DSampledSeries[], error?: string,
    constructions?: Graph2DConstructionArtifact) => void,
  timeBudgetMs = 5000) {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearTimeout(timeout); worker.onmessage = null; worker.onerror = null; worker.terminate();
  };
  const finish = (series: readonly Graph2DSampledSeries[], error?: string, constructions?: Graph2DConstructionArtifact) => {
    if (disposed) return;
    dispose(); publish(series, error, constructions);
  };
  const timeout = setTimeout(() => finish([], "Graph sampling exceeded its time budget."), timeBudgetMs);
  worker.onmessage = (event) => {
    if (event.data.jobId === jobId) finish(event.data.series ?? [], event.data.error, event.data.constructions);
  };
  worker.onerror = () => finish([], "Graph sampling failed. Change the viewport or retry.");
  try { worker.postMessage({ jobId, request }); }
  catch (error) { finish([], (error as Error).message); }
  return dispose;
}
