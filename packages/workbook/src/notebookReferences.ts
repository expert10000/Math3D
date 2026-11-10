import {
  isScientificSourceGeneration,
  isStableDocumentId,
  isStructuralHash,
  inspectProjectStudyMembers,
  matchesScientificSourceGeneration,
  normalizeMath3DProject,
  structuralHash,
  viewerSourceFromDocument,
  createResearchReference,
  inspectResearchReference,
  matchesScientificSourceGeneration as sourceMatches,
  normalizeResearchReference,
  researchResourcePins,
  type ResearchReference,
  type AnalysisResultEnvelope,
  type Math3DProject,
  type ScientificSourceGeneration,
  type StableDocumentId,
  type StudyRecordV1,
  type StructuralHash,
} from "@math3d/core";

export const NOTEBOOK_REFERENCE_SCHEMA_VERSION = 2 as const;

/** A citation into a normal named Project. No document, result or figure bytes are copied into a Workbook cell. */
type NotebookReferenceBase = Readonly<{
  schemaVersion: 1 | typeof NOTEBOOK_REFERENCE_SCHEMA_VERSION;
  projectId: StableDocumentId;
  targetId: string;
  source: ScientificSourceGeneration;
  pinnedEvidence?: ResearchReference;
}>;
export type NotebookReference =
  | (NotebookReferenceBase & Readonly<{ kind: "document" }>)
  | (NotebookReferenceBase & Readonly<{ kind: "result"; resultHash: StructuralHash }>)
  | (NotebookReferenceBase & Readonly<{ kind: "study"; studyHash: StructuralHash }>);

