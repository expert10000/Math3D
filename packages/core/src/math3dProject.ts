import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, structuralHash, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { MAX_MIXED_WORKSPACE_BYTES, MIXED_WORKSPACE_FORMAT, normalizeMixedWorkspaceDocument,
  type MixedWorkspaceDocument } from "./mixedWorkspace";
import { canonicalJsonByteLength } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const MATH3D_PROJECT_FORMAT = "math3d.project" as const;
export const MATH3D_PROJECT_SCHEMA_VERSION = 1 as const;
export const MAX_MATH3D_PROJECT_BYTES = MAX_MIXED_WORKSPACE_BYTES + 32 * 1024;

/** Named product container. The existing mixed workspace remains its sole content. */
export type Math3DProject = Readonly<{
  format: typeof MATH3D_PROJECT_FORMAT;
  schemaVersion: typeof MATH3D_PROJECT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  metadata: Readonly<{ title: string; description?: string; tags?: readonly string[] }>;
  workspace: MixedWorkspaceDocument;
}>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const validTitle = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= 160;

export const normalizeMath3DProject = (value: unknown): ValidationResult<Math3DProject> => {
  try {
    if (canonicalJsonByteLength(value) > MAX_MATH3D_PROJECT_BYTES) return { ok: false, errors: ["Project exceeds its size limit."] };
    if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "metadata", "workspace"]) ||
      value.format !== MATH3D_PROJECT_FORMAT || value.schemaVersion !== MATH3D_PROJECT_SCHEMA_VERSION) {
      return { ok: false, errors: ["Invalid or unsupported Math3D project envelope."] };
    }
    if (!isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:project:")) return { ok: false, errors: ["Invalid project identity."] };
    if (!record(value.metadata) || Object.keys(value.metadata).some((key) => !["title", "description", "tags"].includes(key)) || !validTitle(value.metadata.title)) return { ok: false, errors: ["Project title must contain 1–160 characters and metadata must use supported fields."] };
    if ("description" in value.metadata && (typeof value.metadata.description !== "string" || value.metadata.description.length > 2000)) return { ok: false, errors: ["Project description must contain at most 2000 characters."] };
    if ("tags" in value.metadata && (!Array.isArray(value.metadata.tags) || value.metadata.tags.length > 16 ||
      !value.metadata.tags.every((tag) => typeof tag === "string" && tag.trim() === tag && tag.length > 0 && tag.length <= 40) ||
      new Set(value.metadata.tags).size !== value.metadata.tags.length)) return { ok: false, errors: ["Project tags must be unique, with at most 16 tags of 1–40 characters."] };
    const workspace = normalizeMixedWorkspaceDocument(value.workspace);
    if (!workspace.ok) return { ok: false, errors: workspace.errors.map((error) => `Project workspace: ${error}`) };
    if (structuralHash(workspace.value) !== value.identity.structuralHash) return { ok: false, errors: ["Project content hash does not match its workspace."] };
    return { ok: true, value: JSON.parse(canonicalJsonStringify({ ...value, workspace: workspace.value })) as Math3DProject };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

const requireProject = (value: unknown): Math3DProject => {
  const normalized = normalizeMath3DProject(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
export const createMath3DProject = (workspace: MixedWorkspaceDocument, options: { stableKey: CanonicalJsonValue; title?: string }): Math3DProject =>
  requireProject({ format: MATH3D_PROJECT_FORMAT, schemaVersion: MATH3D_PROJECT_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("project", options.stableKey), workspace),
    metadata: { title: options.title ?? "Untitled project" }, workspace });

/** Project revision describes all persisted workspace content, not a domain source generation. */
export const replaceMath3DProjectWorkspace = (project: Math3DProject, workspace: MixedWorkspaceDocument): Math3DProject => {
  const current = requireProject(project);
  return requireProject({ ...current, identity: advanceDocumentIdentity(current.identity, workspace), workspace });
};
export const updateMath3DProjectMetadata = (project: Math3DProject, metadata: Math3DProject["metadata"]): Math3DProject =>
  requireProject({ ...requireProject(project), metadata });
export const renameMath3DProject = (project: Math3DProject, title: string): Math3DProject =>
  updateMath3DProjectMetadata(project, { ...project.metadata, title: title.trim() });
export const serializeMath3DProject = (project: Math3DProject): string => canonicalJsonStringify(requireProject(project));
export const parseMath3DProject = (raw: string): Math3DProject => {
  if (new TextEncoder().encode(raw).length > MAX_MATH3D_PROJECT_BYTES) throw new TypeError("Project exceeds its size limit.");
  return requireProject(JSON.parse(raw));
};

/** Explicit compatibility adapter; opening legacy bytes never rewrites their store. */
export const adoptMixedWorkspaceProject = (workspace: MixedWorkspaceDocument, title = "Recovered workspace"): Math3DProject => {
  const normalized = normalizeMixedWorkspaceDocument(workspace);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return createMath3DProject(normalized.value, { title,
    stableKey: { importedFormat: MIXED_WORKSPACE_FORMAT, documentIds: normalized.value.entries.map((entry) => entry.expected.id).sort() } });
};
