import { canonicalJsonStringify, createResearchReference, inspectProjectNoteAnchor,
  projectResourceInventory, researchResourcePins, sha256Checksum, structuralHash, upsertMath3DProjectWorkbook,
  verifyProjectResourceBytes, type Math3DProject, type ProjectNote } from "@math3d/core";
import { type NotebookReference, type Workbook } from "@math3d/workbook";
import { assessProjectResearchCitation } from "../projects/projectResearchCitation";
import { projectNoteSourceResolver } from "../projects/projectNoteTargets";
import { projectNoteRenderedBody, resolveProjectNoteValues } from "../projects/projectNoteValues";
import { captureProjectResources, exportProjectPackage, parseProjectPackage,
  type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";

export const RESEARCH_NARRATIVE_FORMAT = "math3d.research-narrative/v1" as const;

const narrativeEvidence = (project: Math3DProject, books: readonly Workbook[], reader: ProjectResourceReader,
  selected?: readonly string[]) => {
  const blocks = books.flatMap(book => book.stages.flatMap(stage => stage.blocks
    .filter(block => !selected || selected.includes(block.id))
    .map(block => ({ workbookId: book.id, stageId: stage.id, blockId: block.id,
      title: block.title, contentHash: structuralHash(block) }))));
  const included = new Set(blocks.map(block => block.blockId));
  const rawReferences: NotebookReference[] = [];
  for (const book of books) for (const stage of book.stages) for (const block of stage.blocks) {
    if (!included.has(block.id)) continue;
    if (block.notebookReference) rawReferences.push(block.notebookReference);
    for (const edge of book.dependencies ?? []) if (edge.targetBlockId === block.id && edge.source.kind === "project")
      rawReferences.push(edge.source.reference);
    for (const evidence of block.claim?.evidence ?? []) if (evidence.kind === "result") rawReferences.push(evidence.reference);
    for (const snapshot of [block.visualize?.snapshot, block.visualize?.snapshotA, block.visualize?.snapshotB])
      for (const result of snapshot?.provenance?.results ?? []) rawReferences.push(result.reference);
  }
  const citations = [...new Map(rawReferences.map(reference => [canonicalJsonStringify(reference), reference])).values()]
    .map(reference => ({ reference, ...assessProjectResearchCitation(project, reference, reader) }));
  const resolver = projectNoteSourceResolver(project.identity.id, project.workspace);
  const inventory = projectResourceInventory(project);
  const workbookBlock = (workbookId: string, blockId: string) => {
    const book = books.find(item => item.id === workbookId);
    const block = book?.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId);
    const revision = project.workbooks?.find(item => item.id === workbookId)?.revision;
    return block && revision ? { revision, hash: structuralHash(block) } : null;
  };
  const notes = (project.notes ?? []).map((note: ProjectNote) => {
    const inspection = inspectProjectNoteAnchor(note, { ...resolver, workbookBlock });
    const source = note.anchor && "source" in note.anchor ? note.anchor.source : null;
    const reference = source ? createResearchReference({ projectId: project.identity.id, kind: "selection",
      targetId: note.identity.id, selectionId: note.anchor?.kind === "study-selection" ? note.anchor.selectionId : note.identity.id,
      source, targetHash: note.identity.structuralHash, resources: researchResourcePins(project, source.documentId) }) : null;
    let status = inspection.status, reason = inspection.reason;
    if (status === "current" && reference) for (const pin of reference.resources) {
      const required = inventory.find(item => item.kind === pin.kind && item.id === pin.id &&
        structuralHash(item.reference) === pin.descriptorHash);
      let verified = false;
      try { const bytes = required && reader(required); if (required && bytes) {
        verifyProjectResourceBytes(required, bytes); verified = true;
      } } catch { /* Omit the Note evidence when a pinned sidecar fails verification. */ }
      if (!verified) {
        status = "missing"; reason = "Pinned Note source sidecar is missing or changed."; break;
      }
    }
    if (status === "current" && !note.anchor) { status = "unanchored"; reason = "Note has no saved evidence target."; }
    if (status === "current" && resolveProjectNoteValues(note, project.workspace).some(value => value.status !== "current")) {
      status = "stale"; reason = "A bound Note value no longer matches its saved source.";
    }
    return { noteId: note.identity.id, revision: note.identity.revision, noteHash: note.identity.structuralHash,
      title: note.title, anchor: note.anchor ?? null, reference, status, reason,
      renderedBody: status === "current" ? projectNoteRenderedBody(note, project.workspace) : null };
  });
  const omissions = [
    ...citations.filter(item => item.status !== "current").map(item => ({ kind: "citation" as const,
      targetId: item.reference.targetId, reason: `${item.status}: ${item.reason} Evidence withheld.` })),
    ...notes.filter(item => item.status !== "current").map(item => ({ kind: "note" as const,
      targetId: item.noteId, reason: `${item.status}: ${item.reason} Note text withheld.` })),
    ...inventory.filter(item => item.required).flatMap(item => {
      try { const bytes = reader(item); if (bytes) { verifyProjectResourceBytes(item, bytes); return []; } }
      catch { /* Include corrupt sidecars as explicit omissions. */ }
      return [{ kind: "resource" as const, targetId: `${item.kind}:${item.id}`,
        reason: "Required Project sidecar is missing or corrupt. Dependent evidence is unavailable." }];
    }),
  ].sort((a, b) => `${a.kind}:${a.targetId}:${a.reason}`.localeCompare(`${b.kind}:${b.targetId}:${b.reason}`));
  return { blocks, citations, notes, omissions };
};

