import type { Math3DProject } from "@math3d/core";

// Local navigation state; never part of a scientific document or its hash.
export const PROJECT_RESUME_KEY = "math3d.project-resume.v1";
export const PROJECT_UI_KEY = "math3d.project-ui.v1";
export type ProjectUiPreferences = { resumeEnabled: boolean; placement: "left" | "middle" | "right" | "all" };
export function projectUiPreferences(raw: string | null): ProjectUiPreferences {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return { resumeEnabled: value?.resumeEnabled !== false,
      placement: ["left", "middle", "right", "all"].includes(value?.placement) ? value.placement : "left" };
  } catch { return { resumeEnabled: true, placement: "left" }; }
}
export function rememberProjectUi(store: Pick<Storage, "setItem">, value: ProjectUiPreferences) {
  try { store.setItem(PROJECT_UI_KEY, JSON.stringify(value)); } catch { /* Optional presentation state. */ }
}
/** All entry points use the same deterministic, non-archived document choice. */
export function selectProjectDocument(project: Math3DProject, raw: string | null) {
  const resumed = projectResumeDocument(project, raw);
  const entries = project.workspace.entries.filter(entry => !project.metadata.documents?.[entry.expected.id]?.archived);
  const selected = resumed ?? (project.metadata.tags?.includes("starter")
    ? (["geometry", "surface", "mesh", "volume", "curve", "graph2d"] as const).map(module => entries.find(entry => entry.module === module)).find(Boolean) : null)
    ?? entries.find(entry => project.workspace.activeDocumentIds.includes(entry.expected.id)) ?? entries[0];
  if (!selected) throw new Error("Saved Project has no available document to open.");
  let applies = false;
  try { applies = !!raw && JSON.parse(raw)?.projectId === project.identity.id; } catch { applies = !!raw; }
  return { selected, recovery: applies && !resumed ? "Saved document selection is unavailable. Opened an available Project document." : null };
}
export function projectResumeDocument(project: Math3DProject, raw: string | null) {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value?.projectId !== project.identity.id) return null;
    return project.workspace.entries.find(entry => entry.expected.id === value.documentId &&
      !project.metadata.documents?.[entry.expected.id]?.archived) ?? null;
  } catch { return null; }
}
export function rememberProjectDocument(store: Pick<Storage, "setItem">, project: Math3DProject, documentId: string) {
  if (!project.workspace.entries.some(entry => entry.expected.id === documentId)) return;
  try { store.setItem(PROJECT_RESUME_KEY, JSON.stringify({ projectId: project.identity.id, documentId })); }
  catch { /* Saving the Project remains possible when optional UI storage is full. */ }
}
