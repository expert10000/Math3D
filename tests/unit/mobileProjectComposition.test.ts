import { describe, expect, it, vi } from "vitest";
import {
  createSceneObjectEnvelope,
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION,
  planMobileProjectComposition,
  prepareMobileProjectCompositionSource,
} from "../../apps/mobile/src/models/mobileProjectComposition";
import { addMobileSceneObjectImportToScene, readMobileImportedSceneObject } from "../../apps/mobile/src/models/mobileSceneObjectImport";
import { commitMobileWorkspaceAdd } from "../../apps/mobile/src/models/mobileWorkspaceAdd";

const destination: SceneDocument = {
  id: "destination", title: "Destination", createdAt: 1, updatedAt: 2,
  surfaces: [{ id: "alpha", kind: "explicit", expression: "x" }],
};
const stored = (scene: SceneDocument): MobileStoredSceneProject => ({
  id: scene.id, title: scene.title, updatedAt: scene.updatedAt, lastOpenedAt: 3,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
});
const beta = createSceneObjectEnvelope({
  producer: { name: "Math3D", version: "1.5.1", platform: "desktop" },
  object: {
    id: "beta", kind: "explicit", definition: { id: "beta", kind: "explicit", expression: "x+y" },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    visible: true, style: {},
  },
  geometry: null,
  provenance: { sourceFormat: "math3d.scene-project", sourceProjectId: "source", sourceObjectId: "beta", importedAt: null },
  analysisMetadata: { inputObjectId: "alpha" },
});
const baseSource: SceneDocument = {
  id: "source", title: "Source", createdAt: 1, updatedAt: 2,
  surfaces: [{ id: "alpha", kind: "explicit", expression: "x*x" }],
};
const withBeta = addMobileSceneObjectImportToScene(baseSource, {
  envelope: beta, sourceName: "beta.json", sourceVersion: 1, migrated: false,
  destinationObjectId: "beta", hasIdentityCollision: false, definitionSummary: "x+y",
  analysisMetadataKeys: ["inputObjectId"],
}, 2).scene;
const source: SceneDocument = {
  ...withBeta,
  extensions: {
    ...withBeta.extensions,
    [MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION]: [{
      fromObjectId: "beta", toObjectId: "alpha", relation: "analysis.input", referencePath: "/analysisMetadata/inputObjectId",
    }],
  },
};

describe("mobile add from project", () => {
  it("previews dependencies and collision names, then saves one atomic composition", async () => {
    const prepared = prepareMobileProjectCompositionSource(stored(source).serializedProject, "Source project", destination.id);
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    expect(prepared.source.objects).toMatchObject([
      { id: "alpha", compatible: true },
      { id: "beta", compatible: true, dependencies: ["alpha"] },
    ]);
    expect(planMobileProjectComposition(prepared.source, ["beta"], destination, 100)).toMatchObject({
      ok: false, error: expect.stringContaining("alpha"),
    });
    const planned = planMobileProjectComposition(prepared.source, ["beta", "alpha"], destination, 100);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.preview.plan.idMap).toEqual({ alpha: "alpha-2", beta: "beta" });
    expect(planned.preview.estimatedBytes).toBeGreaterThan(0);
    const save = vi.fn(async (_projects: MobileStoredSceneProject[]) => undefined);
    const result = await commitMobileWorkspaceAdd(
      [stored(destination), stored(source)], destination.id, destination,
      { route: "objects-from-project", preview: planned.preview }, save, 100
    );
    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (!result.ok) return;
    expect(result.addedObjectIds).toEqual(["alpha-2", "beta"]);
    expect(result.projects.find((project) => project.id === source.id)).toEqual(stored(source));
    expect(result.scene.surfaces?.map((surface) => surface.id)).toEqual(["alpha", "alpha-2", "beta"]);
    expect(readMobileImportedSceneObject(result.scene, "beta")?.envelope.analysisMetadata.inputObjectId).toBe("alpha-2");
    expect(result.scene.extensions?.[MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION]).toMatchObject([
      { fromObjectId: "beta", toObjectId: "alpha-2" },
    ]);
    expect(deserializeSceneProject(result.project.serializedProject).ok).toBe(true);
  });

  it("rejects same project, malformed source, cancellation, and storage failure without mutation", async () => {
    expect(prepareMobileProjectCompositionSource(null, "file", destination.id)).toEqual({ status: "cancelled" });
    expect(prepareMobileProjectCompositionSource("{", "file", destination.id)).toMatchObject({ status: "error" });
    expect(prepareMobileProjectCompositionSource(stored(destination).serializedProject, "self", destination.id)).toMatchObject({ status: "error" });
    const prepared = prepareMobileProjectCompositionSource(stored(source).serializedProject, "source", destination.id);
    if (prepared.status !== "ready") throw new Error("Fixture is invalid");
    const planned = planMobileProjectComposition(prepared.source, ["alpha"], destination, 100);
    if (!planned.ok) throw new Error(planned.error);
    const failed = await commitMobileWorkspaceAdd(
      [stored(destination), stored(source)], destination.id, destination,
      { route: "objects-from-project", preview: planned.preview },
      async () => { throw new Error("storage full"); }, 100
    );
    expect(failed).toEqual({ ok: false, error: "storage full" });
    expect(destination.surfaces).toHaveLength(1);
    expect(destination.extensions).toBeUndefined();
  });
});
