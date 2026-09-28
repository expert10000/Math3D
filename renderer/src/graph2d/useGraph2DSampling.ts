import { useEffect, useMemo, useRef, useState } from "react";
import { Graph2DSamplingJobController, sampleGraph2DScene, structuralHash,
  type Graph2DSceneSamplingRequest, type Graph2DSampledSeries } from "@math3d/core";
import { startGraph2DSamplingTask, type Graph2DSamplingWorker } from "./graph2dSamplingTask";

/** Every replacement/unmount terminates the worker and releases its generation record. */
export function useGraph2DSampling(request: Graph2DSceneSamplingRequest) {
  const controller = useRef(new Graph2DSamplingJobController());
  const key = useMemo(() => structuralHash({ source: request.document.source, display: request.document.display,
    identity: request.document.identity, viewport: request.viewport, width: request.width, height: request.height,
    interaction: request.interaction, pointTables: request.pointTables ?? {} }), [request]);
  const [result, setResult] = useState<{ key: string; series: readonly Graph2DSampledSeries[]; error?: string } | null>(null);
  useEffect(() => {
    const handle = controller.current.begin("scene", key);
    let dispose: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | null = null;
    const publish = (series: readonly Graph2DSampledSeries[], error?: string) => {
      if (controller.current.settle(handle, key) === "accepted") setResult({ key, series, error });
    };
    if (typeof Worker !== "undefined") {
      try {
        const worker = new Worker(new URL("./graph2dSamplingWorker.ts", import.meta.url), { type: "module" });
        dispose = startGraph2DSamplingTask(worker as unknown as Graph2DSamplingWorker, handle.jobId, request, publish);
      } catch (error) { publish([], (error as Error).message); }
    } else {
      timer = setTimeout(() => {
        try { publish(sampleGraph2DScene(request)); } catch (error) { publish([], (error as Error).message); }
      }, 0);
    }
    return () => {
      dispose?.(); if (timer) clearTimeout(timer);
      controller.current.cancel(handle.jobId); controller.current.settle(handle, key);
    };
    // Selection/metadata-only changes share the sampling key and do not restart work.
  }, [key]);
  return result?.key === key ? result : { key, series: [], error: undefined };
}
