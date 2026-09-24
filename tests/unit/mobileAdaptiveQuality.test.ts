import { describe, expect, it } from "vitest";
import { INITIAL_MOBILE_ADAPTIVE_QUALITY, recommendMobileAdaptiveQuality, updateMobileAdaptiveQuality } from "../../apps/mobile/src/viewer/mobileAdaptiveQuality";

const sample = (overrides = {}) => ({
  frameTimeMs: 16,
  triangleCount: 20_000,
  estimatedGpuBytes: 8 * 1024 * 1024,
  pixelRatio: 2,
  ...overrides,
});

describe("mobile adaptive quality", () => {
  it("uses frame time, mesh size, memory estimate, and density", () => {
    expect(recommendMobileAdaptiveQuality(sample({ frameTimeMs: 30 })).tier).toBe("performance");
    expect(recommendMobileAdaptiveQuality(sample({ triangleCount: 200_000 })).tier).toBe("performance");
    expect(recommendMobileAdaptiveQuality(sample({ estimatedGpuBytes: 100 * 1024 * 1024 })).tier).toBe("performance");
    expect(recommendMobileAdaptiveQuality(sample({ pixelRatio: 4, triangleCount: 40_000 })).tier).toBe("balanced");
    expect(recommendMobileAdaptiveQuality(sample({ frameTimeMs: 11 })).tier).toBe("quality");
  });

  it("downgrades after two samples and upgrades after four", () => {
    const slow1 = updateMobileAdaptiveQuality(INITIAL_MOBILE_ADAPTIVE_QUALITY, sample({ frameTimeMs: 30 }));
    expect(slow1).toMatchObject({ tier: "balanced", pendingTier: "performance", pendingSamples: 1 });
    const slow2 = updateMobileAdaptiveQuality(slow1, sample({ frameTimeMs: 30 }));
    expect(slow2.tier).toBe("performance");
    let recovering = slow2;
    for (let index = 0; index < 3; index += 1) recovering = updateMobileAdaptiveQuality(recovering, sample({ frameTimeMs: 11 }));
    expect(recovering.tier).toBe("performance");
    recovering = updateMobileAdaptiveQuality(recovering, sample({ frameTimeMs: 11 }));
    expect(recovering.tier).toBe("quality");
  });
});
