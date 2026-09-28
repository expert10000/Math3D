import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
  createGraph2DDocument,
} from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobileGraph, storeMobileGraph, updateStoredMobileGraph, readMobileGraphWorkspace, mobileGraphWorkspaceNeedsIdentityFork } from "./mobileGraphProject";

export type MobileProjectMutationResult =
  | { ok: true; project: MobileStoredSceneProject }
  | { ok: false; error: string };

const parseProjectScene = (project: MobileStoredSceneProject): SceneDocument | null => {
  const parsed = deserializeSceneProject(project.serializedProject);
  return parsed.ok ? parsed.value.scene : null;
};

export const normalizeProjectTitle = (value: string): string => value.trim().replace(/\s+/g, " ");

export const renameMobileProject = (
  project: MobileStoredSceneProject,
  title: string,
  now = Date.now()
): MobileProjectMutationResult => {
  const normalizedTitle = normalizeProjectTitle(title);
  if (!normalizedTitle) return { ok: false, error: "Project name cannot be empty." };
  if (project.projectType === "graph2d") {
    try {
      const graph = readMobileGraph(project);
      return { ok: true, project: { ...updateStoredMobileGraph(project, { ...graph,
        metadata: { ...graph.metadata, title: normalizedTitle } }, now), lastOpenedAt: project.lastOpenedAt } };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  }

  const scene = parseProjectScene(project);
  if (!scene) return { ok: false, error: "The project scene could not be read." };
  const renamedScene: SceneDocument = { ...scene, title: normalizedTitle, updatedAt: now };
  return {
    ok: true,
    project: {
      ...project,
      title: normalizedTitle,
      updatedAt: now,
      serializedProject: serializeSceneProject(createSceneProjectDocument(renamedScene)),
    },
  };
};

const nextCopyTitle = (sourceTitle: string, projects: MobileStoredSceneProject[]): string => {
  const existing = new Set(projects.map((project) => project.title.trim().toLocaleLowerCase()));
  const base = `${sourceTitle} copy`;
  if (!existing.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (existing.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
};

const nextCopyId = (sourceId: string, projects: MobileStoredSceneProject[]): string => {
  const existing = new Set(projects.map((project) => project.id));
  const base = `${sourceId}-copy`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const duplicateMobileProject = (
  source: MobileStoredSceneProject,
  projects: MobileStoredSceneProject[],
  now = Date.now()
): MobileProjectMutationResult => {
  if (source.projectType === "graph2d") {
    try {
      const graph = readMobileGraph(source);
      if (mobileGraphWorkspaceNeedsIdentityFork(readMobileGraphWorkspace(source)))
        return { ok: false, error: "Duplicate this mixed workspace on desktop to fork all document identities safely. Companion documents will not be discarded." };
      const copy = createGraph2DDocument({ source: graph.source, display: graph.display, selection: graph.selection,
        title: nextCopyTitle(source.title, projects), stableKey: { copyOf: source.id, name: nextCopyId(source.id, projects) } });
      return { ok: true, project: storeMobileGraph(copy, now) };
    } catch (error) { return { ok: false, error: (error as Error).message }; }
  }
  const scene = parseProjectScene(source);
  if (!scene) return { ok: false, error: "The project scene could not be read." };

  const id = nextCopyId(source.id, projects);
  const title = nextCopyTitle(source.title, projects);
  const duplicateScene: SceneDocument = {
    ...scene,
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    project: {
      id,
      title,
      updatedAt: now,
      lastOpenedAt: now,
      serializedProject: serializeSceneProject(createSceneProjectDocument(duplicateScene)),
    },
  };
};
