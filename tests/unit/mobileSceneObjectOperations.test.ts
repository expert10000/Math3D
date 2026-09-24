import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@math3d/core";
import {
  deleteMobileSceneObject,
  duplicateMobileSceneObject,
  renameMobileSceneObject,
  restoreMobileSceneObject,
} from "../../apps/mobile/src/models/mobileSceneObjectOperations";

const scene = (): SceneDocument => ({
  id: "scene",
  title: "Objects",
  createdAt: 1,
  updatedAt: 1,
  surfaces: [
    { id: "bowl", kind: "explicit", expression: "x*x+y*y" },
    { id: "sphere", kind: "implicit", expression: "x*x+y*y+z*z-1" },
  ],
});

describe("mobile scene object operations", () => {
  it("renames to a normalized unique id", () => {
    const result = renameMobileSceneObject(scene(), "bowl", "  tall bowl  ", 10);
    expect(result).toMatchObject({ ok: true, objectId: "tall-bowl" });
    if (result.ok) expect(result.scene.surfaces?.map((surface) => surface.id)).toEqual(["tall-bowl", "sphere"]);
    expect(renameMobileSceneObject(scene(), "bowl", "sphere")).toMatchObject({ ok: false });
  });

  it("duplicates beside the source with a stable unique id", () => {
    const first = duplicateMobileSceneObject(scene(), "sphere", 10);
    expect(first).toMatchObject({ ok: true, objectId: "sphere-copy" });
    if (!first.ok) return;
    const second = duplicateMobileSceneObject(first.scene, "sphere", 11);
    expect(second).toMatchObject({ ok: true, objectId: "sphere-copy-2" });
  });

  it("deletes with predictable selection and restores the exact position", () => {
    const removed = deleteMobileSceneObject(scene(), "bowl", 10);
    expect(removed).toMatchObject({ ok: true, nextSelectedId: "sphere" });
    if (!removed.ok) return;
    const restored = restoreMobileSceneObject(removed.scene, removed.deleted, 11);
    expect(restored).toMatchObject({ ok: true, objectId: "bowl" });
    if (restored.ok) expect(restored.scene.surfaces?.map((surface) => surface.id)).toEqual(["bowl", "sphere"]);
  });
});
