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
import type { ProjectCoordinateFrame } from "./projectComposition";
import { normalizeProjectNoteValueBindings, normalizeProjectNoteValueSnapshot, type ProjectNoteValueBinding, type ProjectNoteValueSnapshot } from "./projectNoteValues";
import { normalizeResearchReference, type ResearchReference } from "./researchReferenceSchema";

export const PROJECT_NOTE_SCHEMA_VERSION = 1 as const;
export const MAX_PROJECT_NOTE_BYTES = 16 * 1024;
export type ProjectNoteKind = "text" | "callout" | "pinned" | "result";
export type NotePoint3 = readonly [number, number, number];
export type ProjectComparisonCoordinateProbe = Readonly<{
  format: "math3d.comparison-coordinate-probe/v1";
  sourceSlot: "A" | "B";
  point: NotePoint3;
  coordinateFrame: ProjectCoordinateFrame;
}>;
export type ProjectNoteAnchor = (
  | Readonly<{ kind: "comparison"; compositionId: string; compositionHash: StructuralHash;
      members: readonly [DocumentIdentity, DocumentIdentity]; alignment: "source-declared match" | "operator assertion" | "not applicable";
      coordinateProbe?: ProjectComparisonCoordinateProbe }>
  | Readonly<{ kind: "saved-mesh-comparison"; comparisonId: string; comparisonHash: StructuralHash; metricPath: string;
      a: Readonly<{ resultId: string; resultHash: StructuralHash; meshId: StableDocumentId; revision: number; sourceHash: StructuralHash }>;
      b: Readonly<{ resultId: string; resultHash: StructuralHash; meshId: StableDocumentId; revision: number; sourceHash: StructuralHash }> }>
  | Readonly<{ kind: "document"; source: ScientificSourceGeneration }>
  | Readonly<{ kind: "object-local"; source: ScientificSourceGeneration; objectId: string; localPosition: NotePoint3; shapeHash: StructuralHash }>
  | Readonly<{ kind: "subentity"; source: ScientificSourceGeneration; objectId: string; entityKind: "face" | "edge" | "vertex"; entityId: string; topologyHash: StructuralHash; barycentric?: NotePoint3 }>
  | Readonly<{ kind: "entity-selection"; source: ScientificSourceGeneration; objectId: string; entityKind: "face" | "edge" | "vertex"; entityId: string; topologyHash: StructuralHash }>
  | Readonly<{ kind: "result"; source: ScientificSourceGeneration; resultId: string; resultHash: StructuralHash }>
  | Readonly<{ kind: "study-selection"; source: ScientificSourceGeneration; studyId: StableDocumentId;
      studyHash: StructuralHash; memberId: string; selectionId: string }>
  | Readonly<{ kind: "graph-selection"; source: ScientificSourceGeneration; objectId: string; objectHash: StructuralHash;
      probe?: Readonly<{ x: number; y: number; parameter?: number; rowId?: string }> }>
  | Readonly<{ kind: "workbook-block"; workbookId: StableDocumentId; workbookRevision: number; blockId: string; blockHash: StructuralHash }>) &
  Readonly<{ researchReference?: ResearchReference }>;

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
  valueBindings?: readonly ProjectNoteValueBinding[];
  valueSnapshot?: ProjectNoteValueSnapshot | null;
}>;

export type ProjectNoteAnchorInspection = Readonly<{
  status: "unanchored" | "current" | "stale" | "missing" | "different-project" | "invalid";
  reason: string;
  currentSource?: ScientificSourceGeneration;
}>;

export type ProjectNoteAnchorResolver = Readonly<{
  projectId: StableDocumentId;
  source: (documentId: StableDocumentId) => ScientificSourceGeneration | null;
  comparison?: (compositionId: string) => Readonly<{ hash: StructuralHash; members: readonly [DocumentIdentity, DocumentIdentity];
    alignment: "source-declared match" | "operator assertion" | "not applicable"; available: boolean }> | null;
  savedMeshComparison?: (comparisonId: string) => Readonly<{ hash: StructuralHash; metricPath: string;
    a: Extract<ProjectNoteAnchor, { kind: "saved-mesh-comparison" }>["a"];
    b: Extract<ProjectNoteAnchor, { kind: "saved-mesh-comparison" }>["b"]; available: boolean }> | null;
  objectShape?: (documentId: StableDocumentId, objectId: string) => StructuralHash | null;
  subentityTopology?: (documentId: StableDocumentId, objectId: string, entityKind: "face" | "edge" | "vertex", entityId: string) => StructuralHash | null;
  result?: (resultId: string) => Readonly<{ source: ScientificSourceGeneration; hash: StructuralHash }> | null;
  studySelection?: (studyId: StableDocumentId, memberId: string, selectionId: string) => Readonly<{
    hash: StructuralHash; source: ScientificSourceGeneration; status: "current" | "stale" | "missing" }> | null;
  graphObject?: (documentId: StableDocumentId, objectId: string) => StructuralHash | null;
  workbookBlock?: (workbookId: StableDocumentId, blockId: string) => Readonly<{ revision: number; hash: StructuralHash }> | null;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const anchorExact = (value: Record<string, unknown>, keys: readonly string[]) =>
  exact(value, [...keys, ...("researchReference" in value ? ["researchReference"] : [])]);
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const point = (value: unknown): value is NotePoint3 =>
  Array.isArray(value) && value.length === 3 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));

