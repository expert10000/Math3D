import { deserializeSceneProject } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import type { MobileComputeJob } from "./mobileComputeJobs";
import type { SceneSortMode } from "./useMobileProjectState";

export const MOBILE_PROJECT_LIBRARY_SECTIONS = ["all", "my", "imported", "shared", "files"] as const;
export type MobileProjectLibrarySection = (typeof MOBILE_PROJECT_LIBRARY_SECTIONS)[number];

export type MobileProjectLibraryCard = Readonly<{
  id: string;
  title: string;
  updatedAt: number;
  lastOpenedAt: number;
  objectCount: number;
  origin: "My Project" | "Imported" | "Shared" | "Desktop";
  sourceName: string | null;
  compatible: boolean;
  compatibilityMessage: string;
  workerStatus: string | null;
  resultStatus: string | null;
}>;

const originOf = (project: MobileStoredSceneProject): MobileProjectLibraryCard["origin"] => {
  if (project.source?.kind === "shared") return "Shared";
  if (project.source?.kind === "desktop") return "Desktop";
  if (project.source?.kind === "imported") return "Imported";
  return "My Project";
};

const inSection = (project: MobileStoredSceneProject, section: MobileProjectLibrarySection): boolean => {
  if (section === "all") return true;
  if (section === "my") return !project.source;
  if (section === "files") return !!project.source;
  if (section === "shared") return project.source?.kind === "shared";
  return project.source?.kind === "imported" || project.source?.kind === "desktop";
};

export const buildMobileProjectLibraryCards = (
  projects: readonly MobileStoredSceneProject[],
  options: Readonly<{
    section: MobileProjectLibrarySection;
    query: string;
    sort: SceneSortMode;
    jobs?: readonly MobileComputeJob[];
    readyResultProjectId?: string | null;
  }>
): MobileProjectLibraryCard[] => {
  const query = options.query.trim().toLocaleLowerCase();
  const latestJobByProject = new Map<string, MobileComputeJob>();
  for (const job of options.jobs ?? []) {
    const projectId = job.request.sceneId;
    if (!projectId) continue;
    const previous = latestJobByProject.get(projectId);
    if (!previous || previous.updatedAt < job.updatedAt) latestJobByProject.set(projectId, job);
  }
  const seen = new Set<string>();
  const cards: MobileProjectLibraryCard[] = [];
  for (const project of projects) {
    if (seen.has(project.id) || !inSection(project, options.section)) continue;
    seen.add(project.id);
    const origin = originOf(project);
    const sourceName = project.source?.name ?? null;
    if (query && ![project.title, project.id, origin, sourceName ?? ""].some((value) => value.toLocaleLowerCase().includes(query))) continue;
    const parsed = deserializeSceneProject(project.serializedProject);
    const compatible = parsed.ok && parsed.value.scene.id === project.id && parsed.value.scene.title === project.title;
    const job = latestJobByProject.get(project.id);
    cards.push({
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      lastOpenedAt: project.lastOpenedAt,
      objectCount: parsed.ok ? parsed.value.scene.surfaces?.length ?? 0 : 0,
      origin,
      sourceName,
      compatible,
      compatibilityMessage: compatible ? "Compatible" : parsed.ok ? "Identity mismatch" : `Needs attention: ${parsed.errors[0]}`,
      workerStatus: job?.status ?? null,
      resultStatus: options.readyResultProjectId === project.id ? "Preview ready" : job?.status === "succeeded" ? "Recheck on open" : null,
    });
  }
  cards.sort((a, b) => options.sort === "title"
    ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    : options.sort === "updated"
      ? b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)
      : b.lastOpenedAt - a.lastOpenedAt || a.id.localeCompare(b.id));
  return cards;
};

export const countMobileProjectLibrarySections = (projects: readonly MobileStoredSceneProject[]): Record<MobileProjectLibrarySection, number> => ({
  all: projects.length,
  my: projects.filter((project) => inSection(project, "my")).length,
  imported: projects.filter((project) => inSection(project, "imported")).length,
  shared: projects.filter((project) => inSection(project, "shared")).length,
  files: projects.filter((project) => inSection(project, "files")).length,
});
