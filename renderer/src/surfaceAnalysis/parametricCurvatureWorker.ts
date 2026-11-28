import { parametricSurfaceCurvatureOperation,
  type ParametricCurvatureParameters, type ParametricSurfaceSource } from "./parametricCurvatureOperation";

self.onmessage = (event: MessageEvent<{ surface: ParametricSurfaceSource;
  parameters: ParametricCurvatureParameters }>) => {
  try {
    const { surface, parameters } = event.data;
    const result = parametricSurfaceCurvatureOperation.execute({ surface, parameters });
    const uCount = parameters.resolutionU ?? 128;
    const vCount = parameters.resolutionV ?? 128;
    const side = Math.min(32, uCount, vCount);
    const heatmap = Array.from({ length: side * side }, (_, index) => {
      const ui = Math.min(uCount - 1, Math.floor((Math.floor(index / side) + 0.5) * uCount / side));
      const vi = Math.min(vCount - 1, Math.floor(((index % side) + 0.5) * vCount / side));
      const sampleIndex = ui * vCount + vi;
      return result.field.validityMask[sampleIndex]
        ? result.field.gaussianCurvature[sampleIndex] : null;
    });
    self.postMessage({ ok: true, summary: {
      sampleCount: result.field.sampleCount,
      gaussianRange: result.field.statistics.K
        ? [result.field.statistics.K.min, result.field.statistics.K.max] : null,
      meanGaussian: result.field.statistics.K?.mean ?? null,
      validation: result.validation, heatmap, heatmapSide: side,
    } });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