export const normalizeProjectNoteAnchor = (value: unknown): ProjectNoteAnchor | null => {
  if (!record(value)) return null;
  if ("researchReference" in value) {
    const reference = normalizeResearchReference(value.researchReference);
    if (!reference || !isScientificSourceGeneration(value.source) ||
      !matchesScientificSourceGeneration(reference.source, value.source) ||
      reference.kind !== (value.kind === "result" ? "result" : value.kind === "document" ? "document" : "selection") ||
      reference.targetHash !== (value.kind === "result" ? value.resultHash : value.kind === "study-selection" ? value.studyHash :
        value.kind === "graph-selection" ? value.objectHash : value.kind === "object-local" ? value.shapeHash :
          value.kind === "entity-selection" || value.kind === "subentity" ? value.topologyHash : value.source.structuralHash)) return null;
  }
  if (value.kind === "comparison") {
    if (!anchorExact(value, ["kind", "compositionId", "compositionHash", "members", "alignment",
      ...(value.coordinateProbe === undefined ? [] : ["coordinateProbe"])]) ||
      !id(value.compositionId) || value.compositionId.length > 120 || !isStructuralHash(value.compositionHash) ||
      !Array.isArray(value.members) || value.members.length !== 2 ||
      !value.members.every((member: unknown) => isDocumentIdentity(member)) ||
      !["source-declared match", "operator assertion", "not applicable"].includes(String(value.alignment))) return null;
    if (value.coordinateProbe !== undefined) {
      const probe = value.coordinateProbe;
      if (!record(probe) || !exact(probe, ["format", "sourceSlot", "point", "coordinateFrame"]) ||
        probe.format !== "math3d.comparison-coordinate-probe/v1" || !["A", "B"].includes(String(probe.sourceSlot)) ||
        !point(probe.point) || !record(probe.coordinateFrame) ||
        !exact(probe.coordinateFrame, ["format", "frame", "unit", "axes", "handedness"]) ||
        probe.coordinateFrame.format !== "math3d.coordinate-frame/v1" ||
        !id(probe.coordinateFrame.frame) || probe.coordinateFrame.frame.length > 80 ||
        !id(probe.coordinateFrame.unit) || probe.coordinateFrame.unit.length > 40 ||
        !Array.isArray(probe.coordinateFrame.axes) || probe.coordinateFrame.axes.length !== 3 ||
        !probe.coordinateFrame.axes.every((axis: unknown) => id(axis) && axis.length <= 32) ||
        new Set(probe.coordinateFrame.axes).size !== 3 ||
        !["right", "left"].includes(String(probe.coordinateFrame.handedness))) return null;
    }
  } else if (value.kind === "saved-mesh-comparison") {
    const side = (candidate: unknown) => record(candidate) && exact(candidate, ["resultId", "resultHash", "meshId", "revision", "sourceHash"]) &&
      id(candidate.resultId) && isStructuralHash(candidate.resultHash) && isStableDocumentId(candidate.meshId) &&
      positive(candidate.revision) && isStructuralHash(candidate.sourceHash);
    if (!anchorExact(value, ["kind", "comparisonId", "comparisonHash", "metricPath", "a", "b"]) ||
      !id(value.comparisonId) || value.comparisonId.length > 120 || !isStructuralHash(value.comparisonHash) ||
      !id(value.metricPath) || !side(value.a) || !side(value.b)) return null;
  } else if (value.kind === "workbook-block") {
    if (!anchorExact(value, ["kind", "workbookId", "workbookRevision", "blockId", "blockHash"]) ||
      !isStableDocumentId(value.workbookId) || !value.workbookId.startsWith("math3d:workbook:") ||
      !positive(value.workbookRevision) || !id(value.blockId) || !isStructuralHash(value.blockHash)) return null;
  } else {
    if (!isScientificSourceGeneration(value.source)) return null;
    if (value.kind === "document") {
      if (!anchorExact(value, ["kind", "source"])) return null;
    } else if (value.kind === "object-local") {
      if (!anchorExact(value, ["kind", "source", "objectId", "localPosition", "shapeHash"]) ||
        !id(value.objectId) || !point(value.localPosition) || !isStructuralHash(value.shapeHash)) return null;
    } else if (value.kind === "entity-selection") {
      if (!anchorExact(value, ["kind", "source", "objectId", "entityKind", "entityId", "topologyHash"]) ||
        !id(value.objectId) || !["face", "edge", "vertex"].includes(String(value.entityKind)) ||
        !id(value.entityId) || !isStructuralHash(value.topologyHash)) return null;
    } else if (value.kind === "subentity") {
      if (!anchorExact(value, "barycentric" in value
        ? ["kind", "source", "objectId", "entityKind", "entityId", "topologyHash", "barycentric"]
        : ["kind", "source", "objectId", "entityKind", "entityId", "topologyHash"]) ||
        !id(value.objectId) || !["face", "edge", "vertex"].includes(String(value.entityKind)) ||
        !id(value.entityId) || !isStructuralHash(value.topologyHash) ||
        (value.entityKind === "face" ? !point(value.barycentric) || Math.abs((value.barycentric as NotePoint3).reduce((sum, coordinate) => sum + coordinate, 0) - 1) > 1e-6 ||
          (value.barycentric as NotePoint3).some((coordinate) => coordinate < -1e-6 || coordinate > 1 + 1e-6) : "barycentric" in value)) return null;
    } else if (value.kind === "result") {
      if (!anchorExact(value, ["kind", "source", "resultId", "resultHash"]) ||
        !id(value.resultId) || !isStructuralHash(value.resultHash)) return null;
    } else if (value.kind === "study-selection") {
      if (!anchorExact(value, ["kind", "source", "studyId", "studyHash", "memberId", "selectionId"]) ||
        !isStableDocumentId(value.studyId) || !value.studyId.startsWith("math3d:study:") ||
        !isStructuralHash(value.studyHash) || !id(value.memberId) || !id(value.selectionId) ||
        value.memberId.length > 160 || value.selectionId.length > 160) return null;
    } else if (value.kind === "graph-selection") {
      if (!anchorExact(value, "probe" in value ? ["kind", "source", "objectId", "objectHash", "probe"] : ["kind", "source", "objectId", "objectHash"]) ||
        !id(value.objectId) || !isStructuralHash(value.objectHash)) return null;
      if ("probe" in value) {
        if (!record(value.probe) || !exact(value.probe, ["x", "y", ...(value.probe.parameter === undefined ? [] : ["parameter"]), ...(value.probe.rowId === undefined ? [] : ["rowId"])]) ||
          typeof value.probe.x !== "number" || !Number.isFinite(value.probe.x) ||
          typeof value.probe.y !== "number" || !Number.isFinite(value.probe.y) ||
          (value.probe.parameter !== undefined && (typeof value.probe.parameter !== "number" || !Number.isFinite(value.probe.parameter))) ||
          (value.probe.rowId !== undefined && !id(value.probe.rowId))) return null;
      }
    } else return null;
  }
  return JSON.parse(canonicalJsonStringify(value)) as ProjectNoteAnchor;
};

