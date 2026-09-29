import { createGraph2DWorkspaceProject, forkGraph2DWorkspaceProject, createSceneProjectDocument, serializeSceneProject,
  type Graph2DDocument, type SceneDocument, type Graph2DPointTableReference } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { readMobileGraph, readMobileGraphWorkspace, storeMobileGraph, updateStoredMobileGraph } from "./mobileGraphProject";
export function preserveMobilePersonalGraphWork(projects: readonly MobileStoredSceneProject[], current: { graph?: Graph2DDocument | null; scene?: SceneDocument | null }, now = Date.now()) {
  let preserved: MobileStoredSceneProject | null = null;
  if (current.graph) preserved = updateStoredMobileGraph(projects.find(p => p.id === current.graph!.identity.id), current.graph, now);
  else if (current.scene) preserved = { ...projects.find(p => p.id === current.scene!.id), projectType: "scene", id: current.scene.id, title: current.scene.title,
    updatedAt: now, lastOpenedAt: now, serializedProject: serializeSceneProject(createSceneProjectDocument(current.scene)) };
  return preserved ? [preserved, ...projects.filter(p => p.id !== preserved!.id)] : [...projects];
}
export function planMobilePersonalGraph(projects: readonly MobileStoredSceneProject[], current: { graph?: Graph2DDocument | null; scene?: SceneDocument | null },
  id: string, copy: { token: string; title: string } | null, dataAvailable: (table: Graph2DPointTableReference) => boolean, now = Date.now()) {
  const preserved = preserveMobilePersonalGraphWork(projects, current, now), source = preserved.find(p => p.id === id);
  if (!source || source.projectType !== "graph2d") throw new TypeError("Saved Graph project unavailable.");
  const graph = readMobileGraph(source);
  if (!copy) { const project = { ...source, lastOpenedAt: now }; return { project, projects: [project, ...preserved.filter(p => p.id !== id)] }; }
  for (const o of graph.source.objects) if (o.kind === "point-series" && !dataAvailable(o.table)) throw new TypeError("Original data sidecar is missing or corrupt. Import it before making a reusable copy.");
  const workspace = forkGraph2DWorkspaceProject(readMobileGraphWorkspace(source) ?? createGraph2DWorkspaceProject(graph), copy.token, copy.title);
  const next = workspace.entries.find(e => e.module === "graph2d")!.checkpoint as Graph2DDocument, project = storeMobileGraph(next, now, workspace);
  if (preserved.some(p => p.id === project.id)) throw new TypeError("Reusable copy identity already exists. Try again.");
  return { project, projects: [project, ...preserved] };
}
