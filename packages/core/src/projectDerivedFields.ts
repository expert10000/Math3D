import { canonicalJsonStringify, structuralHash, type StructuralHash } from "./documentIdentity";
import { createDerivedFieldDocument, vectorFieldDerivedShape,
  type DerivedFieldDocument, type DerivedFieldInput, type DerivedFieldOperation } from "./derivedFieldDocument";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument, type KernelWorkspaceDocument } from "./mixedWorkspace";
import type { VectorField3DDocument } from "./vectorField3DDocument";

export const PROJECT_DERIVED_FIELDS_CAPABILITY = "project.derived-fields.v1" as const;
export type DerivedFieldReview = Readonly<{ status: "current" | "stale" | "missing" | "unverified";
  document: DerivedFieldDocument; cacheKey: StructuralHash | null }>;
/** The host must use its existing source-resource verifier for scientific bundles. */
export type DerivedSourceVerification = (document: VectorField3DDocument) => boolean;
const requireProject = (project: Math3DProject) => parseMath3DProject(serializeMath3DProject(project));
const sameGeneration = (a: { id: string; revision: number; structuralHash: string },
  b: { id: string; revision: number; structuralHash: string }) =>
  a.id === b.id && a.revision === b.revision && a.structuralHash === b.structuralHash;
const pinned = (input: DerivedFieldInput) => ({ id: input.documentId,
  revision: input.revision, structuralHash: input.structuralHash });

export const listProjectDerivedFields = (project: Math3DProject): readonly DerivedFieldDocument[] =>
  requireProject(project).workspace.derivedFields ?? [];

/** Read-only status. Saved recipes remain inspectable when a source changes; values are withheld. */
export const reviewProjectDerivedField = (project: Math3DProject, id: string,
  verifySource: DerivedSourceVerification,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): DerivedFieldReview => {
  const current = requireProject(project), byId = new Map<string, DerivedFieldDocument>((current.workspace.derivedFields ?? [])
    .map(document => [document.identity.id, document]));
  const root = byId.get(id);
  if (!root) throw new TypeError("Project derived field is missing.");
  const inspect = (document: DerivedFieldDocument): DerivedFieldReview["status"] => {
    const input = document.input;
    if (input.kind === "derived") {
      const parent = byId.get(input.documentId);
      if (!parent) return "missing";
      if (!sameGeneration(pinned(input), parent.identity) ||
          canonicalJsonStringify(input.shape) !== canonicalJsonStringify(parent.output)) return "stale";
      return inspect(parent);
    }
    const entry = current.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === input.documentId);
    if (!entry) return "missing";
    if (!sameGeneration(pinned(input), entry.expected)) return "stale";
    const source = entry.replay === null ? entry.checkpoint : resolved?.get(input.documentId);
    if (!source || source.format !== "math3d.vector-field3d-document") return "unverified";
    if (!sameGeneration(entry.expected, source.identity) ||
        canonicalJsonStringify(input.shape) !== canonicalJsonStringify(vectorFieldDerivedShape(source)))
      return "stale";
    try { return verifySource(source) ? "current" : "unverified"; }
    catch { return "unverified"; }
  };
  const status = inspect(root);
  return { status, document: root,
    cacheKey: status === "current" ? structuralHash({ document: root.identity,
      input: root.input, operation: root.operation, output: root.output }) : null };
};

/** Consumers release a cached numerical result only against the current verified recipe key. */
export const currentProjectDerivedFieldResult = <T>(project: Math3DProject, id: string,
  result: Readonly<{ cacheKey: string; value: T }>, verifySource: DerivedSourceVerification,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): T | null => {
  const review = reviewProjectDerivedField(project, id, verifySource, resolved);
  return review.status === "current" && review.cacheKey === result.cacheKey ? result.value : null;
};

/** Append exactly one typed operation after a verified vector source or current derived output. */
export const appendProjectDerivedField = (project: Math3DProject, inputId: string,
  operation: DerivedFieldOperation, options: { stableKey: string; title: string },
  verifySource: DerivedSourceVerification,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): Math3DProject => {
  const current = requireProject(project);
  const parent = current.workspace.derivedFields?.find(document => document.identity.id === inputId);
  let input: DerivedFieldInput;
  if (parent) {
    const review = reviewProjectDerivedField(current, parent.identity.id, verifySource, resolved);
    if (review.status !== "current") throw new TypeError("Derived input is not currently verified.");
    input = { kind: "derived", documentId: parent.identity.id,
      revision: parent.identity.revision, structuralHash: parent.identity.structuralHash,
      shape: parent.output };
  } else {
    const entry = current.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === inputId);
    const source = entry?.replay === null ? entry.checkpoint : resolved?.get(inputId);
    if (!entry || source?.format !== "math3d.vector-field3d-document" ||
        !sameGeneration(entry.expected, source.identity) || !verifySource(source))
      throw new TypeError("A current verified vector source is required.");
    input = { kind: "vector3d", documentId: source.identity.id,
      revision: source.identity.revision, structuralHash: source.identity.structuralHash,
      shape: vectorFieldDerivedShape(source) };
  }
  const document = createDerivedFieldDocument(input, operation, options);
  if (current.workspace.derivedFields?.some(item => item.identity.id === document.identity.id))
    throw new TypeError("Derived field ID already exists in the Project.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    derivedFields: [...(current.workspace.derivedFields ?? []), document] }));
};

/** Shared read model for Explorer and Graphs; returns intent and admission status, never samples. */
export const projectDerivedFieldsForDocument = (project: Math3DProject, documentId: string,
  verifySource: DerivedSourceVerification,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): readonly DerivedFieldReview[] => {
  const current = requireProject(project), fields = current.workspace.derivedFields ?? [];
  const descendants = new Set<string>([documentId]);
  for (let index = 0; index < fields.length; index++)
    for (const field of fields) if (descendants.has(field.input.documentId)) descendants.add(field.identity.id);
  return fields.filter(field => descendants.has(field.identity.id))
    .map(field => reviewProjectDerivedField(current, field.identity.id, verifySource, resolved));
};
