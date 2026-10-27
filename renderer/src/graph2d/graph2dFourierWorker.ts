import { analyzeGraph2DMultiChannelFourier, type Graph2DDocument, type Graph2DFourierChannelInput,
  type Graph2DFourierOptions } from "@math3d/core";

type Request = { document: Graph2DDocument; channels: readonly Graph2DFourierChannelInput[];
  options: Graph2DFourierOptions; maxRows?: number };
self.onmessage = (event: MessageEvent<Request>) => {
  try { self.postMessage({ result: analyzeGraph2DMultiChannelFourier(event.data) }); }
  catch (caught) { self.postMessage({ error: caught instanceof Error ? caught.message : "Fourier analysis failed." }); }
};