export type NotebookReferenceInspection = Readonly<{
  status: "current" | "stale" | "missing" | "different-project";
  reason: string;
  currentSource?: ScientificSourceGeneration;
  result?: AnalysisResultEnvelope;
  study?: StudyRecordV1;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function normalizeNotebookReference(value: unknown): NotebookReference | null {
  const pinned = value && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion === 2;
  if (!isRecord(value) || Object.keys(value).sort().join("|") !==
      (value.kind === "result" ? `kind|projectId|resultHash|schemaVersion|source|targetId${pinned ? "|pinnedEvidence" : ""}` :
        value.kind === "study" ? `kind|projectId|schemaVersion|source|studyHash|targetId${pinned ? "|pinnedEvidence" : ""}` :
          `kind|projectId|schemaVersion|source|targetId${pinned ? "|pinnedEvidence" : ""}`).split("|").sort().join("|") ||
    (value.schemaVersion !== 1 && value.schemaVersion !== NOTEBOOK_REFERENCE_SCHEMA_VERSION) ||
    !isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:") ||
    (value.kind !== "document" && value.kind !== "result" && value.kind !== "study") ||
    typeof value.targetId !== "string" || value.targetId.length < 1 || value.targetId.length > 256 ||
    value.targetId.trim() !== value.targetId || !isScientificSourceGeneration(value.source) ||
    (value.kind === "document" && (value.targetId !== value.source.documentId || !isStableDocumentId(value.targetId))) ||
    (value.kind === "result" && !isStructuralHash(value.resultHash)) ||
    (value.kind === "study" && (!isStableDocumentId(value.targetId) ||
      !value.targetId.startsWith("math3d:study:") || !isStructuralHash(value.studyHash)))) return null;
  const evidence = pinned ? normalizeResearchReference(value.pinnedEvidence) : null;
  if (pinned && (!evidence || evidence.kind !== value.kind || evidence.projectId !== value.projectId ||
    evidence.targetId !== value.targetId || !sourceMatches(evidence.source, value.source) ||
    evidence.targetHash !== (value.kind === "result" ? value.resultHash :
      value.kind === "study" ? value.studyHash : value.source.structuralHash))) return null;
  const base = {
    schemaVersion: value.schemaVersion as 1 | 2,
    projectId: value.projectId,
    targetId: value.targetId,
    source: { ...value.source },
    ...(evidence ? { pinnedEvidence: evidence } : {}),
  };
  return value.kind === "result"
    ? { ...base, kind: "result", resultHash: value.resultHash as StructuralHash }
    : value.kind === "study" ? { ...base, kind: "study", studyHash: value.studyHash as StructuralHash }
    : { ...base, kind: "document" };
}

const validatedProject = (project: Math3DProject): Math3DProject => {
  const checked = normalizeMath3DProject(project);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

export function createNotebookReference(project: Math3DProject, kind: NotebookReference["kind"], targetId: string): NotebookReference {
  const current = validatedProject(project);
  const result = kind === "result" ? current.workspace.results.find((item) => item.resultId === targetId) : null;
  const study = kind === "study" ? current.workspace.studies?.find((item) => item.id === targetId) : null;
  const source = kind === "document"
    ? (() => {
      const entry = current.workspace.entries.find((item) => item.expected.id === targetId);
      return entry ? viewerSourceFromDocument({ identity: entry.expected }) : null;
    })()
    : kind === "study" ? study?.members[0] && viewerSourceFromDocument({ identity: study.members[0].expected })
      : result?.provenance.source ?? null;
  if (!source) throw new RangeError(`Project ${kind} '${targetId}' was not found.`);
  const pinnedEvidence = createResearchReference({ projectId: current.identity.id, kind, targetId, source,
    targetHash: result ? structuralHash(result) : study ? structuralHash(study) : source.structuralHash,
    resources: researchResourcePins(current, source.documentId) });
  const reference = normalizeNotebookReference({
    schemaVersion: NOTEBOOK_REFERENCE_SCHEMA_VERSION,
    projectId: current.identity.id,
    kind,
    targetId,
    source,
    pinnedEvidence,
    ...(result ? { resultHash: structuralHash(result) } : {}),
    ...(study ? { studyHash: structuralHash(study) } : {}),
  });
  if (!reference) throw new TypeError("Project target cannot form a notebook reference.");
  return reference;
}

/** Convert v1 without borrowing resource descriptors from a later Project generation. */
export function migrateLegacyNotebookReference(candidate: unknown): NotebookReference | null {
  const ref = normalizeNotebookReference(candidate);
  if (!ref) return null;
  if (ref.schemaVersion === 2) return ref;
  const pinnedEvidence = createResearchReference({ projectId: ref.projectId, kind: ref.kind,
    targetId: ref.targetId, source: ref.source,
    targetHash: ref.kind === "result" ? ref.resultHash : ref.kind === "study" ? ref.studyHash : ref.source.structuralHash,
    resources: [], pinState: "legacy-unpinned" });
  return normalizeNotebookReference({ ...ref, schemaVersion: 2, pinnedEvidence });
}

/** Resolves IDs and source generations only. A later viewer must still verify replay and artifact bytes. */
const inspectNotebookReferenceBase = (project: Math3DProject, candidate: unknown): NotebookReferenceInspection => {
  const reference = normalizeNotebookReference(candidate);
  if (!reference) return { status: "missing", reason: "Invalid notebook reference." };
  const current = validatedProject(project);
  if (reference.projectId !== current.identity.id) {
    return { status: "different-project", reason: "The reference belongs to a different project." };
  }
  if (reference.kind === "document") {
    const entry = current.workspace.entries.find((item) => item.expected.id === reference.targetId);
    if (!entry) return { status: "missing", reason: "The referenced document is absent from this project." };
    const currentSource = viewerSourceFromDocument({ identity: entry.expected });
    return matchesScientificSourceGeneration(reference.source, currentSource)
      ? { status: "current", reason: "Document source generation matches.", currentSource }
      : { status: "stale", reason: "Document source generation has changed.", currentSource };
  }
  if (reference.kind === "study") {
    const study = current.workspace.studies?.find((item) => item.id === reference.targetId);
    if (!study) return { status: "missing", reason: "The referenced Study is absent from this project." };
    if (structuralHash(study) !== reference.studyHash)
      return { status: "stale", reason: "The Study record changed after this citation was saved.", study };
    const first = study.members[0]!;
    const recordedSource = viewerSourceFromDocument({ identity: first.expected });
    if (!matchesScientificSourceGeneration(reference.source, recordedSource))
      return { status: "stale", reason: "The cited Study source generation differs from its saved member.", study };
    const members = inspectProjectStudyMembers(current, study);
    const missing = members.find(item => item.status === "missing-document" || item.status === "missing-result");
    if (missing) return { status: "missing", reason: `Study member ${missing.memberId} is unavailable.`, study };
    const changed = members.find(item => item.status === "changed");
    if (changed) return { status: "stale", reason: `Study member ${changed.memberId} changed.`, study };
    return { status: "current", reason: "Study record and all member generations match this Project.",
      currentSource: recordedSource, study };
  }
  const result = current.workspace.results.find((item) => item.resultId === reference.targetId);
  if (!result || !matchesScientificSourceGeneration(reference.source, result.provenance.source) ||
    structuralHash(result) !== reference.resultHash) {
    return { status: "missing", reason: "The referenced result and its recorded source are unavailable." };
  }
  const sourceEntry = current.workspace.entries.find((item) => item.expected.id === reference.source.documentId);
  if (!sourceEntry) return { status: "missing", reason: "The result source document is absent from this project.", result };
  const currentSource = viewerSourceFromDocument({ identity: sourceEntry.expected });
  return matchesScientificSourceGeneration(reference.source, currentSource)
    ? { status: "current", reason: "Result source generation matches.", currentSource, result }
    : { status: "stale", reason: "Result is historical after a source edit.", currentSource, result };
};

export function inspectNotebookReference(project: Math3DProject, candidate: unknown): NotebookReferenceInspection {
  const base = inspectNotebookReferenceBase(project, candidate);
  if (base.status !== "current") return base;
  const evidence = normalizeNotebookReference(candidate)?.pinnedEvidence;
  if (!evidence || evidence.pinState === "legacy-unpinned") return base;
  const pinned = inspectResearchReference(project, evidence);
  return pinned.status === "missing" ? { ...base, status: "missing", reason: pinned.reason } :
    pinned.status === "historical" ? { ...base, status: "stale", reason: pinned.reason } : base;
}
