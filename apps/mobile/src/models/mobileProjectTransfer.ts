import { deserializeSceneProject, serializeSceneProject } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";

export const MOBILE_SCENE_EXPORT_EXTENSION = ".math3d.scene.json";

export type MobileProjectImportResult =
  | { ok: true; project: MobileStoredSceneProject }
  | { ok: false; error: string };

const nextAvailableValue = (base: string, existing: Set<string>, separator: string): string => {
  if (!existing.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (existing.has(`${base}${separator}${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base}${separator}${suffix}`;
};

const safeFileStem = (value: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "math3d-project";
};

export const createMobileProjectExportName = (project: MobileStoredSceneProject, now = new Date()): string => {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${safeFileStem(project.title)}-${timestamp}${MOBILE_SCENE_EXPORT_EXTENSION}`;
};

export const validateMobileProjectForTransfer = (
  project: MobileStoredSceneProject
): { ok: true; serializedProject: string } | { ok: false; error: string } => {
  const parsed = deserializeSceneProject(project.serializedProject);
  if (!parsed.ok) return { ok: false, error: `Project cannot be exported: ${parsed.errors.join("; ")}` };
  if (parsed.value.scene.id !== project.id || parsed.value.scene.title !== project.title) {
    return { ok: false, error: "Project cannot be exported because its scene identity is inconsistent." };
  }
  return { ok: true, serializedProject: serializeSceneProject(parsed.value) };
};

export const importMobileSceneProject = (
  serializedProject: string,
  projects: MobileStoredSceneProject[],
  now = Date.now(),
  sourceDescriptor?: { kind: "imported" | "shared" | "desktop"; name: string }
): MobileProjectImportResult => {
  const parsed = deserializeSceneProject(serializedProject);
  if (!parsed.ok) return { ok: false, error: `Invalid Math3D scene project: ${parsed.errors.join("; ")}` };

  const existingIds = new Set(projects.map((project) => project.id.toLocaleLowerCase()));
  const existingTitles = new Set(projects.map((project) => project.title.trim().toLocaleLowerCase()));
  const source = parsed.value.scene;
  const hasIdConflict = existingIds.has(source.id.toLocaleLowerCase());
  const hasTitleConflict = existingTitles.has(source.title.trim().toLocaleLowerCase());
  const id = hasIdConflict
    ? nextAvailableValue(`${source.id}-import`, existingIds, "-")
    : source.id;
  const title = hasTitleConflict
    ? nextAvailableValue(`${source.title} import`, existingTitles, " ")
    : source.title;
  const scene = id === source.id && title === source.title
    ? source
    : { ...source, id, title, updatedAt: now };

  return {
    ok: true,
    project: {
      id,
      title,
      updatedAt: scene.updatedAt,
      lastOpenedAt: now,
      serializedProject: serializeSceneProject({ ...parsed.value, scene }),
      ...(sourceDescriptor ? { source: {
        kind: sourceDescriptor.kind,
        name: sourceDescriptor.name.trim().slice(0, 240) || "Math3D project",
        sourceProjectId: parsed.value.scene.id,
        importedAt: now,
      } } : {}),
    },
  };
};
