import { describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, deserializeSceneProject, serializeSceneProject, type SceneDocument, type SurfaceDefinition } from "@math3d/core";
import { mobileExamples } from "../../apps/mobile/src/data/mobileSeedData";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  MOBILE_WORKSPACE_ADD_GROUPS,
  commitMobileWorkspaceAdd,
  mobileWorkspaceAddLayout,
  restoreMobileWorkspaceAdd,
  type MobileWorkspaceAddRequest,
} from "../../apps/mobile/src/models/mobileWorkspaceAdd";
import { createMobileThumbnailCacheKey } from "../../apps/mobile/src/viewer/mobileSceneThumbnail";

const scene: SceneDocument = {
  id: "active-project",
  title: "Active project",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{ id: "sphere", kind: "implicit", expression: "x*x+y*y+z*z-1" }],
};
const project: MobileStoredSceneProject = {
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: 3,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
};
const authored: SurfaceDefinition = { id: "graph", kind: "explicit", expression: "sin(x)*cos(y)" };
const requests: MobileWorkspaceAddRequest[] = [
  { route: "primitive", primitive: "torus" },
  { route: "surface", surface: authored },
  { route: "preset", example: mobileExamples.find((item) => item.id === "sphere")! },
  { route: "example", example: mobileExamples.find((item) => item.id === "graph-saddle")! },
];

describe("unified mobile Workspace add flow", () => {
  it("exposes the complete MOB56 launcher language", () => {
    expect(MOBILE_WORKSPACE_ADD_GROUPS.flatMap((group) => group.routes)).toEqual([
      "primitive", "surface", "mesh", "math3d-object", "objects-from-project", "preset", "example", "desktop",
    ]);
  });

  it.each(requests.map((request) => [request.route, request] as const))(
    "commits the %s route once and selects a valid added identity",
    async (_route, request) => {
      const save = vi.fn(async () => undefined);
      const result = await commitMobileWorkspaceAdd([project], project.id, scene, request, save, 10);
      expect(result.ok).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      if (!result.ok) return;
      expect(result.addedObjectIds.length).toBeGreaterThan(0);
      expect(result.scene.surfaces?.at(-1)?.id).toBe(result.addedObjectIds.at(-1));
      expect(deserializeSceneProject(result.project.serializedProject)).toMatchObject({ ok: true });
      expect(createMobileThumbnailCacheKey(result.project)).not.toBe(createMobileThumbnailCacheKey(project));
    }
  );

  it("remaps colliding source identities and restores the pre-add project in one undo save", async () => {
    const duplicateSource = { ...mobileExamples[0], scene: { ...mobileExamples[0].scene, surfaces: [scene.surfaces![0]] } };
    const added = await commitMobileWorkspaceAdd(
      [project], project.id, scene, { route: "example", example: duplicateSource }, async () => undefined, 10
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.addedObjectIds).toEqual(["sphere-2"]);
    const save = vi.fn(async () => undefined);
    const undone = await restoreMobileWorkspaceAdd(added.projects, added.previousProject, save);
    expect(undone.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (undone.ok) expect(undone.scene.surfaces?.map((surface) => surface.id)).toEqual(["sphere"]);
  });

  it("leaves persistence untouched without an active project or when save fails", async () => {
    const save = vi.fn(async () => undefined);
    expect(await commitMobileWorkspaceAdd([project], null, scene, requests[0], save, 10)).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
    const failed = await commitMobileWorkspaceAdd(
      [project], project.id, scene, requests[0], async () => { throw new Error("storage unavailable"); }, 10
    );
    expect(failed).toEqual({ ok: false, error: "storage unavailable" });
  });

  it("keeps the launcher compact, scroll-bounded, and touch-safe", () => {
    expect(mobileWorkspaceAddLayout(320)).toEqual({
      columns: 1,
      optionWidth: "100%",
      maxPanelHeight: 300,
      minTouchHeight: 48,
    });
    expect(mobileWorkspaceAddLayout(768)).toMatchObject({ columns: 2, optionWidth: "48.5%" });
  });
});
