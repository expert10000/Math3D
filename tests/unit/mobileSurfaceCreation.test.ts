import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@math3d/core";
import { appendMobileSurface, createMobilePrimitiveSurface } from "../../apps/mobile/src/models/mobileSurfaceCreation";

const scene: SceneDocument = {
  id: "scene",
  title: "Primitives",
  createdAt: 1,
  updatedAt: 1,
  surfaces: [{ id: "sphere", kind: "explicit", expression: "0" }],
};

describe("mobile primitive creation", () => {
  it("creates locally renderable primitive surface definitions", () => {
    expect(createMobilePrimitiveSurface("plane", null)).toMatchObject({ id: "plane", kind: "explicit", expression: "0" });
    expect(createMobilePrimitiveSurface("sphere", scene)).toMatchObject({ id: "sphere-2", kind: "parametric" });
    expect(createMobilePrimitiveSurface("cylinder", null)).toMatchObject({ id: "cylinder", kind: "parametric" });
    expect(createMobilePrimitiveSurface("torus", null)).toMatchObject({ id: "torus", kind: "parametric" });
  });

  it("appends to a scene or creates a new scene", () => {
    const plane = createMobilePrimitiveSurface("plane", scene);
    expect(appendMobileSurface(scene, plane, 10)).toMatchObject({ updatedAt: 10, surfaces: [{ id: "sphere" }, { id: "plane" }] });
    expect(appendMobileSurface(null, plane, 20)).toMatchObject({ id: "scene-mobile-created-20", title: "Untitled scene", surfaces: [{ id: "plane" }] });
  });
});
