import {
  advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, isStableDocumentId, isStructuralHash, structuralHash,
  type CanonicalJsonValue, type DocumentIdentity, type StableDocumentId, type StructuralHash,
} from "./documentIdentity";
import {
  canonicalJsonByteLength, isScientificSourceGeneration, matchesScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const PROJECT_NOTE_SCHEMA_VERSION = 1 as const;
export const MAX_PROJECT_NOTE_BYTES = 16 * 1024;
export type ProjectNoteKind = "text" | "callout" | "pinned" | "result";
export type NotePoint3 = readonly [number, number, number];
export type ProjectNoteAnchor =
  | Readonly<{ kind: "document"; source: ScientificSourceGeneration }>
  | Readonly<{ kind: "object-local"; source: ScientificSourceGeneration; objectId: string; localPosition: NotePoint3; shapeHash: StructuralHash }>
  | Readonly<{ kind: "subentity"; source: ScientificSourceGeneration; objectId: string; entityKind: "face" | "edge" | "vertex"; entityId: string; topologyHash: StructuralHash; barycentric?: NotePoint3 }>
  | Readonly<{ kind: "result"; source: ScientificSourceGeneration; resultId: string; resultHash: StructuralHash }>
  | Readonly<{ kind: "workbook-block"; workbookId: StableDocumentId; workbookRevision: number; blockId: string; blockHash: StructuralHash }>;

export type ProjectNote = Readonly<{
  schemaVersion: typeof PROJECT_NOTE_SCHEMA_VERSION;
  identity: DocumentIdentity;
  projectId: StableDocumentId;
  kind: ProjectNoteKind;
  title: string;
  body: string;
  anchor: ProjectNoteAnchor | null;
  createdAt: number;
  updatedAt: number;
}>;

export type ProjectNoteAnchorInspection = Readonly<{
  status: "unanchored" | "current" | "stale" | "missing" | "different-project" | "invalid";
  reason: string;
  currentSource?: ScientificSourceGeneration;
}>;

export type ProjectNoteAnchorResolver = Readonly<{
  projectId: StableDocumentId;
  source: (documentId: StableDocumentId) => ScientificSourceGeneration | null;
  objectShape?: (documentId: StableDocumentId, objectId: string) => StructuralHash | null;
  subentityTopology?: (documentId: StableDocumentId, objectId: string, entityKind: "face" | "edge" | "vertex", entityId: string) => StructuralHash | null;
  result?: (resultId: string) => Readonly<{ source: ScientificSourceGeneration; hash: StructuralHash }> | null;
  workbookBlock?: (workbookId: StableDocumentId, blockId: string) => Readonly<{ revision: number; hash: StructuralHash }> | null;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const point = (value: unknown): value is NotePoint3 =>
  Array.isArray(value) && value.length === 3 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));

export const normalizeProjectNoteAnchor = (value: unknown): ProjectNoteAnchor | null => {
  if (!record(value)) return null;
  if (value.kind === "workbook-block") {
    if (!exact(value, ["kind", "workbookId", "workbookRevision", "blockId", "blockHash"]) ||
      !isStableDocumentId(value.workbookId) || !value.workbookId.startsWith("math3d:workbook:") ||
      !positive(value.workbookRevision) || !id(value.blockId) || !isStructuralHash(value.blockHash)) return null;
  } else {
    if (!isScientificSourceGeneration(value.source)) return null;
    if (value.kind === "document") {
      if (!exact(value, ["kind", "source"])) return null;
    } else if (value.kind === "object-local") {
      if (!exact(value, ["kind", "source", "objectId", "localPosition", "shapeHash"]) ||
        !id(value.objectId) || !point(value.localPosition) || !isStructuralHash(value.shapeHash)) return null;
    } else if (value.kind === "subentity") {
      if (!exact(value, "barycentric" in value
        ? ["kind", "source", "objectId", "entityKind", "entityId", "topologyHash", "barycentric"]
        : ["kind", "source", "objectId", "entityKind", "entityId", "topologyHash"]) ||
        !id(value.objectId) || !["face", "edge", "vertex"].includes(String(value.entityKind)) ||
        !id(value.entityId) || !isStructuralHash(value.topologyHash) ||
        (value.entityKind === "face" ? !point(value.barycentric) || Math.abs((value.barycentric as NotePoint3).reduce((sum, coordinate) => sum + coordinate, 0) - 1) > 1e-6 ||
          (value.barycentric as NotePoint3).some((coordinate) => coordinate < -1e-6 || coordinate > 1 + 1e-6) : "barycentric" in value)) return null;
    } else if (value.kind === "result") {
      if (!exact(value, ["kind", "source", "resultId", "resultHash"]) ||
        !id(value.resultId) || !isStructuralHash(value.resultHash)) return null;
    } else return null;
  }
  return JSON.parse(canonicalJsonStringify(value)) as ProjectNoteAnchor;
};

