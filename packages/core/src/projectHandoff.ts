import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { deserializeSceneProject, type SceneProjectDocument } from "./serialization";
import type { ValidationResult } from "./validation";

export const PROJECT_HANDOFF_FORMAT = "math3d.project-handoff" as const;
export const PROJECT_HANDOFF_VERSION = 1 as const;
export type ProjectHandoffPlatform = "desktop" | "mobile" | "browser" | "legacy";

export type ProjectHandoffManifest = {
  format: typeof PROJECT_HANDOFF_FORMAT;
  version: typeof PROJECT_HANDOFF_VERSION;
  producer: { platform: ProjectHandoffPlatform; name: string; version: string };
  projectId: string;
  projectRevision: string;
  baseRevision: string | null;
  contentHashes: { scene: string };
  requiredCapabilities: string[];
  results: { id: string; kind: string; contentHash: string }[];
  project: SceneProjectDocument;
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const bounded = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

export const sceneProjectRevision = (project: SceneProjectDocument): string =>
  structuralHash(project.scene);

export const createProjectHandoff = (
  project: SceneProjectDocument,
  options: {
    producer: ProjectHandoffManifest["producer"];
    baseRevision?: string | null;
    requiredCapabilities?: string[];
    results?: ProjectHandoffManifest["results"];
  }
): ProjectHandoffManifest => {
  const normalized = deserializeSceneProject(JSON.stringify(project));
  if (!normalized.ok) throw new TypeError(normalized.errors.join("; "));
  project = JSON.parse(JSON.stringify(normalized.value)) as SceneProjectDocument;
  const manifest: ProjectHandoffManifest = {
    format: PROJECT_HANDOFF_FORMAT,
    version: PROJECT_HANDOFF_VERSION,
    producer: options.producer,
    projectId: project.scene.id,
    projectRevision: sceneProjectRevision(project),
    baseRevision: options.baseRevision ?? null,
    contentHashes: { scene: structuralHash(project.scene) },
    requiredCapabilities: [...new Set(options.requiredCapabilities ?? [])].sort(),
    results: options.results ?? [],
    project,
  };
  const checked = validateProjectHandoff(manifest);
  if (!checked.ok) throw new TypeError(checked.errors.join("; "));
  return checked.value;
};

export const validateProjectHandoff = (value: unknown): ValidationResult<ProjectHandoffManifest> => {
  if (!record(value) || value.format !== PROJECT_HANDOFF_FORMAT || value.version !== PROJECT_HANDOFF_VERSION)
    return { ok: false, errors: ["Unsupported project handoff format or version."] };
  const producer = value.producer;
  if (!record(producer) || !["desktop", "mobile", "browser", "legacy"].includes(String(producer.platform))
    || !bounded(producer.name) || !bounded(producer.version))
    return { ok: false, errors: ["Project handoff producer is invalid."] };
  const project = deserializeSceneProject(JSON.stringify(value.project));
  if (!project.ok) return { ok: false, errors: project.errors.map((error) => `project: ${error}`) };
  if (!bounded(value.projectId) || value.projectId !== project.value.scene.id)
    return { ok: false, errors: ["Project handoff ID does not match its scene."] };
  if (!hash(value.projectRevision) || value.projectRevision !== sceneProjectRevision(project.value)
    || !record(value.contentHashes) || value.contentHashes.scene !== structuralHash(project.value.scene))
    return { ok: false, errors: ["Project handoff content hash or revision does not match its scene."] };
  if (value.baseRevision !== null && !hash(value.baseRevision))
    return { ok: false, errors: ["Project handoff base revision is invalid."] };
  if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.length > 64
    || value.requiredCapabilities.some((item) => !bounded(item)))
    return { ok: false, errors: ["Project handoff capabilities are invalid."] };
  if (!Array.isArray(value.results) || value.results.length > 256 || value.results.some((item) =>
    !record(item) || !bounded(item.id) || !bounded(item.kind) || !hash(item.contentHash)))
    return { ok: false, errors: ["Project handoff result descriptors are invalid."] };
  return { ok: true, value: value as ProjectHandoffManifest };
};

/** A v1 scene-project remains importable, but has no trustworthy revision ancestry. */
export const deserializeProjectHandoff = (serialized: string): ValidationResult<ProjectHandoffManifest> => {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { return { ok: false, errors: ["Invalid project handoff JSON."] }; }
  if (record(parsed) && parsed.format === PROJECT_HANDOFF_FORMAT) return validateProjectHandoff(parsed);
  const legacy = deserializeSceneProject(serialized);
  if (!legacy.ok) return { ok: false, errors: legacy.errors };
  return { ok: true, value: createProjectHandoff(legacy.value, {
    producer: { platform: "legacy", name: "Math3D scene-project v1", version: "1" },
  }) };
};

export const serializeProjectHandoff = (manifest: ProjectHandoffManifest): string => {
  const checked = validateProjectHandoff(manifest);
  if (!checked.ok) throw new TypeError(checked.errors.join("; "));
  return canonicalJsonStringify(JSON.parse(JSON.stringify(checked.value)));
};
