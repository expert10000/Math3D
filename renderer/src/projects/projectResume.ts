import type { Math3DProject } from "@math3d/core";

// Local navigation state; never part of a scientific document or its hash.
export const PROJECT_RESUME_KEY = "math3d.project-resume.v1";
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
