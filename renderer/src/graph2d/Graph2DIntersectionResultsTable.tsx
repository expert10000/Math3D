import { useMemo, useState } from "react";
import { GRAPH2D_ANALYSIS_QUALITY_MEANINGS, isGraph2DIntersectionCurrent,
  type Graph2DDocument, type Graph2DIntersectionAnalysis,
  type Graph2DIntersectionCandidate, type Graph2DSelection } from "@math3d/core";
import { graph2DNumericalRows } from "./graph2dNumericalRows";

type Filter = "all" | "crossing" | "tangent-possible";

export function Graph2DIntersectionResultsTable({ analysis, document, onSelectionCommit,
  canSave, onSave }: Readonly<{
  analysis: Graph2DIntersectionAnalysis;
  document: Graph2DDocument;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  canSave: boolean;
  onSave: (candidate: Graph2DIntersectionCandidate) => void;
}>) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(false);
  const rows = useMemo(() => graph2DNumericalRows(analysis.candidates, { query, descending,
    include: item => filter === "all" || item.classification === filter,
    searchText: item => `${item.classification} ${item.x} ${item.y} ${item.quality} ${item.method}` }),
  [analysis, filter, query, descending]);
  const current = isGraph2DIntersectionCurrent(analysis, document);
  return <div data-testid="graph2d-intersection-results-table" data-source-hash={analysis.source.structuralHash}>
    <div className="graph2d-critical-controls">
      <div role="group" aria-label="Filter intersection results">
        {(["all", "crossing", "tangent-possible"] as const).map(value =>
          <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => setFilter(value)}>{value === "all" ? "All" :
              value === "crossing" ? "Crossings" : "Possible tangencies"}</button>)}
      </div>
      <label>Search intersections <input aria-label="Search intersection results" value={query}
        onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="graph2d-critical-table-wrap"><table aria-label="Intersection numerical results">
      <thead><tr><th scope="col">Kind</th><th scope="col"><button type="button"
        aria-label="Sort intersections by x" onClick={() => setDescending(value => !value)}>
        x {descending ? "↓" : "↑"}</button></th><th scope="col">y</th><th scope="col">Residual</th>
        <th scope="col">Quality</th><th scope="col">Save</th></tr></thead>
      <tbody>{rows.map(candidate => {
        const active = document.selection.probe?.objectId === candidate.firstObjectId &&
          Math.abs(document.selection.probe.x - candidate.x) < 1e-8;
        return <tr key={candidate.candidateId} className={active ? "graph2d-critical-active" : undefined}>
          <td><button type="button" aria-label={`Select intersection at x ${candidate.x.toPrecision(7)}`}
            disabled={!current} title={`${candidate.classification} · ${candidate.method}`}
            onClick={() => onSelectionCommit?.({ objectId: candidate.firstObjectId,
              probe: { objectId: candidate.firstObjectId, x: candidate.x, y: candidate.y } })}>
            {candidate.classification}</button></td>
          <td>{candidate.x.toPrecision(7)}</td><td>{candidate.y.toPrecision(7)}</td>
          <td>{candidate.residual.toExponential(1)}</td>
          <td><span className={`graph2d-analysis-quality graph2d-analysis-quality-${candidate.quality}`}
            title={GRAPH2D_ANALYSIS_QUALITY_MEANINGS[candidate.quality]}>
            {candidate.quality === "refined" ? "Refined" : "Approximate"}</span></td>
          <td><button type="button" aria-label={`Save intersection at x ${candidate.x.toPrecision(7)} as construction`}
            title={analysis.status !== "complete" ? "Complete bounded scan required before saving." : undefined}
            disabled={!canSave || analysis.status !== "complete" || !current}
            onClick={() => onSave(candidate)}>Save</button></td>
        </tr>;
      })}</tbody>
    </table>{!rows.length && <p>{analysis.candidates.length ? "No matching intersections." :
      "No isolated candidates found."}</p>}</div>
  </div>;
}
