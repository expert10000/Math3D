import { analyzeGraph2DPhasePortrait, type Graph2DPhasePortraitObject,
  type Graph2DViewport } from "@math3d/core";

export type PhaseAnalysisJob = Readonly<{ jobId: string; object: Graph2DPhasePortraitObject;
  variables: Readonly<Record<string, number>>; viewport: Graph2DViewport;
  width: number; height: number; maxEvaluations: number }>;

self.onmessage = (event: MessageEvent<PhaseAnalysisJob>) => {
  const { jobId, ...request } = event.data;
  try {
    self.postMessage({ jobId, result: analyzeGraph2DPhasePortrait({ ...request, deadlineMs: Date.now() + 1500 }) });
  } catch (error) {
    self.postMessage({ jobId, error: (error as Error).message });
  }
};
