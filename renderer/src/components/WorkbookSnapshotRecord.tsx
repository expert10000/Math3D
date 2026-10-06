import React from "react";
import { workbookSnapshotQualification, type WorkbookBlock } from "@math3d/workbook";

export const WorkbookSnapshotRecord = ({ block }: { block: WorkbookBlock }) => <div data-testid="workbook-snapshot-record" style={{ fontSize: 11 }}>
  <strong>{block.visualize?.live ? "Live scene" : "Frozen view"}</strong>
  {(["A", "B"] as const).map(slot => {
    const snapshot = slot === "A" ? block.visualize?.snapshotA ?? block.visualize?.snapshot : block.visualize?.snapshotB;
    if (!snapshot) return null;
    return <details key={slot}><summary>Snapshot {slot} · frozen capture</summary>
      <p>{workbookSnapshotQualification(snapshot)}</p>
      <p>Camera: {JSON.stringify(snapshot.camera ?? null)}</p>
      <p>Coloring: {snapshot.colorMode ?? "not recorded"} · {snapshot.colorPalette ?? "not recorded"}</p>
      {snapshot.provenance && <>
        <p>Viewer source: {snapshot.provenance.viewerSource ? JSON.stringify(snapshot.provenance.viewerSource) : "unavailable; Project context alone does not establish the picture source"}</p>
        <p>Selection: {JSON.stringify(snapshot.provenance.selection)}</p>
        <p>Visibility and presentation: {JSON.stringify(snapshot.provenance.presentation)}</p>
        {snapshot.provenance.sources.map(source => <p key={source.documentId}>Source: {source.documentId} · r{source.revision} · g{source.generation} · {source.structuralHash}</p>)}
        {snapshot.provenance.annotations.map(note => <p key={note.id}>Captured Note: {note.title} · {note.hash} · {note.body}</p>)}
        {snapshot.provenance.results.map(result => <p key={result.reference.targetId}>Result: {result.reference.targetId} · {result.reference.kind === "result" ? result.reference.resultHash : ""} · {result.authority} · artifacts: {result.artifacts.map(item => `${item.id}: ${item.status}`).join(", ") || "none declared"}</p>)}
      </>}
    </details>;
  })}
</div>;
