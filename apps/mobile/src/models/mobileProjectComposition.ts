import {
  deserializeSceneProject,
  planSceneObjectComposition,
  serializeSceneObjectEnvelope,
  type SceneDocument,
  type SceneObjectDependency,
  type SceneObjectEnvelope,
  type SceneObjectCompositionPlan,
} from "@math3d/core";
import { createMobileSemanticObjectEnvelope } from "./mobileObjectExport";
import {
  addMobileSceneObjectImportToScene,
  readMobileImportedObjectMeshes,
  readMobileImportedSceneObject,
  type MobileImportedObjectPresentation,
} from "./mobileSceneObjectImport";
import type { MobileMeshPayload } from "../viewer/mobileSurfacePreview";

export const MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION = "math3d.scene-object.dependencies.v1";

export type MobileProjectSourceObject = Readonly<{
  id: string;
  kind: string;
  compatible: boolean;
  reason: string | null;
  bytes: number;
  dependencies: readonly string[];
}>;

export type MobileProjectCompositionSource = Readonly<{
  serializedProject: string;
  sourceName: string;
  projectId: string;
  projectTitle: string;
  objects: readonly MobileProjectSourceObject[];
  dependencies: readonly SceneObjectDependency[];
}>;

export type MobileProjectCompositionPreview = Readonly<{
  source: MobileProjectCompositionSource;
  selectedObjectIds: readonly string[];
  plan: SceneObjectCompositionPlan;
  estimatedBytes: number;
}>;

