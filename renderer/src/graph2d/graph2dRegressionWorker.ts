import { analyzeGraph2DRegression, type Graph2DDocument, type Graph2DPointRow,
  type Graph2DRegressionModel, type Graph2DExponentialInitial } from "@math3d/core";

type Request = { document: Graph2DDocument; objectId: string; rows: readonly Graph2DPointRow[] | null;
  model: Graph2DRegressionModel; smoothing?: number; initial?: Graph2DExponentialInitial };
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const result = analyzeGraph2DRegression(event.data);
    self.postMessage({ result });
  } catch (caught) {
    self.postMessage({ error: caught instanceof Error ? caught.message : "Regression failed." });
  }
};
