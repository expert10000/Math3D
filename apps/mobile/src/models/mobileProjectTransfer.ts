import { createProjectHandoff, deserializeProjectHandoff, deserializeSceneProject, serializeProjectHandoff, serializeSceneProject } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobileGraph } from "./mobileGraphProject";
import { serializeGraph2DDocument } from "@math3d/core";

export const MOBILE_SCENE_EXPORT_EXTENSION = ".math3d.scene.json";
export const MOBILE_HANDOFF_EXPORT_EXTENSION = ".math3d.handoff.json";

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

export const createMobileHandoffExportName = (project: MobileStoredSceneProject, now = new Date()): string =>
  createMobileProjectExportName(project, now).replace(MOBILE_SCENE_EXPORT_EXTENSION,
    project.projectType === "graph2d" ? ".math3d.graph2d.json" : MOBILE_HANDOFF_EXPORT_EXTENSION);

export const serializeMobileProjectHandoff = (project: MobileStoredSceneProject): string => {
  if (project.projectType === "graph2d") return serializeGraph2DDocument(readMobileGraph(project));
  const checked = validateMobileProjectForTransfer(project);
  if (!checked.ok) throw new Error(checked.error);
  const parsed = deserializeSceneProject(checked.serializedProject);
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return serializeProjectHandoff(createProjectHandoff(parsed.value, {
    producer: { platform: "mobile", name: "Math3D Mobile", version: "1.5.1" },
    baseRevision: project.source?.handoffRevision ?? null,
    requiredCapabilities: (parsed.value.scene.surfaces ?? []).map((surface) => `surface.${surface.kind}`),
  }));
};

export const validateMobileProjectForTransfer = (
  project: MobileStoredSceneProject
): { ok: true; serializedProject: string } | { ok: false; error: string } => {
  if (project.projectType === "graph2d") {
    try { return { ok: true, serializedProject: serializeGraph2DDocument(readMobileGraph(project)) }; }
    catch (error) { return { ok: false, error: (error as Error).message }; }
  }
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
  const parsed = deserializeProjectHandoff(serializedProject);
  if (!parsed.ok) return { ok: false, error: `Invalid Math3D scene project: ${parsed.errors.join("; ")}` };

  const existingIds = new Set(projects.map((project) => project.id.toLocaleLowerCase()));
  const existingTitles = new Set(projects.map((project) => project.title.trim().toLocaleLowerCase()));
  const source = parsed.value.project.scene;
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
      serializedProject: serializeSceneProject({ ...parsed.value.project, scene }),
      ...(sourceDescriptor ? { source: {
        kind: sourceDescriptor.kind,
        name: sourceDescriptor.name.trim().slice(0, 240) || "Math3D project",
        sourceProjectId: parsed.value.projectId,
        importedAt: now,
        ...(id === parsed.value.projectId && parsed.value.producer.platform !== "legacy"
          ? { handoffRevision: parsed.value.projectRevision } : {}),
      } } : {}),
    },
  };
};
