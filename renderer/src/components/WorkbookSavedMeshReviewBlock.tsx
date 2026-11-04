import React, { useEffect, useState } from "react";
import { parseMath3DProject, type Math3DProject } from "@math3d/core";
import { createWorkbookSavedMeshReviewReference, type WorkbookSavedMeshReviewReference } from "@math3d/workbook";
import type { ProjectResourceReader, VerifiedProjectResources } from "../projects/projectResources";
import { loadProjectResources } from "../projects/projectResourceArchive";
import { PROJECT_STORAGE_KEY } from "../projects/projectLibrary";
import { inspectWorkbookSavedMeshReview } from "../projects/projectSavedMeshWorkbookReview";
import { savedMeshComparisonReviewHtml } from "../projects/projectSavedMeshComparisonReviewReport";
import { downloadStudyBlob } from "../projects/studyComparisonExport";

export const WorkbookSavedMeshReviewEditor: React.FC<{
  project: Math3DProject | null; reference?: WorkbookSavedMeshReviewReference; readOnly: boolean;
  onChange: (reference: WorkbookSavedMeshReviewReference | undefined) => void;
}> = ({ project, reference, readOnly, onChange }) => {
  const [selected, setSelected] = useState<string[]>(reference?.pairs.map(item => item.comparison.comparisonId) ?? []);
  const [message, setMessage] = useState("");
  useEffect(() => setSelected(reference?.pairs.map(item => item.comparison.comparisonId) ?? []), [reference]);
  return <section style={{ display: "grid", gap: 5 }} data-testid="workbook-saved-mesh-review-editor">
    <strong>Saved comparison review</strong>
    <small>Choose exact saved pairs and their current linked Notes. Workbook retains IDs and hashes, not result bytes.</small>
    {(project?.savedMeshComparisons ?? []).map(pair => <label key={pair.id}>
      <input type="checkbox" checked={selected.includes(pair.id)} disabled={readOnly} onChange={event =>
        setSelected(previous => event.target.checked ? [...previous, pair.id] : previous.filter(id => id !== pair.id))} />
      {pair.title} · {pair.metricPath}
    </label>)}
    {!project?.savedMeshComparisons?.length && <small>Save Mesh A/B comparisons in Projects first.</small>}
    <div><button type="button" disabled={readOnly || !project || !selected.length} onClick={() => {
      try { onChange(createWorkbookSavedMeshReviewReference(project!, selected)); setMessage("Exact pair and Note references linked. Save the Workbook in Projects."); }
      catch (error) { setMessage(`Link refused: ${(error as Error).message}`); }
    }}>Link selected saved pairs</button>{" "}
      <button type="button" disabled={readOnly || !reference} onClick={() => { onChange(undefined); setMessage("Review link removed."); }}>Clear review link</button></div>
    {message && <small role={message.includes("refused") ? "alert" : "status"}>{message}</small>}
  </section>;
};

export const WorkbookSavedMeshReviewBlock: React.FC<{
  project: Math3DProject | null; reference: WorkbookSavedMeshReviewReference; readResource?: ProjectResourceReader;
  onOpenPair?: (comparisonId: string) => void; onOpenNote?: (noteId: string) => void;
}> = ({ project, reference, readResource, onOpenPair, onOpenNote }) => {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  const [archive, setArchive] = useState<VerifiedProjectResources | null>(null);
  const savedProject = (() => {
    try { const raw = localStorage.getItem(PROJECT_STORAGE_KEY), saved = raw ? parseMath3DProject(raw) : null;
      return saved?.identity.id === project?.identity.id ? saved : project; }
    catch { return project; }
  })();
  const archived = savedProject && archive?.verifiedFor(savedProject) ? archive : null;
  const reader: ProjectResourceReader | undefined = archived ? item => archived.bytes(item) : readResource;
  const snapshot = open ? inspectWorkbookSavedMeshReview(savedProject, reference, reader) : null;
  useEffect(() => {
    if (!open || !savedProject) return;
    let cancelled = false;
    void loadProjectResources(savedProject).then(resources => { if (!cancelled) setArchive(resources); })
      .catch(error => { if (!cancelled) setMessage(`Source archive unavailable: ${(error as Error).message}`); });
    return () => { cancelled = true; };
  }, [open, savedProject?.identity.id, savedProject?.identity.structuralHash]);
  const exportHtml = () => {
    if (!snapshot) return;
    downloadStudyBlob(new Blob([savedMeshComparisonReviewHtml(snapshot)], { type: "text/html" }),
      "math3d-workbook-saved-comparison-review.html");
    setMessage("Saved review status report downloaded. Unavailable values and Note text are withheld.");
  };
  return <section data-testid="workbook-saved-mesh-review" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, minWidth: 0, overflowWrap: "anywhere" }}>
    <strong>Saved comparison review · {reference.pairs.length} pairs</strong>
    <p>Project {reference.projectId}. Exact saved pair and Note identities are reverified when opened.</p>
    <details onToggle={event => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) setArchive(null); }}>
      <summary>Show embedded comparison review</summary>
      {snapshot && <div style={{ display: "grid", gap: 8 }}>
        {snapshot.entries.map(entry => <article key={entry.comparisonId} data-testid={`workbook-review-row-${entry.comparisonId}`}
          style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>
          <strong>{entry.title}</strong> · {entry.metricPath} · <b>{entry.status}</b>
          <p>{entry.reason}</p>
          <small>Pair {entry.comparisonId} · {entry.comparisonHash}<br />
            A result {entry.a.resultId} · {entry.a.resultHash} · Mesh r{entry.a.revision} · {entry.a.sourceHash}<br />
            B result {entry.b.resultId} · {entry.b.resultHash} · Mesh r{entry.b.revision} · {entry.b.sourceHash}</small>
          {entry.status === "verified" && entry.values ? <p>A {entry.values.a}; B {entry.values.b}; B − A {entry.values.difference} {entry.values.unit}</p>
            : <p>Values unavailable; exact evidence did not verify.</p>}
          <button type="button" disabled={entry.status !== "verified" || !onOpenPair} onClick={() => onOpenPair?.(entry.comparisonId)}>Open saved pair</button>
          {entry.observations.map(note => <div key={note.noteId}>
            {note.status === "verified" ? <><strong>{note.title}</strong><p>{note.body}</p><small>Note {note.noteId} · r{note.noteRevision} · {note.noteHash}</small>{" "}
              <button type="button" disabled={!onOpenNote} onClick={() => onOpenNote?.(note.noteId)}>Open Note</button></>
              : <p>Note {note.noteId} unavailable · {note.reason} Text withheld.</p>}
          </div>)}
        </article>)}
        <button type="button" onClick={exportHtml}>Export review status HTML</button>
      </div>}
    </details>
    {message && <p role="status">{message}</p>}
  </section>;
};
