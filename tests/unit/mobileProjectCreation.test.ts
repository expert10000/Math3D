import { describe, expect, it, vi } from "vitest";
import { createSceneProjectDocument, deserializeSceneProject, serializeSceneProject, type SceneDocument } from "@math3d/core";
import { mobileExamples } from "../../apps/mobile/src/data/mobileSeedData";
import {
  MOBILE_PROJECT_CREATION_GROUPS,
  commitMobileProjectCreation,
  mobileProjectCreationLayout,
  planMobileProjectCreation,
  type MobileProjectCreationRequest,
} from "../../apps/mobile/src/models/mobileProjectCreation";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";

const now = 1_800_000_000_000;
const importedScene: SceneDocument = {
  id: "desktop-study",
  title: "Desktop study",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{ id: "desktop-sphere", kind: "implicit", expression: "x*x+y*y+z*z-1" }],
};
const serializedProject = serializeSceneProject(createSceneProjectDocument(importedScene));
const templateScene: SceneDocument = {
  id: "template-surface-study",
  title: "Surface study",
  createdAt: 0,
  updatedAt: 0,
  surfaces: [{ id: "template-graph", kind: "explicit", expression: "sin(x)*cos(y)" }],
};

const routes: MobileProjectCreationRequest[] = [
  { route: "empty" },
  { route: "primitive", primitive: "sphere" },
  { route: "surface", surfaceKind: "parametric" },
  { route: "example", example: mobileExamples[0] },
  { route: "template", templateId: "surface-study", templateVersion: 1, scene: templateScene },
  { route: "import", serializedProject, sourceName: "study.math3d.scene.json" },
  { route: "desktop", serializedProject, sourceName: "desktop.math3d.scene.json" },
  { route: "shared", serializedProject, sourceName: "shared.math3d.scene.json" },
];

describe("unified mobile project creation", () => {
  it("exposes every MOB55 route in the grouped launcher", () => {
    expect(MOBILE_PROJECT_CREATION_GROUPS.flatMap((group) => group.routes)).toEqual([
      "empty", "primitive", "surface", "import", "example", "template", "desktop", "shared",
    ]);
  });

  it.each(routes.map((request) => [request.route, request] as const))(
    "plans a validated saved project for the %s route",
    (_route, request) => {
      const result = planMobileProjectCreation(request, [], now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const parsed = deserializeSceneProject(result.project.serializedProject);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.scene.id).toBe(result.project.id);
      expect(parsed.value.scene.title).toBe(result.project.title);
      expect(result.project.lastOpenedAt).toBe(now);
    }
  );

  it.each(routes.map((request) => [request.route, request] as const))(
    "commits the %s route exactly once before Workspace can open it",
    async (_route, request) => {
      const save = vi.fn(async (_projects: MobileStoredSceneProject[]) => undefined);
      const result = await commitMobileProjectCreation(request, [], save, now);
      expect(result.ok).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      if (!result.ok) return;
      expect(save).toHaveBeenCalledWith(result.projects);
      expect(result.projects[0]).toBe(result.project);
    }
  );

  it("commits once before returning the project that Workspace should open", async () => {
    const save = vi.fn(async (_projects: MobileStoredSceneProject[]) => undefined);
    const result = await commitMobileProjectCreation({ route: "primitive", primitive: "torus" }, [], save, now);
    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (!result.ok) return;
    expect(result.projects[0]).toBe(result.project);
  });

  it("does not expose a project when validation or persistence fails", async () => {
    const invalid = await commitMobileProjectCreation(
      { route: "import", serializedProject: "{broken", sourceName: "broken.json" },
      [],
      vi.fn(),
      now
    );
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("Invalid Math3D") });

    const failedSave = await commitMobileProjectCreation(
      { route: "empty" },
      [],
      async () => { throw new Error("storage unavailable"); },
      now
    );
    expect(failedSave).toEqual({ ok: false, error: "storage unavailable" });
  });

  it("keeps the launcher single-column and touch-safe on compact phones", () => {
    expect(mobileProjectCreationLayout(320)).toEqual({
      columns: 1,
      optionWidth: "100%",
      horizontalPadding: 8,
      minTouchHeight: 48,
    });
    expect(mobileProjectCreationLayout(768)).toMatchObject({ columns: 2, optionWidth: "48.5%" });
  });
});
