import type { MobileStoredSceneProject } from "./mobileScene";

/** A last-viewed Surface snapshot must outrank an unrelated library fallback. */
export function selectMobileStartupProject(projects: readonly MobileStoredSceneProject[], lastSceneId: string | null,
  hasValidViewerSnapshot: boolean): MobileStoredSceneProject | null {
  const editable = projects.filter(project => project.projectType !== "project-preview" || project.activeGraphDocumentId !== undefined || project.activeCurveDocumentId !== undefined);
  const selected = lastSceneId ? editable.find(project => project.id === lastSceneId) : undefined;
  return selected ?? (hasValidViewerSnapshot ? null : editable[0] ?? null);
}
