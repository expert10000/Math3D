import React, { useMemo } from "react";
import { inspectProjectNoteAnchor, matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument,
  type KernelWorkspaceModule, type Math3DProject, type ProjectNote, type ScientificSourceGeneration } from "@math3d/core";
import { inspectNotebookReference, type NotebookReference, type Workbook, type WorkbookStageId } from "@math3d/workbook";
import { readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { projectNoteSourceResolver } from "../projects/projectNoteTargets";

type Status = "current" | "stale" | "missing" | "different-project" | "unanchored" | "invalid";
type Citation = { workbookId: string; stageId: WorkbookStageId; blockId: string; blockTitle: string;
  targetId: string; kind: "document" | "result"; source: ScientificSourceGeneration; origin: string; status: Status; reason: string };
type NoteUse = { workbookId: string; stageId: WorkbookStageId; blockId: string; blockTitle: string;
  noteId: string; noteTitle: string; revision: number; status: Status };
type LoadedWorkbook = { reference: NonNullable<Math3DProject["workbooks"]>[number]; workbook: Workbook | null };
type Props = {
  project: Math3DProject;
  titles: ReadonlyMap<string, string>;
  workbookBytes: (id: string) => Uint8Array | null;
  canOpenDocument: (id: string, module: KernelWorkspaceModule) => boolean;
  onOpenDocument: (id: string, module: KernelWorkspaceModule) => void;
  onInspectResult: (id: string) => void;
  onOpenWorkbookBlock: (id: string, stageId: WorkbookStageId, blockId: string) => void;
  onOpenNote: (id: string) => void;
  canOpenNote: boolean;
};

const statusText = (status: Status) => ({ current: "Up to date", stale: "Historical", missing: "Unavailable",
  "different-project": "Other Project", unanchored: "No target", invalid: "Invalid" })[status];
const tone = (status: Status) => status === "current" ? "current" : status === "stale" ? "stale" : "unavailable";

/** Reads verified Workbook payloads and the Project's stored Note anchors; prose is never treated as a link. */
export const ProjectResearchLinks: React.FC<Props> = ({ project, titles, workbookBytes, canOpenDocument, onOpenDocument,
  onInspectResult, onOpenWorkbookBlock, onOpenNote, canOpenNote }) => {
  const research = useMemo(() => {
    const workbooks: LoadedWorkbook[] = (project.workbooks ?? []).map(reference => {
      try { const bytes = workbookBytes(reference.id); return { reference, workbook: bytes ? readProjectWorkbook(bytes, reference) : null }; }
      catch { return { reference, workbook: null }; }
    });
    const citations: Citation[] = [], noteUses: NoteUse[] = [], seen = new Set<string>();
    const add = (workbookId: string, stageId: WorkbookStageId, blockId: string, blockTitle: string,
      reference: NotebookReference, origin: string) => {
      const key = JSON.stringify([workbookId, blockId, reference.kind, reference.targetId, reference.source.revision,
        reference.source.structuralHash]);
      if (seen.has(key)) return;
      seen.add(key);
      const inspection = inspectNotebookReference(project, reference);
      citations.push({ workbookId, stageId, blockId, blockTitle, targetId: reference.targetId, kind: reference.kind,
        source: reference.source, origin, status: inspection.status, reason: inspection.reason });
    };
    for (const { reference, workbook } of workbooks) if (workbook) for (const stage of workbook.stages) for (const block of stage.blocks) {
      const args = [reference.id, stage.id, block.id, block.title] as const;
      if (block.notebookReference) add(...args, block.notebookReference, "Block citation");
      for (const edge of workbook.dependencies ?? []) if (edge.targetBlockId === block.id && edge.source.kind === "project")
        add(...args, edge.source.reference, "Project dependency");
      for (const edge of workbook.dependencies ?? []) if (edge.targetBlockId === block.id && edge.source.kind === "note") {
        const source = edge.source, note = project.notes?.find(item => item.identity.id === source.noteId);
        noteUses.push({ workbookId: reference.id, stageId: stage.id, blockId: block.id, blockTitle: block.title,
          noteId: source.noteId, noteTitle: note?.title ?? source.noteId, revision: source.revision,
          status: source.projectId !== project.identity.id ? "different-project" : !note ? "missing" :
            note.identity.revision === source.revision && note.identity.structuralHash === source.hash ? "current" : "stale" });
      }
      for (const evidence of block.claim?.evidence ?? []) if (evidence.kind === "result")
        add(...args, evidence.reference, "Claim evidence");
      for (const snapshot of [block.visualize?.snapshot, block.visualize?.snapshotA, block.visualize?.snapshotB]) {
        const provenance = snapshot?.provenance;
        if (!provenance) continue;
        for (const result of provenance.results) add(...args, result.reference, "Frozen view result");
        const source = provenance.viewerSource;
        if (!source || provenance.projectId !== project.identity.id) continue;
        const key = JSON.stringify([reference.id, block.id, "viewer", source.documentId, source.revision, source.structuralHash]);
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = project.workspace.entries.find(item => item.expected.id === source.documentId);
        const status = !entry ? "missing" : matchesScientificSourceGeneration(source, viewerSourceFromDocument({ identity: entry.expected })) ? "current" : "stale";
        citations.push({ workbookId: reference.id, stageId: stage.id, blockId: block.id, blockTitle: block.title,
          targetId: source.documentId, kind: "document", source, origin: "Frozen view source", status,
          reason: status === "missing" ? "The captured viewer source is unavailable." : status === "stale" ? "The captured viewer source is historical." : "Captured viewer source matches." });
      }
    }
    const resolver = projectNoteSourceResolver(project.identity.id, project.workspace);
    const blockLookup = (workbookId: string, blockId: string) => {
      const loaded = workbooks.find(item => item.reference.id === workbookId);
      const block = loaded?.workbook?.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId);
      return loaded && block ? { revision: loaded.reference.revision, hash: structuralHash(block) } : null;
    };
    const notes = (project.notes ?? []).map(note => ({ note, inspection: inspectProjectNoteAnchor(note, { ...resolver, workbookBlock: blockLookup }) }));
    return { workbooks, citations, noteUses, notes };
  }, [project, workbookBytes]);

  const documentButton = (id: string, label: string, status: Status) => {
    const entry = project.workspace.entries.find(item => item.expected.id === id);
    return <button type="button" disabled={!entry || status === "missing" || status === "different-project" || !canOpenDocument(id, entry.module)}
      onClick={() => entry && onOpenDocument(id, entry.module)}>{label}</button>;
  };
  const noteTarget = (note: ProjectNote, status: Status) => {
    const anchor = note.anchor;
    if (!anchor) return <span>Project Note without a target</span>;
    if (anchor.kind === "workbook-block") {
      const loaded = research.workbooks.find(item => item.reference.id === anchor.workbookId);
      const stage = loaded?.workbook?.stages.find(item => item.blocks.some(block => block.id === anchor.blockId));
      const block = stage?.blocks.find(item => item.id === anchor.blockId);
      return <><span>{loaded?.reference.title ?? anchor.workbookId} / {stage?.title ?? "Workbook"} / {block?.title ?? anchor.blockId} · r{anchor.workbookRevision}</span>
        <button type="button" disabled={!stage || !block || status === "missing"} onClick={() => stage && onOpenWorkbookBlock(anchor.workbookId, stage.id, anchor.blockId)}>Open block</button></>;
    }
    if (anchor.kind === "result") {
      const result = project.workspace.results.find(item => item.resultId === anchor.resultId);
      return <><span>{result?.provenance.operation.type ?? anchor.resultId} · source r{anchor.source.revision} g{anchor.source.generation}</span>
        <button type="button" disabled={!result || status === "missing"} onClick={() => onInspectResult(anchor.resultId)}>Inspect result</button></>;
    }
    return <><span>{titles.get(anchor.source.documentId) ?? anchor.source.documentId} · r{anchor.source.revision} g{anchor.source.generation}</span>
      {documentButton(anchor.source.documentId, "Open document", status)}</>;
  };
  return <section className="project-research-links project-workspace-section" data-testid="project-research-links" aria-label="Project research links">
    <h3>Research links</h3>
    <p className="project-workspace-section-hint">Exact Workbook citations and Note anchors from this Project. Historical links retain their captured revision; unavailable payloads reveal no inferred connections.</p>
    <div className="project-research-grid">
      <section aria-label="Workbook citations"><h4>Workbook citations ({research.citations.length + research.noteUses.length})</h4>
        {research.workbooks.map(({ reference, workbook }) => !workbook && <p key={reference.id} className="project-research-unavailable" data-testid={`project-research-workbook-unavailable-${reference.id}`}>{reference.title}: Workbook payload unavailable. Its citations cannot be inspected.</p>)}
        {research.citations.length || research.noteUses.length ? <ul>{research.citations.map((item, index) => <li key={`${item.workbookId}:${item.blockId}:${index}`} data-testid={`project-research-citation-${index}`}>
          <strong>{research.workbooks.find(loaded => loaded.reference.id === item.workbookId)?.reference.title} / {item.blockTitle}</strong>
          <small>{item.origin} · {item.kind === "document" ? titles.get(item.targetId) ?? item.targetId : project.workspace.results.find(result => result.resultId === item.targetId)?.provenance.operation.type ?? item.targetId} · r{item.source.revision} g{item.source.generation}</small>
          <span className="project-freshness-badge" data-tone={tone(item.status)} title={item.reason}>{statusText(item.status)}</span>
          <div className="project-research-actions"><button type="button" onClick={() => onOpenWorkbookBlock(item.workbookId, item.stageId, item.blockId)}>Open block</button>
            {item.kind === "document" ? documentButton(item.targetId, "Open document", item.status) :
              <button type="button" disabled={item.status === "missing" || item.status === "different-project"} onClick={() => onInspectResult(item.targetId)}>Inspect result</button>}</div>
        </li>)}{research.noteUses.map((item, index) => <li key={`${item.workbookId}:${item.blockId}:note:${index}`} data-testid={`project-research-note-use-${index}`}>
          <strong>{research.workbooks.find(loaded => loaded.reference.id === item.workbookId)?.reference.title} / {item.blockTitle}</strong>
          <small>Note dependency · {item.noteTitle} · r{item.revision}</small>
          <span className="project-freshness-badge" data-tone={tone(item.status)}>{statusText(item.status)}</span>
          <div className="project-research-actions"><button type="button" onClick={() => onOpenWorkbookBlock(item.workbookId, item.stageId, item.blockId)}>Open block</button>
            <button type="button" disabled={!canOpenNote || item.status === "missing" || item.status === "different-project"} onClick={() => onOpenNote(item.noteId)}>Open Note</button></div>
        </li>)}</ul> : <p>No exact Workbook citations recorded.</p>}
      </section>
      <section aria-label="Note anchors"><h4>Note anchors ({research.notes.length})</h4>
        {research.notes.length ? <ul>{research.notes.map(({ note, inspection }) => <li key={note.identity.id} data-testid={`project-research-note-${note.identity.id}`}>
          <strong>{note.title}</strong><small>{note.anchor?.kind ?? "Unanchored"} · {inspection.reason}</small>
          <span className="project-freshness-badge" data-tone={tone(inspection.status)}>{statusText(inspection.status)}</span>
          <div className="project-research-target">{noteTarget(note, inspection.status)}</div>
          {note.valueBindings?.filter(binding => binding.kind === "result").map(binding => {
            if (binding.kind !== "result") return null;
            const result = project.workspace.results.find(item => item.resultId === binding.resultId);
            const exact = result && structuralHash(result) === binding.resultHash && matchesScientificSourceGeneration(result.provenance.source, binding.source);
            const sourceEntry = project.workspace.entries.find(item => item.expected.id === binding.source.documentId);
            const status: Status = !exact || !sourceEntry ? "missing" : matchesScientificSourceGeneration(binding.source, viewerSourceFromDocument({ identity: sourceEntry.expected })) ? "current" : "stale";
            return <div key={binding.id} className="project-research-target" data-testid={`project-research-note-value-${note.identity.id}-${binding.id}`}>
              <span>Value {binding.id}: {binding.field} · result {binding.resultId} · r{binding.source.revision} g{binding.source.generation}</span>
              <span className="project-freshness-badge" data-tone={tone(status)}>{statusText(status)}</span>
              <button type="button" disabled={status === "missing"} onClick={() => onInspectResult(binding.resultId)}>Inspect result</button>
            </div>;
          })}
          <div className="project-research-actions"><button type="button" disabled={!canOpenNote} onClick={() => onOpenNote(note.identity.id)}>Open Note</button></div>
        </li>)}</ul> : <p>No Project Notes recorded.</p>}
      </section>
    </div>
  </section>;
};
