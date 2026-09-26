import {
  deserializeSceneProject,
  serializeSceneProject,
  validateSceneObjectEnvelope,
  type SceneDocument,
  type SurfaceDefinition,
} from "@math3d/core";
import type { Math3DExample, MobileStoredSceneProject } from "./mobileScene";
import { createUniqueMobileSceneObjectId } from "./mobileSceneObjectOperations";
import {
  addMobileSceneObjectImportToScene,
  type MobileImportedObjectPresentation,
  type MobileSceneObjectImportPreview,
} from "./mobileSceneObjectImport";
import { createMobilePrimitiveSurface, type MobilePrimitiveKind } from "./mobileSurfaceCreation";
import type { MobileMeshImportPreview } from "./mobileMeshImport";
import type { MobileMeshPayload } from "../viewer/mobileSurfacePreview";
import { addMobileProjectCompositionToScene, type MobileProjectCompositionPreview } from "./mobileProjectComposition";

export type MobileWorkspaceAddRequest =
  | { route: "primitive"; primitive: MobilePrimitiveKind }
  | { route: "surface"; surface: SurfaceDefinition }
  | { route: "preset"; example: Math3DExample }
  | { route: "example"; example: Math3DExample }
  | { route: "math3d-object"; preview: MobileSceneObjectImportPreview }
  | { route: "mesh"; preview: MobileMeshImportPreview }
  | { route: "objects-from-project"; preview: MobileProjectCompositionPreview };

export const MOBILE_WORKSPACE_ADD_GROUPS = [
  { id: "create", label: "Create", routes: ["primitive", "surface"] },
  { id: "import", label: "Import", routes: ["mesh", "math3d-object", "objects-from-project"] },
  { id: "explore", label: "Explore", routes: ["preset", "example"] },
  { id: "connect", label: "Connect", routes: ["desktop"] },
] as const;

export const mobileWorkspaceAddLayout = (width: number) => ({
  columns: width >= 600 ? 2 : 1,
  optionWidth: width >= 600 ? "48.5%" as const : "100%" as const,
  maxPanelHeight: width < 360 ? 300 : 360,
  minTouchHeight: 48,
});

export type MobileWorkspaceAddPlan = {
  ok: true;
  project: MobileStoredSceneProject;
  previousProject: MobileStoredSceneProject;
  scene: SceneDocument;
  addedObjectIds: string[];
  importedPresentationById: Record<string, MobileImportedObjectPresentation>;
  importedMeshById: Record<string, MobileMeshPayload>;
  message: string;
};

export type MobileWorkspaceAddCommitResult =
  | (MobileWorkspaceAddPlan & { projects: MobileStoredSceneProject[] })
  | { ok: false; error: string };

const appendSurfaces = (
  scene: SceneDocument,
  surfaces: readonly SurfaceDefinition[],
  now: number
): { scene: SceneDocument; addedObjectIds: string[] } => {
  let nextScene = scene;
  const addedObjectIds: string[] = [];
  for (const source of surfaces) {
    const id = createUniqueMobileSceneObjectId(nextScene, source.id);
    const surface = { ...source, id } as SurfaceDefinition;
    nextScene = {
      ...nextScene,
      surfaces: [...(nextScene.surfaces ?? []), surface],
      updatedAt: now,
    };
    addedObjectIds.push(id);
  }
  return { scene: nextScene, addedObjectIds };
};

