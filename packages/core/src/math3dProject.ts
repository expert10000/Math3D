import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, isStableDocumentId, isStructuralHash, structuralHash,
  type CanonicalJsonValue, type DocumentIdentity, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { MAX_MIXED_WORKSPACE_BYTES, MIXED_WORKSPACE_FORMAT, normalizeMixedWorkspaceDocument,
  type MixedWorkspaceDocument } from "./mixedWorkspace";
import { canonicalJsonByteLength } from "./scientificJobs";
import { relocateQuantumSceneDocument } from "./quantumSceneDocument";
import { normalizeProjectNote, type ProjectNote } from "./projectNotes";
import type { ValidationResult } from "./validation";

export const MATH3D_PROJECT_FORMAT = "math3d.project" as const;
export const MATH3D_PROJECT_SCHEMA_VERSION = 1 as const;
export const MAX_MATH3D_PROJECT_BYTES = MAX_MIXED_WORKSPACE_BYTES + 64 * 1024;
export const MAX_PROJECT_WORKBOOK_BYTES = 8 * 1024 * 1024;
export type ProjectWorkbookReference = Readonly<{
  id: StableDocumentId; title: string; revision: number; checksum: StructuralHash; byteLength: number;
}>;
/** External, immutable quantum-scene source. The bundle is never embedded or edited by Math3D. */
export type ProjectQuantumSceneReference = Readonly<{
  format: "quantum-scene/v1";
  title: string;
  directory: string;
  sceneFingerprint: string;
}>;

/** Named container for the mixed workspace, saved Workbooks, and Project Notes. */
export type Math3DProject = Readonly<{
  format: typeof MATH3D_PROJECT_FORMAT;
  schemaVersion: typeof MATH3D_PROJECT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  metadata: Readonly<{ title: string; description?: string; tags?: readonly string[];
    documents?: Readonly<Record<string, Readonly<{ title?: string; archived?: boolean }>>> }>;
  workspace: MixedWorkspaceDocument;
  workbooks?: readonly ProjectWorkbookReference[];
  notes?: readonly ProjectNote[];
  quantumScenes?: readonly ProjectQuantumSceneReference[];
}>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const validTitle = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= 160;
const projectContent = (workspace: MixedWorkspaceDocument, workbooks?: readonly ProjectWorkbookReference[], notes?: readonly ProjectNote[], quantumScenes?: readonly ProjectQuantumSceneReference[]) =>
  workbooks?.length || notes?.length || quantumScenes?.length ? { workspace, ...(workbooks?.length ? { workbooks } : {}), ...(notes?.length ? { notes } : {}), ...(quantumScenes?.length ? { quantumScenes } : {}) } : workspace;
const validQuantumSceneReference = (value: unknown): value is ProjectQuantumSceneReference =>
  record(value) && exact(value, ["format", "title", "directory", "sceneFingerprint"]) &&
  value.format === "quantum-scene/v1" && validTitle(value.title) &&
  typeof value.directory === "string" && value.directory.length >= 1 && value.directory.length <= 2048 &&
  value.directory.trim() === value.directory && !/[\x00-\x1f]/.test(value.directory) &&
  typeof value.sceneFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.sceneFingerprint);
const validWorkbookReference = (value: unknown): value is ProjectWorkbookReference =>
  record(value) && exact(value, ["id", "title", "revision", "checksum", "byteLength"]) &&
  isStableDocumentId(value.id) && value.id.startsWith("math3d:workbook:") && validTitle(value.title) &&
  Number.isSafeInteger(value.revision) && (value.revision as number) >= 1 && isStructuralHash(value.checksum) &&
  Number.isSafeInteger(value.byteLength) && (value.byteLength as number) >= 1 && (value.byteLength as number) <= MAX_PROJECT_WORKBOOK_BYTES;

