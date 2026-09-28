import { type Graph2DDocument, type Graph2DSampledSeries } from "@math3d/core";

export const MOBILE_GRAPH_QUALITY = { quick: { maxSamples: 512, maxDepth: 6, tolerancePx: 3 },
  balanced: { maxSamples: 1024, maxDepth: 8, tolerancePx: 1.5 }, fine: { maxSamples: 2048, maxDepth: 10, tolerancePx: 1 } } as const;
export type MobileGraphQuality = keyof typeof MOBILE_GRAPH_QUALITY;
export type MobileGraphOverlays = { tangent: boolean; area: boolean; features: boolean };
export const MOBILE_GRAPH_DEFAULT_OVERLAYS: MobileGraphOverlays = { tangent: false, area: false, features: false };
export const mobileGraphSamplingPolicy = (document: Graph2DDocument, interacting: boolean): Graph2DDocument["display"]["sampling"] => ({
  maxSamples: Math.min(document.display.sampling.maxSamples, interacting ? 256 : 2048),
  maxDepth: Math.min(document.display.sampling.maxDepth, interacting ? 6 : 10),
  tolerancePx: Math.max(document.display.sampling.tolerancePx, interacting ? 3 : 1),
});
export const mobileGraphDisplayScene = (document: Graph2DDocument, action: { type: "axis"; key: "x" | "y" | "grid" | "labels" } |
  { type: "quality"; quality: MobileGraphQuality }) => ({ source: document.source, selection: document.selection,
    display: action.type === "axis" ? { ...document.display, axes: { ...document.display.axes, [action.key]: !document.display.axes[action.key] } } :
      { ...document.display, sampling: { ...MOBILE_GRAPH_QUALITY[action.quality] } } });
export const mobileGraphSamplingDiagnostics = (series: readonly Graph2DSampledSeries[]) => series.map((item) => ({ objectId: item.objectId,
  converged: item.artifact.converged, samples: item.artifact.samplesEvaluated, messages: item.artifact.diagnostics.map((item) => `${item.code}: ${item.count}`) }));
