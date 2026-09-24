import { describe, expect, it } from "vitest";
import { buildSceneSurfacePreviews } from "../../apps/mobile/src/viewer/mobileSurfacePreview";
import { projectMobileSceneWireframe } from "../../apps/mobile/src/viewer/mobileProjectedScene";

const orbit = { azimuth: 0.8, polar: 1.1, distance: 6, targetX: 0, targetY: 0, targetZ: 0 };

describe("mobile projected scene", () => {
  it("projects a real surface preview into a bounded iOS wireframe", () => {
    const previews = buildSceneSurfacePreviews({
      id: "ios-scene",
      title: "iOS scene",
      createdAt: 1,
      updatedAt: 1,
      surfaces: [{
        id: "sphere",
        kind: "parametric",
        expressions: {
          x: "cos(u)*sin(v)",
          y: "sin(u)*sin(v)",
          z: "cos(v)",
        },
        domain: { uMin: 0, uMax: Math.PI * 2, vMin: 0, vMax: Math.PI },
        resolution: 24,
      }],
    }, "performance");
    const lines = projectMobileSceneWireframe(previews, orbit, 390, 700, "sphere", 80);
    expect(lines.length).toBeGreaterThan(80);
    expect(lines.length).toBeLessThanOrEqual(240);
    expect(lines.every((line) => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite))).toBe(true);
    expect(lines.every((line) => line.emphasized)).toBe(true);
  });

  it("returns no segments for an empty scene or zero-size viewport", () => {
    expect(projectMobileSceneWireframe([], orbit, 390, 700, null)).toEqual([]);
    expect(projectMobileSceneWireframe([], orbit, 0, 0, null)).toEqual([]);
  });
});
