import type { MobileRenderQuality } from "./mobileSurfacePreview";

export type MobileAdaptiveQualityTier = Exclude<MobileRenderQuality, "auto">;

export type MobilePerformanceSample = {
  frameTimeMs: number;
  triangleCount: number;
  estimatedGpuBytes: number;
  pixelRatio: number;
};

export type MobileAdaptiveQualityState = {
  tier: MobileAdaptiveQualityTier;
  pendingTier: MobileAdaptiveQualityTier | null;
  pendingSamples: number;
  reason: string;
};

export const INITIAL_MOBILE_ADAPTIVE_QUALITY: MobileAdaptiveQualityState = {
  tier: "balanced",
  pendingTier: null,
  pendingSamples: 0,
  reason: "Collecting device measurements.",
};

const MIB = 1024 * 1024;

export const recommendMobileAdaptiveQuality = (
  sample: MobilePerformanceSample
): { tier: MobileAdaptiveQualityTier; reason: string } => {
  if (sample.estimatedGpuBytes >= 96 * MIB) return { tier: "performance", reason: "Estimated GPU memory is above 96 MiB." };
  if (sample.frameTimeMs >= 25) return { tier: "performance", reason: `Frame time is ${sample.frameTimeMs.toFixed(1)} ms.` };
  if (sample.triangleCount >= 180_000) return { tier: "performance", reason: `Scene has ${sample.triangleCount.toLocaleString()} triangles.` };
  if (sample.estimatedGpuBytes >= 48 * MIB) return { tier: "balanced", reason: "Estimated GPU memory is above 48 MiB." };
  if (sample.frameTimeMs >= 18) return { tier: "balanced", reason: `Frame time is ${sample.frameTimeMs.toFixed(1)} ms.` };
  if (sample.triangleCount >= 60_000) return { tier: "balanced", reason: `Scene has ${sample.triangleCount.toLocaleString()} triangles.` };
  if (sample.pixelRatio >= 3 && sample.triangleCount >= 30_000) return { tier: "balanced", reason: `High density display (${sample.pixelRatio.toFixed(1)}×).` };
  if (sample.frameTimeMs <= 14 && sample.triangleCount < 30_000 && sample.estimatedGpuBytes < 24 * MIB && sample.pixelRatio <= 3) {
    return { tier: "quality", reason: "Frame time and mesh load allow quality rendering." };
  }
  return { tier: "balanced", reason: "Device load fits the balanced profile." };
};

const rank: Record<MobileAdaptiveQualityTier, number> = { performance: 0, balanced: 1, quality: 2 };

export const updateMobileAdaptiveQuality = (
  state: MobileAdaptiveQualityState,
  sample: MobilePerformanceSample
): MobileAdaptiveQualityState => {
  const recommendation = recommendMobileAdaptiveQuality(sample);
  if (recommendation.tier === state.tier) {
    return { ...state, pendingTier: null, pendingSamples: 0, reason: recommendation.reason };
  }
  const pendingSamples = state.pendingTier === recommendation.tier ? state.pendingSamples + 1 : 1;
  const isDowngrade = rank[recommendation.tier] < rank[state.tier];
  const requiredSamples = isDowngrade ? 2 : 4;
  if (pendingSamples < requiredSamples) {
    return { ...state, pendingTier: recommendation.tier, pendingSamples, reason: recommendation.reason };
  }
  return { tier: recommendation.tier, pendingTier: null, pendingSamples: 0, reason: recommendation.reason };
};
