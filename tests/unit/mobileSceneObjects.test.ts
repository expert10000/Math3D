import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@math3d/core";
import { buildMobileSceneObjectItems } from "../../apps/mobile/src/models/mobileSceneObjects";

const scene: SceneDocument = {
  id: "multi-scene",
  title: "Two surfaces",
  createdAt: 1,
  updatedAt: 1,
  surfaces: [
    { id: "bowl", kind: "explicit", expression: "x*x+y*y" },
    { id: "sphere", kind: "implicit", expression: "x*x+y*y+z*z-1" },
  ],
};

describe("mobile scene object list", () => {
  it("keeps selection independent from visibility", () => {
    const items = buildMobileSceneObjectItems(scene, ["bowl"], "sphere");
    expect(items).toEqual([
      expect.objectContaining({ id: "bowl", visible: true, selected: false, kindLabel: "Explicit surface" }),
      expect.objectContaining({ id: "sphere", visible: false, selected: true, kindLabel: "Implicit surface" }),
    ]);
  });

  it("uses the scene title for a single object", () => {
    const single = { ...scene, title: "Only sphere", surfaces: [scene.surfaces![1]] };
    expect(buildMobileSceneObjectItems(single, ["sphere"], "sphere")[0]).toMatchObject({
      label: "Only sphere",
      selected: true,
      visible: true,
    });
  });
});
