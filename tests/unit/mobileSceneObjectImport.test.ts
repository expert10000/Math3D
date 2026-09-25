import { describe, expect, it, vi } from "vitest";
import {
  createSceneObjectEnvelope,
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneObjectEnvelope,
  serializeSceneProject,
  type SceneDocument,
  type SceneObjectEnvelopeInput,
} from "@math3d/core";
import futureVersion from "../../packages/core/fixtures/scene-object/invalid-future-version.json";
import legacyExplicit from "../../packages/core/fixtures/scene-object/legacy-explicit-v0.json";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";
import {
  MOBILE_SCENE_OBJECT_IMPORTS_EXTENSION,
  prepareMobileSceneObjectImport,
  readMobileImportedObjectPresentations,
  readMobileImportedSceneObject,
} from "../../apps/mobile/src/models/mobileSceneObjectImport";
import { commitMobileWorkspaceAdd } from "../../apps/mobile/src/models/mobileWorkspaceAdd";

const scene: SceneDocument = {
  id: "project-1",
  title: "Import destination",
  createdAt: 1,
  updatedAt: 2,
  surfaces: [{ id: "saddle", kind: "explicit", expression: "x+y" }],
};

const project: MobileStoredSceneProject = {
  id: scene.id,
  title: scene.title,
  updatedAt: scene.updatedAt,
  lastOpenedAt: 3,
  serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
};

const envelopeInput: SceneObjectEnvelopeInput = {
  producer: { name: "Math3D Desktop", version: "1.5.1", platform: "desktop" },
  object: {
    id: "saddle",
    kind: "explicit",
    definition: {
      id: "saddle",
      kind: "explicit",
      expression: "sin(x)*cos(y)",
      domain: { xSpan: 7, ySpan: 5 },
      resolution: 96,
    },
    transform: {
      position: { x: 2, y: -1, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 1.5, y: 0.75, z: 2 },
    },
    visible: false,
    style: { color: "#3366cc", opacity: 0.4, wireframe: true },
  },
  geometry: null,
  provenance: {
    sourceFormat: "math3d.scene-project",
    sourceProjectId: "desktop-project",
    sourceObjectId: "saddle",
    importedAt: 123,
  },
  analysisMetadata: { compatible: true, analysisKind: "curvature", sampleCount: 2048 },
};

describe("mobile semantic scene-object import", () => {
  it("previews and atomically imports editable semantics with collision-safe identity", async () => {
    const envelope = createSceneObjectEnvelope(envelopeInput);
    const prepared = prepareMobileSceneObjectImport(
      serializeSceneObjectEnvelope(envelope),
      "saddle.math3d.object.json",
      scene
    );
    expect(prepared).toMatchObject({
      status: "ready",
      preview: {
        destinationObjectId: "saddle-2",
        hasIdentityCollision: true,
        sourceVersion: 1,
        migrated: false,
        analysisMetadataKeys: ["analysisKind", "compatible", "sampleCount"],
      },
    });
    if (prepared.status !== "ready") return;

    const save = vi.fn(async () => undefined);
    const result = await commitMobileWorkspaceAdd(
      [project], project.id, scene, { route: "math3d-object", preview: prepared.preview }, save, 500
    );
    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    if (!result.ok) return;
    expect(result.addedObjectIds).toEqual(["saddle-2"]);
    expect(result.scene.surfaces?.at(-1)).toEqual({
      id: "saddle-2",
      kind: "explicit",
      expression: "sin(x)*cos(y)",
      domain: { xSpan: 7, ySpan: 5 },
      resolution: 96,
    });
    expect(result.importedPresentationById["saddle-2"]).toMatchObject({
      visible: false,
      opacity: 0.4,
      color: "#3366cc",
      transform: envelope.object.transform,
    });

    const storedRecord = readMobileImportedSceneObject(result.scene, "saddle-2");
    expect(storedRecord).toMatchObject({
      importedAt: 500,
      sourceName: "saddle.math3d.object.json",
      envelope: {
        contentHash: envelope.contentHash,
        object: { id: "saddle", transform: envelope.object.transform, style: envelope.object.style },
        provenance: envelope.provenance,
        analysisMetadata: envelope.analysisMetadata,
      },
    });
    expect(readMobileImportedObjectPresentations(result.scene)["saddle-2"]).toMatchObject({ visible: false, opacity: 0.4 });
    expect(result.scene.extensions?.[MOBILE_SCENE_OBJECT_IMPORTS_EXTENSION]).toBeDefined();
    const reopened = deserializeSceneProject(result.project.serializedProject);
    expect(reopened).toMatchObject({ ok: true });
    if (reopened.ok) {
      expect(readMobileImportedSceneObject(reopened.value.scene, "saddle-2")?.envelope.contentHash).toBe(envelope.contentHash);
      expect(readMobileImportedObjectPresentations(reopened.value.scene)["saddle-2"]).toMatchObject({ visible: false, opacity: 0.4 });
    }
  });

  it("migrates a supported legacy semantic object before preview", () => {
    const prepared = prepareMobileSceneObjectImport(JSON.stringify(legacyExplicit), "legacy.json", scene);
    expect(prepared).toMatchObject({
      status: "ready",
      preview: { migrated: true, sourceVersion: 0, envelope: { version: 1 } },
    });
  });

  it("rejects malformed, future-version, oversized, and mesh-only inputs before persistence", () => {
    expect(prepareMobileSceneObjectImport("{", "broken.json", scene)).toMatchObject({ status: "error", error: expect.stringContaining("Invalid JSON") });
    expect(prepareMobileSceneObjectImport(JSON.stringify(futureVersion), "future.json", scene)).toMatchObject({ status: "error", error: expect.stringContaining("version") });
    expect(prepareMobileSceneObjectImport("0123456789", "large.json", scene, 4)).toMatchObject({ status: "error", error: expect.stringContaining("larger") });

    const mesh = createSceneObjectEnvelope({
      ...envelopeInput,
      object: {
        ...envelopeInput.object,
        id: "mesh",
        kind: "mesh",
        definition: { id: "mesh", kind: "mesh", source: "math3d-object:embedded" },
      },
      geometry: { kind: "embedded-mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    });
    expect(prepareMobileSceneObjectImport(serializeSceneObjectEnvelope(mesh), "mesh.json", scene)).toMatchObject({
      status: "error",
      error: expect.stringContaining("MOB60"),
    });
  });

  it("treats picker cancellation as a no-op and returns no preview", () => {
    expect(prepareMobileSceneObjectImport(null, "cancelled", scene)).toEqual({ status: "cancelled" });
  });

  it("returns a failed commit without exposing a partially mutated project", async () => {
    const prepared = prepareMobileSceneObjectImport(
      serializeSceneObjectEnvelope(createSceneObjectEnvelope(envelopeInput)),
      "saddle.json",
      { ...scene, surfaces: [] }
    );
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;
    const result = await commitMobileWorkspaceAdd(
      [project],
      project.id,
      scene,
      { route: "math3d-object", preview: prepared.preview },
      async () => { throw new Error("storage unavailable"); },
      500
    );
    expect(result).toEqual({ ok: false, error: "storage unavailable" });
    expect(scene.surfaces).toHaveLength(1);
    expect(scene.extensions).toBeUndefined();
  });
});
