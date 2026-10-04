import {
  isScientificSourceGeneration,
  isStableDocumentId,
  isStructuralHash,
  matchesScientificSourceGeneration,
  normalizeMath3DProject,
  structuralHash,
  viewerSourceFromDocument,
  type AnalysisResultEnvelope,
  type Math3DProject,
  type ScientificSourceGeneration,
  type StableDocumentId,
  type StructuralHash,
} from "@math3d/core";

export const NOTEBOOK_REFERENCE_SCHEMA_VERSION = 1 as const;

/** A citation into a normal named Project. No document, result or figure bytes are copied into a Workbook cell. */
type NotebookReferenceBase = Readonly<{
  schemaVersion: typeof NOTEBOOK_REFERENCE_SCHEMA_VERSION;
  projectId: StableDocumentId;
  targetId: string;
  source: ScientificSourceGeneration;
}>;
export type NotebookReference =
  | (NotebookReferenceBase & Readonly<{ kind: "document" }>)
  | (NotebookReferenceBase & Readonly<{ kind: "result"; resultHash: StructuralHash }>);

export type NotebookReferenceInspection = Readonly<{
  status: "current" | "stale" | "missing" | "different-project";
  reason: string;
  currentSource?: ScientificSourceGeneration;
  result?: AnalysisResultEnvelope;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function normalizeNotebookReference(value: unknown): NotebookReference | null {
  if (!isRecord(value) || Object.keys(value).sort().join("|") !==
      (value.kind === "result" ? "kind|projectId|resultHash|schemaVersion|source|targetId" : "kind|projectId|schemaVersion|source|targetId") ||
    value.schemaVersion !== NOTEBOOK_REFERENCE_SCHEMA_VERSION ||
    !isStableDocumentId(value.projectId) || !value.projectId.startsWith("math3d:project:") ||
    (value.kind !== "document" && value.kind !== "result") ||
    typeof value.targetId !== "string" || value.targetId.length < 1 || value.targetId.length > 256 ||
    value.targetId.trim() !== value.targetId || !isScientificSourceGeneration(value.source) ||
    (value.kind === "document" && (value.targetId !== value.source.documentId || !isStableDocumentId(value.targetId))) ||
    (value.kind === "result" && !isStructuralHash(value.resultHash))) return null;
  const base = {
    schemaVersion: NOTEBOOK_REFERENCE_SCHEMA_VERSION,
    projectId: value.projectId,
    targetId: value.targetId,
    source: { ...value.source },
  };
  return value.kind === "result"
    ? { ...base, kind: "result", resultHash: value.resultHash as StructuralHash }
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
  const source = kind === "document"
    ? (() => {
      const entry = current.workspace.entries.find((item) => item.expected.id === targetId);
      return entry ? viewerSourceFromDocument({ identity: entry.expected }) : null;
    })()
    : result?.provenance.source ?? null;
  if (!source) throw new RangeError(`Project ${kind} '${targetId}' was not found.`);
  const reference = normalizeNotebookReference({
    schemaVersion: NOTEBOOK_REFERENCE_SCHEMA_VERSION,
    projectId: current.identity.id,
    kind,
    targetId,
    source,
    ...(result ? { resultHash: structuralHash(result) } : {}),
  });
  if (!reference) throw new TypeError("Project target cannot form a notebook reference.");
  return reference;
}

/** Resolves IDs and source generations only. A later viewer must still verify replay and artifact bytes. */
export function inspectNotebookReference(project: Math3DProject, candidate: unknown): NotebookReferenceInspection {
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
}
