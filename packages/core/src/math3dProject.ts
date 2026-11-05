import { advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, isStableDocumentId, isStructuralHash, structuralHash,
  type CanonicalJsonValue, type DocumentIdentity, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { MAX_MIXED_WORKSPACE_BYTES, MIXED_WORKSPACE_FORMAT, normalizeMixedWorkspaceDocument,
  type MixedWorkspaceDocument } from "./mixedWorkspace";
import { canonicalJsonByteLength } from "./scientificJobs";
import { quantumSceneRole, relocateQuantumSceneDocument } from "./quantumSceneDocument";
import { relocateQuantumFieldDocument } from "./quantumFieldDocument";
import { normalizeProjectNote, type ProjectNote } from "./projectNotes";
import type { ValidationResult } from "./validation";
import { validProjectComposition, type ProjectComposition } from "./projectComposition";
import { createAlgebraObjectRecord, parseAlgebraObjectRecord, type AlgebraObjectRecord } from "./algebraObjects";
import { createProjectAlgebraObjectId, validateProjectAlgebraRegistry, type ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";
import { MAX_PROJECT_ALGEBRA_EVIDENCE, parseProjectAlgebraEvidence, type ProjectAlgebraEvidence } from "./projectAlgebraEvidence";
import { MAX_PROJECT_ALGEBRA_RECIPES, parseAlgebraRecipeGraph, type AlgebraRecipeGraph } from "./algebraRecipeGraph";

export const MATH3D_PROJECT_FORMAT = "math3d.project" as const;
export const MATH3D_PROJECT_SCHEMA_VERSION = 1 as const;
export const MAX_MATH3D_PROJECT_BYTES = MAX_MIXED_WORKSPACE_BYTES + 1024 * 1024;
export const MAX_PROJECT_WORKBOOK_BYTES = 8 * 1024 * 1024;
export type ProjectWorkbookReference = Readonly<{
  id: StableDocumentId; title: string; revision: number; checksum: StructuralHash; byteLength: number;
}>;
/** External, immutable quantum-scene source. The bundle is never embedded or edited by Math3D. */
export type ProjectQuantumSceneReference = Readonly<{
  format: "quantum-scene/v1" | "quantum-scene/v2";
  title: string;
  directory: string;
  sceneFingerprint: string;
}>;
/** External scientific-scene source; only its location and verified manifest fingerprint enter a Project. */
export type ProjectScientificSceneReference = Readonly<{
  format: "scientific-scene/v1";
  title: string;
  directory: string;
  sceneFingerprint: string;
}>;
/** PC18 stores references only; result and Mesh bytes remain in their Project owners. */
export type ProjectSavedMeshComparison = Readonly<{
  id: string; title: string; metricPath: string;
  a: Readonly<{ resultId: string; resultHash: StructuralHash; meshId: StableDocumentId; revision: number; sourceHash: StructuralHash }>;
  b: Readonly<{ resultId: string; resultHash: StructuralHash; meshId: StableDocumentId; revision: number; sourceHash: StructuralHash }>;
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
  scientificScenes?: readonly ProjectScientificSceneReference[];
  compositions?: readonly ProjectComposition[];
  savedMeshComparisons?: readonly ProjectSavedMeshComparison[];
  algebraObjects?: readonly ProjectAlgebraObjectEntry[];
  algebraEvidence?: readonly ProjectAlgebraEvidence[];
  algebraRecipes?: readonly AlgebraRecipeGraph[];
}>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const validTitle = (value: unknown): value is string => typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= 160;
const projectContent = (workspace: MixedWorkspaceDocument, workbooks?: readonly ProjectWorkbookReference[], notes?: readonly ProjectNote[], quantumScenes?: readonly ProjectQuantumSceneReference[], scientificScenes?: readonly ProjectScientificSceneReference[], compositions?: readonly ProjectComposition[], savedMeshComparisons?: readonly ProjectSavedMeshComparison[], algebraObjects?: readonly ProjectAlgebraObjectEntry[], algebraEvidence?: readonly ProjectAlgebraEvidence[], algebraRecipes?: readonly AlgebraRecipeGraph[]) =>
  workbooks?.length || notes?.length || quantumScenes?.length || scientificScenes?.length || compositions?.length || savedMeshComparisons?.length || algebraObjects?.length || algebraEvidence?.length || algebraRecipes?.length ? { workspace, ...(workbooks?.length ? { workbooks } : {}), ...(notes?.length ? { notes } : {}), ...(quantumScenes?.length ? { quantumScenes } : {}), ...(scientificScenes?.length ? { scientificScenes } : {}), ...(compositions?.length ? { compositions } : {}), ...(savedMeshComparisons?.length ? { savedMeshComparisons } : {}), ...(algebraObjects?.length ? { algebraObjects } : {}), ...(algebraEvidence?.length ? { algebraEvidence } : {}), ...(algebraRecipes?.length ? { algebraRecipes } : {}) } : workspace;
const validSavedMeshComparison = (value: unknown): value is ProjectSavedMeshComparison => {
  const target = (item: unknown) => record(item) && exact(item, ["resultId", "resultHash", "meshId", "revision", "sourceHash"]) &&
    typeof item.resultId === "string" && item.resultId.length > 0 && item.resultId.length <= 256 &&
    isStructuralHash(item.resultHash) && isStableDocumentId(item.meshId) && item.meshId.startsWith("math3d:mesh:") &&
    Number.isSafeInteger(item.revision) && (item.revision as number) >= 1 && isStructuralHash(item.sourceHash);
  return record(value) && exact(value, ["id", "title", "metricPath", "a", "b"]) &&
    typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value.id) && validTitle(value.title) &&
    typeof value.metricPath === "string" && /^[a-zA-Z0-9_.]{1,160}$/.test(value.metricPath) &&
    target(value.a) && target(value.b) && (value.a as Record<string, unknown>).resultId !== (value.b as Record<string, unknown>).resultId;
};
const validQuantumSceneReference = (value: unknown): value is ProjectQuantumSceneReference =>
  record(value) && exact(value, ["format", "title", "directory", "sceneFingerprint"]) &&
  ["quantum-scene/v1", "quantum-scene/v2"].includes(String(value.format)) && validTitle(value.title) &&
  typeof value.directory === "string" && value.directory.length >= 1 && value.directory.length <= 2048 &&
  value.directory.trim() === value.directory && !/[\x00-\x1f]/.test(value.directory) &&
  typeof value.sceneFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.sceneFingerprint);
