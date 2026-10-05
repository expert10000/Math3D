import { isStableDocumentId, isStructuralHash, normalizeMath3DProject, type Math3DProject, type StableDocumentId, type StructuralHash } from "@math3d/core";
import { createNotebookReference, inspectNotebookReference, normalizeNotebookReference, type NotebookReference } from "./notebookReferences";
import type { Workbook, WorkbookBlock } from "./workbookModel";

/** Dependency edges record provenance and ordering. They do not execute or copy target content. */
export type WorkbookDependency = Readonly<{
  id: string;
  targetBlockId: string;
  source:
    | Readonly<{ kind: "block"; blockId: string; outputPortId?: string; inputPortId?: string }>
    | Readonly<{ kind: "project"; reference: NotebookReference }>
    | Readonly<{ kind: "note"; projectId: StableDocumentId; noteId: StableDocumentId; revision: number; hash: StructuralHash }>;
}>;

export type WorkbookDependencyInspection = Readonly<{
  status: "current" | "stale" | "missing" | "different-project" | "invalid";
  reason: string;
}>;

const blocksOf = (workbook: Workbook): WorkbookBlock[] => workbook.stages.flatMap((stage) => stage.blocks);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value;
const keyOf = (edge: WorkbookDependency): string => JSON.stringify([edge.targetBlockId, edge.source]);

/** Checks the graph without modifying persisted blocks, ports, or saved runs. */
export function validateWorkbookDependencies(workbook: Workbook): void {
  if (workbook.dependencies === undefined) return;
  if (!Array.isArray(workbook.dependencies)) throw new TypeError("Invalid Workbook dependencies.");
  const blocks = new Map(blocksOf(workbook).map((block) => [block.id, block]));
  const ids = new Set<string>();
  const links = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of workbook.dependencies) {
    if (!edge || !validId(edge.id) || ids.has(edge.id) || !validId(edge.targetBlockId) || !blocks.has(edge.targetBlockId) || !edge.source) {
      throw new TypeError("Invalid Workbook dependency identity or target.");
    }
    ids.add(edge.id);
    const source = edge.source;
    if (source.kind === "block") {
      if (!validId(source.blockId) || !blocks.has(source.blockId) || source.blockId === edge.targetBlockId) throw new TypeError("Invalid block dependency source.");
      if ((source.outputPortId === undefined) !== (source.inputPortId === undefined)) throw new TypeError("A port link requires both ports.");
      if (source.outputPortId !== undefined) {
        const output = blocks.get(source.blockId)?.outputs?.find((port) => port.id === source.outputPortId);
        const input = blocks.get(edge.targetBlockId)?.inputs?.find((port) => port.id === source.inputPortId);
        if (!output || !input || output.type !== input.type) throw new TypeError("Workbook dependency ports are missing or incompatible.");
      }
      outgoing.set(source.blockId, [...outgoing.get(source.blockId) ?? [], edge.targetBlockId]);
    } else if (source.kind === "project") {
      if (!normalizeNotebookReference(source.reference)) throw new TypeError("Invalid Project dependency reference.");
    } else if (source.kind === "note") {
      if (!isStableDocumentId(source.projectId) || !source.projectId.startsWith("math3d:project:") ||
        !isStableDocumentId(source.noteId) || !source.noteId.startsWith("math3d:note:") ||
        !Number.isSafeInteger(source.revision) || source.revision < 1 || !isStructuralHash(source.hash)) {
        throw new TypeError("Invalid Note dependency generation.");
      }
    } else throw new TypeError("Unknown Workbook dependency source.");
    const key = keyOf(edge);
    if (links.has(key)) throw new TypeError("Duplicate Workbook dependency.");
    links.add(key);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new TypeError("Workbook dependency cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of blocks.keys()) visit(id);
}

export function addWorkbookDependency(workbook: Workbook, edge: WorkbookDependency, project?: Math3DProject): Workbook {
  const next = { ...workbook, dependencies: [...workbook.dependencies ?? [], edge] };
  validateWorkbookDependencies(next);
  if (project) {
    const outgoing = new Map<string, string[]>();
    for (const link of next.dependencies) if (link.source.kind === "block") {
      outgoing.set(link.source.blockId, [...outgoing.get(link.source.blockId) ?? [], link.targetBlockId]);
    }
    for (const link of next.dependencies) {
      const source = link.source;
      if (source.kind !== "note" || source.projectId !== project.identity.id) continue;
      const anchor = project.notes?.find((item) => item.identity.id === source.noteId)?.anchor;
      if (anchor?.kind !== "workbook-block" || anchor.workbookId !== workbook.id) continue;
      const seen = new Set<string>();
      const reachesAnchor = (id: string): boolean => {
        if (id === anchor.blockId) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return (outgoing.get(id) ?? []).some(reachesAnchor);
      };
      if (reachesAnchor(link.targetBlockId)) throw new TypeError("Note dependency would create a cycle with its Workbook block anchor.");
    }
  }
  return next;
}

export function createProjectDependencySource(project: Math3DProject, kind: NotebookReference["kind"], targetId: string): WorkbookDependency["source"] {
  return { kind: "project", reference: createNotebookReference(project, kind, targetId) };
}

export function createNoteDependencySource(project: Math3DProject, noteId: string): WorkbookDependency["source"] {
  const checked = normalizeMath3DProject(project);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const note = checked.value.notes?.find((item) => item.identity.id === noteId);
  if (!note) throw new RangeError(`Project Note '${noteId}' was not found.`);
  return { kind: "note", projectId: checked.value.identity.id, noteId: note.identity.id, revision: note.identity.revision, hash: note.identity.structuralHash };
}

export function inspectWorkbookDependency(edge: WorkbookDependency, workbook: Workbook, project: Math3DProject | null): WorkbookDependencyInspection {
  const target = blocksOf(workbook).find((block) => block.id === edge.targetBlockId);
  if (!target) return { status: "missing", reason: "Target Workbook block is missing." };
  try { validateWorkbookDependencies({ ...workbook, dependencies: [edge] }); }
  catch (error) { return { status: "invalid", reason: error instanceof Error ? error.message : "Invalid dependency." }; }
  const source = edge.source;
  if (source.kind === "block") return { status: "current", reason: "Source Workbook block is available." };
  if (!project) return { status: "missing", reason: "Open the linked Project to inspect this dependency." };
  if (source.kind === "project") {
    const result = inspectNotebookReference(project, source.reference);
    return { status: result.status, reason: result.reason };
  }
  if (source.projectId !== project.identity.id) return { status: "different-project", reason: "The Note belongs to another Project." };
  const note = project.notes?.find((item) => item.identity.id === source.noteId);
  if (!note) return { status: "missing", reason: "The referenced Note is absent." };
  return note.identity.revision === source.revision && note.identity.structuralHash === source.hash
    ? { status: "current", reason: "Note revision matches." }
    : { status: "stale", reason: "The Note changed after this link was recorded." };
}
