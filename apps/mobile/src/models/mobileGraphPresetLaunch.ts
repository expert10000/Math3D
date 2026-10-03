import { createSceneProjectDocument, instantiateGraph2DPreset, serializeSceneProject, type Graph2DDocument, type Graph2DPreset, type SceneDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { storeMobileGraph, updateStoredMobileGraph } from "./mobileGraphProject";
import type { MobileCurrentGraphWork } from "./mobileGraphPersonalProjects";

export const planMobileGraphPresetLaunch = (preset: Graph2DPreset, token: string, projects: readonly MobileStoredSceneProject[],
  current: MobileCurrentGraphWork, now = Date.now()) => {
  const launch = instantiateGraph2DPreset(preset, token), project = storeMobileGraph(launch.document, now);
  if (projects.some(item => item.id === project.id)) throw new Error("Graph launch identity already exists. Try opening the scene again.");
  let preserved: MobileStoredSceneProject | null = null;
  if (current.graph && current.project) preserved = current.project;
  else if (current.graph) preserved = updateStoredMobileGraph(projects.find(item => item.id === current.graph!.identity.id), current.graph, now);
  else if (current.scene) preserved = {
    ...projects.find(item => item.id === current.scene!.id), id: current.scene.id, title: current.scene.title, projectType: "scene",
    updatedAt: now, lastOpenedAt: now, serializedProject: serializeSceneProject(createSceneProjectDocument(current.scene)),
  };
  const next = [project, ...(preserved ? [preserved] : []), ...projects.filter(item => item.id !== preserved?.id)];
  return { project, projects: next, sidecars: launch.sidecars };
};

/** Sidecars are available before the normal atomic library write; failures undo newly staged files. */
export const commitMobileGraphPresetLaunch = async (plan: ReturnType<typeof planMobileGraphPresetLaunch>,
  save: (projects: MobileStoredSceneProject[]) => Promise<void>, stage: (sidecars: Graph2DPreset["sidecars"]) => () => void) => {
  const rollback = stage(plan.sidecars);
  try { await save(plan.projects); }
  catch (error) { rollback(); throw error; }
  return plan;
};
