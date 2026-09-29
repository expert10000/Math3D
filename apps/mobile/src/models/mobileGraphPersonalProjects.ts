import { createGraph2DWorkspaceProject, forkGraph2DWorkspaceProject, createSceneProjectDocument, serializeSceneProject,
  inspectGraph2DPersonalPreset, forkGraph2DPersonalPreset, type Graph2DPersonalPresetPreview,
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

export const previewMobilePersonalGraphImport = (raw: string, dataAvailable: (table: Graph2DPointTableReference) => boolean) =>
  inspectGraph2DPersonalPreset(raw, dataAvailable);

export function planMobilePersonalGraphImport(projects: readonly MobileStoredSceneProject[], current: { graph?: Graph2DDocument | null; scene?: SceneDocument | null },
  preview: Graph2DPersonalPresetPreview, token: string, dataAvailable: (table: Graph2DPointTableReference) => boolean, now = Date.now()) {
  for (const object of preview.document.source.objects) if (object.kind === "point-series" && !dataAvailable(object.table))
    throw new TypeError("Required point-table sidecar is missing or corrupt. Import it before accepting this preset.");
  const preserved = preserveMobilePersonalGraphWork(projects, current, now);
  const workspace = forkGraph2DPersonalPreset(preview, token);
  const document = workspace.entries.find(entry => entry.module === "graph2d")!.checkpoint as Graph2DDocument;
  const project = storeMobileGraph(document, now, workspace);
  if (preserved.some(item => item.id === project.id)) throw new TypeError("Imported Graph identity already exists. Try again.");
  return { project, projects: [project, ...preserved] };
}
