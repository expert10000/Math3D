import { deserializeProjectHandoff, deserializeSceneProject, sceneProjectRevision, type ProjectHandoffManifest } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";
import { importMobileSceneProject } from "./mobileProjectTransfer";

const MOBILE_HANDOFF_CAPABILITIES = new Set(["surface.explicit", "surface.parametric", "surface.implicit"]);

export type MobileHandoffPreview = {
  manifest: ProjectHandoffManifest;
  sourceName: string;
  unsupported: string[];
  existingProjectId: string | null;
  diverged: boolean;
  canReplace: boolean;
};

export const inspectMobileProjectHandoff = (
  serialized: string,
  sourceName: string,
  projects: readonly MobileStoredSceneProject[]
): { ok: true; preview: MobileHandoffPreview } | { ok: false; error: string } => {
  const decoded = deserializeProjectHandoff(serialized);
  if (!decoded.ok) return { ok: false, error: decoded.errors.join("; ") };
  const manifest = decoded.value;
  const scene = manifest.project.scene;
  const unsupported = [...new Set([
    ...manifest.requiredCapabilities.filter((capability) => !MOBILE_HANDOFF_CAPABILITIES.has(capability)),
    ...(scene.surfaces ?? []).filter((surface) => !MOBILE_HANDOFF_CAPABILITIES.has(`surface.${surface.kind}`)).map((surface) => `surface.${surface.kind}`),
    ...(scene.objects?.length ? ["scene.objects"] : []),
    ...(scene.geometry ? ["scene.geometry"] : []),
  ])].sort();
  const existing = projects.find((project) => project.id === manifest.projectId);
  const current = existing ? deserializeSceneProject(existing.serializedProject) : null;
  const currentRevision = current?.ok ? sceneProjectRevision(current.value) : null;
  const canReplace = !!existing && !!manifest.baseRevision && currentRevision === manifest.baseRevision;
  return { ok: true, preview: {
    manifest, sourceName, unsupported,
    existingProjectId: existing?.id ?? null,
    diverged: !!existing && !canReplace,
    canReplace,
  } };
};

export const commitMobileProjectHandoff = async (
  preview: MobileHandoffPreview,
  resolution: "copy" | "replace",
  projects: readonly MobileStoredSceneProject[],
  save: (projects: MobileStoredSceneProject[]) => Promise<void>,
  now = Date.now()
): Promise<{ ok: true; project: MobileStoredSceneProject; projects: MobileStoredSceneProject[] } | { ok: false; error: string }> => {
  const checked = inspectMobileProjectHandoff(
    JSON.stringify(preview.manifest), preview.sourceName, projects
  );
  if (!checked.ok) return checked;
  if (resolution === "replace" && !checked.preview.canReplace)
    return { ok: false, error: "The base revision no longer matches. Import a copy instead." };
  const imported = importMobileSceneProject(JSON.stringify(preview.manifest.project),
    resolution === "replace" ? [] : [...projects], now,
    { kind: "desktop", name: preview.sourceName });
  if (!imported.ok) return imported;
  const preservesIdentity = imported.project.id === preview.manifest.projectId;
  const project: MobileStoredSceneProject = {
    ...imported.project,
    source: imported.project.source ? {
      ...imported.project.source,
      ...(preservesIdentity ? { handoffRevision: preview.manifest.projectRevision } : {}),
    } : undefined,
  };
  const nextProjects = [project, ...projects.filter((candidate) => candidate.id !== project.id)]
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  try { await save(nextProjects); }
  catch (error) { return { ok: false, error: String((error as Error)?.message ?? error) }; }
  return { ok: true, project, projects: nextProjects };
};
