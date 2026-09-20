import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { colorizeSurfaceCurvature } from "../../apps/mobile/src/viewer/mobileCurvatureColors";

const foldedStrip = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 1,
  ], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 1, 4, 3]);
  return geometry;
};

describe("mobile curvature colors", () => {
  it("colors connected vertices by local normal change", () => {
    const geometry = foldedStrip();
    const colored = colorizeSurfaceCurvature(geometry, "curvature");
    const colors = colored.getAttribute("color");
    expect(colored).toBe(geometry);
    expect(colors.count).toBe(5);
    expect(colors.getX(0)).not.toBe(colors.getX(4));
    for (let i = 0; i < colors.count; i += 1) {
      for (const value of [colors.getX(i), colors.getY(i), colors.getZ(i)]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    geometry.dispose();
  });

  it("assigns one color to each face in face mode", () => {
    const geometry = foldedStrip();
    const colored = colorizeSurfaceCurvature(geometry, "curvature-faces");
    const colors = colored.getAttribute("color");
    expect(colored.getIndex()).toBeNull();
    expect(colors.count).toBe(9);
    for (let face = 0; face < 3; face += 1) {
      for (let corner = 1; corner < 3; corner += 1) {
        expect(colors.getX(face * 3 + corner)).toBeCloseTo(colors.getX(face * 3));
      }
    }
    expect(colors.getX(0)).not.toBe(colors.getX(6));
    colored.dispose();
    geometry.dispose();
  });
});
