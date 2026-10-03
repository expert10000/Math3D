import { adoptMixedWorkspaceProject, parseMath3DProject, parseMixedWorkspaceDocument, parseWorkspaceProjectHandoff,
  replayMixedWorkspaceDocument, serializeMath3DProject, type Math3DProject } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";

/** Validate every checkpoint, retaining unsupported editors, lineage and unavailable resource references. */
export const readMobilePreviewProject = (stored: MobileStoredSceneProject): Math3DProject => {
  if (stored.projectType !== "project-preview") throw new TypeError("Not a saved project preview.");
  const project = parseMath3DProject(stored.serializedProject);
  if (project.workspace.entries.some(entry => entry.replay !== null)) throw new TypeError("Export checkpoint JSON on desktop before mobile preview import.");
  replayMixedWorkspaceDocument(project.workspace);
  if (project.identity.id !== stored.id || project.metadata.title !== stored.title) throw new TypeError("Project preview identity is inconsistent.");
  return project;
};

export const importMobileProjectPreview = (raw: string, projects: readonly MobileStoredSceneProject[], sourceName: string,
  sourceKind: "imported" | "desktop" | "shared" = "imported", now = Date.now()): MobileStoredSceneProject => {
  if (new TextEncoder().encode(raw).length > 25 * 1024 * 1024) throw new TypeError("Project exceeds the mobile import limit.");
  const format = JSON.parse(raw)?.format;
  let project: Math3DProject;
  if (format === "math3d.project") project = parseMath3DProject(raw);
  else if (format === "math3d.mixed-workspace") project = adoptMixedWorkspaceProject(parseMixedWorkspaceDocument(raw), sourceName);
  else if (format === "math3d.project-handoff") project = adoptMixedWorkspaceProject(parseWorkspaceProjectHandoff(raw).project, sourceName);
  else throw new TypeError("Unsupported project preview file.");
  if (projects.some(item => item.id === project.identity.id || (() => {
    try { return JSON.parse(item.serializedProject)?.identity?.id === project.identity.id; } catch { return false; }
  })())) throw new TypeError("This project identity already exists. Existing work was kept; resolve the version conflict on desktop.");
  const stored: MobileStoredSceneProject = { projectType: "project-preview", id: project.identity.id, title: project.metadata.title,
    updatedAt: now, lastOpenedAt: now, serializedProject: format === "math3d.project" ? raw : serializeMath3DProject(project),
    source: { kind: sourceKind, name: sourceName.trim().slice(0, 240) || "Project file", sourceProjectId: project.identity.id, importedAt: now } };
  readMobilePreviewProject(stored);
  return stored;
};
