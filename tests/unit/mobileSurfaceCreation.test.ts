import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@math3d/core";
import {
  appendMobileSurface,
  buildMobileExplicitSurface,
  buildMobileParametricSurface,
  buildMobileImplicitSurface,
  createMobilePrimitiveSurface,
  DEFAULT_MOBILE_EXPLICIT_DRAFT,
  DEFAULT_MOBILE_PARAMETRIC_DRAFT,
  DEFAULT_MOBILE_IMPLICIT_DRAFT,
  validateMobileSurfaceExpression,
} from "../../apps/mobile/src/models/mobileSurfaceCreation";

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

  it("validates and builds explicit and parametric drafts", () => {
    expect(buildMobileExplicitSurface(scene, { ...DEFAULT_MOBILE_EXPLICIT_DRAFT, id: "wave" })).toMatchObject({ ok: true, surface: { id: "wave", kind: "explicit" } });
    expect(buildMobileParametricSurface(scene, DEFAULT_MOBILE_PARAMETRIC_DRAFT)).toMatchObject({ ok: true, surface: { kind: "parametric" } });
    expect(buildMobileParametricSurface(scene, { ...DEFAULT_MOBILE_PARAMETRIC_DRAFT, uMax: "-4" })).toMatchObject({ ok: false });
  });

  it("rejects unsafe, unknown, and non-finite expressions", () => {
    expect(validateMobileSurfaceExpression("x^2", ["x", "y"])).toContain("not exponentiation");
    expect(validateMobileSurfaceExpression("unknown(x)", ["x", "y"])).toContain("Unknown name");
    expect(validateMobileSurfaceExpression("1/0", ["x", "y"])).toContain("finite");
  });

  it("builds an implicit definition for the compute job pipeline", () => {
    expect(buildMobileImplicitSurface(scene, DEFAULT_MOBILE_IMPLICIT_DRAFT)).toMatchObject({
      ok: true,
      surface: {
        id: "implicit-surface",
        kind: "implicit",
        expression: "x*x + y*y + z*z - 1",
        domain: { xSpan: 1.5, ySpan: 1.5, zSpan: 1.5 },
        resolution: 72,
      },
    });
    expect(buildMobileImplicitSurface(scene, { ...DEFAULT_MOBILE_IMPLICIT_DRAFT, zSpan: "0" })).toMatchObject({ ok: false });
  });
});
