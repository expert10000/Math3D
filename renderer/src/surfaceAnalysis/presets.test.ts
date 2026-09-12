import { describe, expect, it } from "vitest";
import { SURFACE_ANALYSIS_PRESETS, getSurfaceAnalysisPreset, validateSurfaceAnalysisPresets } from "./presets";

describe("Surface Analysis layer presets", () => {
  it("provides a valid preset for each focused Surface workflow", () => {
    expect(validateSurfaceAnalysisPresets()).toEqual([]);
    expect(new Set(SURFACE_ANALYSIS_PRESETS.map((preset) => preset.focus))).toEqual(new Set([
      "curvature-field",
      "surface-probe",
      "surface-curves",
      "surface-features",
      "chart-diagnostics",
    ]));
  });

  it("keeps every preset layered and retrievable by stable ID", () => {
    expect(SURFACE_ANALYSIS_PRESETS.every((preset) => preset.layers.length >= 2)).toBe(true);
    expect(getSurfaceAnalysisPreset("feature-map")?.layers).toEqual([
      "curvature-field",
      "ridges",
      "valleys",
      "umbilics",
      "parabolic-set",
    ]);
    expect(getSurfaceAnalysisPreset("missing")).toBeNull();
  });
});
