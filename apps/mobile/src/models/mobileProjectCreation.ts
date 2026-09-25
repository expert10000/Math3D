import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  structuralHash,
  type SceneDocument,
  type SurfaceDefinition,
} from "@math3d/core";
import type { Math3DExample, MobileStoredSceneProject } from "./mobileScene";
import { importMobileSceneProject } from "./mobileProjectTransfer";
import {
  buildMobileExplicitSurface,
  buildMobileImplicitSurface,
  buildMobileParametricSurface,
  createMobilePrimitiveSurface,
  DEFAULT_MOBILE_EXPLICIT_DRAFT,
  DEFAULT_MOBILE_IMPLICIT_DRAFT,
  DEFAULT_MOBILE_PARAMETRIC_DRAFT,
  type MobilePrimitiveKind,
} from "./mobileSurfaceCreation";

export type MobileProjectSurfaceKind = "explicit" | "parametric" | "implicit";
export type MobileProjectFileSource = "import" | "desktop";

export type MobileProjectCreationRequest =
  | { route: "empty"; title?: string }
  | { route: "primitive"; primitive: MobilePrimitiveKind; title?: string }
  | { route: "surface"; surfaceKind: MobileProjectSurfaceKind; title?: string }
  | { route: "example"; example: Math3DExample; title?: string }
  | { route: "template"; templateId: string; templateVersion: number; scene: SceneDocument; title?: string }
  | { route: "import"; serializedProject: string; sourceName: string }
  | { route: "desktop"; serializedProject: string; sourceName: string };

export type MobileProjectCreationResult =
  | { ok: true; project: MobileStoredSceneProject; projects: MobileStoredSceneProject[]; message: string }
  | { ok: false; error: string };

export const MOBILE_PROJECT_CREATION_GROUPS = [
  { id: "empty", label: "Empty", routes: ["empty"] },
  { id: "create", label: "Create", routes: ["primitive", "surface"] },
  { id: "import", label: "Import", routes: ["import"] },
  { id: "start", label: "Start from", routes: ["example", "template", "desktop"] },
] as const;

export const mobileProjectCreationLayout = (width: number) => ({
  columns: width >= 600 ? 2 : 1,
  optionWidth: width >= 600 ? "48.5%" as const : "100%" as const,
  horizontalPadding: width < 360 ? 8 : 10,
  minTouchHeight: 48,
});

const normalizeTitle = (value: string | undefined, fallback: string): string => {
  const title = (value ?? fallback).trim().replace(/\s+/g, " ");
  return title.slice(0, 80);
};

const slug = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "project";

const nextProjectId = (title: string, projects: readonly MobileStoredSceneProject[]): string => {
  const existing = new Set(projects.map((project) => project.id.toLocaleLowerCase()));
  const base = `scene-mobile-${slug(title)}`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

const createStoredProject = (
  title: string,
  surfaces: SurfaceDefinition[],
  projects: readonly MobileStoredSceneProject[],
  now: number,
  sourceScene?: SceneDocument,
  template?: { id: string; version: number }
): MobileStoredSceneProject => {
  const id = nextProjectId(title, projects);
  const instanceSurfaces = template
    ? surfaces.map((surface, index) => ({
        ...surface,
        id: `${slug(surface.id)}-${structuralHash({ projectId: id, templateId: template.id, templateVersion: template.version, index }).slice(7, 15)}`,
      } as SurfaceDefinition))
    : surfaces.map((surface) => ({ ...surface }));
  const scene: SceneDocument = {
    ...(sourceScene ?? {}),
    id,
    title,
    createdAt: now,
    updatedAt: now,
    surfaces: instanceSurfaces,
    metadata: template ? {
      ...(sourceScene?.metadata ?? {}),
      "math3d.template.id": template.id,
      "math3d.template.version": template.version,
    } : sourceScene?.metadata,
  };
  return {
    id,
    title,
    updatedAt: now,
    lastOpenedAt: now,
    serializedProject: serializeSceneProject(createSceneProjectDocument(scene)),
  };
};

const defaultSurface = (kind: MobileProjectSurfaceKind): SurfaceDefinition => {
  const built = kind === "explicit"
    ? buildMobileExplicitSurface(null, DEFAULT_MOBILE_EXPLICIT_DRAFT)
    : kind === "parametric"
      ? buildMobileParametricSurface(null, DEFAULT_MOBILE_PARAMETRIC_DRAFT)
      : buildMobileImplicitSurface(null, DEFAULT_MOBILE_IMPLICIT_DRAFT);
  if (!built.ok) throw new Error(built.message);
  return built.surface;
};

export const planMobileProjectCreation = (
  request: MobileProjectCreationRequest,
  projects: readonly MobileStoredSceneProject[],
  now = Date.now()
): Omit<MobileProjectCreationResult & { ok: true }, "projects"> | { ok: false; error: string } => {
  if (request.route === "import" || request.route === "desktop") {
    const imported = importMobileSceneProject(request.serializedProject, [...projects], now);
    if (!imported.ok) return imported;
    const origin = request.route === "desktop" ? "desktop project" : "project";
    return {
      ok: true,
      project: imported.project,
      message: `Created ${imported.project.title} from ${origin} ${request.sourceName}.`,
    };
  }

  let title: string;
  let surfaces: SurfaceDefinition[] = [];
  let sourceScene: SceneDocument | undefined;

  if (request.route === "empty") {
    title = normalizeTitle(request.title, "Untitled project");
  } else if (request.route === "primitive") {
    const label = request.primitive[0].toUpperCase() + request.primitive.slice(1);
    title = normalizeTitle(request.title, `${label} project`);
    surfaces = [createMobilePrimitiveSurface(request.primitive, null)];
  } else if (request.route === "surface") {
    const labels: Record<MobileProjectSurfaceKind, string> = {
      explicit: "Graph surface",
      parametric: "Parametric surface",
      implicit: "Implicit surface",
    };
    title = normalizeTitle(request.title, labels[request.surfaceKind]);
    surfaces = [defaultSurface(request.surfaceKind)];
  } else if (request.route === "example") {
    title = normalizeTitle(request.title, request.example.title);
    surfaces = request.example.scene.surfaces ?? [];
    sourceScene = request.example.scene;
  } else {
    title = normalizeTitle(request.title, request.scene.title);
    surfaces = request.scene.surfaces ?? [];
    sourceScene = request.scene;
  }

  if (!title) return { ok: false, error: "Project name cannot be empty." };
  const project = createStoredProject(
    title,
    surfaces,
    projects,
    now,
    sourceScene,
    request.route === "template" ? { id: request.templateId, version: request.templateVersion } : undefined
  );
  const parsed = deserializeSceneProject(project.serializedProject);
  if (!parsed.ok) return { ok: false, error: `Project validation failed: ${parsed.errors.join("; ")}` };
  return { ok: true, project, message: `Created ${project.title}.` };
};

export const commitMobileProjectCreation = async (
  request: MobileProjectCreationRequest,
  projects: readonly MobileStoredSceneProject[],
  save: (nextProjects: MobileStoredSceneProject[]) => Promise<void>,
  now = Date.now()
): Promise<MobileProjectCreationResult> => {
  const planned = planMobileProjectCreation(request, projects, now);
  if (!planned.ok) return planned;
  const nextProjects = [planned.project, ...projects]
    .filter((project, index, all) => all.findIndex((candidate) => candidate.id === project.id) === index)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  try {
    await save(nextProjects);
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
  return { ...planned, projects: nextProjects };
};
