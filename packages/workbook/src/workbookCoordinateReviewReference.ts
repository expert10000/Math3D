import { isStableDocumentId, isStructuralHash, type Math3DProject, type StructuralHash } from "@math3d/core";

export type WorkbookCoordinateReviewReference = Readonly<{
  schemaVersion: 1;
  projectId: string;
  notes: readonly Readonly<{
    noteId: string;
    revision: number;
    hash: StructuralHash;
    title: string;
    compositionId: string;
    compositionHash: StructuralHash;
  }>[];
}>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.sort().join("|");

export function normalizeWorkbookCoordinateReviewReference(value: unknown): WorkbookCoordinateReviewReference {
  if (!record(value) || !exact(value, ["schemaVersion", "projectId", "notes"]) || value.schemaVersion !== 1 ||
    !isStableDocumentId(value.projectId) || !String(value.projectId).startsWith("math3d:project:") ||
    !Array.isArray(value.notes) || value.notes.length < 1 || value.notes.length > 64)
    throw new TypeError("Invalid Workbook coordinate review reference.");
  const ids = new Set<string>();
  for (const note of value.notes) {
    if (!record(note) || !exact(note, ["noteId", "revision", "hash", "title", "compositionId", "compositionHash"]) ||
      !isStableDocumentId(note.noteId) || !String(note.noteId).startsWith("math3d:note:") ||
      !Number.isSafeInteger(note.revision) || Number(note.revision) < 1 || !isStructuralHash(note.hash) ||
      typeof note.title !== "string" || !note.title.trim() || note.title.length > 160 ||
      typeof note.compositionId !== "string" || !note.compositionId || note.compositionId.length > 120 ||
      !isStructuralHash(note.compositionHash) || ids.has(String(note.noteId)))
      throw new TypeError("Invalid Workbook coordinate Note reference.");
    ids.add(String(note.noteId));
  }
  return value as WorkbookCoordinateReviewReference;
}

/** Captures authored Note identities only; the Project retains source generations and resource bytes. */
export function createWorkbookCoordinateReviewReference(project: Math3DProject, selectedIds: readonly string[]): WorkbookCoordinateReviewReference {
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length) throw new TypeError("Choose distinct coordinate Notes.");
  const notes = selectedIds.map(id => {
    const note = project.notes?.find(item => item.identity.id === id);
    if (!note || note.anchor?.kind !== "comparison" || !note.anchor.coordinateProbe)
      throw new TypeError(`Coordinate Note ${id} is missing.`);
    return { noteId: note.identity.id, revision: note.identity.revision, hash: note.identity.structuralHash,
      title: note.title, compositionId: note.anchor.compositionId, compositionHash: note.anchor.compositionHash };
  });
  return normalizeWorkbookCoordinateReviewReference({ schemaVersion: 1, projectId: project.identity.id, notes });
}

/** Metadata check only. The renderer checks each exact comparison and source byte before showing a marker. */
export function inspectWorkbookCoordinateReviewReference(project: Math3DProject | null, value: WorkbookCoordinateReviewReference): "current" | "stale" | "missing" | "different-project" {
  const ref = normalizeWorkbookCoordinateReviewReference(value);
  if (!project) return "missing";
  if (project.identity.id !== ref.projectId) return "different-project";
  for (const item of ref.notes) {
    const note = project.notes?.find(saved => saved.identity.id === item.noteId);
    if (!note) return "missing";
    if (note.identity.revision !== item.revision || note.identity.structuralHash !== item.hash || note.title !== item.title ||
      note.anchor?.kind !== "comparison" || !note.anchor.coordinateProbe || note.anchor.compositionId !== item.compositionId ||
      note.anchor.compositionHash !== item.compositionHash) return "stale";
  }
  return "current";
}
