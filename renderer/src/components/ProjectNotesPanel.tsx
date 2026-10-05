import React, { useEffect, useMemo, useState } from "react";
import { inspectProjectNoteAnchor, structuralHash,
  type Math3DProject, type MixedWorkspaceDocument, type ProjectNote } from "@math3d/core";
import type { Workbook } from "@math3d/workbook";
import type { NoteCaptureKind, ProjectNoteDraft } from "../projects/projectNoteDrafts";
import { projectNoteSourceResolver } from "../projects/projectNoteTargets";

type Filter = "all" | "scene" | "object" | "result" | "workbook";
const category = (anchor: ProjectNote["anchor"]): Exclude<Filter, "all"> | "global" =>
  anchor?.kind === "document" ? "scene" : anchor?.kind === "object-local" || anchor?.kind === "subentity" || anchor?.kind === "entity-selection" || anchor?.kind === "graph-selection" ? "object" :
    anchor?.kind === "result" ? "result" : anchor?.kind === "workbook-block" ? "workbook" : "global";

const anchorLabel = (anchor: ProjectNote["anchor"]) => !anchor ? "Unanchored" :
  anchor.kind === "workbook-block" ? `Workbook block ${anchor.blockId}` : anchor.kind === "result" ? `Result ${anchor.resultId}` :
    anchor.kind === "graph-selection" ? `Graph ${anchor.objectId}${anchor.probe ? ` · probe (${anchor.probe.x}, ${anchor.probe.y})` : ""}` :
    "objectId" in anchor ? `${anchor.objectId}${"entityId" in anchor ? ` · ${anchor.entityKind} ${anchor.entityId}` : ""}` : `Document ${anchor.source.documentId}`;
type WorkbookBlockChoice = { workbookId: string; blockId: string; label: string };
const SavedNote: React.FC<{ note: ProjectNote; status: string; busy: boolean; targets: WorkbookBlockChoice[];
  onSave: (note: ProjectNote, title: string, body: string) => Promise<boolean>;
  onOpen: (note: ProjectNote) => void;
  onSendToWorkbook: (note: ProjectNote, workbookId: string, blockId: string) => Promise<boolean>;
}> = ({ note, status, busy, targets, onSave, onOpen, onSendToWorkbook }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title), [body, setBody] = useState(note.body);
  const [targetKey, setTargetKey] = useState("");
  return <article id={`project-note-${note.identity.id}`} tabIndex={-1} data-testid={`project-note-${note.identity.id}`} style={{ border: "1px solid #cbd5e1", borderRadius: 7, padding: 8, marginTop: 7 }}>
    {editing ? <>
      <input aria-label="Note title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      <textarea aria-label="Note body" value={body} maxLength={8192} rows={3} onChange={(event) => setBody(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 5 }} />
      <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => { void onSave(note, title, body).then((saved) => { if (saved) setEditing(false); }); }}>Save changes</button>
      <button type="button" onClick={() => { setTitle(note.title); setBody(note.body); setEditing(false); }}>Cancel</button>
    </> : <>
      <strong>{note.title}</strong><p style={{ whiteSpace: "pre-wrap", margin: "5px 0" }}>{note.body}</p>
      <button type="button" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
      {note.anchor && <button type="button" disabled={busy} onClick={() => onOpen(note)} style={{ marginLeft: 5 }}>Open target</button>}
      <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
        <select aria-label={`Workbook block for ${note.title}`} value={targetKey} onChange={(event) => setTargetKey(event.target.value)} style={{ minWidth: 0, flex: 1 }}>
          <option value="">Choose Project Workbook block</option>
          {targets.map((target) => <option key={`${target.workbookId}:${target.blockId}`} value={`${target.workbookId}:${target.blockId}`}>{target.label}</option>)}
        </select>
        <button type="button" disabled={busy || !targets.some((target) => `${target.workbookId}:${target.blockId}` === targetKey)}
          onClick={() => { const target = targets.find((item) => `${item.workbookId}:${item.blockId}` === targetKey); if (target) void onSendToWorkbook(note, target.workbookId, target.blockId); }}>
          Send to Workbook
        </button>
      </div>
    </>}
    <small style={{ display: "block", marginTop: 5 }}>{category(note.anchor)} · {anchorLabel(note.anchor)} · {status} · revision {note.identity.revision}</small>
  </article>;
};

