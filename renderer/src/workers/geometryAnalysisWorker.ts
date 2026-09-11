/// <reference lib="webworker" />
import { runGeometrySampledFieldRequest, type GeometrySampledFieldRequest } from "../geometry/sampledFieldAnalysis";

const cancelled = new Set<string>();
self.onmessage = (event: MessageEvent<{ type: "run"; request: GeometrySampledFieldRequest } | { type: "cancel"; requestId: string }>) => {
  if (event.data.type === "cancel") { cancelled.add(event.data.requestId); return; }
  const request = event.data.request;
  void runGeometrySampledFieldRequest({ request, isCancelled: () => cancelled.has(request.requestId), yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)), publish: (progress) => self.postMessage(progress) }).catch((error) => self.postMessage({ requestId: request.requestId, sourceObjectId: request.sourceObjectId, sourceRevision: request.sourceRevision, stage: "pointwise", progress: 0, status: "failed", sampleCount: 0, durationMs: 0, overlays: [], warnings: [error instanceof Error ? error.message : String(error)], budgets: {} }));
};
