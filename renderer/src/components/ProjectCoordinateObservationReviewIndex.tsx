import type { ProjectCoordinateObservationReviewRow } from "../projects/projectCoordinateObservationReview";

export function ProjectCoordinateObservationReviewIndex({ rows, onOpen, onExport }: {
  rows: readonly ProjectCoordinateObservationReviewRow[]; onOpen: (noteId: string) => void; onExport?: () => void;
}) {
  return <section data-testid="project-coordinate-observation-review" aria-label="Saved coordinate observations" style={{ marginTop: 16 }}>
    <h4>Saved coordinate observations ({rows.length})</h4>
    <p>Authored positions in exact Mesh/Geometry comparisons. A coordinate is not a matching element or measured value.</p>
    {onExport && <button type="button" data-testid="project-coordinate-review-export" onClick={onExport}>Export coordinate review</button>}
    <ul>{rows.map(row => <li key={row.noteId} data-testid={`project-coordinate-review-${row.noteId}`}>
      <strong>{row.title}</strong> · {row.status} · {row.compositionTitle ?? row.compositionId}<br />
      <small>{row.sourceSlot} → {row.sourceSlot === "A" ? "B" : "A"} · {row.frame} · {row.unit}<br />
        {row.sources.map(source => `${source.slot}: ${source.id} r${source.revision} · ${source.hash}`).join(" | ")}</small><br />
      {row.status === "current" ? <button type="button" onClick={() => onOpen(row.noteId)}>Open saved marker</button> :
        <small role="status">Unavailable: {row.reason}</small>}
    </li>)}</ul>
  </section>;
}