export const ProjectNotesPanel: React.FC<{
  project: Math3DProject | null; workspace: MixedWorkspaceDocument | null; drafts: readonly ProjectNoteDraft[];
  busy: boolean; message: string; onClose: () => void; onOpenProjects: () => void; onRefresh: () => void;
  selectionAvailable: boolean; workbooks: readonly { workbook: Workbook; revision: number }[];
  onCapture: (kind: NoteCaptureKind) => void; onUpdateDraft: (id: string, patch: Partial<Pick<ProjectNoteDraft, "title" | "body">>) => void;
  onCaptureResult: (resultId: string) => void; onCaptureWorkbookBlock: (workbookId: string, blockId: string) => void; onOpenTarget: (note: ProjectNote) => void;
  onDiscardDraft: (id: string) => void; onSaveDrafts: () => void;
  onSaveNote: (note: ProjectNote, title: string, body: string) => Promise<boolean>;
  onSendToWorkbook: (note: ProjectNote, workbookId: string, blockId: string) => Promise<boolean>;
  focusNoteId?: string | null;
}> = ({ project, workspace, drafts, busy, message, selectionAvailable, workbooks, onClose, onOpenProjects, onRefresh, onCapture, onCaptureResult, onCaptureWorkbookBlock, onOpenTarget, onUpdateDraft, onDiscardDraft, onSaveDrafts, onSaveNote, onSendToWorkbook, focusNoteId }) => {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<Filter>("all");
  const [resultId, setResultId] = useState(""), [blockKey, setBlockKey] = useState("");
  const notes = project?.notes ?? [];
  const visible = useMemo(() => {
    const matches = (title: string, body: string, anchor: ProjectNote["anchor"]) =>
      (filter === "all" || category(anchor) === filter) && `${title} ${body}`.toLowerCase().includes(query.trim().toLowerCase());
    return { drafts: drafts.filter((draft) => matches(draft.title, draft.body, draft.anchor)), notes: notes.filter((note) => matches(note.title, note.body, note.anchor)) };
  }, [drafts, notes, filter, query]);
  const blocks = workbooks.flatMap(({ workbook }) => workbook.stages.flatMap((stage) => stage.blocks.map((block) => ({ workbook, stage, block, key: `${workbook.id}:${block.id}` }))));
  const targets: WorkbookBlockChoice[] = blocks.map(({ workbook, stage, block }) => ({ workbookId: workbook.id, blockId: block.id, label: `${workbook.title} / ${stage.title} / ${block.title}` }));
  useEffect(() => { if (focusNoteId) { setQuery(""); setFilter("all"); } }, [focusNoteId]);
  useEffect(() => {
    if (!focusNoteId) return;
    const frame = requestAnimationFrame(() => {
      const note = document.getElementById(`project-note-${focusNoteId}`);
      note?.scrollIntoView({ block: "nearest" });
      note?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusNoteId, notes.length, query, filter]);
  const resolver = useMemo(() => project && workspace ? projectNoteSourceResolver(project.identity.id, workspace) : null, [project?.identity.id, workspace]);
  const status = (note: ProjectNote): string => {
    if (!resolver) return "Source unavailable";
    const state = inspectProjectNoteAnchor(note, { ...resolver, workbookBlock: (workbookId, blockId) => {
      const target = workbooks.find((item) => item.workbook.id === workbookId);
      const block = target?.workbook.stages.flatMap((stage) => stage.blocks).find((item) => item.id === blockId);
      return target && block ? { revision: target.revision, hash: structuralHash(block) } : null;
    } });
    return `${state.status === "missing" ? "Detached" : state.status}${state.reason ? ` — ${state.reason}` : ""}`;
  };
  return <aside aria-label="Project Notes" data-testid="project-notes-panel" style={{ position: "absolute", right: 0, top: 0, width: 420, maxWidth: "calc(100vw - 28px)", maxHeight: "min(72vh, 680px)", overflow: "auto", boxSizing: "border-box", padding: 14, background: "#fff", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 10, boxShadow: "0 10px 30px #0f172a30" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>Notes</strong><button type="button" onClick={onClose}>Close</button></div>
    <p style={{ margin: "7px 0" }}>{project ? `Project: ${project.metadata.title}` : "Session drafts. Save a named Project to keep these Notes."}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      <button type="button" data-testid="notes-new" disabled={busy} onClick={() => onCapture("global")}>New Note</button>
      <button type="button" data-testid="notes-capture-selection" disabled={busy || !selectionAvailable} onClick={() => onCapture("selection")}>From selection</button>
      <button type="button" data-testid="notes-capture-result" disabled={busy || !workspace?.results.length} onClick={() => onCapture("result")}>From latest result</button>
      <button type="button" disabled={busy} onClick={onRefresh}>Refresh</button>
      <button type="button" onClick={onOpenProjects}>Projects</button>
    </div>
    {!!workspace?.results.length && <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
      <select aria-label="Saved result target" value={resultId} onChange={(event) => setResultId(event.target.value)} style={{ minWidth: 0, flex: 1 }}><option value="">Choose saved result</option>
        {workspace.results.map((result) => <option key={result.resultId} value={result.resultId}>{result.resultId}</option>)}
      </select><button type="button" disabled={busy || !resultId} onClick={() => onCaptureResult(resultId)}>Note on result</button>
    </div>}
    {!!blocks.length && <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
      <select aria-label="Workbook block target" value={blockKey} onChange={(event) => setBlockKey(event.target.value)} style={{ minWidth: 0, flex: 1 }}><option value="">Choose Workbook block</option>
        {blocks.map(({ workbook, stage, block, key }) => <option key={key} value={key}>{workbook.title} / {stage.title} / {block.title}</option>)}
      </select><button type="button" disabled={busy || !blockKey} onClick={() => { const target = blocks.find((item) => item.key === blockKey); if (target) onCaptureWorkbookBlock(target.workbook.id, target.block.id); }}>Note on block</button>
    </div>}
    <label style={{ display: "grid", gap: 4, marginTop: 10 }}>Search Notes<input data-testid="notes-search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div aria-label="Note filters" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
      {(["all", "scene", "object", "result", "workbook"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}
    </div>
    {drafts.length > 0 && <div style={{ marginTop: 10 }}><strong>Session drafts ({drafts.length})</strong>
      <button type="button" data-testid="notes-save" disabled={busy || !project || drafts.some((draft) => !draft.title.trim() || !draft.body.trim())} onClick={onSaveDrafts} style={{ marginLeft: 7 }}>Save to Project</button>
      {!project && <small style={{ display: "block" }}>Save a named Project to bind these drafts.</small>}
    </div>}
    {visible.drafts.map((draft) => <article key={draft.id} data-testid={`note-draft-${draft.id}`} style={{ border: "1px solid #bfdbfe", borderRadius: 7, padding: 8, marginTop: 7, background: "#eff6ff" }}>
      <input aria-label="Draft title" value={draft.title} maxLength={160} onChange={(event) => onUpdateDraft(draft.id, { title: event.target.value })} style={{ width: "100%", boxSizing: "border-box" }} />
      <textarea aria-label="Draft body" value={draft.body} maxLength={8192} rows={3} onChange={(event) => onUpdateDraft(draft.id, { body: event.target.value })} style={{ width: "100%", boxSizing: "border-box", marginTop: 5 }} />
      <small>{category(draft.anchor)} · Session draft</small><button type="button" onClick={() => onDiscardDraft(draft.id)} style={{ marginLeft: 7 }}>Discard</button>
    </article>)}
    <strong style={{ display: "block", marginTop: 11 }}>Saved Notes ({notes.length})</strong>
    {visible.notes.map((note) => <SavedNote key={`${note.identity.id}:${note.identity.revision}`} note={note} status={status(note)} busy={busy} targets={targets} onSave={onSaveNote} onOpen={onOpenTarget} onSendToWorkbook={onSendToWorkbook} />)}
    {!visible.drafts.length && !visible.notes.length && <p>No Notes match this view.</p>}
    <p role="status" data-testid="notes-message">{message}</p>
  </aside>;
};
