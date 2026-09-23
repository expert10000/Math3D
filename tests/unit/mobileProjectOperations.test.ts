import { describe, expect, it } from "vitest";
import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import { duplicateMobileProject, renameMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";

const storedProject = (id = "scene-a", title = "Catenoid"): MobileStoredSceneProject => {
  const scene: SceneDocument = {
    id,
    title,
    createdAt: 10,
    updatedAt: 10,
    surfaces: [],
  };
  return {
    id,
    title,
    updatedAt: 10,
    lastOpenedAt: 20,
    serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
  };
};

describe("mobile project operations", () => {
  it("renames list metadata and the serialized scene together", () => {
    const result = renameMobileProject(storedProject(), "  Study   surface  ", 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.title).toBe("Study surface");
    expect(result.project.updatedAt).toBe(100);
    const parsed = deserializeSceneProject(result.project.serializedProject);
    expect(parsed.ok && parsed.value.scene.title).toBe("Study surface");
  });

  it("rejects an empty project name", () => {
    expect(renameMobileProject(storedProject(), "   ")).toEqual({
      ok: false,
      error: "Project name cannot be empty.",
    });
  });

  it("duplicates with unique project and scene identities", () => {
    const source = storedProject();
    const existing = [source, storedProject("scene-a-copy", "Catenoid copy")];
    const result = duplicateMobileProject(source, existing, 200);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.id).toBe("scene-a-copy-2");
    expect(result.project.title).toBe("Catenoid copy 2");
    const parsed = deserializeSceneProject(result.project.serializedProject);
    expect(parsed.ok && parsed.value.scene.id).toBe(result.project.id);
    expect(parsed.ok && parsed.value.scene.title).toBe(result.project.title);
  });
});