export type MobileProjectCompositionPreparation =
  | { status: "ready"; source: MobileProjectCompositionSource }
  | { status: "cancelled" }
  | { status: "error"; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readDependencies = (scene: SceneDocument): readonly SceneObjectDependency[] => {
  const value = scene.extensions?.[MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4096) throw new Error("The source project has invalid object dependencies.");
  return value.map((entry, index) => {
    if (!isRecord(entry) || Object.keys(entry).sort().join(",") !== "fromObjectId,referencePath,relation,toObjectId" ||
        typeof entry.fromObjectId !== "string" || typeof entry.toObjectId !== "string" ||
        typeof entry.relation !== "string" || !(entry.referencePath === null || typeof entry.referencePath === "string")) {
      throw new Error(`Object dependency ${index + 1} is invalid.`);
    }
    return entry as SceneObjectDependency;
  });
};

const sourceEnvelope = (scene: SceneDocument, id: string): SceneObjectEnvelope => {
  const imported = readMobileImportedSceneObject(scene, id);
  const visible = imported?.envelope.object.visible ?? true;
  const opacity = imported?.envelope.object.style.opacity;
  return createMobileSemanticObjectEnvelope({ scene, objectId: id, visible, opacity });
};

export const prepareMobileProjectCompositionSource = (
  serializedProject: string | null,
  sourceName: string,
  destinationProjectId: string
): MobileProjectCompositionPreparation => {
  if (serializedProject === null) return { status: "cancelled" };
  const parsed = deserializeSceneProject(serializedProject);
  if (!parsed.ok) return { status: "error", error: `Invalid Math3D project: ${parsed.errors.join("; ")}` };
  const scene = parsed.value.scene;
  if (scene.id === destinationProjectId) return { status: "error", error: "Choose another project as the source." };
  try {
    const dependencies = readDependencies(scene);
    const ids = new Set((scene.surfaces ?? []).map((surface) => surface.id));
    if (ids.size !== (scene.surfaces ?? []).length) throw new Error("The source project has duplicate object IDs.");
    for (const dependency of dependencies) {
      if (!ids.has(dependency.fromObjectId) || !ids.has(dependency.toObjectId)) {
        throw new Error(`The source project has a dangling dependency from ${dependency.fromObjectId} to ${dependency.toObjectId}.`);
      }
    }
    const objects = (scene.surfaces ?? []).map((surface): MobileProjectSourceObject => {
      const objectDependencies = dependencies.filter((entry) => entry.fromObjectId === surface.id).map((entry) => entry.toObjectId);
      try {
        const envelope = sourceEnvelope(scene, surface.id);
        return {
          id: surface.id,
          kind: surface.kind,
          compatible: true,
          reason: null,
          bytes: new TextEncoder().encode(serializeSceneObjectEnvelope(envelope)).byteLength,
          dependencies: objectDependencies,
        };
      } catch (error) {
        return {
          id: surface.id,
          kind: surface.kind,
          compatible: false,
          reason: String((error as Error).message ?? error),
          bytes: 0,
          dependencies: objectDependencies,
        };
      }
    });
    if (objects.length === 0) return { status: "error", error: "The source project contains no surface objects to add." };
    return { status: "ready", source: {
      serializedProject,
      sourceName: sourceName.trim().slice(0, 240) || scene.title,
      projectId: scene.id,
      projectTitle: scene.title,
      objects,
      dependencies,
    } };
  } catch (error) {
    return { status: "error", error: String((error as Error).message ?? error) };
  }
};

export const planMobileProjectComposition = (
  source: MobileProjectCompositionSource,
  selectedObjectIds: readonly string[],
  destinationScene: SceneDocument,
  now = Date.now()
): { ok: true; preview: MobileProjectCompositionPreview } | { ok: false; error: string } => {
  const parsed = deserializeSceneProject(source.serializedProject);
  if (!parsed.ok || parsed.value.scene.id !== source.projectId) return { ok: false, error: "The source project changed or is invalid." };
  if (source.projectId === destinationScene.id) return { ok: false, error: "Choose another project as the source." };
  const selected = new Set(selectedObjectIds);
  if (selected.size === 0) return { ok: false, error: "Select at least one object." };
  if (selected.size !== selectedObjectIds.length) return { ok: false, error: "The object selection contains duplicate IDs." };
  const objects: SceneObjectEnvelope[] = [];
  for (const id of selected) {
    const item = source.objects.find((candidate) => candidate.id === id);
    if (!item || !item.compatible) return { ok: false, error: `${id} is not compatible with mobile project composition.` };
    try { objects.push(sourceEnvelope(parsed.value.scene, id)); }
    catch (error) { return { ok: false, error: `${id}: ${String((error as Error).message ?? error)}` }; }
  }
  const missing = source.dependencies.filter((entry) => selected.has(entry.fromObjectId) && !selected.has(entry.toObjectId));
  if (missing.length > 0) return { ok: false, error: `Also select required object${missing.length === 1 ? "" : "s"}: ${[...new Set(missing.map((entry) => entry.toObjectId))].join(", ")}.` };
  const planned = planSceneObjectComposition({
    sourceFormat: "math3d.scene-project",
    sourceProjectId: source.projectId,
    objects,
    dependencies: source.dependencies.filter((entry) => selected.has(entry.fromObjectId)),
  }, {
    destinationObjectIds: (destinationScene.surfaces ?? []).map((surface) => surface.id),
    importedAt: now,
  });
  if (!planned.ok) return { ok: false, error: planned.errors.join("; ") };
  return { ok: true, preview: {
    source,
    selectedObjectIds: [...selected].sort(),
    plan: planned.plan,
    estimatedBytes: planned.plan.objects.reduce((total, object) => total + new TextEncoder().encode(serializeSceneObjectEnvelope(object)).byteLength, 0),
  } };
};

export const addMobileProjectCompositionToScene = (
  destinationScene: SceneDocument,
  preview: MobileProjectCompositionPreview,
  now: number
): { scene: SceneDocument; addedObjectIds: string[]; presentations: Record<string, MobileImportedObjectPresentation>; meshes: Record<string, MobileMeshPayload> } => {
  const replanned = planMobileProjectComposition(preview.source, preview.selectedObjectIds, destinationScene, now);
  if (!replanned.ok) throw new Error(replanned.error);
  let scene = destinationScene;
  const addedObjectIds: string[] = [];
  const presentations: Record<string, MobileImportedObjectPresentation> = {};
  for (const envelope of replanned.preview.plan.objects) {
    const imported = addMobileSceneObjectImportToScene(scene, {
      envelope,
      sourceName: preview.source.sourceName,
      sourceVersion: envelope.version,
      migrated: false,
      destinationObjectId: envelope.object.id,
      hasIdentityCollision: false,
      definitionSummary: envelope.object.kind,
      analysisMetadataKeys: Object.keys(envelope.analysisMetadata),
    }, now);
    if (imported.objectId !== envelope.object.id) throw new Error("Object identity changed during composition.");
    scene = imported.scene;
    addedObjectIds.push(imported.objectId);
    presentations[imported.objectId] = imported.presentation;
  }
  scene = {
    ...scene,
    extensions: {
      ...(scene.extensions ?? {}),
      [MOBILE_PROJECT_OBJECT_DEPENDENCIES_EXTENSION]: [
        ...readDependencies(destinationScene),
        ...replanned.preview.plan.dependencies,
      ],
    },
  };
  const allMeshes = readMobileImportedObjectMeshes(scene);
  return { scene, addedObjectIds, presentations, meshes: Object.fromEntries(
    addedObjectIds.flatMap((id) => allMeshes[id] ? [[id, allMeshes[id]]] : [])
  ) };
};
