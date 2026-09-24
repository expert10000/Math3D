import { describe, expect, it } from "vitest";
import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  createMobileProjectExportName,
  importMobileSceneProject,
  validateMobileProjectForTransfer,
} from "../../apps/mobile/src/models/mobileProjectTransfer";

const scene: SceneDocument = {
  id: "stored-saddle",
  title: "Stored saddle",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{
    id: "surface-saddle",
    kind: "explicit",
    expression: "x*x-y*y",
    resolution: 18,
    domain: { xSpan: 2, ySpan: 2 },
  }],
};

const serializedProject = serializeSceneProject({
  ...createSceneProjectDocument(scene),
  workbookId: "shared-workbook-reference",
});

const project: MobileStoredSceneProject = {
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: 3,
  serializedProject,
};

describe("mobile project transfer", () => {
  it("imports a valid canonical scene project without changing a unique identity", () => {
    const imported = importMobileSceneProject(serializedProject, [], 10);
    expect(imported).toMatchObject({
      ok: true,
      project: { id: scene.id, title: scene.title, updatedAt: scene.updatedAt, lastOpenedAt: 10 },
    });
    if (!imported.ok) return;
    const parsed = deserializeSceneProject(imported.project.serializedProject);
    expect(parsed.ok && parsed.value.workbookId).toBe("shared-workbook-reference");
  });

  it("creates a safe distinct scene identity when an import conflicts", () => {
    const imported = importMobileSceneProject(serializedProject, [project], 20);
    expect(imported).toMatchObject({
      ok: true,
      project: { id: "stored-saddle-import", title: "Stored saddle import", updatedAt: 20 },
    });
    if (!imported.ok) return;
    const parsed = deserializeSceneProject(imported.project.serializedProject);
    expect(parsed.ok && parsed.value.scene).toMatchObject({
      id: imported.project.id,
      title: imported.project.title,
      updatedAt: 20,
    });
  });

  it("rejects invalid or inconsistent projects before transfer", () => {
    expect(importMobileSceneProject("{broken", [], 10)).toMatchObject({
      ok: false,
      error: expect.stringContaining("Invalid Math3D scene project"),
    });
    expect(validateMobileProjectForTransfer({ ...project, title: "Mismatched title" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("identity is inconsistent"),
    });
  });

  it("creates a portable timestamped scene filename", () => {
    expect(createMobileProjectExportName(
      { ...project, title: "Tórus / Study" },
      new Date("2026-09-24T01:02:03.456Z")
    )).toBe("Torus-Study-20260924T010203Z.math3d.scene.json");
  });
});
