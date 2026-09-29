import { Graph2DAnimationExportBuilder, type Graph2DAnimationExportRequest } from "@math3d/core";
self.onmessage = (event: MessageEvent<Graph2DAnimationExportRequest>) => {
  try {
    const builder = new Graph2DAnimationExportBuilder(event.data);
    while (!builder.complete) { builder.appendNext(); self.postMessage({ progress: builder.progress }); }
    const outputs = builder.finish();
    self.postMessage({ outputs }, outputs.map(o => o.bytes.buffer as ArrayBuffer));
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
