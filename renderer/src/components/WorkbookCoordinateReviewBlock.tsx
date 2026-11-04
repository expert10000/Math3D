import React, { useEffect, useState } from "react";
import { parseMath3DProject, type Math3DProject } from "@math3d/core";
import { createWorkbookCoordinateReviewReference, type WorkbookCoordinateReviewReference } from "@math3d/workbook";
import { loadProjectResources } from "../projects/projectResourceArchive";
import { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
import { inspectWorkbookCoordinateReview, workbookCoordinateReviewHtml } from "../projects/projectCoordinateWorkbookReview";
import { downloadStudyBlob } from "../projects/studyComparisonExport";
import type { ProjectResourceReader, VerifiedProjectResources } from "../projects/projectResources";

export const WorkbookCoordinateReviewEditor: React.FC<{
  project: Math3DProject | null; reference?: WorkbookCoordinateReviewReference; readOnly: boolean;
  onChange: (reference: WorkbookCoordinateReviewReference | undefined) => void;
}> = ({ project, reference, readOnly, onChange }) => {
  const [selected, setSelected] = useState<string[]>(reference?.notes.map(item => item.noteId) ?? []);
  const [message, setMessage] = useState("");
  useEffect(() => setSelected(reference?.notes.map(item => item.noteId) ?? []), [reference]);
  const notes = (project?.notes ?? []).filter(note => note.anchor?.kind === "comparison" && !!note.anchor.coordinateProbe);
  return <section data-testid="workbook-coordinate-review-editor" style={{ display: "grid", gap: 5 }}>
    <strong>Saved coordinate review</strong>
    <small>Choose exact PC26 coordinate Notes. Workbook retains Note and comparison hashes, not source arrays.</small>
    {notes.map(note => <label key={note.identity.id}><input type="checkbox" disabled={readOnly} checked={selected.includes(note.identity.id)}
      onChange={event => setSelected(previous => event.target.checked ? [...previous, note.identity.id] : previous.filter(id => id !== note.identity.id))} />{note.title}</label>)}
    {!notes.length && <small>Save coordinate observations in a Project comparison first.</small>}
    <div><button type="button" disabled={readOnly || !project || !selected.length} onClick={() => {
      try { onChange(createWorkbookCoordinateReviewReference(project!, selected)); setMessage("Exact coordinate Notes linked. Save the Workbook in Projects."); }
      catch (error) { setMessage(`Link refused: ${(error as Error).message}`); }
    }}>Link selected coordinate Notes</button>{" "}
      <button type="button" disabled={readOnly || !reference} onClick={() => { onChange(undefined); setMessage("Review link removed."); }}>Clear review link</button></div>
    {message && <small role={message.includes("refused") ? "alert" : "status"}>{message}</small>}
  </section>;
};

export const WorkbookCoordinateReviewBlock: React.FC<{
  project: Math3DProject | null; reference: WorkbookCoordinateReviewReference; readResource?: ProjectResourceReader;
  onOpenNote?: (noteId: string) => void;
}> = ({ project, reference, readResource, onOpenNote }) => {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  const [archive, setArchive] = useState<VerifiedProjectResources | null>(null);
  const savedProject = (() => {
    try { const raw = localStorage.getItem(PROJECT_STORAGE_KEY), saved = raw ? parseMath3DProject(raw) : null;
      return saved?.identity.id === project?.identity.id ? saved : project; }
    catch { return project; }
  })();
  const archived = savedProject && archive?.verifiedFor(savedProject) ? archive : null;
  const reader: ProjectResourceReader | undefined = archived ? item => archived.bytes(item) : readResource;
  const snapshot = open ? inspectWorkbookCoordinateReview(savedProject, reference, reader) : null;
  useEffect(() => {
    if (!open || !savedProject) return;
    let cancelled = false;
    void loadProjectResources(savedProject).then(resources => { if (!cancelled) setArchive(resources); })
      .catch(error => { if (!cancelled) setMessage(`Source archive unavailable: ${(error as Error).message}`); });
    return () => { cancelled = true; };
  }, [open, savedProject?.identity.id, savedProject?.identity.structuralHash]);
  return <section data-testid="workbook-coordinate-review" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, minWidth: 0, overflowWrap: "anywhere" }}>
    <strong>Saved coordinate review · {reference.notes.length} observations</strong>
    <p>Exact Note and source bytes are reverified on open. A marker denotes a shared coordinate, not a matching element.</p>
    <details onToggle={event => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) setArchive(null); }}>
      <summary>Show embedded coordinate review</summary>
      {snapshot && <div style={{ display: "grid", gap: 8 }}>
        {snapshot.entries.map(entry => <article key={entry.noteId} data-testid={`workbook-coordinate-review-row-${entry.noteId}`}
          style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>
          <strong>{entry.title}</strong> · <b>{entry.status}</b>
          <p>Note {entry.noteId} · r{entry.noteRevision} · {entry.noteHash}<br />Comparison {entry.compositionId} · {entry.compositionHash}</p>
          {entry.status === "verified" && entry.evidence?.point ? <>
            <p data-testid="workbook-coordinate-marker">◎ {entry.evidence.point.join(", ")} {entry.evidence.unit} · {entry.evidence.frame} · source {entry.evidence.sourceSlot}</p>
            <p>{entry.evidence.body}</p><small>Verified sources: {entry.evidence.sources.map(source => `${source.slot} ${source.id} r${source.revision} ${source.hash}`).join(" · ")}</small><br />
            <button type="button" disabled={!onOpenNote} onClick={() => onOpenNote?.(entry.noteId)}>Open saved marker</button>
          </> : <p>Unavailable: {entry.reason} Coordinate and observation text withheld.</p>}
        </article>)}
        <button type="button" onClick={() => {
          downloadStudyBlob(new Blob([workbookCoordinateReviewHtml(inspectWorkbookCoordinateReview(savedProject, reference, reader))], { type: "text/html" }),
            "math3d-workbook-coordinate-review.html");
          setMessage("Coordinate review status report downloaded.");
        }}>Export coordinate review HTML</button>
      </div>}
    </details>
    {message && <p role="status">{message}</p>}
  </section>;
};
