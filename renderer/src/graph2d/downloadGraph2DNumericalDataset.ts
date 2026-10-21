import { createGraph2DNumericalDataset, type Graph2DNumericalAnalysis } from "@math3d/core";

export const downloadGraph2DNumericalDataset = (analysis: Graph2DNumericalAnalysis) => {
  const dataset = createGraph2DNumericalDataset(analysis);
  const url = URL.createObjectURL(new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" }));
  const link = globalThis.document.createElement("a");
  link.href = url;
  link.download = `${dataset.operation}-${dataset.resultId}.json`;
  globalThis.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};
