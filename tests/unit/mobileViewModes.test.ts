import { describe, expect, it } from "vitest";
import { normalizeMobileRenderQuality } from "../../apps/mobile/src/viewer/mobileSurfacePreview";
import {
  normalizeMobileSurfaceRenderMode,
  normalizeMobileSurfaceShading,
} from "../../apps/mobile/src/viewer/mobileViewModes";

describe("mobile view modes", () => {
  it("accepts supported render and shading modes", () => {
    expect(normalizeMobileSurfaceRenderMode("wireframe")).toBe("wireframe");
    expect(normalizeMobileSurfaceRenderMode("solid-edges")).toBe("solid-edges");
    expect(normalizeMobileSurfaceShading("flat")).toBe("flat");
  });

  it("falls back to stable view defaults for unknown settings", () => {
    expect(normalizeMobileSurfaceRenderMode("points")).toBe("solid");
    expect(normalizeMobileSurfaceShading("toon")).toBe("smooth");
    expect(normalizeMobileRenderQuality("sharp")).toBe("balanced");
  });

  it("keeps the Auto and manual quality choices", () => {
    expect(normalizeMobileRenderQuality("auto")).toBe("auto");
    expect(normalizeMobileRenderQuality("performance")).toBe("performance");
    expect(normalizeMobileRenderQuality("quality")).toBe("quality");
  });
});
