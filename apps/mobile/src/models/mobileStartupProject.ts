import type { MobileStoredSceneProject } from "./mobileScene";

/** A last-viewed Surface snapshot must outrank an unrelated library fallback. */
export function selectMobileStartupProject(projects: readonly MobileStoredSceneProject[], lastSceneId: string | null,
  hasValidViewerSnapshot: boolean): MobileStoredSceneProject | null {
  const selected = lastSceneId ? projects.find(project => project.id === lastSceneId) : undefined;
  return selected ?? (hasValidViewerSnapshot ? null : projects[0] ?? null);
}
