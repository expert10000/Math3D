import React, { useMemo, useState } from "react";
import { inspectProjectNoteAnchor, structuralHash, viewerSourceFromDocument,
  type Math3DProject, type MixedWorkspaceDocument, type ProjectNote } from "@math3d/core";
import type { NoteCaptureKind, ProjectNoteDraft } from "../projects/projectNoteDrafts";

type Filter = "all" | "scene" | "object" | "result" | "workbook";
const category = (anchor: ProjectNote["anchor"]): Exclude<Filter, "all"> | "global" =>
  anchor?.kind === "document" ? "scene" : anchor?.kind === "object-local" || anchor?.kind === "subentity" ? "object" :
    anchor?.kind === "result" ? "result" : anchor?.kind === "workbook-block" ? "workbook" : "global";

const SavedNote: React.FC<{ note: ProjectNote; status: string; busy: boolean; onSave: (note: ProjectNote, title: string, body: string) => Promise<boolean> }> = ({ note, status, busy, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title), [body, setBody] = useState(note.body);
  return <article data-testid={`project-note-${note.identity.id}`} style={{ border: "1px solid #cbd5e1", borderRadius: 7, padding: 8, marginTop: 7 }}>
    {editing ? <>
      <input aria-label="Note title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      <textarea aria-label="Note body" value={body} maxLength={8192} rows={3} onChange={(event) => setBody(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginTop: 5 }} />
      <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => { void onSave(note, title, body).then((saved) => { if (saved) setEditing(false); }); }}>Save changes</button>
      <button type="button" onClick={() => { setTitle(note.title); setBody(note.body); setEditing(false); }}>Cancel</button>
    </> : <>
      <strong>{note.title}</strong><p style={{ whiteSpace: "pre-wrap", margin: "5px 0" }}>{note.body}</p>
      <button type="button" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
    </>}
    <small style={{ display: "block", marginTop: 5 }}>{category(note.anchor)} · {status} · revision {note.identity.revision}</small>
  </article>;
};

export const ProjectNotesPanel: React.FC<{
  project: Math3DProject | null; workspace: MixedWorkspaceDocument | null; drafts: readonly ProjectNoteDraft[];
  busy: boolean; message: string; onClose: () => void; onOpenProjects: () => void; onRefresh: () => void;
  onCapture: (kind: NoteCaptureKind) => void; onUpdateDraft: (id: string, patch: Partial<Pick<ProjectNoteDraft, "title" | "body">>) => void;
  onDiscardDraft: (id: string) => void; onSaveDrafts: () => void;
  onSaveNote: (note: ProjectNote, title: string, body: string) => Promise<boolean>;
}> = ({ project, workspace, drafts, busy, message, onClose, onOpenProjects, onRefresh, onCapture, onUpdateDraft, onDiscardDraft, onSaveDrafts, onSaveNote }) => {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<Filter>("all");
  const notes = project?.notes ?? [];
  const visible = useMemo(() => {
    const matches = (title: string, body: string, anchor: ProjectNote["anchor"]) =>
      (filter === "all" || category(anchor) === filter) && `${title} ${body}`.toLowerCase().includes(query.trim().toLowerCase());
    return { drafts: drafts.filter((draft) => matches(draft.title, draft.body, draft.anchor)), notes: notes.filter((note) => matches(note.title, note.body, note.anchor)) };
  }, [drafts, notes, filter, query]);
  const status = (note: ProjectNote): string => {
    if (!workspace) return "Source unavailable";
    const sources = new Map(workspace.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]));
    const anchor = note.anchor;
    if (anchor?.kind === "workbook-block") return project?.workbooks?.some((item) => item.id === anchor.workbookId)
      ? "Workbook linked · block check pending" : "Detached — Workbook is not in this Project.";
    if (anchor?.kind === "object-local" || anchor?.kind === "subentity")
      return sources.has(anchor.source.documentId) ? "Object anchor · precise check pending" : "Detached — source document is unavailable.";
    const state = inspectProjectNoteAnchor(note, {
      projectId: project!.identity.id,
      source: (id) => sources.get(id) ?? null,
      result: (id) => { const result = workspace.results.find((entry) => entry.resultId === id); return result ? { source: result.provenance.source, hash: structuralHash(result) } : null; },
    });
    return `${state.status === "missing" ? "Detached" : state.status}${state.reason ? ` — ${state.reason}` : ""}`;
  };
  return <aside aria-label="Project Notes" data-testid="project-notes-panel" style={{ position: "absolute", right: 0, top: 0, width: 420, maxWidth: "calc(100vw - 28px)", maxHeight: "min(72vh, 680px)", overflow: "auto", boxSizing: "border-box", padding: 14, background: "#fff", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: 10, boxShadow: "0 10px 30px #0f172a30" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>Notes</strong><button type="button" onClick={onClose}>Close</button></div>
    <p style={{ margin: "7px 0" }}>{project ? `Project: ${project.metadata.title}` : "Session drafts. Save a named Project to keep these Notes."}</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      <button type="button" data-testid="notes-new" disabled={busy} onClick={() => onCapture("global")}>New Note</button>
      <button type="button" data-testid="notes-capture-selection" disabled={busy || !workspace?.committedSelection?.entityIds.length} onClick={() => onCapture("selection")}>From selection</button>
      <button type="button" data-testid="notes-capture-result" disabled={busy || !workspace?.results.length} onClick={() => onCapture("result")}>From latest result</button>
      <button type="button" disabled={busy} onClick={onRefresh}>Refresh</button>
      <button type="button" onClick={onOpenProjects}>Projects</button>
    </div>
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
    {visible.notes.map((note) => <SavedNote key={`${note.identity.id}:${note.identity.revision}`} note={note} status={status(note)} busy={busy} onSave={onSaveNote} />)}
    {!visible.drafts.length && !visible.notes.length && <p>No Notes match this view.</p>}
    <p role="status" data-testid="notes-message">{message}</p>
  </aside>;
};
