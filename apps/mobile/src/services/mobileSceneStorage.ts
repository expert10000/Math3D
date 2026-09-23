import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import { Directory, File, Paths } from "expo-file-system";
import type { MobileSceneSummary, MobileStoredSceneProject } from "../models/mobileScene";

export const MOBILE_SCENE_STORAGE_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const STORAGE_FILE_NAME = "scene-projects.json";
const STORAGE_TEMP_FILE_NAME = "scene-projects.tmp";
const STORAGE_BACKUP_FILE_NAME = "scene-projects.backup.json";
const STORAGE_BACKUP_TEMP_FILE_NAME = "scene-projects.backup.tmp";

type PersistedPayload = {
  schemaVersion: number;
  projects: MobileStoredSceneProject[];
};

export type MobileSceneStorageSource = "empty" | "primary" | "backup" | "invalid";

export type MobileSceneStorageLoad = {
  projects: MobileStoredSceneProject[];
  issues: string[];
  source: MobileSceneStorageSource;
};

type DecodedPayload = {
  ok: true;
  projects: MobileStoredSceneProject[];
  migrated: boolean;
} | {
  ok: false;
  issues: string[];
};

export type MobileSceneStorageErrorCode = "storage-full" | "validation" | "write-failed";

export class MobileSceneStorageError extends Error {
  readonly code: MobileSceneStorageErrorCode;

  constructor(code: MobileSceneStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MobileSceneStorageError";
    this.code = code;
  }
}

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const storageFile = () => new File(storageDirectory, STORAGE_FILE_NAME);
const storageTempFile = () => new File(storageDirectory, STORAGE_TEMP_FILE_NAME);
const storageBackupFile = () => new File(storageDirectory, STORAGE_BACKUP_FILE_NAME);
const storageBackupTempFile = () => new File(storageDirectory, STORAGE_BACKUP_TEMP_FILE_NAME);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const ensureStorageDirectory = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
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
  if (parsed.value.scene.id !== value.id) {
    issues.push(`projects[${index}].id does not match its scene id.`);
    return null;
  }
  if (parsed.value.scene.title !== value.title) {
    issues.push(`projects[${index}].title does not match its scene title.`);
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

export const decodeMobileSceneStorage = (raw: string): DecodedPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, issues: [`Storage JSON parse failed: ${String((error as Error).message ?? error)}`] };
  }

  let projectList: unknown;
  let migrated = false;
  if (Array.isArray(parsed)) {
    projectList = parsed;
    migrated = true;
  } else if (parsed && typeof parsed === "object") {
    const payload = parsed as Partial<PersistedPayload>;
    if (payload.schemaVersion === undefined || payload.schemaVersion === 0) {
      projectList = payload.projects;
      migrated = true;
    } else if (payload.schemaVersion === MOBILE_SCENE_STORAGE_SCHEMA_VERSION) {
      projectList = payload.projects;
    } else {
      return {
        ok: false,
        issues: [
          `Unsupported project storage schema ${String(payload.schemaVersion)}. Expected ${MOBILE_SCENE_STORAGE_SCHEMA_VERSION}.`,
        ],
      };
    }
  } else {
    return { ok: false, issues: ["Storage payload must be an object or legacy project array."] };
  }

  if (!Array.isArray(projectList)) {
    return { ok: false, issues: ["Storage projects must be an array."] };
  }

  const issues: string[] = [];
  const projects: MobileStoredSceneProject[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < projectList.length; index += 1) {
    const normalized = normalizeStoredProject(projectList[index], index, issues);
    if (!normalized) continue;
    if (ids.has(normalized.id)) {
      issues.push(`projects[${index}].id duplicates '${normalized.id}'.`);
      continue;
    }
    ids.add(normalized.id);
    projects.push(normalized);
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    projects: projects.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    migrated,
  };
};

export const resolveMobileSceneStorage = (
  primaryRaw: string | null,
  backupRaw: string | null
): MobileSceneStorageLoad & { rewritePrimary: boolean } => {
  const primaryEmpty = primaryRaw === null || primaryRaw.trim().length === 0;
  if (!primaryEmpty) {
    const primary = decodeMobileSceneStorage(primaryRaw);
    if (primary.ok) {
      return {
        projects: primary.projects,
        issues: [],
        source: "primary",
        rewritePrimary: primary.migrated,
      };
    }

    if (backupRaw && backupRaw.trim()) {
      const backup = decodeMobileSceneStorage(backupRaw);
      if (backup.ok) {
        return {
          projects: backup.projects,
          issues: ["Project storage was damaged and recovered from the last valid backup.", ...primary.issues],
          source: "backup",
          rewritePrimary: true,
        };
      }
      return {
        projects: [],
        issues: ["Project storage and its backup are both invalid.", ...primary.issues, ...backup.issues],
        source: "invalid",
        rewritePrimary: false,
      };
    }

    return {
      projects: [],
      issues: ["Project storage is invalid and no valid backup is available.", ...primary.issues],
      source: "invalid",
      rewritePrimary: false,
    };
  }

  if (backupRaw && backupRaw.trim()) {
    const backup = decodeMobileSceneStorage(backupRaw);
    if (backup.ok) {
      return {
        projects: backup.projects,
        issues: ["Project storage was interrupted and recovered from the last valid backup."],
        source: "backup",
        rewritePrimary: true,
      };
    }
    return {
      projects: [],
      issues: ["The project backup is invalid and could not be recovered.", ...backup.issues],
      source: "invalid",
      rewritePrimary: false,
    };
  }

  return { projects: [], issues: [], source: "empty", rewritePrimary: false };
};

