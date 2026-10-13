import { sampleGraph2DScene, resolveGraph2DConstructions, type Graph2DSceneSamplingRequest } from "@math3d/core";

self.onmessage = (event: MessageEvent<{ jobId: string; request: Graph2DSceneSamplingRequest }>) => {
  try { self.postMessage({ jobId: event.data.jobId, series: sampleGraph2DScene(event.data.request),
    constructions: resolveGraph2DConstructions(event.data.request.document) }); }
  catch (error) { self.postMessage({ jobId: event.data.jobId, error: (error as Error).message }); }
};