const validScientificSceneReference = (value: unknown): value is ProjectScientificSceneReference =>
  record(value) && exact(value, ["format", "title", "directory", "sceneFingerprint"]) &&
  value.format === "scientific-scene/v1" && validTitle(value.title) &&
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
    if (!record(value) || !exact(value, ["format", "schemaVersion", "identity", "metadata", "workspace", ...(value.workbooks === undefined ? [] : ["workbooks"]), ...(value.notes === undefined ? [] : ["notes"]), ...(value.quantumScenes === undefined ? [] : ["quantumScenes"]), ...(value.scientificScenes === undefined ? [] : ["scientificScenes"]), ...(value.compositions === undefined ? [] : ["compositions"]), ...(value.savedMeshComparisons === undefined ? [] : ["savedMeshComparisons"]), ...(value.algebraObjects === undefined ? [] : ["algebraObjects"]), ...(value.algebraEvidence === undefined ? [] : ["algebraEvidence"]), ...(value.algebraRecipes === undefined ? [] : ["algebraRecipes"])]) ||
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
    if (value.scientificScenes !== undefined && (!Array.isArray(value.scientificScenes) || value.scientificScenes.length < 1 || value.scientificScenes.length > 16 ||
      !value.scientificScenes.every(validScientificSceneReference) ||
      new Set(value.scientificScenes.map((item: ProjectScientificSceneReference) => item.sceneFingerprint)).size !== value.scientificScenes.length))
      return { ok: false, errors: ["Invalid Project scientific-scene references."] };
    if (value.compositions !== undefined && (!Array.isArray(value.compositions) || value.compositions.length < 1 || value.compositions.length > 32 ||
      !value.compositions.every(validProjectComposition) || new Set(value.compositions.map((item: ProjectComposition) => item.id)).size !== value.compositions.length))
      return { ok: false, errors: ["Invalid Project document compositions."] };
    if (value.savedMeshComparisons !== undefined && (!Array.isArray(value.savedMeshComparisons) || value.savedMeshComparisons.length < 1 || value.savedMeshComparisons.length > 32 ||
      !value.savedMeshComparisons.every(validSavedMeshComparison) || new Set(value.savedMeshComparisons.map((item: ProjectSavedMeshComparison) => item.id)).size !== value.savedMeshComparisons.length))
      return { ok: false, errors: ["Invalid saved Mesh comparisons."] };
    const algebraObjects = value.algebraObjects === undefined ? undefined : validateProjectAlgebraRegistry(value.algebraObjects);
    const algebraRecipes = value.algebraRecipes === undefined ? undefined : (() => {
      if (!Array.isArray(value.algebraRecipes) || value.algebraRecipes.length < 1 ||
          value.algebraRecipes.length > MAX_PROJECT_ALGEBRA_RECIPES ||
          canonicalJsonByteLength(value.algebraRecipes) > 128 * 1024) throw new TypeError("Invalid or oversized Project algebra recipes.");
      const items = value.algebraRecipes.map((item: unknown) => parseAlgebraRecipeGraph(item,
        (value.identity as DocumentIdentity).id, algebraObjects ?? []));
      if (new Set(items.map((item) => item.id)).size !== items.length) throw new TypeError("Duplicate Project algebra recipe IDs.");
      return items;
    })();
    const algebraEvidence = value.algebraEvidence === undefined ? undefined : (() => {
      if (!Array.isArray(value.algebraEvidence) || value.algebraEvidence.length < 1 ||
          value.algebraEvidence.length > MAX_PROJECT_ALGEBRA_EVIDENCE ||
          canonicalJsonByteLength(value.algebraEvidence) > 768 * 1024) throw new TypeError("Invalid or oversized Project algebra evidence.");
      const items = value.algebraEvidence.map((item: unknown) => parseProjectAlgebraEvidence(item,
        (value.identity as DocumentIdentity).id, algebraObjects ?? []));
      if (new Set(items.map((item) => item.id)).size !== items.length) throw new TypeError("Duplicate Project algebra evidence IDs.");
      return items;
    })();
    for (const entry of algebraObjects ?? []) for (const group of entry.revisions) {
      if (group.definition.kind !== "finite-group" || !group.definition.source) continue;
      if (group.definition.representation !== "permutation")
        throw new TypeError("Saved Galois group must use a permutation action.");
      const source = group.definition.source;
      const evidence = algebraEvidence?.find((item) => item.id === source.evidenceId);
      const result = evidence?.result as { sourcePolynomial?: string; splittingField?: { definingPolynomial?: string };
        group?: { elements?: readonly (readonly number[])[]; generators?: readonly number[] } } | undefined;
      if (!evidence || evidence.request.operation !== "sage.galois.analyze" ||
          evidence.request.target.objectId !== source.ring.objectId ||
          evidence.request.target.revision !== source.ring.revision ||
          result?.sourcePolynomial !== source.polynomial ||
          result?.splittingField?.definingPolynomial !== source.splittingPolynomial ||
          !result?.group?.elements || !result.group.generators ||
          canonicalJsonStringify(group.definition.generators.map((item) => item.images)) !==
            canonicalJsonStringify(result.group.generators.map((index) => result.group!.elements![index])))
        throw new TypeError("Saved Galois group must reference matching pinned Project evidence.");
    }
    for (const entry of workspace.value.entries.filter((item) => item.module === "quantum")) {
      const checkpoint = entry.checkpoint;
      if (entry.replay !== null || checkpoint.format !== "math3d.quantum-scene-document")
        return { ok: false, errors: ["Quantum-scene documents must be compact, read-only checkpoints."] };
      const linked = (value.quantumScenes as ProjectQuantumSceneReference[] | undefined)?.find((item) => item.sceneFingerprint === checkpoint.source.sceneFingerprint);
      if (!linked || linked.directory !== checkpoint.location.directory || linked.format !== checkpoint.source.sceneSchema)
        return { ok: false, errors: ["Quantum-scene document requires its matching external Project reference."] };
      for (const relation of checkpoint.linkedViews ?? []) {
        const sibling = workspace.value.entries.find(item => item.module === "quantum" &&
          item.checkpoint.format === "math3d.quantum-scene-document" &&
          item.checkpoint.source.sceneFingerprint === relation.sceneFingerprint)?.checkpoint;
        if (!sibling || sibling.format !== "math3d.quantum-scene-document" ||
          sibling.source.provenance.runId !== checkpoint.source.provenance.runId ||
          sibling.source.provenance.resultSha256 !== checkpoint.source.provenance.resultSha256 ||
          sibling.source.provenance.model !== checkpoint.source.provenance.model ||
          relation.role !== quantumSceneRole(sibling.source) ||
          !sibling.linkedViews?.some(back => back.sceneFingerprint === checkpoint.source.sceneFingerprint &&
            back.role === quantumSceneRole(checkpoint.source)))
          return { ok: false, errors: ["Quantum-scene same-result relation is missing, mismatched or not reciprocal."] };
      }
    }
    for (const entry of workspace.value.entries.filter((item) => item.module === "field" &&
      item.checkpoint.format === "math3d.quantum-field-document")) {
      const checkpoint = entry.checkpoint;
      if (checkpoint.format !== "math3d.quantum-field-document" || entry.replay !== null)
        return { ok: false, errors: ["Quantum field documents must be compact, read-only checkpoints."] };
      const linked = (value.quantumScenes as ProjectQuantumSceneReference[] | undefined)?.find(item =>
        item.sceneFingerprint === checkpoint.source.scene.sceneFingerprint);
      if (!linked || linked.directory !== checkpoint.location.directory ||
          linked.format !== checkpoint.source.scene.sceneSchema)
        return { ok: false, errors: ["Quantum field document requires its matching verified Project source reference."] };
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
    if (structuralHash(projectContent(workspace.value, value.workbooks as ProjectWorkbookReference[] | undefined, value.notes as ProjectNote[] | undefined, value.quantumScenes as ProjectQuantumSceneReference[] | undefined, value.scientificScenes as ProjectScientificSceneReference[] | undefined, value.compositions as ProjectComposition[] | undefined, value.savedMeshComparisons as ProjectSavedMeshComparison[] | undefined, algebraObjects, algebraEvidence, algebraRecipes)) !== value.identity.structuralHash)
      return { ok: false, errors: ["Project content hash does not match its workspace and external references."] };
    return { ok: true, value: JSON.parse(canonicalJsonStringify({ ...value, workspace: workspace.value, ...(algebraObjects ? { algebraObjects } : {}), ...(algebraEvidence ? { algebraEvidence } : {}), ...(algebraRecipes ? { algebraRecipes } : {}) })) as Math3DProject };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

const requireProject = (value: unknown): Math3DProject => {
  const normalized = normalizeMath3DProject(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
const quantumFieldReferences = (workspace: MixedWorkspaceDocument): ProjectQuantumSceneReference[] =>
  workspace.entries.flatMap(entry => entry.module === "field" && entry.checkpoint.format === "math3d.quantum-field-document" ?
    [{ format: entry.checkpoint.source.scene.sceneSchema, title: entry.checkpoint.metadata.title,
      directory: entry.checkpoint.location.directory,
      sceneFingerprint: entry.checkpoint.source.scene.sceneFingerprint }] : [])
    .filter((item, index, all) => all.findIndex(other => other.sceneFingerprint === item.sceneFingerprint) === index)
    .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
export const createMath3DProject = (workspace: MixedWorkspaceDocument, options: { stableKey: CanonicalJsonValue; title?: string }): Math3DProject => {
  const quantumScenes = quantumFieldReferences(workspace);
  return requireProject({ format: MATH3D_PROJECT_FORMAT, schemaVersion: MATH3D_PROJECT_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("project", options.stableKey),
      projectContent(workspace, undefined, undefined, quantumScenes.length ? quantumScenes : undefined)),
    metadata: { title: options.title ?? "Untitled project" }, workspace,
    ...(quantumScenes.length ? { quantumScenes } : {}) });
};

/** Project revision describes all persisted workspace content, not a domain source generation. */
export const replaceMath3DProjectWorkspace = (project: Math3DProject, workspace: MixedWorkspaceDocument): Math3DProject => {
  const current = requireProject(project);
  const quantumScenes = [...(current.quantumScenes ?? []).filter(item =>
    !quantumFieldReferences(workspace).some(field => field.sceneFingerprint === item.sceneFingerprint)),
    ...quantumFieldReferences(workspace)].sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  return requireProject({ ...current, identity: advanceDocumentIdentity(current.identity, projectContent(workspace, current.workbooks, current.notes, quantumScenes.length ? quantumScenes : undefined, current.scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)), workspace,
    ...(quantumScenes.length ? { quantumScenes } : {}) });
};
export const upsertMath3DProjectWorkbook = (project: Math3DProject, reference: ProjectWorkbookReference): Math3DProject => {
  const current = requireProject(project);
  if (!validWorkbookReference(reference)) throw new TypeError("Invalid Project Workbook reference.");
  const workbooks = [...(current.workbooks ?? []).filter((item) => item.id !== reference.id), reference].sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJsonStringify(workbooks) === canonicalJsonStringify(current.workbooks ?? [])) return current;
  return requireProject({ ...current, workbooks,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, workbooks, current.notes, current.quantumScenes, current.scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
export const upsertMath3DProjectNote = (project: Math3DProject, note: ProjectNote): Math3DProject => {
  const current = requireProject(project), checked = normalizeProjectNote(note);
  if (!checked.ok || checked.value.projectId !== current.identity.id) throw new TypeError("Note does not belong to this Project.");
  const notes = [...(current.notes ?? []).filter((item) => item.identity.id !== checked.value.identity.id), checked.value]
    .sort((a, b) => a.identity.id.localeCompare(b.identity.id));
  if (canonicalJsonStringify(notes) === canonicalJsonStringify(current.notes ?? [])) return current;
  return requireProject({ ...current, notes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, notes, current.quantumScenes, current.scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
export const upsertMath3DProjectQuantumScene = (project: Math3DProject, reference: ProjectQuantumSceneReference): Math3DProject => {
  const current = requireProject(project);
  if (!validQuantumSceneReference(reference)) throw new TypeError("Invalid Project quantum-scene reference.");
  const quantumScenes = [...(current.quantumScenes ?? []).filter((item) => item.sceneFingerprint !== reference.sceneFingerprint), reference]
    .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  if (canonicalJsonStringify(quantumScenes) === canonicalJsonStringify(current.quantumScenes ?? [])) return current;
  return requireProject({ ...current, quantumScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, quantumScenes, current.scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
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
  const workspace = { ...current.workspace, entries: current.workspace.entries.map(entry =>
    entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document" && entry.checkpoint.source.sceneFingerprint === fingerprint
      ? { ...entry, checkpoint: relocateQuantumSceneDocument(entry.checkpoint, directory) } :
    entry.module === "field" && entry.checkpoint.format === "math3d.quantum-field-document" && entry.checkpoint.source.scene.sceneFingerprint === fingerprint
      ? { ...entry, checkpoint: relocateQuantumFieldDocument(entry.checkpoint, directory) } : entry) };
  return requireProject({ ...current, workspace, quantumScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(workspace, current.workbooks, current.notes, quantumScenes, current.scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
export const upsertMath3DProjectScientificScene = (project: Math3DProject, reference: ProjectScientificSceneReference): Math3DProject => {
  const current = requireProject(project);
  if (!validScientificSceneReference(reference)) throw new TypeError("Invalid Project scientific-scene reference.");
  const scientificScenes = [...(current.scientificScenes ?? []).filter((item) => item.sceneFingerprint !== reference.sceneFingerprint), reference]
    .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  if (canonicalJsonStringify(scientificScenes) === canonicalJsonStringify(current.scientificScenes ?? [])) return current;
  return requireProject({ ...current, scientificScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, current.quantumScenes, scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
/** The caller verifies the replacement bundle before changing the saved location. */
export const relinkMath3DProjectScientificScene = (project: Math3DProject, fingerprint: string, directory: string): Math3DProject => {
  const current = requireProject(project);
  const linked = current.scientificScenes?.find((item) => item.sceneFingerprint === fingerprint);
  if (!linked) throw new TypeError("Scientific scene is not linked to this Project.");
  const replacement: ProjectScientificSceneReference = { ...linked, directory };
  if (!validScientificSceneReference(replacement)) throw new TypeError("Invalid replacement scientific-scene location.");
  if (linked.directory === directory) return current;
  const scientificScenes = current.scientificScenes!.map((item) => item.sceneFingerprint === fingerprint ? replacement : item);
  return requireProject({ ...current, scientificScenes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, current.quantumScenes, scientificScenes, current.compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
/** Save only the view recipe; member documents and binary resources remain in their owners. */
export const upsertMath3DProjectComposition = (project: Math3DProject, composition: ProjectComposition): Math3DProject => {
  const current = requireProject(project);
  if (!validProjectComposition(composition)) throw new TypeError("Invalid Project composition.");
  const compositions = [...(current.compositions ?? []).filter(item => item.id !== composition.id), composition]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJsonStringify(compositions) === canonicalJsonStringify(current.compositions ?? [])) return current;
  return requireProject({ ...current, compositions,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, current.quantumScenes, current.scientificScenes, compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
export const removeMath3DProjectComposition = (project: Math3DProject, id: string): Math3DProject => {
  const current = requireProject(project);
  const compositions = current.compositions?.filter(item => item.id !== id) ?? [];
  if (compositions.length === (current.compositions?.length ?? 0)) return current;
  const { compositions: _removed, ...rest } = current;
  return requireProject({ ...rest, ...(compositions.length ? { compositions } : {}),
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, current.quantumScenes, current.scientificScenes, compositions, current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
export const upsertMath3DProjectSavedMeshComparison = (project: Math3DProject, comparison: ProjectSavedMeshComparison): Math3DProject => {
  const current = requireProject(project);
  if (!validSavedMeshComparison(comparison)) throw new TypeError("Invalid saved Mesh comparison.");
  const savedMeshComparisons = [...(current.savedMeshComparisons ?? []).filter(item => item.id !== comparison.id), comparison]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJsonStringify(savedMeshComparisons) === canonicalJsonStringify(current.savedMeshComparisons ?? [])) return current;
  return requireProject({ ...current, savedMeshComparisons,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks, current.notes, current.quantumScenes, current.scientificScenes, current.compositions, savedMeshComparisons, current.algebraObjects, current.algebraEvidence, current.algebraRecipes)) });
};
const withAlgebraObjects = (project: Math3DProject, algebraObjects: readonly ProjectAlgebraObjectEntry[]): Math3DProject =>
  requireProject({ ...project, algebraObjects,
    identity: advanceDocumentIdentity(project.identity, projectContent(project.workspace, project.workbooks, project.notes,
      project.quantumScenes, project.scientificScenes, project.compositions, project.savedMeshComparisons, algebraObjects, project.algebraEvidence, project.algebraRecipes)) });

/** Appends one immutable, object-linked Sage result to the Project bundle. */
export const addMath3DProjectAlgebraEvidence = (project: Math3DProject, evidence: ProjectAlgebraEvidence): Math3DProject => {
  const current = requireProject(project);
  const checked = parseProjectAlgebraEvidence(evidence, current.identity.id, current.algebraObjects ?? []);
  if (current.algebraEvidence?.some((item) => item.id === checked.id)) throw new TypeError("Duplicate Project algebra evidence ID.");
  const algebraEvidence = [...(current.algebraEvidence ?? []), checked].sort((a, b) => a.id.localeCompare(b.id));
  return requireProject({ ...current, algebraEvidence,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks,
      current.notes, current.quantumScenes, current.scientificScenes, current.compositions,
      current.savedMeshComparisons, current.algebraObjects, algebraEvidence, current.algebraRecipes)) });
};

/** Saves a reusable versioned algebra recipe without rewriting prior evidence. */
export const upsertMath3DProjectAlgebraRecipe = (project: Math3DProject, recipe: AlgebraRecipeGraph): Math3DProject => {
  const current = requireProject(project);
  const checked = parseAlgebraRecipeGraph(recipe, current.identity.id, current.algebraObjects ?? []);
  const existing = current.algebraRecipes?.find((item) => item.id === checked.id);
  if (existing && canonicalJsonStringify(existing) === canonicalJsonStringify(checked)) return current;
  const algebraRecipes = [...(current.algebraRecipes ?? []).filter((item) => item.id !== checked.id), checked]
    .sort((a, b) => a.id.localeCompare(b.id));
  return requireProject({ ...current, algebraRecipes,
    identity: advanceDocumentIdentity(current.identity, projectContent(current.workspace, current.workbooks,
      current.notes, current.quantumScenes, current.scientificScenes, current.compositions,
      current.savedMeshComparisons, current.algebraObjects, current.algebraEvidence, algebraRecipes)) });
};

/** Adds a new identity or its next immutable revision; existing revisions cannot be rewritten. */
export const upsertMath3DProjectAlgebraObject = (project: Math3DProject, value: AlgebraObjectRecord): Math3DProject => {
  const current = requireProject(project), object = parseAlgebraObjectRecord(value);
  const existing = current.algebraObjects?.find((entry) => entry.id === object.id);
  if (existing?.archived) throw new TypeError(`Archived algebra object ${object.id} must be recovered before editing.`);
  if (existing) {
    const previous = existing.revisions[object.revision - 1];
    if (previous) {
      if (canonicalJsonStringify(previous) === canonicalJsonStringify(object)) return current;
      throw new TypeError(`Duplicate algebra object ID and revision ${object.id}@${object.revision}.`);
    }
    if (object.revision !== existing.revisions.length + 1 || object.kind !== existing.revisions[0].kind) {
      throw new TypeError(`Algebra object ${object.id} requires its next revision with the same kind.`);
    }
  } else if (object.revision !== 1) {
    throw new TypeError(`New algebra object ${object.id} must start at revision 1.`);
  }
  const algebraObjects = [...(current.algebraObjects ?? []).filter((entry) => entry.id !== object.id),
    existing ? { ...existing, revisions: [...existing.revisions, object] } : { id: object.id, revisions: [object], archived: false }]
    .sort((a, b) => a.id.localeCompare(b.id));
  return withAlgebraObjects(current, algebraObjects);
};

/** A rename creates a new record revision while retaining the old label and definition snapshot. */
export const renameMath3DProjectAlgebraObject = (project: Math3DProject, id: StableDocumentId, label: string): Math3DProject => {
  const current = requireProject(project), entry = current.algebraObjects?.find((item) => item.id === id);
  if (!entry || entry.archived) throw new TypeError(`Active algebra object ${id} is unavailable.`);
  const latest = entry.revisions[entry.revisions.length - 1];
  if (latest.label === label) return current;
  return upsertMath3DProjectAlgebraObject(current, createAlgebraObjectRecord({ id, label,
    revision: latest.revision + 1, definition: latest.definition }));
};

/** A fork receives a distinct project-local ID and an independent revision history. */
export const forkMath3DProjectAlgebraObject = (project: Math3DProject, sourceId: StableDocumentId,
  stableKey: CanonicalJsonValue, label: string): Math3DProject => {
  const current = requireProject(project), source = current.algebraObjects?.find((entry) => entry.id === sourceId);
  if (!source) throw new TypeError(`Algebra object ${sourceId} is unavailable for fork.`);
  const id = createProjectAlgebraObjectId(current.identity.id, stableKey);
  if (current.algebraObjects?.some((entry) => entry.id === id)) throw new TypeError(`Duplicate algebra object ID ${id}.`);
  return upsertMath3DProjectAlgebraObject(current, createAlgebraObjectRecord({ id, label, revision: 1,
    definition: source.revisions[source.revisions.length - 1].definition }));
};

/** Archive is recoverable and retains revisions so dependent parent references remain resolvable. */
export const setMath3DProjectAlgebraObjectArchived = (project: Math3DProject, id: StableDocumentId, archived: boolean): Math3DProject => {
  const current = requireProject(project), entry = current.algebraObjects?.find((item) => item.id === id);
  if (!entry) throw new TypeError(`Algebra object ${id} is unavailable.`);
  if (entry.archived === archived) return current;
  return withAlgebraObjects(current, current.algebraObjects!.map((item) => item.id === id ? { ...item, archived } : item));
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
    ? [{ format: entry.checkpoint.source.sceneSchema, title: entry.checkpoint.metadata.title, directory: entry.checkpoint.location.directory,
      sceneFingerprint: entry.checkpoint.source.sceneFingerprint }] :
    entry.module === "field" && entry.checkpoint.format === "math3d.quantum-field-document" ?
      [{ format: entry.checkpoint.source.scene.sceneSchema, title: entry.checkpoint.metadata.title,
        directory: entry.checkpoint.location.directory, sceneFingerprint: entry.checkpoint.source.scene.sceneFingerprint }] : [])
    .filter((entry, index, all) => all.findIndex(other => other.sceneFingerprint === entry.sceneFingerprint) === index)
    .sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint));
  const stableKey = { importedFormat: MIXED_WORKSPACE_FORMAT, documentIds: normalized.value.entries.map((entry) => entry.expected.id).sort() };
  return requireProject({ format: MATH3D_PROJECT_FORMAT, schemaVersion: MATH3D_PROJECT_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("project", stableKey), projectContent(normalized.value, undefined, undefined, quantumScenes)),
    metadata: { title }, workspace: normalized.value, ...(quantumScenes.length ? { quantumScenes } : {}) });
};
