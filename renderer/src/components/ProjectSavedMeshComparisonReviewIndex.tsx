import React from "react";
import type { SavedMeshComparisonReviewRow } from "../projects/projectSavedMeshComparisonReview";

export function ProjectSavedMeshComparisonReviewIndex({ rows, busy, onOpenPair, onOpenNote }: {
  rows: readonly SavedMeshComparisonReviewRow[]; busy: boolean;
  onOpenPair: (id: string) => void; onOpenNote?: (id: string) => void;
}) {
  return <section data-testid="project-saved-mesh-comparisons" style={{ display: "grid", gap: 8, marginTop: 10 }}>
    <strong>Saved comparison review ({rows.length})</strong>
    <p style={{ margin: 0 }}>Exact saved pairs remain listed when evidence is unavailable. Values and Notes open only after verification.</p>
    {rows.map(row => <article key={row.pair.id} data-testid={`project-mesh-review-${row.pair.id}`}
      style={{ border: "1px solid #94a3b8", borderRadius: 7, padding: 8, overflowWrap: "anywhere" }}>
      <strong>{row.pair.title}</strong>
      <div>Metric {row.pair.metricPath} · A r{row.pair.a.revision} / B r{row.pair.b.revision}</div>
      <small>A {row.pair.a.resultId} · {row.pair.a.sourceHash}<br />B {row.pair.b.resultId} · {row.pair.b.sourceHash}</small>
      <p data-testid={`project-mesh-review-status-${row.pair.id}`} role={row.status === "verified" ? "status" : "alert"}
        style={{ margin: "5px 0" }}>{row.status === "verified" ? "Verified" : "Unavailable"} · {row.reason}</p>
      <div>{row.verifiedObservations.length} verified / {row.observationCount} saved observations</div>
      <button type="button" data-testid={`project-open-pinned-mesh-${row.pair.id}`} disabled={busy || row.status !== "verified"}
        onClick={() => onOpenPair(row.pair.id)}>Open saved pair</button>
      {onOpenNote && row.verifiedObservations.map(note => <button type="button" key={note.id}
        data-testid={`project-mesh-review-note-${note.id}`} disabled={busy || row.status !== "verified"}
        onClick={() => onOpenNote(note.id)}>Open Note: {note.title}</button>)}
    </article>)}
  </section>;
}
