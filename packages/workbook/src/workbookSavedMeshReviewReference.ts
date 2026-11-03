import { isStableDocumentId, isStructuralHash, structuralHash, type Math3DProject, type StructuralHash } from "@math3d/core";
import { createWorkbookSavedMeshComparisonReference, normalizeWorkbookSavedMeshComparisonReference,
  type WorkbookSavedMeshComparisonReference } from "./workbookSavedMeshComparisonReference";

export type WorkbookSavedMeshReviewReference = Readonly<{
  schemaVersion: 1;
  projectId: string;
  pairs: readonly Readonly<{
    comparison: WorkbookSavedMeshComparisonReference;
    title: string;
    notes: readonly Readonly<{ noteId: string; revision: number; hash: StructuralHash; title: string }>[];
  }>[];
}>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.sort().join("|");

export function normalizeWorkbookSavedMeshReviewReference(value: unknown): WorkbookSavedMeshReviewReference {
  if (!record(value) || !exact(value, ["schemaVersion", "projectId", "pairs"]) || value.schemaVersion !== 1 ||
    !isStableDocumentId(value.projectId) || !String(value.projectId).startsWith("math3d:project:") ||
    !Array.isArray(value.pairs) || value.pairs.length < 1 || value.pairs.length > 32)
    throw new TypeError("Invalid Workbook saved Mesh review reference.");
  const pairIds = new Set<string>();
  for (const item of value.pairs) {
    if (!record(item) || !exact(item, ["comparison", "title", "notes"]) ||
      typeof item.title !== "string" || !item.title.trim() || item.title.length > 160 || !Array.isArray(item.notes) || item.notes.length > 64)
      throw new TypeError("Invalid Workbook review pair.");
    const comparison = normalizeWorkbookSavedMeshComparisonReference(item.comparison);
    if (comparison.projectId !== value.projectId || pairIds.has(comparison.comparisonId)) throw new TypeError("Duplicate or foreign Workbook review pair.");
    pairIds.add(comparison.comparisonId);
    const noteIds = new Set<string>();
    for (const note of item.notes) {
      if (!record(note) || !exact(note, ["noteId", "revision", "hash", "title"]) ||
        !isStableDocumentId(note.noteId) || !String(note.noteId).startsWith("math3d:note:") ||
        !Number.isSafeInteger(note.revision) || Number(note.revision) < 1 || !isStructuralHash(note.hash) ||
        typeof note.title !== "string" || !note.title.trim() || note.title.length > 160 || noteIds.has(String(note.noteId)))
        throw new TypeError("Invalid Workbook review Note reference.");
      noteIds.add(String(note.noteId));
    }
  }
  return value as WorkbookSavedMeshReviewReference;
}

/** Capture selected immutable Project pair and Note identities; never copy Note text or Mesh bytes. */
export function createWorkbookSavedMeshReviewReference(project: Math3DProject, selectedIds: readonly string[]): WorkbookSavedMeshReviewReference {
  if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length) throw new TypeError("Choose distinct saved Mesh pairs.");
  const pairs = selectedIds.map(id => {
    const pair = project.savedMeshComparisons?.find(item => item.id === id);
    if (!pair) throw new TypeError(`Saved Mesh pair ${id} is missing.`);
    const notes = (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === id)
      .map(note => ({ noteId: note.identity.id, revision: note.identity.revision, hash: note.identity.structuralHash, title: note.title }));
    return { comparison: createWorkbookSavedMeshComparisonReference(project, pair), title: pair.title, notes };
  });
  return normalizeWorkbookSavedMeshReviewReference({ schemaVersion: 1, projectId: project.identity.id, pairs });
}

/** Metadata freshness only; renderer rechecks exact result and sidecar bytes for each row. */
export function inspectWorkbookSavedMeshReviewReference(project: Math3DProject | null, value: WorkbookSavedMeshReviewReference): "current" | "stale" | "missing" | "different-project" {
  const ref = normalizeWorkbookSavedMeshReviewReference(value);
  if (!project) return "missing";
  if (project.identity.id !== ref.projectId) return "different-project";
  for (const item of ref.pairs) {
    const pair = project.savedMeshComparisons?.find(saved => saved.id === item.comparison.comparisonId);
    if (!pair) return "missing";
    if (structuralHash(pair) !== item.comparison.comparisonHash) return "stale";
    for (const noteRef of item.notes) {
      const note = project.notes?.find(saved => saved.identity.id === noteRef.noteId);
      if (!note) return "missing";
      if (note.identity.revision !== noteRef.revision || note.identity.structuralHash !== noteRef.hash || note.title !== noteRef.title ||
        note.anchor?.kind !== "saved-mesh-comparison" || note.anchor.comparisonId !== pair.id) return "stale";
    }
  }
  return "current";
}
