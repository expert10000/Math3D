/// <reference lib="webworker" />
import { createSurfaceCurvatureField } from "../surfaceAnalysis/surfaceCurvature";
import type { SurfaceAnalysisWorkerMessage, SurfaceAnalysisWorkerRequest } from "./surfaceAnalysisWorkerTypes";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<SurfaceAnalysisWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== "compute-curvature") return;
  const send = (message: SurfaceAnalysisWorkerMessage) => scope.postMessage(message);
  const started = performance.now();
  try {
    send({ type: "progress", requestId: request.requestId, surfaceRevision: request.surfaceRevision, progress: 0.1, phase: "normalizing fields" });
    const result = createSurfaceCurvatureField(request.source, request.options);
    send({ type: "progress", requestId: request.requestId, surfaceRevision: request.surfaceRevision, progress: 0.9, phase: "publishing statistics" });
    send({ type: "curvature-result", requestId: request.requestId, surfaceRevision: request.surfaceRevision, result, computeTimeMs: performance.now() - started });
  } catch (error) {
    send({ type: "error", requestId: request.requestId, surfaceRevision: request.surfaceRevision, error: error instanceof Error ? error.message : String(error) });
  }
};
