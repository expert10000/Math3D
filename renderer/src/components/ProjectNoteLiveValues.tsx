import React, { useState } from "react";
import { serializeProjectNote, updateProjectNote, type MixedWorkspaceDocument, type ProjectNote } from "@math3d/core";
import { projectNoteValueChoices, resolveProjectNoteValues } from "../projects/projectNoteValues";

export type NoteValuePatch = Partial<Pick<ProjectNote, "body" | "valueBindings" | "valueSnapshot">>;
export const ProjectNoteLiveValues = ({ note, workspace, busy, onChange }: { note: ProjectNote; workspace: MixedWorkspaceDocument | null; busy: boolean; onChange: (note: ProjectNote, patch: NoteValuePatch) => Promise<boolean> }) => {
  const [selected, setSelected] = useState("");
  const choices = workspace ? projectNoteValueChoices(workspace) : [], values = resolveProjectNoteValues(note, workspace);
  return <details data-testid="note-live-values"><summary>Values {note.valueSnapshot ? "· frozen snapshot" : "· live"}</summary>
    <select aria-label="Live value target" disabled={busy || !!note.valueSnapshot} value={selected} onChange={event => setSelected(event.target.value)} style={{ width: "100%" }}>
      <option value="">Choose a parameter, object coordinate or saved result value</option>
      {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
    </select>
    <button type="button" disabled={busy || !!note.valueSnapshot || (note.valueBindings?.length ?? 0) >= 16 || !choices.some(choice => choice.key === selected)} onClick={() => {
      const choice = choices.find(item => item.key === selected); if (!choice) return;
      let index = 1; while (note.valueBindings?.some(binding => binding.id === `value${index}`)) index++;
      const binding = { ...choice.binding, id: `value${index}` };
      void onChange(note, { valueBindings: [...note.valueBindings ?? [], binding], body: `${note.body} {{value:${binding.id}}}`, valueSnapshot: null });
    }}>Insert live value</button>
    <ul>{values.map(value => <li key={value.id} data-testid={`note-value-${value.id}`}>
      <strong>{value.id}</strong>: {value.value ?? "unavailable"} {value.units} · {value.status}
      <small style={{ display: "block", overflowWrap: "anywhere" }}>{value.source ? `${value.source.documentId} · r${value.source.revision}` : "Source unavailable"}</small>
      {!note.valueSnapshot && <button type="button" disabled={busy} onClick={() => void onChange(note, { valueBindings: note.valueBindings!.filter(binding => binding.id !== value.id), valueSnapshot: null })}>Remove binding</button>}
    </li>)}</ul>
    {!!values.length && <button type="button" disabled={busy} onClick={() => void onChange(note, { valueSnapshot: note.valueSnapshot ? null : { capturedAt: Date.now(), values } })}>{note.valueSnapshot ? "Use live values" : "Freeze values"}</button>}
    {!!values.length && <button type="button" disabled={busy} onClick={() => {
      const now = Date.now(), snapshot = note.valueSnapshot ? note : updateProjectNote(note, { valueSnapshot: { capturedAt: now, values } }, now);
      const url = URL.createObjectURL(new Blob([serializeProjectNote(snapshot)], { type: "application/json" })), link = document.createElement("a");
      link.href = url; link.download = "math3d-note-value-snapshot.json"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }}>Export value snapshot</button>}
    {note.valueSnapshot && <small style={{ display: "block" }}>Captured {new Date(note.valueSnapshot.capturedAt).toLocaleString()}. Values retain their recorded source generations.</small>}
    <small>Unknown tokens remain literal. Values show their source, units and freshness.</small>
  </details>;
};
