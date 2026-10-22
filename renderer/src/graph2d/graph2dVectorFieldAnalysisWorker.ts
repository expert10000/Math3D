import { analyzeGraph2DVectorField, type Graph2DVectorFieldSource,
  type Graph2DViewport } from "@math3d/core";

export type VectorFieldAnalysisJob = Readonly<{ jobId: string; object: Graph2DVectorFieldSource;
  variables: Readonly<Record<string, number>>; viewport: Graph2DViewport; maxEvaluations: number }>;

self.onmessage = (event: MessageEvent<VectorFieldAnalysisJob>) => {
  const { jobId, ...request } = event.data;
  try {
    self.postMessage({ jobId, result: analyzeGraph2DVectorField({ ...request, deadlineMs: Date.now() + 1500 }) });
  } catch (error) {
    self.postMessage({ jobId, error: (error as Error).message });
  }
};
