import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildMobileEdgeOverlayGeometry,
  mobileAnalysisOverlayAvailability,
  normalizeMobileAnalysisOverlay,
} from "../../apps/mobile/src/viewer/mobileAnalysisOverlays";

describe("mobile single analysis overlay", () => {
  it("normalizes to exactly one supported overlay", () => {
    expect(normalizeMobileAnalysisOverlay("curvature")).toBe("curvature");
    expect(normalizeMobileAnalysisOverlay("curvature,normals")).toBe("none");
    expect(normalizeMobileAnalysisOverlay(null)).toBe("none");
  });

  it("requires valid mesh analysis for heavy overlays", () => {
    expect(mobileAnalysisOverlayAvailability("normals", null)).toMatchObject({ available: false });
    expect(mobileAnalysisOverlayAvailability("curvature", { status: "unavailable", reason: "Compute first" })).toEqual({ available: false, message: "Compute first" });
    expect(mobileAnalysisOverlayAvailability("none", null)).toMatchObject({ available: true });
  });

  it("extracts boundary edges and omits absent nonmanifold edges", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    const boundary = buildMobileEdgeOverlayGeometry(geometry, "boundaries");
    expect(boundary?.getAttribute("position").count).toBe(6);
    expect(buildMobileEdgeOverlayGeometry(geometry, "non-manifold")).toBeNull();
    boundary?.dispose();
    geometry.dispose();
  });
});
