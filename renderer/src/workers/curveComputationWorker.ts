/// <reference lib="webworker" />
import { executeCurveWorkerRequest, type CurveWorkerInbound, type CurveWorkerOutbound } from "../curveAnalysis/curveComputation";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();
const send = (message: CurveWorkerOutbound) => {
  const transfer: Transferable[] = message.type === "result" ? [message.output.buffer] : message.type === "progress" && message.preview ? [message.preview.buffer] : [];
  scope.postMessage(message, transfer);
};
scope.onmessage = (event: MessageEvent<CurveWorkerInbound>) => {
  const message = event.data;
  if (message.type === "cancel") { cancelled.add(message.requestId); return; }
  const request = message.request;
  void executeCurveWorkerRequest(request, send, () => cancelled.has(request.requestId)).then((result) => {
    if (!cancelled.has(request.requestId)) send(result);
  }).catch((error) => {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    send({ type: "error", requestId: request.requestId, curveRevision: request.curveRevision, code: aborted ? "CANCELLED" : /exceeds.*budget/i.test(String(error)) ? "BUDGET_EXCEEDED" : "WORKER_FAILURE", message: error instanceof Error ? error.message : String(error), retryable: !aborted && !/exceeds.*budget/i.test(String(error)), detail: `Curve worker ${request.operation} failed for ${request.curveId}@${request.curveRevision}.` });
  }).finally(() => cancelled.delete(request.requestId));
};
