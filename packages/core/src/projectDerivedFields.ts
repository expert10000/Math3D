import { advanceDocumentIdentity, canonicalJsonStringify, structuralHash, type StructuralHash } from "./documentIdentity";
import { createDerivedFieldDocument, deriveFieldOutput, normalizeDerivedFieldDocument,
  vectorFieldDerivedShape,
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
  const inspectInput = (input: DerivedFieldInput): DerivedFieldReview["status"] => {
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
  const inspect = (document: DerivedFieldDocument): DerivedFieldReview["status"] => {
    const statuses = [document.input, ...(document.secondaryInput ? [document.secondaryInput] : [])]
      .map(inspectInput);
    return (["missing", "stale", "unverified", "current"] as const)
      .find(status => statuses.includes(status)) ?? "missing";
  };
  const status = inspect(root);
  return { status, document: root,
    cacheKey: status === "current" ? structuralHash({ document: root.identity,
      input: root.input, ...(root.secondaryInput ? { secondaryInput: root.secondaryInput } : {}),
      operation: root.operation, output: root.output }) : null };
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
  operation: DerivedFieldOperation, options: { stableKey: string; title: string;
    secondaryInputId?: string },
  verifySource: DerivedSourceVerification,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): Math3DProject => {
  const current = requireProject(project);
  const resolveInput = (id: string): DerivedFieldInput => {
    const parent = current.workspace.derivedFields?.find(document => document.identity.id === id);
    if (parent) {
      const review = reviewProjectDerivedField(current, parent.identity.id, verifySource, resolved);
      if (review.status !== "current") throw new TypeError("Derived input is not currently verified.");
      return { kind: "derived", documentId: parent.identity.id,
        revision: parent.identity.revision, structuralHash: parent.identity.structuralHash,
        shape: parent.output };
    } else {
      const entry = current.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === id);
      const source = entry?.replay === null ? entry.checkpoint : resolved?.get(id);
      if (!entry || source?.format !== "math3d.vector-field3d-document" ||
          !sameGeneration(entry.expected, source.identity) || !verifySource(source))
        throw new TypeError("A current verified vector source is required.");
      return { kind: "vector3d", documentId: source.identity.id,
        revision: source.identity.revision, structuralHash: source.identity.structuralHash,
        shape: vectorFieldDerivedShape(source) };
    }
  };
  const input = resolveInput(inputId);
  const secondaryInput = options.secondaryInputId ? resolveInput(options.secondaryInputId) : undefined;
  const document = createDerivedFieldDocument(input, operation, { ...options, secondaryInput });
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
    for (const field of fields) if (descendants.has(field.input.documentId) ||
      field.secondaryInput && descendants.has(field.secondaryInput.documentId))
      descendants.add(field.identity.id);
  return fields.filter(field => descendants.has(field.identity.id))
    .map(field => reviewProjectDerivedField(current, field.identity.id, verifySource, resolved));
};

/** Explicitly repin a saved recipe chain after verified replacement bytes. IDs and coordinates stay fixed. */
export function rebaseProjectDerivedSource(project: Math3DProject,
  replacement: VectorField3DDocument, verifyReplacement: DerivedSourceVerification): Math3DProject {
  const current = requireProject(project);
  const entry = current.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === replacement.identity.id);
  if (!entry || entry.checkpoint.format !== "math3d.vector-field3d-document" ||
      entry.replay !== null) throw new TypeError("Rebase needs a saved vector source checkpoint.");
  const old = entry.checkpoint;
  const oldField = old.source.field, newField = replacement.source.field;
  if (oldField.kind !== "scientific-bundle" || newField.kind !== "scientific-bundle" ||
      oldField.references.every((ref, index) =>
        ref.resourceSha256 === newField.references[index]!.resourceSha256))
    throw new TypeError("Source rebase requires changed scientific bundle bytes.");
  if (replacement.identity.revision !== old.identity.revision + 1 ||
      replacement.identity.structuralHash === old.identity.structuralHash ||
      canonicalJsonStringify(replacement.source.axes) !== canonicalJsonStringify(old.source.axes) ||
      canonicalJsonStringify(vectorFieldDerivedShape(replacement).componentUnits) !==
        canonicalJsonStringify(vectorFieldDerivedShape(old).componentUnits) ||
      !verifyReplacement(replacement))
    throw new TypeError("Replacement must be a newly verified generation on the same physical grid and units.");
  const rebuilt = new Map<string, DerivedFieldDocument>();
  const remaining = [...(current.workspace.derivedFields ?? [])];
  let progress = true;
  while (remaining.length && progress) {
    progress = false;
    for (let index = remaining.length - 1; index >= 0; index--) {
      const field = remaining[index]!;
      const references = [field.input, ...(field.secondaryInput ? [field.secondaryInput] : [])];
      if (references.some(input => input.kind === "derived" &&
          remaining.some(item => item.identity.id === input.documentId))) continue;
      const repin = (input: DerivedFieldInput): DerivedFieldInput => {
        if (input.kind === "vector3d" && input.documentId === old.identity.id)
          return { ...input, revision: replacement.identity.revision,
            structuralHash: replacement.identity.structuralHash,
            shape: vectorFieldDerivedShape(replacement) };
        const parent = rebuilt.get(input.documentId);
        return parent ? { ...input, revision: parent.identity.revision,
          structuralHash: parent.identity.structuralHash, shape: parent.output } : input;
      };
      const input = repin(field.input);
      const secondaryInput = field.secondaryInput && repin(field.secondaryInput);
      const changed = canonicalJsonStringify(input) !== canonicalJsonStringify(field.input) ||
        canonicalJsonStringify(secondaryInput ?? null) !== canonicalJsonStringify(field.secondaryInput ?? null);
      if (changed) {
        const output = deriveFieldOutput(input.shape, field.operation, secondaryInput?.shape);
        const identitySource = { input, ...(secondaryInput ? { secondaryInput } : {}),
          operation: field.operation, output };
        const candidate = { ...field, input, ...(secondaryInput ? { secondaryInput } : {}),
          output, identity: advanceDocumentIdentity(field.identity, identitySource) };
        const checked = normalizeDerivedFieldDocument(candidate);
        if (!checked.ok) throw new TypeError(checked.errors.join(" "));
        rebuilt.set(field.identity.id, checked.value);
      }
      remaining.splice(index, 1); progress = true;
    }
  }
  if (remaining.length) throw new TypeError("Derived recipe cycle prevents source rebase.");
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({
    ...current.workspace,
    entries: current.workspace.entries.map(item => item === entry ?
      { ...item, checkpoint: replacement, expected: replacement.identity } : item),
    derivedFields: (current.workspace.derivedFields ?? []).map(field =>
      rebuilt.get(field.identity.id) ?? field),
    scientificSelections: current.workspace.scientificSelections?.map(selection =>
      selection.source?.kind === "document" &&
      selection.source.documentId === replacement.identity.id &&
      selection.source.checkpoint?.revision === old.identity.revision &&
      selection.source.checkpoint.structuralHash === old.identity.structuralHash ?
        { ...selection, source: { ...selection.source, checkpoint: {
          revision: replacement.identity.revision,
          structuralHash: replacement.identity.structuralHash } } } : selection),
  }));
}
