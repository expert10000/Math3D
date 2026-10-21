import { analyzeGraph2DFourier, type Graph2DDocument, type Graph2DFourierOptions,
  type Graph2DPointRow } from "@math3d/core";

type Request = { document: Graph2DDocument; objectId: string; rows: readonly Graph2DPointRow[] | null;
  options: Graph2DFourierOptions };
self.onmessage = (event: MessageEvent<Request>) => {
  try { self.postMessage({ result: analyzeGraph2DFourier(event.data) }); }
  catch (caught) { self.postMessage({ error: caught instanceof Error ? caught.message : "Fourier analysis failed." }); }
};