export const normalizeMath3DProject = (value: unknown): ValidationResult<Math3DProject> => {
  try {
    if (canonicalJsonByteLength(value) > MAX_MATH3D_PROJECT_BYTES) return { ok: false, errors: ["Project exceeds its size limit."] };
    if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "metadata", "workspace", ...(value.workbooks === undefined ? [] : ["workbooks"]), ...(value.notes === undefined ? [] : ["notes"]), ...(value.quantumScenes === undefined ? [] : ["quantumScenes"])]) ||
      value.format !== MATH3D_PROJECT_FORMAT || value.schemaVersion !== MATH3D_PROJECT_SCHEMA_VERSION) {
      return { ok: false, errors: ["Invalid or unsupported Math3D project envelope."] };
    }
    if (!isDocumentIdentity(value.identity) || !value.identity.id.startsWith("math3d:project:")) return { ok: false, errors: ["Invalid project identity."] };
    if (!record(value.metadata) || Object.keys(value.metadata).some((key) => !["title", "description", "tags", "documents"].includes(key)) || !validTitle(value.metadata.title)) return { ok: false, errors: ["Project title must contain 1–160 characters and metadata must use supported fields."] };
    if ("description" in value.metadata && (typeof value.metadata.description !== "string" || value.metadata.description.length > 2000)) return { ok: false, errors: ["Project description must contain at most 2000 characters."] };
    if ("tags" in value.metadata && (!Array.isArray(value.metadata.tags) || value.metadata.tags.length > 16 ||
      !value.metadata.tags.every((tag) => typeof tag === "string" && tag.trim() === tag && tag.length > 0 && tag.length <= 40) ||
      new Set(value.metadata.tags).size !== value.metadata.tags.length)) return { ok: false, errors: ["Project tags must be unique, with at most 16 tags of 1–40 characters."] };
    const workspace = normalizeMixedWorkspaceDocument(value.workspace);
    if (!workspace.ok) return { ok: false, errors: workspace.errors.map((error) => `Project workspace: ${error}`) };
    if (value.workbooks !== undefined && (!Array.isArray(value.workbooks) || value.workbooks.length < 1 || value.workbooks.length > 64 ||
      !value.workbooks.every(validWorkbookReference) ||
      new Set(value.workbooks.map((item: ProjectWorkbookReference) => item.id)).size !== value.workbooks.length ||
      value.workbooks.reduce((sum: number, item: ProjectWorkbookReference) => sum + item.byteLength, 0) > 64 * 1024 * 1024))
      return { ok: false, errors: ["Invalid Project Workbook references."] };
    if (value.notes !== undefined && (!Array.isArray(value.notes) || value.notes.length < 1 || value.notes.length > 64 ||
      canonicalJsonByteLength(value.notes) > 48 * 1024 ||
      !value.notes.every((note: unknown) => { const checked = normalizeProjectNote(note); return checked.ok && checked.value.projectId === (value.identity as DocumentIdentity).id; }) ||
      new Set(value.notes.map((note: ProjectNote) => note.identity.id)).size !== value.notes.length))
      return { ok: false, errors: ["Invalid or oversized Project Notes."] };
    if (value.quantumScenes !== undefined && (!Array.isArray(value.quantumScenes) || value.quantumScenes.length < 1 || value.quantumScenes.length > 16 ||
      !value.quantumScenes.every(validQuantumSceneReference) ||
      new Set(value.quantumScenes.map((item: ProjectQuantumSceneReference) => item.sceneFingerprint)).size !== value.quantumScenes.length))
      return { ok: false, errors: ["Invalid Project quantum-scene references."] };
    for (const entry of workspace.value.entries.filter((item) => item.module === "quantum")) {
      const checkpoint = entry.checkpoint;
      if (entry.replay !== null || checkpoint.format !== "math3d.quantum-scene-document")
        return { ok: false, errors: ["Quantum-scene documents must be compact, read-only checkpoints."] };
      const linked = (value.quantumScenes as ProjectQuantumSceneReference[] | undefined)?.find((item) => item.sceneFingerprint === checkpoint.source.sceneFingerprint);
      if (!linked || linked.directory !== checkpoint.location.directory)
        return { ok: false, errors: ["Quantum-scene document requires its matching external Project reference."] };
    }
    if (canonicalJsonByteLength(value.metadata) > 32 * 1024) return { ok: false, errors: ["Project metadata exceeds 32 KiB."] };
    if ("documents" in value.metadata) {
      const documents = value.metadata.documents, ids = new Set<string>(workspace.value.entries.map((entry) => entry.expected.id));
      if (!record(documents) || Object.keys(documents).length > 512 || Object.entries(documents).some(([id, entry]) =>
        !ids.has(id) || !record(entry) || Object.keys(entry).some((key) => !["title", "archived"].includes(key)) ||
        ("title" in entry && !validTitle(entry.title)) || ("archived" in entry && typeof entry.archived !== "boolean"))) {
        return { ok: false, errors: ["Invalid project document titles or archive flags."] };
      }
    }
    if (structuralHash(projectContent(workspace.value, value.workbooks as ProjectWorkbookReference[] | undefined, value.notes as ProjectNote[] | undefined, value.quantumScenes as ProjectQuantumSceneReference[] | undefined)) !== value.identity.structuralHash)
      return { ok: false, errors: ["Project content hash does not match its workspace, Workbooks, Notes and quantum scenes."] };
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
  return requireProject({ ...current, identity: advanceDocumentIdentity(current.identity, projectContent(workspace, current.workbooks, current.notes, current.quantumScenes)), workspace });
};
export const upsertMath3DProjectWorkbook = (project: Math3DProject, reference: ProjectWorkbookReference): Math3DProject => {
  const current = requireProject(project);
  if (!validWorkbookReference(reference)) throw new TypeError("Invalid Project Workbook reference.");
  const workbooks = [...(current.workbooks ?? []).filter((item) => item.id !== reference.id), reference].sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJsonStringify(workbooks) === canonicalJsonStringify(current.workbooks ?? [])) return current;
  return requireProject({ ...current, workbooks,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, workbooks, current.notes, current.quantumScenes)) });
};
export const upsertMath3DProjectNote = (project: Math3DProject, note: ProjectNote): Math3DProject => {
  const current = requireProject(project), checked = normalizeProjectNote(note);
  if (!checked.ok || checked.value.projectId !== current.identity.id) throw new TypeError("Note does not belong to this Project.");
  const notes = [...(current.notes ?? []).filter((item) => item.identity.id !== checked.value.identity.id), checked.value]
    .sort((a, b) => a.identity.id.localeCompare(b.identity.id));
  if (canonicalJsonStringify(notes) === canonicalJsonStringify(current.notes ?? [])) return current;
  return requireProject({ ...current, notes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, notes, current.quantumScenes)) });
};
export const upsertMath3DProjectQuantumScene = (project: Math3DProject, reference: ProjectQuantumSceneReference): Math3DProject => {
  const current = requireProject(project);
  if (!validQuantumSceneReference(reference)) throw new TypeError("Invalid Project quantum-scene reference.");
  const quantumScenes = [...(current.quantumScenes ?? []).filter((item) => item.sceneFingerprint !== reference.sceneFingerprint), reference]
    .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  if (canonicalJsonStringify(quantumScenes) === canonicalJsonStringify(current.quantumScenes ?? [])) return current;
  return requireProject({ ...current, quantumScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, quantumScenes)) });
};
/** Replace only the location of an already linked scene. Callers must independently verify the picked bundle. */
export const relinkMath3DProjectQuantumScene = (project: Math3DProject, fingerprint: string, directory: string): Math3DProject => {
  const current = requireProject(project);
  const linked = current.quantumScenes?.find((item) => item.sceneFingerprint === fingerprint);
  if (!linked) throw new TypeError("Quantum scene is not linked to this Project.");
  const replacement: ProjectQuantumSceneReference = { ...linked, directory };
  if (!validQuantumSceneReference(replacement)) throw new TypeError("Invalid replacement quantum-scene location.");
  if (linked.directory === directory) return current;
  const quantumScenes = current.quantumScenes!.map((item) => item.sceneFingerprint === fingerprint ? replacement : item);
  const workspace = current.workspace.entries.some((entry) => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document" && entry.checkpoint.source.sceneFingerprint === fingerprint)
    ? { ...current.workspace, entries: current.workspace.entries.map((entry) => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document" && entry.checkpoint.source.sceneFingerprint === fingerprint
      ? { ...entry, checkpoint: relocateQuantumSceneDocument(entry.checkpoint, directory) } : entry) } : current.workspace;
  return requireProject({ ...current, workspace, quantumScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(workspace, current.workbooks, current.notes, quantumScenes)) });
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
  const quantumScenes: ProjectQuantumSceneReference[] = normalized.value.entries.flatMap((entry) => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document"
    ? [{ format: "quantum-scene/v1" as const, title: entry.checkpoint.metadata.title, directory: entry.checkpoint.location.directory,
      sceneFingerprint: entry.checkpoint.source.sceneFingerprint }] : []).sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  const stableKey = { importedFormat: MIXED_WORKSPACE_FORMAT, documentIds: normalized.value.entries.map((entry) => entry.expected.id).sort() };
  return requireProject({ format: MATH3D_PROJECT_FORMAT, schemaVersion: MATH3D_PROJECT_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("project", stableKey), projectContent(normalized.value, undefined, undefined, quantumScenes)),
    metadata: { title }, workspace: normalized.value, ...(quantumScenes.length ? { quantumScenes } : {}) });
};
