import { useEffect, useState } from "react";
import { GRAPH2D_ANALYSIS_QUALITY_MEANINGS, GRAPH2D_MAX_CONSTRUCTIONS, isGraph2DIntersectionCurrent,
  type Graph2DDocument, type Graph2DIntersectionAnalysis,
  type Graph2DIntersectionCandidate, type Graph2DSelection } from "@math3d/core";
import { downloadGraph2DNumericalDataset } from "./downloadGraph2DNumericalDataset";
import { downloadGraph2DResultsCsv } from "./downloadGraph2DResultsCsv";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

const filters: readonly Graph2DResultFilter<Graph2DIntersectionCandidate>[] = [
  { id: "all", label: "All", include: () => true },
  { id: "crossing", label: "Crossings", include: item => item.classification === "crossing" },
  { id: "tangent-possible", label: "Possible tangencies", include: item => item.classification === "tangent-possible" },
];
const columns: readonly Graph2DResultColumn<Graph2DIntersectionCandidate>[] = [
  { id: "y", label: "y", render: item => item.y.toPrecision(7) },
  { id: "residual", label: "Residual", render: item => item.residual.toExponential(1) },
  { id: "quality", label: "Quality", render: item => <span
    className={`graph2d-analysis-quality graph2d-analysis-quality-${item.quality}`}
    title={GRAPH2D_ANALYSIS_QUALITY_MEANINGS[item.quality]}>
    {item.quality === "refined" ? "Refined" : "Approximate"}</span> },
];

export function Graph2DIntersectionResultsTable({ analysis, document, onSelectionCommit,
  canSave, onSave, onSaveBatch }: Readonly<{
  analysis: Graph2DIntersectionAnalysis;
  document: Graph2DDocument;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  canSave: boolean;
  onSave: (candidate: Graph2DIntersectionCandidate) => void;
  onSaveBatch?: (candidates: readonly Graph2DIntersectionCandidate[]) => void;
}>) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [actionError, setActionError] = useState("");
  useEffect(() => { setSelectedIds([]); setActionError(""); }, [analysis.resultId]);
  const current = isGraph2DIntersectionCurrent(analysis, document);
  const available = GRAPH2D_MAX_CONSTRUCTIONS - (document.source.constructions?.objects.length ?? 0);
  const saveable = (item: Graph2DIntersectionCandidate) => canSave && current &&
    analysis.status === "complete" && !document.source.constructions?.objects.some(saved =>
      saved.kind === "intersection" && saved.anchor.candidateId === item.candidateId);
  const exportCsv = () => downloadGraph2DResultsCsv(`graph-intersections-${analysis.firstObjectId}-${analysis.secondObjectId}.csv`,
    ["classification", "x", "y", "residual", "quality", "confidence", "method", "source_document",
      "source_revision", "scan_status", "interval_min", "interval_max"],
    analysis.candidates.map(item => [item.classification, item.x, item.y, item.residual, item.quality,
      item.confidence, item.method, item.source.documentId, item.source.revision, analysis.status,
      analysis.interval.min, analysis.interval.max]));
  return <div data-testid="graph2d-intersection-results-table" data-source-hash={analysis.source.structuralHash}>
    <dl className="graph2d-critical-summary">
      <div><dt>Crossings</dt><dd>{analysis.candidates.filter(item => item.classification === "crossing").length}</dd></div>
      <div><dt>Possible tangencies</dt><dd>{analysis.candidates.filter(item => item.classification === "tangent-possible").length}</dd></div>
      <div><dt>Unresolved cells</dt><dd>{analysis.unresolvedIntervals.length}</dd></div>
    </dl>
    <Graph2DNumericalResultsTable resultKey={analysis.resultId} tableLabel="Intersection numerical results"
      controlsLabel="Filter intersection results" searchLabel="Search intersection results"
      sortLabel="Sort intersections by x" items={analysis.candidates} filters={filters} columns={columns}
      getId={item => item.candidateId} getX={item => item.x} getKind={item => item.classification}
      getSearchText={item => `${item.classification} ${item.x} ${item.y} ${item.quality} ${item.method}`}
      onFocus={item => onSelectionCommit?.({ objectId: item.firstObjectId,
        probe: { objectId: item.firstObjectId, x: item.x, y: item.y } })}
      canFocus={() => current && !!onSelectionCommit}
      focusLabel={item => `Select intersection at x ${item.x.toPrecision(7)}`}
      isActive={item => document.selection.probe?.objectId === item.firstObjectId &&
        Math.abs(document.selection.probe.x - item.x) < 1e-8}
      canSave={saveable} onSaveOne={onSave}
      saveLabel={item => `Save intersection at x ${item.x.toPrecision(7)} as construction`}
      selectedIds={onSaveBatch ? selectedIds : undefined}
      onSelectedIdsChange={onSaveBatch ? setSelectedIds : undefined}
      onSaveSelected={onSaveBatch ? items => { try { onSaveBatch(items); setSelectedIds([]); setActionError(""); }
        catch (error) { setActionError(error instanceof Error ? error.message : "Intersections could not be saved."); } } : undefined}
      canSaveSelected={items => items.length <= available}
      exportCsv={current ? exportCsv : undefined}
      exportJson={current ? () => downloadGraph2DNumericalDataset(analysis) : undefined}
      emptyText="No isolated candidates found." />
    {actionError && <p role="alert">{actionError}</p>}
  </div>;
}