const noteSource = (note: Pick<ProjectNote, "projectId" | "kind" | "title" | "body" | "anchor" | "valueBindings" | "valueSnapshot">) => ({
  projectId: note.projectId, kind: note.kind, title: note.title, body: note.body, anchor: note.anchor,
  ...(note.valueBindings !== undefined ? { valueBindings: note.valueBindings } : {}),
  ...(note.valueSnapshot !== undefined ? { valueSnapshot: note.valueSnapshot } : {}),
});

export const normalizeProjectNote = (value: unknown): ValidationResult<ProjectNote> => {
  try {
    if (canonicalJsonByteLength(value) > MAX_PROJECT_NOTE_BYTES) return { ok: false, errors: ["Note exceeds its size limit."] };
    if (!record(value) || !exact(value, ["schemaVersion", "identity", "projectId", "kind", "title", "body", "anchor", "createdAt", "updatedAt", ...("valueBindings" in value ? ["valueBindings"] : []), ...("valueSnapshot" in value ? ["valueSnapshot"] : [])]) ||
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
    if (normalized.valueBindings !== undefined) normalizeProjectNoteValueBindings(normalized.valueBindings);
    if (normalized.valueSnapshot !== undefined && normalized.valueSnapshot !== null) normalizeProjectNoteValueSnapshot(normalized.valueSnapshot, normalized.valueBindings ?? []);
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

export const updateProjectNote = (note: ProjectNote, patch: Partial<Pick<ProjectNote, "kind" | "title" | "body" | "anchor" | "valueBindings" | "valueSnapshot">>, updatedAt: number): ProjectNote => {
  const current = requireNote(note);
  if (!record(patch) || Object.keys(patch).some((key) => !["kind", "title", "body", "anchor", "valueBindings", "valueSnapshot"].includes(key)))
    throw new TypeError("Note update contains unsupported fields.");
  if (!time(updatedAt) || updatedAt < current.updatedAt) throw new TypeError("Note update time cannot precede its current version.");
  const source = noteSource({
    projectId: current.projectId, kind: patch.kind ?? current.kind, title: patch.title ?? current.title,
    body: patch.body ?? current.body, anchor: "anchor" in patch ? patch.anchor! : current.anchor,
    ...(patch.valueBindings !== undefined ? { valueBindings: patch.valueBindings } : current.valueBindings !== undefined ? { valueBindings: current.valueBindings } : {}),
    ...("valueSnapshot" in patch ? { valueSnapshot: patch.valueSnapshot } : current.valueSnapshot !== undefined ? { valueSnapshot: current.valueSnapshot } : {}),
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
  if (anchor.kind === "comparison") {
    const current = resolver.comparison?.(anchor.compositionId);
    if (!current) return { status: "missing", reason: "Saved comparison is unavailable." };
    if (current.hash !== anchor.compositionHash || current.alignment !== anchor.alignment ||
      current.members.some((member, index) => member.id !== anchor.members[index]!.id ||
        member.revision !== anchor.members[index]!.revision || member.structuralHash !== anchor.members[index]!.structuralHash))
      return { status: "stale", reason: "Saved comparison or a referenced source generation changed." };
    return current.available ? { status: "current", reason: "Both exact comparison sources are available." } :
      { status: "missing", reason: "An exact comparison source or resource is unavailable." };
  }
  if (anchor.kind === "saved-mesh-comparison") {
    const current = resolver.savedMeshComparison?.(anchor.comparisonId);
    if (!current) return { status: "missing", reason: "Saved Mesh comparison is unavailable." };
    if (current.hash !== anchor.comparisonHash || current.metricPath !== anchor.metricPath ||
      canonicalJsonStringify(current.a) !== canonicalJsonStringify(anchor.a) ||
      canonicalJsonStringify(current.b) !== canonicalJsonStringify(anchor.b))
      return { status: "stale", reason: "Saved Mesh comparison, result, or source generation changed." };
    return current.available ? { status: "current", reason: "Both exact saved Mesh results and source sidecars are available." } :
      { status: "missing", reason: "A saved Mesh result or exact source sidecar is unavailable." };
  }
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
  if (anchor.kind === "subentity" || anchor.kind === "entity-selection") {
    const topology = resolver.subentityTopology?.(anchor.source.documentId, anchor.objectId, anchor.entityKind, anchor.entityId);
    if (!topology || !isStructuralHash(topology)) return { status: "missing", reason: "Anchored subentity is unavailable.", currentSource };
    return topology === anchor.topologyHash
      ? { status: "current", reason: "Subentity topology matches.", currentSource }
      : { status: "stale", reason: "Subentity topology has changed.", currentSource };
  }
  if (anchor.kind === "graph-selection") {
    const objectHash = resolver.graphObject?.(anchor.source.documentId, anchor.objectId);
    if (!objectHash || !isStructuralHash(objectHash)) return { status: "missing", reason: "Selected Graph object is unavailable.", currentSource };
    if (objectHash !== anchor.objectHash) return { status: "stale", reason: "Selected Graph object changed.", currentSource };
    return { status: "current", reason: "Selected Graph object matches.", currentSource };
  }
  if (anchor.kind === "result") {
    const result = resolver.result?.(anchor.resultId);
    if (!result || !isScientificSourceGeneration(result.source) || !isStructuralHash(result.hash) ||
      !matchesScientificSourceGeneration(result.source, anchor.source) || result.hash !== anchor.resultHash)
      return { status: "missing", reason: "The exact saved result is unavailable.", currentSource };
  }
  if (anchor.kind === "study-selection") {
    const linked = resolver.studySelection?.(anchor.studyId, anchor.memberId, anchor.selectionId);
    if (!linked || linked.status === "missing")
      return { status: "missing", reason: "The pinned Study selection or a member is unavailable.", currentSource };
    if (linked.hash !== anchor.studyHash || linked.status === "stale" ||
      !matchesScientificSourceGeneration(linked.source, anchor.source))
      return { status: "stale", reason: "The Study, pinned selection, or member generation changed.", currentSource };
    return matchesScientificSourceGeneration(anchor.source, currentSource)
      ? { status: "current", reason: "Study pin and member generation match; external scientific bytes still require verification.", currentSource }
      : { status: "stale", reason: "Study selection source generation changed.", currentSource };
  }
  return matchesScientificSourceGeneration(anchor.source, currentSource)
    ? { status: "current", reason: "Source generation matches.", currentSource }
    : { status: "stale", reason: "Source generation has changed.", currentSource };
};