export const planMobileWorkspaceAdd = (
  activeProject: MobileStoredSceneProject,
  activeScene: SceneDocument,
  request: MobileWorkspaceAddRequest,
  now = Date.now()
): MobileWorkspaceAddPlan | { ok: false; error: string } => {
  const parsed = deserializeSceneProject(activeProject.serializedProject);
  if (!parsed.ok) return { ok: false, error: `The active project is invalid: ${parsed.errors.join("; ")}` };
  if (activeScene.id !== activeProject.id || activeScene.title !== activeProject.title) {
    return { ok: false, error: "The open Workspace scene does not match the active saved project." };
  }

  if (request.route === "objects-from-project") {
    try {
      const composed = addMobileProjectCompositionToScene(activeScene, request.preview, now);
      const previousProject: MobileStoredSceneProject = {
        ...activeProject,
        updatedAt: activeScene.updatedAt,
        serializedProject: serializeSceneProject({ ...parsed.value, scene: activeScene }),
      };
      const project: MobileStoredSceneProject = {
        ...activeProject,
        updatedAt: now,
        lastOpenedAt: now,
        serializedProject: serializeSceneProject({ ...parsed.value, scene: composed.scene }),
      };
      return {
        ok: true,
        project,
        previousProject,
        scene: composed.scene,
        addedObjectIds: composed.addedObjectIds,
        importedPresentationById: composed.presentations,
        importedMeshById: composed.meshes,
        message: `Added ${composed.addedObjectIds.length} object${composed.addedObjectIds.length === 1 ? "" : "s"} from ${request.preview.source.projectTitle} to ${activeProject.title}.`,
      };
    } catch (error) {
      return { ok: false, error: String((error as Error).message ?? error) };
    }
  }

  const sources = request.route === "primitive"
    ? [createMobilePrimitiveSurface(request.primitive, activeScene)]
    : request.route === "surface"
      ? [request.surface]
      : request.route === "math3d-object" || request.route === "mesh"
        ? []
      : request.example.scene.surfaces ?? [];
  if (request.route === "math3d-object" || request.route === "mesh") {
    const transferPreview = request.route === "mesh" ? request.preview.transferPreview : request.preview;
    const validated = validateSceneObjectEnvelope(transferPreview.envelope);
    if (!validated.ok) return { ok: false, error: `The selected object is no longer valid: ${validated.errors.join("; ")}` };
    if (request.route === "math3d-object" && validated.value.object.kind === "mesh") {
      return { ok: false, error: "Mesh scene objects use the bounded mesh importer introduced in MOB60." };
    }
    if (request.route === "mesh" && validated.value.object.kind !== "mesh") {
      return { ok: false, error: "The selected mesh preview no longer contains a mesh object." };
    }
    const imported = addMobileSceneObjectImportToScene(
      activeScene,
      { ...transferPreview, envelope: validated.value },
      now
    );
    const previousProject: MobileStoredSceneProject = {
      ...activeProject,
      updatedAt: activeScene.updatedAt,
      serializedProject: serializeSceneProject({ ...parsed.value, scene: activeScene }),
    };
    const project: MobileStoredSceneProject = {
      ...activeProject,
      updatedAt: now,
      lastOpenedAt: now,
      serializedProject: serializeSceneProject({ ...parsed.value, scene: imported.scene }),
    };
    return {
      ok: true,
      project,
      previousProject,
      scene: imported.scene,
      addedObjectIds: [imported.objectId],
      importedPresentationById: { [imported.objectId]: imported.presentation },
      importedMeshById: request.route === "mesh" ? { [imported.objectId]: request.preview.mesh } : {},
      message: `Imported ${imported.objectId} from ${transferPreview.sourceName} into ${activeProject.title}.`,
    };
  }
  if (sources.length === 0) return { ok: false, error: "The selected source contains no supported objects." };

  const appended = appendSurfaces(activeScene, sources, now);
  const previousProject: MobileStoredSceneProject = {
    ...activeProject,
    updatedAt: activeScene.updatedAt,
    serializedProject: serializeSceneProject({ ...parsed.value, scene: activeScene }),
  };
  const project: MobileStoredSceneProject = {
    ...activeProject,
    updatedAt: now,
    lastOpenedAt: now,
    serializedProject: serializeSceneProject({ ...parsed.value, scene: appended.scene }),
  };
  const label = request.route === "primitive"
    ? request.primitive
    : request.route === "surface"
      ? request.surface.id
      : request.example.title;
  return {
    ok: true,
    project,
    previousProject,
    scene: appended.scene,
    addedObjectIds: appended.addedObjectIds,
    importedPresentationById: {},
    importedMeshById: {},
    message: `Added ${label} to ${activeProject.title}.`,
  };
};

const replaceProject = (
  projects: readonly MobileStoredSceneProject[],
  project: MobileStoredSceneProject
): MobileStoredSceneProject[] => projects
  .map((candidate) => candidate.id === project.id ? project : candidate)
  .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);

export const commitMobileWorkspaceAdd = async (
  projects: readonly MobileStoredSceneProject[],
  activeProjectId: string | null,
  activeScene: SceneDocument | null,
  request: MobileWorkspaceAddRequest,
  save: (nextProjects: MobileStoredSceneProject[]) => Promise<void>,
  now = Date.now()
): Promise<MobileWorkspaceAddCommitResult> => {
  if (!activeProjectId || !activeScene) {
    return { ok: false, error: "Open or create a saved project before adding objects." };
  }
  const activeProject = projects.find((project) => project.id === activeProjectId);
  if (!activeProject) return { ok: false, error: "The active project is no longer in the project library." };
  const planned = planMobileWorkspaceAdd(activeProject, activeScene, request, now);
  if (!planned.ok) return planned;
  const nextProjects = replaceProject(projects, planned.project);
  try {
    await save(nextProjects);
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
  return { ...planned, projects: nextProjects };
};

export const restoreMobileWorkspaceAdd = async (
  projects: readonly MobileStoredSceneProject[],
  previousProject: MobileStoredSceneProject,
  save: (nextProjects: MobileStoredSceneProject[]) => Promise<void>
): Promise<{ ok: true; projects: MobileStoredSceneProject[]; scene: SceneDocument } | { ok: false; error: string }> => {
  if (!projects.some((project) => project.id === previousProject.id)) {
    return { ok: false, error: "The project for this undo action is no longer available." };
  }
  const parsed = deserializeSceneProject(previousProject.serializedProject);
  if (!parsed.ok) return { ok: false, error: `The undo snapshot is invalid: ${parsed.errors.join("; ")}` };
  const nextProjects = replaceProject(projects, previousProject);
  try {
    await save(nextProjects);
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
  return { ok: true, projects: nextProjects, scene: parsed.value.scene };
};
