import { describe, expect, it, vi } from "vitest";
import {
  createProjectHandoff, createSceneProjectDocument, deserializeProjectHandoff,
  deserializeSceneProject, sceneProjectRevision, serializeProjectHandoff, serializeSceneProject,
} from "@math3d/core";
import { goldenDesktopProject, goldenDesktopScene, goldenMeshOnlyScene } from "../fixtures/projectHandoffGolden";
import { commitMobileProjectHandoff, inspectMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectHandoff";
import { importMobileSceneProject, serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";

const desktop = (project = goldenDesktopProject, baseRevision: string | null = null) =>
  serializeProjectHandoff(createProjectHandoff(project, {
    producer: { platform: "desktop", name: "Math3D Desktop", version: "1.5.0" },
    baseRevision,
    requiredCapabilities: (project.scene.surfaces ?? []).map((surface) => `surface.${surface.kind}`),
  }));

describe("desktop-core-mobile golden transfer matrix", () => {
  it("preserves semantic definitions, IDs, domains, metadata and a mobile edit on return", async () => {
    const preview = inspectMobileProjectHandoff(desktop(), "golden.handoff.json", []);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const imported = await commitMobileProjectHandoff(preview.preview, "copy", [], async () => {}, 300);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const parsed = deserializeSceneProject(imported.project.serializedProject);
    expect(parsed.ok && parsed.value.scene).toEqual(goldenDesktopScene);
    if (!parsed.ok) return;
    const edited = { ...parsed.value, scene: {
      ...parsed.value.scene, updatedAt: 400,
      surfaces: (parsed.value.scene.surfaces ?? []).map((surface) => surface.id === "explicit"
        ? { ...surface, expression: "sin(x)-y" } : surface),
    } };
    const returned = deserializeProjectHandoff(serializeMobileProjectHandoff({
      ...imported.project, updatedAt: 400, serializedProject: serializeSceneProject(edited),
    }));
    expect(returned).toMatchObject({ ok: true, value: {
      projectId: goldenDesktopScene.id,
      baseRevision: preview.preview.manifest.projectRevision,
      project: { scene: { surfaces: expect.arrayContaining([expect.objectContaining({ id: "explicit", expression: "sin(x)-y" })]) } },
    } });
    if (returned.ok) expect(returned.value.projectRevision).not.toBe(returned.value.baseRevision);
  });

  it("migrates scene-project v1, rejects future project/object envelopes and corrupt hashes", () => {
    expect(deserializeProjectHandoff(serializeSceneProject(goldenDesktopProject))).toMatchObject({ ok: true, value: { baseRevision: null } });
    expect(importMobileSceneProject(serializeSceneProject(goldenDesktopProject), [], 300).ok).toBe(true);
    const future = JSON.parse(desktop());
    future.version = 2;
    expect(deserializeProjectHandoff(JSON.stringify(future)).ok).toBe(false);
    const corrupt = JSON.parse(desktop());
    corrupt.project.scene.surfaces[0].expression = "tampered";
    expect(deserializeProjectHandoff(JSON.stringify(corrupt)).ok).toBe(false);
    const futureProject = JSON.parse(serializeSceneProject(goldenDesktopProject));
    futureProject.version = 2;
    expect(deserializeProjectHandoff(JSON.stringify(futureProject)).ok).toBe(false);
  });

  it("flags mesh-only loss and unsupported capabilities before any write", () => {
    const project = createSceneProjectDocument(goldenMeshOnlyScene);
    const serialized = desktop(project);
    const projects: never[] = [];
    const preview = inspectMobileProjectHandoff(serialized, "mesh.handoff.json", projects);
    expect(preview).toMatchObject({ ok: true, preview: { unsupported: ["surface.mesh"] } });
    // Dismissing a preview has no persistence side effect.
    expect(projects).toEqual([]);
  });

  it("does not write on divergent replace or failed storage; copy remaps identity", async () => {
    const original = importMobileSceneProject(serializeSceneProject(goldenDesktopProject), [], 300);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const current = { ...original.project, serializedProject: serializeSceneProject({
      ...goldenDesktopProject, scene: { ...goldenDesktopScene, updatedAt: 350 },
    }) };
    const incoming = desktop({ ...goldenDesktopProject, scene: { ...goldenDesktopScene, updatedAt: 400 } }, sceneProjectRevision(goldenDesktopProject));
    const inspected = inspectMobileProjectHandoff(incoming, "diverged.json", [current]);
    expect(inspected).toMatchObject({ ok: true, preview: { diverged: true, canReplace: false } });
    if (!inspected.ok) return;
    const save = vi.fn(async () => {});
    expect(await commitMobileProjectHandoff(inspected.preview, "replace", [current], save)).toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
    const copied = await commitMobileProjectHandoff(inspected.preview, "copy", [current], save, 500);
    expect(copied).toMatchObject({ ok: true, project: { id: "golden-project-import" } });
    expect(save).toHaveBeenCalledTimes(1);
    expect(await commitMobileProjectHandoff(inspected.preview, "copy", [current], async () => { throw new Error("disk full"); })).toMatchObject({ ok: false, error: "disk full" });
  });
});