const isStorageFullError = (error: unknown): boolean => {
  const message = String((error as Error)?.message ?? error).toLowerCase();
  return message.includes("enospc") || message.includes("no space left") || message.includes("disk full") ||
    message.includes("storage full") || message.includes("quota exceeded");
};

export const describeMobileSceneStorageError = (error: unknown): string => {
  if ((error instanceof MobileSceneStorageError && error.code === "storage-full") || isStorageFullError(error)) {
    return "Device storage is full. Free space and try again; existing projects were kept.";
  }
  if (error instanceof MobileSceneStorageError && error.code === "validation") {
    return "Project data failed validation. Existing projects were kept.";
  }
  return "Projects could not be saved. Existing projects were kept; try again.";
};

const encodeProjects = (projects: MobileStoredSceneProject[]): string => {
  const raw = JSON.stringify({ schemaVersion: MOBILE_SCENE_STORAGE_SCHEMA_VERSION, projects } satisfies PersistedPayload, null, 2);
  const validation = decodeMobileSceneStorage(raw);
  if (!validation.ok) {
    throw new MobileSceneStorageError("validation", validation.issues.join(" "));
  }
  return raw;
};

const readFile = async (file: File): Promise<string | null> => file.exists ? file.text() : null;

const removeIfPresent = (file: File) => {
  if (file.exists) file.delete();
};

const writeProjectsAtomically = async (projects: MobileStoredSceneProject[]): Promise<void> => {
  ensureStorageDirectory();
  const primary = storageFile();
  const staged = storageTempFile();
  const backup = storageBackupFile();
  const stagedBackup = storageBackupTempFile();
  const raw = encodeProjects(projects);
  let backupCommitted = false;

  try {
    removeIfPresent(staged);
    staged.create({ intermediates: true, overwrite: true });
    staged.write(raw, { encoding: "utf8" });
    const stagedValidation = decodeMobileSceneStorage(await staged.text());
    if (!stagedValidation.ok) {
      throw new MobileSceneStorageError("validation", `Temporary project file failed validation: ${stagedValidation.issues.join(" ")}`);
    }

    const replaceBackupFrom = async (source: File) => {
      removeIfPresent(stagedBackup);
      source.copy(stagedBackup);
      const backupValidation = decodeMobileSceneStorage(await stagedBackup.text());
      if (!backupValidation.ok) {
        throw new MobileSceneStorageError("validation", "Temporary project backup failed validation.");
      }
      removeIfPresent(backup);
      stagedBackup.move(backup);
      backupCommitted = true;
    };

    const primaryRaw = await readFile(primary);
    const primaryValidation = primaryRaw?.trim() ? decodeMobileSceneStorage(primaryRaw) : null;
    if (primaryValidation?.ok) {
      await replaceBackupFrom(primary);
    } else {
      const backupRaw = await readFile(backup);
      const backupValidation = backupRaw?.trim() ? decodeMobileSceneStorage(backupRaw) : null;
      if (!backupValidation?.ok) await replaceBackupFrom(staged);
    }

    removeIfPresent(primary);
    staged.move(primary);
  } catch (error) {
    removeIfPresent(staged);
    if (!backupCommitted) removeIfPresent(stagedBackup);
    if (!primary.exists && backup.exists) {
      try {
        backup.copy(primary);
      } catch {
        // The valid backup remains available for recovery on the next launch.
      }
    }
    if (error instanceof MobileSceneStorageError) throw error;
    const code: MobileSceneStorageErrorCode = isStorageFullError(error) ? "storage-full" : "write-failed";
    throw new MobileSceneStorageError(code, String((error as Error)?.message ?? error), { cause: error });
  }
};

let saveQueue: Promise<void> = Promise.resolve();

export const loadStoredSceneProjects = async (): Promise<MobileSceneStorageLoad> => {
  try {
    ensureStorageDirectory();
    const resolved = resolveMobileSceneStorage(
      await readFile(storageFile()),
      await readFile(storageBackupFile())
    );

    if (resolved.rewritePrimary) {
      try {
        await writeProjectsAtomically(resolved.projects);
      } catch (error) {
        resolved.issues.push(`Recovery loaded projects but could not repair the primary file: ${describeMobileSceneStorageError(error)}`);
      }
    }

    return { projects: resolved.projects, issues: resolved.issues, source: resolved.source };
  } catch (error) {
    return {
      projects: [],
      issues: [`Failed to load project storage: ${String((error as Error).message ?? error)}`],
      source: "invalid",
    };
  }
};

export const saveStoredSceneProjects = (projects: MobileStoredSceneProject[]): Promise<void> => {
  const pending = saveQueue.then(() => writeProjectsAtomically(projects));
  saveQueue = pending.catch(() => undefined);
  return pending;
};

export const clearStoredSceneProjects = async (): Promise<void> => {
  await saveStoredSceneProjects([]);
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