const noteSource = (note: Pick<ProjectNote, "projectId" | "kind" | "title" | "body" | "anchor">) => ({
  projectId: note.projectId, kind: note.kind, title: note.title, body: note.body, anchor: note.anchor,
});

export const normalizeProjectNote = (value: unknown): ValidationResult<ProjectNote> => {
  try {
    if (canonicalJsonByteLength(value) > MAX_PROJECT_NOTE_BYTES) return { ok: false, errors: ["Note exceeds its size limit."] };
    if (!record(value) || !exact(value, ["schemaVersion", "identity", "projectId", "kind", "title", "body", "anchor", "createdAt", "updatedAt"]) ||
      value.schemaVersion !== PROJECT_NOTE_SCHEMA_VERSION || !record(value.identity) ||
      !exact(value.identity, ["schemaVersion", "id", "revision", "structuralHash"]) || !isDocumentIdentity(value.identity) ||
      !value.identity.id.startsWith("math3d:note:") || !isStableDocumentId(value.projectId) ||
      !value.projectId.startsWith("math3d:project:") ||
      !["text", "callout", "pinned", "result"].includes(String(value.kind)) ||
      typeof value.title !== "string" || value.title.length < 1 || value.title.length > 160 || value.title.trim() !== value.title ||
      typeof value.body !== "string" || value.body.trim().length < 1 || value.body.length > 8192 ||
      !time(value.createdAt) || !time(value.updatedAt) || value.updatedAt < value.createdAt) {
      return { ok: false, errors: ["Invalid project Note envelope."] };
    }
    const anchor = value.anchor === null ? null : normalizeProjectNoteAnchor(value.anchor);
    if (value.anchor !== null && !anchor) return { ok: false, errors: ["Invalid Note anchor."] };
    if ((value.kind === "pinned" && anchor?.kind !== "object-local" && anchor?.kind !== "subentity") ||
      (value.kind === "result" && anchor?.kind !== "result")) return { ok: false, errors: ["Note kind requires a matching anchor."] };
    const normalized = JSON.parse(canonicalJsonStringify({ ...value, anchor })) as ProjectNote;
    if (normalized.identity.structuralHash !== structuralHash(noteSource(normalized))) return { ok: false, errors: ["Note content hash does not match its identity."] };
    return { ok: true, value: normalized };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

const requireNote = (value: unknown): ProjectNote => {
  const checked = normalizeProjectNote(value);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

export const createProjectNote = (input: {
  projectId: StableDocumentId; stableKey: CanonicalJsonValue; kind: ProjectNoteKind;
  title: string; body: string; anchor?: ProjectNoteAnchor | null; createdAt: number;
}): ProjectNote => {
  const source = { projectId: input.projectId, kind: input.kind, title: input.title, body: input.body, anchor: input.anchor ?? null };
  return requireNote({ schemaVersion: PROJECT_NOTE_SCHEMA_VERSION,
    identity: createDocumentIdentity(createStableDocumentId("note", { projectId: input.projectId, stableKey: input.stableKey }), source),
    ...source, createdAt: input.createdAt, updatedAt: input.createdAt });
};

export const updateProjectNote = (note: ProjectNote, patch: Partial<Pick<ProjectNote, "kind" | "title" | "body" | "anchor">>, updatedAt: number): ProjectNote => {
  const current = requireNote(note);
  if (!record(patch) || Object.keys(patch).some((key) => !["kind", "title", "body", "anchor"].includes(key)))
    throw new TypeError("Note update contains unsupported fields.");
  if (!time(updatedAt) || updatedAt < current.updatedAt) throw new TypeError("Note update time cannot precede its current version.");
  const source = noteSource({
    projectId: current.projectId, kind: patch.kind ?? current.kind, title: patch.title ?? current.title,
    body: patch.body ?? current.body, anchor: "anchor" in patch ? patch.anchor! : current.anchor,
  });
  const identity = advanceDocumentIdentity(current.identity, source);
  if (identity === current.identity) return current;
  return requireNote({ ...current, ...source, identity, updatedAt });
};

export const serializeProjectNote = (note: ProjectNote): string => canonicalJsonStringify(requireNote(note));
export const parseProjectNote = (raw: string): ProjectNote => {
  if (new TextEncoder().encode(raw).byteLength > MAX_PROJECT_NOTE_BYTES) throw new TypeError("Note exceeds its size limit.");
  return requireNote(JSON.parse(raw));
};

/** Resolution is read-only. A caller supplies verified live generations and shape/topology fingerprints. */
export const inspectProjectNoteAnchor = (candidate: unknown, resolver: ProjectNoteAnchorResolver): ProjectNoteAnchorInspection => {
  const checked = normalizeProjectNote(candidate);
  if (!checked.ok) return { status: "invalid", reason: checked.errors.join(" ") };
  const note = checked.value;
  if (note.projectId !== resolver.projectId) return { status: "different-project", reason: "Note belongs to a different Project." };
  const anchor = note.anchor;
  if (!anchor) return { status: "unanchored", reason: "Note has no target." };
  if (anchor.kind === "workbook-block") {
    const block = resolver.workbookBlock?.(anchor.workbookId, anchor.blockId);
    if (!block || !positive(block.revision) || !isStructuralHash(block.hash)) return { status: "missing", reason: "Workbook block is unavailable." };
    return block.revision === anchor.workbookRevision && block.hash === anchor.blockHash
      ? { status: "current", reason: "Workbook block generation matches." }
      : { status: "stale", reason: "Workbook block generation has changed." };
  }
  const currentSource = resolver.source(anchor.source.documentId);
  if (!currentSource || !isScientificSourceGeneration(currentSource) || currentSource.documentId !== anchor.source.documentId)
    return { status: "missing", reason: "Source document is unavailable." };
  if (anchor.kind === "object-local") {
    const shape = resolver.objectShape?.(anchor.source.documentId, anchor.objectId);
    if (!shape || !isStructuralHash(shape)) return { status: "missing", reason: "Anchored object is unavailable.", currentSource };
    return shape === anchor.shapeHash
      ? { status: "current", reason: "Object-local shape matches; transforms preserve this anchor.", currentSource }
      : { status: "stale", reason: "Object shape has changed.", currentSource };
  }
  if (anchor.kind === "subentity") {
    const topology = resolver.subentityTopology?.(anchor.source.documentId, anchor.objectId, anchor.entityKind, anchor.entityId);
    if (!topology || !isStructuralHash(topology)) return { status: "missing", reason: "Anchored subentity is unavailable.", currentSource };
    return topology === anchor.topologyHash
      ? { status: "current", reason: "Subentity topology matches.", currentSource }
      : { status: "stale", reason: "Subentity topology has changed.", currentSource };
  }
  if (anchor.kind === "result") {
    const result = resolver.result?.(anchor.resultId);
    if (!result || !isScientificSourceGeneration(result.source) || !isStructuralHash(result.hash) ||
      !matchesScientificSourceGeneration(result.source, anchor.source) || result.hash !== anchor.resultHash)
      return { status: "missing", reason: "The exact saved result is unavailable.", currentSource };
  }
  return matchesScientificSourceGeneration(anchor.source, currentSource)
    ? { status: "current", reason: "Source generation matches.", currentSource }
    : { status: "stale", reason: "Source generation has changed.", currentSource };
};
