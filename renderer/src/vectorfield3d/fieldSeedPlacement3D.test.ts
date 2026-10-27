import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2 } from "three";
import { fieldPointToWorld, intersectFieldSeedPlane } from "./fieldSeedPlacement3D";

const axes = [
  { min: -4, max: 4 }, { min: -4, max: 4 }, { min: -4, max: 4 },
] as const; // The committed 80³ vortex fixture's physical domain.

const cameraRay = (position: [number, number, number], up: [number, number, number],
  ndc: [number, number] = [0, 0]) => {
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  camera.position.set(...position);
  camera.up.set(...up);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(...ndc), camera);
  return { origin: raycaster.ray.origin.toArray(),
    direction: raycaster.ray.direction.toArray() };
};

describe("SCI-13 3D ray placement in the 80³ physical domain", () => {
  it("places the center on each explicit plane with the matching camera preset", () => {
    for (const [plane, camera, up] of [
      ["xy", [0, 0, 4], [0, 1, 0]],
      ["xz", [0, 4, 0], [0, 0, 1]],
      ["yz", [4, 0, 0], [0, 0, 1]],
    ] as const) {
      const hit = intersectFieldSeedPlane(cameraRay([...camera], [...up]), plane, 0, axes);
      expect(hit.reason).toBeNull();
      expect(hit.point).not.toBeNull();
      hit.point!.forEach(value => expect(Math.abs(value)).toBeLessThan(1e-10));
    }
  });

  it("respects physical axis orientation and a displaced plane", () => {
    const xy = intersectFieldSeedPlane(cameraRay([0, 0, 4], [0, 1, 0], [.2, .3]),
      "xy", 1.5, axes).point!;
    expect(xy[0]).toBeGreaterThan(0);
    expect(xy[1]).toBeGreaterThan(0);
    expect(xy[2]).toBe(1.5);
    const xz = intersectFieldSeedPlane(cameraRay([0, 4, 0], [0, 0, 1], [.2, .3]),
      "xz", -1, axes).point!;
    expect(xz[0]).toBeLessThan(0);
    expect(xz[1]).toBe(-1);
    expect(xz[2]).toBeGreaterThan(0);
    const yz = intersectFieldSeedPlane(cameraRay([4, 0, 0], [0, 0, 1], [.2, .3]),
      "yz", 2, axes).point!;
    expect(yz[0]).toBe(2);
    expect(yz[1]).toBeGreaterThan(0);
    expect(yz[2]).toBeGreaterThan(0);
    expect(fieldPointToWorld([2, 0, 0], axes)).toEqual([.5, 0, 0]);
  });

  it("works with perspective camera rays and rejects parallel, rear and exterior hits", () => {
    const camera = new PerspectiveCamera(48, 1, .1, 100);
    camera.position.set(2.7, 2.2, 2.7);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);
    const perspectiveHit = intersectFieldSeedPlane({ origin: raycaster.ray.origin.toArray(),
      direction: raycaster.ray.direction.toArray() }, "xy", 0, axes).point;
    expect(perspectiveHit).not.toBeNull();
    perspectiveHit!.forEach(value => expect(Math.abs(value)).toBeLessThan(1e-10));
    expect(intersectFieldSeedPlane({ origin: [0, 0, 1], direction: [1, 0, 0] },
      "xy", 0, axes).reason).toBe("parallel");
    expect(intersectFieldSeedPlane({ origin: [0, 0, 1], direction: [0, 0, 1] },
      "xy", 0, axes).reason).toBe("behind");
    expect(intersectFieldSeedPlane({ origin: [3, 3, 4], direction: [1, 0, -1] },
      "xy", 0, axes).reason).toBe("outside");
  });
});
