import { type Graph2DDocument, type Graph2DSampledSeries } from "@math3d/core";

export type MobileGraphDeviceTier = "low" | "mid" | "high";
export type MobileGraphSamplingPhase = "interaction" | "preview" | "refine" | "paused";
export const MOBILE_GRAPH_DEVICE_PROFILES = {
  low: { samples: 512, interactionSamples: 128, previewSamples: 256, maxDepth: 6, tolerance: 2, lines: 768, fills: 64, markers: 32, artifactBytes: 256 * 1024, segments: 1024, cpuMs: 12 },
  mid: { samples: 1024, interactionSamples: 256, previewSamples: 512, maxDepth: 8, tolerance: 1.5, lines: 2048, fills: 128, markers: 64, artifactBytes: 512 * 1024, segments: 2048, cpuMs: 20 },
  high: { samples: 2048, interactionSamples: 256, previewSamples: 512, maxDepth: 10, tolerance: 1, lines: 4096, fills: 256, markers: 128, artifactBytes: 1024 * 1024, segments: 4096, cpuMs: 32 },
} as const;
export type MobileGraphBudget = ReturnType<typeof mobileGraphBudget>;
export const mobileGraphBudget = (document: Graph2DDocument, tier: MobileGraphDeviceTier, phase: MobileGraphSamplingPhase) => {
  const profile = MOBILE_GRAPH_DEVICE_PROFILES[tier];
  const interaction = phase === "interaction", refine = phase === "refine";
  return { ...profile, tier, phase, cpuMs: interaction ? Math.min(profile.cpuMs, 8) : refine ? profile.cpuMs : Math.min(profile.cpuMs, 12),
    sampling: { maxSamples: Math.min(document.display.sampling.maxSamples, interaction ? profile.interactionSamples : refine ? profile.samples : profile.previewSamples),
      maxDepth: Math.min(document.display.sampling.maxDepth, interaction ? 5 : refine ? profile.maxDepth : 6),
      tolerancePx: Math.max(document.display.sampling.tolerancePx, interaction ? 4 : refine ? profile.tolerance : 3) } };
};
export type MobileGraphPerformanceState = { tier: MobileGraphDeviceTier; slow: number; fast: number; holdUntil: number; reason: string };
export const INITIAL_MOBILE_GRAPH_PERFORMANCE: MobileGraphPerformanceState = { tier: "mid", slow: 0, fast: 0, holdUntil: 0, reason: "Conservative initial profile; collecting measured workload timings." };
export const pressureMobileGraphPerformance = (now: number, reason = "Native memory pressure; cache released."): MobileGraphPerformanceState =>
  ({ tier: "low", slow: 0, fast: 0, holdUntil: now + 30000, reason });
export const measureMobileGraphPerformance = (state: MobileGraphPerformanceState, sample: { samplingMs: number; frameDelayMs: number }, now: number): MobileGraphPerformanceState => {
  if (![sample.samplingMs, sample.frameDelayMs, now].every(Number.isFinite) || sample.samplingMs < 0 || sample.frameDelayMs < 0) return state;
  if (now < state.holdUntil) return { ...state, fast: 0 };
  const slow = sample.samplingMs > MOBILE_GRAPH_DEVICE_PROFILES[state.tier].cpuMs || sample.frameDelayMs > 40;
  const fast = sample.samplingMs < 6 && sample.frameDelayMs < 24;
  const slowCount = slow ? state.slow + 1 : 0, fastCount = fast ? state.fast + 1 : 0;
  const tiers: MobileGraphDeviceTier[] = ["low", "mid", "high"], index = tiers.indexOf(state.tier);
  if (slowCount >= 2 && index > 0) return { tier: tiers[index - 1]!, slow: 0, fast: 0, holdUntil: now + 10000, reason: "Repeated slow sampling/frame delivery; reduced workload (thermal state is not observable)." };
  if (fastCount >= 6 && index < 2) return { tier: tiers[index + 1]!, slow: 0, fast: 0, holdUntil: now + 3000, reason: "Six measured light workloads allow one refinement tier increase." };
  return { ...state, slow: slowCount, fast: fastCount };
};

/** A publication token never outlives a newer request, source/viewport change, pause or unmount. */
export class MobileGraphSamplingEpoch {
  #epoch = 0;
  issue() { return ++this.#epoch; }
  current(token: number) { return token === this.#epoch; }
  cancel() { this.#epoch++; }
}

/** Caps retained serialized artifacts/segments, not a claimed measurement of JS/native heap bytes. */
export const boundMobileGraphArtifacts = (series: readonly Graph2DSampledSeries[], budget: Pick<MobileGraphBudget, "artifactBytes" | "segments">) => {
  let bytes = 0, segments = 0, truncated = false;
  const bounded = series.map((item) => {
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    const count = item.artifact.segments.length + (item.continuation?.segments.length ?? 0);
    if (bytes + size <= budget.artifactBytes - 16384 && segments + count <= budget.segments) {
      bytes += size; segments += count; return item;
    }
    truncated = true;
    const { continuation: _continuation, ...original } = item;
    const omitted = { ...original, artifact: { samplerVersion: 1 as const, segments: [], samplesEvaluated: item.artifact.samplesEvaluated,
      converged: false, diagnostics: [...item.artifact.diagnostics, { code: "output-limit" as const, count: 1 }] } };
    const omittedBytes = new TextEncoder().encode(JSON.stringify(omitted)).length;
    if (bytes + omittedBytes > budget.artifactBytes) return null;
    bytes += omittedBytes;
    return omitted;
  });
  return { series: bounded.filter((item): item is Graph2DSampledSeries => item !== null), bytes, truncated };
};
export const mobileGraphTableRowAllowance = (document: Graph2DDocument, samples: number): number =>
  Math.max(32, Math.floor(samples / Math.max(1, document.display.objects.filter((style) => style.visible).length)));
