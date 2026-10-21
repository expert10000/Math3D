import { isGraph2DIntervalAnalysisCurrent, type Graph2DDocument,
  type Graph2DIntervalAnalysis, type Graph2DIntervalPartition } from "@math3d/core";
import { downloadGraph2DResultJson } from "./downloadGraph2DResultJson";
import { downloadGraph2DResultsCsv } from "./downloadGraph2DResultsCsv";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

const filters: readonly Graph2DResultFilter<Graph2DIntervalPartition>[] = [
  { id: "all", label: "All", include: () => true },
  { id: "increasing", label: "Increasing", include: item => item.monotonicity === "increasing" },
  { id: "decreasing", label: "Decreasing", include: item => item.monotonicity === "decreasing" },
  { id: "unknown", label: "Unknown", include: item => item.monotonicity === "unknown" || item.concavity === "unknown" },
];
const columns: readonly Graph2DResultColumn<Graph2DIntervalPartition>[] = [
  { id: "trend", label: "Trend", render: item => item.monotonicity },
  { id: "concavity", label: "Concavity", render: item => item.concavity },
  { id: "boundary", label: "Boundary", render: item => `${item.leftBoundary} → ${item.rightBoundary}` },
  { id: "quality", label: "Quality", render: item => item.confidence === "unknown" ? "Unresolved" : "Approximate" },
];

export function Graph2DIntervalResultsPanel({ analysis, document, onFocus, focusedId }: Readonly<{
  analysis: Graph2DIntervalAnalysis;
  document: Graph2DDocument;
  onFocus?: (part: Graph2DIntervalPartition) => void;
  focusedId: string | null;
}>) {
  const current = isGraph2DIntervalAnalysisCurrent(analysis, document);
  const uncertain = analysis.partitions.filter(item => item.confidence === "unknown").length;
  const exportCsv = () => downloadGraph2DResultsCsv(`graph-intervals-${analysis.objectId}.csv`,
    ["interval_id", "min", "max", "monotonicity", "concavity", "left_boundary", "right_boundary",
      "confidence", "scan_status", "source_document", "source_revision"],
    analysis.partitions.map(item => [item.intervalId, item.min, item.max, item.monotonicity,
      item.concavity, item.leftBoundary, item.rightBoundary, item.confidence, analysis.status,
      analysis.source.documentId, analysis.source.revision]));
  return <section className="graph2d-intervals" data-testid="graph2d-intervals"
    data-result-id={analysis.resultId} aria-label="Monotonicity and concavity intervals">
    <h3>Monotonicity and concavity</h3>
    <p role="status"><strong>{!current ? "Stale interval analysis" : analysis.status === "complete" ? "Approximate partitions" :
      analysis.status === "incomplete" ? "Incomplete partition scan" : "Partitions unavailable"}</strong>
      {" "}· {analysis.partitions.length} intervals · {analysis.invalidSamples} undefined samples</p>
    <dl className="graph2d-critical-summary">
      <div><dt>Increasing</dt><dd>{analysis.partitions.filter(item => item.monotonicity === "increasing").length}</dd></div>
      <div><dt>Decreasing</dt><dd>{analysis.partitions.filter(item => item.monotonicity === "decreasing").length}</dd></div>
      <div><dt>Unknown</dt><dd>{uncertain}</dd></div>
    </dl>
    <Graph2DNumericalResultsTable resultKey={analysis.resultId} tableLabel="Interval numerical results"
      controlsLabel="Filter interval results" searchLabel="Search interval results" sortLabel="Sort intervals by x"
      items={analysis.partitions} filters={filters} columns={columns} getId={item => item.intervalId}
      getX={item => (item.min + item.max) / 2} getKind={() => "Interval"}
      getSearchText={item => `${item.min} ${item.max} ${item.monotonicity} ${item.concavity} ${item.leftBoundary} ${item.rightBoundary} ${item.confidence}`}
      xLabel="Interval" formatX={item => `(${item.min.toPrecision(5)}, ${item.max.toPrecision(5)})`}
      onFocus={item => onFocus?.(item)} canFocus={() => current && !!onFocus}
      focusLabel={item => `Highlight interval ${item.min.toPrecision(5)} to ${item.max.toPrecision(5)}`}
      isActive={item => focusedId === item.intervalId}
      exportCsv={current ? exportCsv : undefined}
      exportJson={current ? () => downloadGraph2DResultJson(`graph-intervals-${analysis.objectId}.json`, {
        format: "math3d.graph2d-intervals.v1", resultId: analysis.resultId, source: analysis.source,
        status: analysis.status, interval: analysis.interval, invalidSamples: analysis.invalidSamples,
        partitions: analysis.partitions, publication: analysis.publication }) : undefined}
      emptyText="No intervals resolved." />
    <small>Signs are numerical samples, not proofs. Unknown intervals may contain discontinuities or narrow changes.
      Intervals can be highlighted and exported; construction saving is available for validated point candidates.</small>
  </section>;
}
