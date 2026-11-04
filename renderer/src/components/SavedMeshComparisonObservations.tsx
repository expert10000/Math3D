import React, { useState } from "react";
import type { Math3DProject, ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";
import { inspectProjectSavedMeshComparisonNote } from "../projects/projectSavedMeshComparisonNotes";

export function SavedMeshComparisonObservations({ project, pair, readResource, onSave }: {
  project: Math3DProject; pair: ProjectSavedMeshComparison; readResource: ProjectResourceReader;
  onSave?: (pair: ProjectSavedMeshComparison, title: string, body: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("Mesh comparison observation"), [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const linked = (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id);
  const current = linked.filter(note => inspectProjectSavedMeshComparisonNote(project, note, readResource).status === "current");
  return <section data-testid="saved-mesh-comparison-observations" style={{ borderTop: "1px solid #94a3b8", marginTop: 12, paddingTop: 10 }}>
    <h3>Authored observations</h3><p>Notes describe this exact saved pair and metric; they are not independent measurements.</p>
    {current.map(note => <article key={note.identity.id} data-testid="saved-mesh-comparison-observation"><strong>{note.title}</strong><p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p><small>Note {note.identity.id} · {note.identity.structuralHash}</small></article>)}
    {linked.length > current.length && <p role="alert">{linked.length - current.length} observation(s) unavailable because their exact evidence does not verify.</p>}
    {onSave && <div style={{ display: "grid", gap: 6, maxWidth: 640 }}>
      <label>Observation title <input data-testid="saved-mesh-observation-title" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} /></label>
      <label>Observation <textarea data-testid="saved-mesh-observation-body" value={body} maxLength={8192} rows={3} onChange={event => setBody(event.target.value)} /></label>
      <button type="button" data-testid="saved-mesh-observation-save" disabled={!title.trim() || !body.trim()} onClick={() => { void onSave(pair, title, body).then(ok => {
        setMessage(ok ? "Observation saved to the Project." : "Observation save refused; check the Project evidence.");
        if (ok) setBody("");
      }); }}>Save observation</button>
    </div>}
    {message && <p role={message.includes("refused") ? "alert" : "status"}>{message}</p>}
  </section>;
}