/** A normal Project package plus a frozen, independently qualified Workbook and Note evidence index. */
export function createPortableResearchNarrative(project: Math3DProject, books: readonly Workbook[],
  resources: VerifiedProjectResources, sourceReader?: ProjectResourceReader, selected?: readonly string[]) {
  let next = project;
  const workbookBytes = new Map<string, Uint8Array>();
  for (const book of books) {
    const prepared = prepareProjectWorkbook(next, book, `narrative-${book.id}`);
    next = upsertMath3DProjectWorkbook(next, prepared.reference);
    workbookBytes.set(prepared.reference.id, prepared.bytes);
  }
  const captured = captureProjectResources(next, item => {
    const bytes = workbookBytes.get(item.id) ?? sourceReader?.(item) ?? resources.bytes(item);
    if (!bytes) return null;
    try { verifyProjectResourceBytes(item, bytes); return bytes; }
    catch { return null; }
  }, true);
  const packageJson = exportProjectPackage(next, captured);
  const content = { format: RESEARCH_NARRATIVE_FORMAT, schemaVersion: 1 as const,
    projectId: next.identity.id, packageJson,
    packageChecksum: sha256Checksum(new TextEncoder().encode(packageJson)),
    workbookIds: books.map(book => book.id).sort(),
    selectedBlockIds: selected ? [...selected].sort() : null,
    evidence: narrativeEvidence(next, books, item => captured.bytes(item), selected) };
  if (new TextEncoder().encode(canonicalJsonStringify(content)).byteLength > 112 * 1024 * 1024)
    throw new TypeError("Research narrative exceeds 112 MiB.");
  return { ...content, contentHash: structuralHash(content) };
}

export function inspectPortableResearchNarrative(payload: ReturnType<typeof createPortableResearchNarrative>) {
  if (payload.format !== RESEARCH_NARRATIVE_FORMAT || payload.schemaVersion !== 1)
    throw new TypeError("Unsupported research narrative.");
  const { contentHash, ...content } = payload;
  if (new TextEncoder().encode(canonicalJsonStringify(content)).byteLength > 112 * 1024 * 1024)
    throw new TypeError("Research narrative exceeds 112 MiB.");
  if (structuralHash(content) !== contentHash ||
    sha256Checksum(new TextEncoder().encode(payload.packageJson)) !== payload.packageChecksum)
    throw new TypeError("Research narrative checksum mismatch.");
  const reopened = parseProjectPackage(payload.packageJson);
  if (reopened.project.identity.id !== payload.projectId) throw new TypeError("Narrative belongs to another Project.");
  const books = payload.workbookIds.map(id => {
    const reference = reopened.project.workbooks?.find(item => item.id === id);
    if (!reference) throw new TypeError("Narrative Workbook reference is missing.");
    const bytes = reopened.resources.bytes({ kind: "workbook-payload", id: reference.id });
    if (!bytes) throw new TypeError("Narrative Workbook payload is missing.");
    return readProjectWorkbook(bytes, reference);
  });
  const checked = narrativeEvidence(reopened.project, books, item => reopened.resources.bytes(item),
    payload.selectedBlockIds ?? undefined);
  if (canonicalJsonStringify(checked) !== canonicalJsonStringify(payload.evidence))
    throw new TypeError("Research narrative evidence or omissions differ from the imported Project.");
  return reopened;
}
