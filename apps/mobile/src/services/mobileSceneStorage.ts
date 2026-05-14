import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import { Directory, File, Paths } from "expo-file-system";
import type { MobileSceneSummary, MobileStoredSceneProject } from "../models/mobileScene";

const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const STORAGE_FILE_NAME = "scene-projects.json";

type PersistedPayload = {
  schemaVersion: number;
  projects: MobileStoredSceneProject[];
};

export type MobileSceneStorageLoad = {
  projects: MobileStoredSceneProject[];
  issues: string[];
};

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const storageFile = new File(storageDirectory, STORAGE_FILE_NAME);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const ensureStorageLocation = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
  if (!storageFile.exists) {
    storageFile.create({ intermediates: true, overwrite: true });
  }
};

const normalizeStoredProject = (
  candidate: unknown,
  index: number,
  issues: string[]
): MobileStoredSceneProject | null => {
  if (!candidate || typeof candidate !== "object") {
    issues.push(`projects[${index}] must be an object.`);
    return null;
  }

  const value = candidate as Partial<MobileStoredSceneProject>;
  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push(`projects[${index}].id is required.`);
    return null;
  }
  if (typeof value.title !== "string" || value.title.length === 0) {
    issues.push(`projects[${index}].title is required.`);
    return null;
  }
  if (!isFiniteNumber(value.updatedAt)) {
    issues.push(`projects[${index}].updatedAt must be a finite number.`);
    return null;
  }
  if (!isFiniteNumber(value.lastOpenedAt)) {
    issues.push(`projects[${index}].lastOpenedAt must be a finite number.`);
    return null;
  }
  if (typeof value.serializedProject !== "string" || value.serializedProject.length === 0) {
    issues.push(`projects[${index}].serializedProject is required.`);
    return null;
  }

  const parsed = deserializeSceneProject(value.serializedProject);
  if (!parsed.ok) {
    issues.push(`projects[${index}] has invalid scene payload: ${parsed.errors.join("; ")}`);
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    lastOpenedAt: value.lastOpenedAt,
    serializedProject: value.serializedProject,
  };
};

export const loadStoredSceneProjects = async (): Promise<MobileSceneStorageLoad> => {
  try {
    ensureStorageLocation();

    if (!storageFile.exists) {
      return { projects: [], issues: [] };
    }

    const raw = await storageFile.text();
    if (!raw.trim()) {
      return { projects: [], issues: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        projects: [],
        issues: [`Storage JSON parse failed: ${String((error as Error).message ?? error)}`],
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return { projects: [], issues: ["Storage payload must be an object."] };
    }

    const payload = parsed as Partial<PersistedPayload>;
    const issues: string[] = [];
    if (payload.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      issues.push(
        `Storage schema mismatch: expected ${STORAGE_SCHEMA_VERSION}, got ${String(payload.schemaVersion ?? "unknown")}.`
      );
    }

    const projectList = Array.isArray(payload.projects) ? payload.projects : [];
    const projects: MobileStoredSceneProject[] = [];
    for (let i = 0; i < projectList.length; i += 1) {
      const normalized = normalizeStoredProject(projectList[i], i, issues);
      if (normalized) projects.push(normalized);
    }

    return {
      projects: projects.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
      issues,
    };
  } catch (error) {
    return {
      projects: [],
      issues: [`Failed to load scene storage: ${String((error as Error).message ?? error)}`],
    };
  }
};

export const saveStoredSceneProjects = async (projects: MobileStoredSceneProject[]): Promise<void> => {
  ensureStorageLocation();
  const payload: PersistedPayload = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    projects,
  };
  storageFile.write(JSON.stringify(payload, null, 2), { encoding: "utf8" });
};

export const createStoredProjectFromScene = (
  scene: SceneDocument,
  lastOpenedAt = Date.now()
): MobileStoredSceneProject => {
  const project = createSceneProjectDocument(scene);
  return {
    id: scene.id,
    title: scene.title,
    updatedAt: scene.updatedAt,
    lastOpenedAt,
    serializedProject: serializeSceneProject(project),
  };
};

export const readSceneFromStoredProject = (
  project: MobileStoredSceneProject
): { ok: true; scene: SceneDocument } | { ok: false; errors: string[] } => {
  const parsed = deserializeSceneProject(project.serializedProject);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors };
  }
  return { ok: true, scene: parsed.value.scene };
};

export const buildSceneSummary = (project: MobileStoredSceneProject): MobileSceneSummary => ({
  id: project.id,
  title: project.title,
  updatedAt: project.updatedAt,
  surfaceCount: (() => {
    const parsed = readSceneFromStoredProject(project);
    if (!parsed.ok) return 0;
    return parsed.scene.surfaces?.length ?? 0;
  })(),
});
