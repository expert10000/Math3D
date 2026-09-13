/// <reference lib="webworker" />
import { executeVolumeJobRequest, type VolumeWorkerInbound, type VolumeWorkerOutbound } from "../volume/computation";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();
const transfers = (message: VolumeWorkerOutbound): Transferable[] => {
  if (message.type !== "result") return [];
  const output: Transferable[] = [];
  for (const value of Object.values(message.output)) {
    if (ArrayBuffer.isView(value)) output.push(value.buffer as ArrayBuffer);
  }
  return output;
};
const send = (message: VolumeWorkerOutbound) => scope.postMessage(message, transfers(message));

scope.onmessage = (event: MessageEvent<VolumeWorkerInbound>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelled.add(message.requestId);
    return;
  }
  const request = message.request;
  void executeVolumeJobRequest(request, send, () => cancelled.has(request.requestId))
    .then((result) => {
      if (!cancelled.has(request.requestId)) send(result);
    })
    .catch((error) => {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      send({
        type: "error",
        requestId: request.requestId,
        volumeRevision: request.volumeRevision,
        sampledGridRevision: request.sampledGridRevision,
        code: aborted ? "CANCELLED" : /memory limit/i.test(String(error)) ? "MEMORY_LIMIT" : /requires/i.test(String(error)) ? "UNSUPPORTED_INPUT" : "WORKER_FAILURE",
        message: error instanceof Error ? error.message : String(error),
        retryable: !aborted && !/memory limit/i.test(String(error)),
      });
    })
    .finally(() => cancelled.delete(request.requestId));
};
