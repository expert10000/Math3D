import { graph2DConstructionActionsFromCandidates, isGraph2DCriticalCandidateAlreadySaved,
  isGraph2DCriticalPointCurrent,
  GRAPH2D_MAX_CONSTRUCTIONS, type Graph2DCriticalPoint, type Graph2DCriticalPointAnalysis,
  GRAPH2D_ANALYSIS_QUALITY_MEANINGS, type Graph2DConstructionAction,
  type Graph2DDocument, type Graph2DSelection } from "@math3d/core";
import { useEffect, useMemo, useState } from "react";
import { Graph2DAnalysisQualityGuide } from "./Graph2DAnalysisQualityGuide";
import { downloadGraph2DNumericalDataset } from "./downloadGraph2DNumericalDataset";
import { downloadGraph2DResultsCsv } from "./downloadGraph2DResultsCsv";
import { Graph2DUnresolvedCoverage } from "./Graph2DUnresolvedCoverage";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

type Props = Readonly<{
  analysis: Graph2DCriticalPointAnalysis;
  document: Graph2DDocument;
  analysisBudget: number;
  onAnalysisBudgetChange: (budget: number) => void;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  onConstructionBatchCommit?: (actions: readonly Graph2DConstructionAction[]) => void;
  readOnlyPreview?: boolean;
}>;

const isExtremum = (item: Graph2DCriticalPoint) => item.kind === "minimum" || item.kind === "maximum";
const format = (value: number) => Number.isFinite(value) ? value.toPrecision(7) : "—";
const filters: readonly Graph2DResultFilter<Graph2DCriticalPoint>[] = [
  { id: "all", label: "All", include: () => true },
  { id: "zero", label: "Zeros", include: item => item.kind === "zero" },
  { id: "extrema", label: "Extrema", include: isExtremum },
  { id: "inflection", label: "Inflections", include: item => item.kind === "inflection" },
];
const columns: readonly Graph2DResultColumn<Graph2DCriticalPoint>[] = [
  { id: "y", label: "y", render: item => format(item.y) },
  { id: "residual", label: "Residual", render: item => item.residual.toExponential(1) },
  { id: "quality", label: "Quality", render: item => <span
    className={`graph2d-analysis-quality graph2d-analysis-quality-${item.quality}`}
    title={`${GRAPH2D_ANALYSIS_QUALITY_MEANINGS[item.quality]} Method: ${item.method}; residual: ${item.residual.toExponential(2)}`}>
    {item.quality === "refined" ? "Refined" : "Approximate"}</span> },
];

export function Graph2DCriticalResultsPanel({ analysis, document, analysisBudget, onAnalysisBudgetChange,
  onSelectionCommit, onConstructionBatchCommit, readOnlyPreview = false }: Props) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [actionError, setActionError] = useState("");
  useEffect(() => { setSelectedIds([]); setActionError(""); }, [analysis.publication.resultId]);
  const counts = useMemo(() => ({
    zero: analysis.candidates.filter(item => item.kind === "zero").length,
    extrema: analysis.candidates.filter(isExtremum).length,
    inflection: analysis.candidates.filter(item => item.kind === "inflection").length,
  }), [analysis]);
  const validForSave = (item: Graph2DCriticalPoint) => !readOnlyPreview && item.kind !== "inflection" && item.confidence === "numerical" &&
    !isGraph2DCriticalCandidateAlreadySaved(document, item) && isGraph2DCriticalPointCurrent(item, document);
  const available = GRAPH2D_MAX_CONSTRUCTIONS - (document.source.constructions?.objects.length ?? 0);
  const canSave = (items: readonly Graph2DCriticalPoint[]) => !!onConstructionBatchCommit && analysis.status === "complete" &&
    items.length > 0 && items.length <= available;
  const save = (items: readonly Graph2DCriticalPoint[]) => {
    try {
      const actions = graph2DConstructionActionsFromCandidates(document, analysis, items);
      if (actions.length) onConstructionBatchCommit?.(actions);
      setActionError("");
      setSelectedIds([]);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Candidates could not be saved."); }
  };
  const exportCsv = () => {
    downloadGraph2DResultsCsv(`graph-analysis-${analysis.objectId}.csv`,
      ["kind", "x", "y", "residual", "quality", "confidence", "method", "source_document", "source_revision",
        "scan_status", "scan_quality", "interval_min", "interval_max"],
      analysis.candidates.map(item => [item.kind, item.x, item.y, item.residual, item.quality, item.confidence, item.method,
        item.source.documentId, item.source.revision, analysis.status, analysis.quality ?? "unavailable",
        analysis.interval.min, analysis.interval.max]));
  };
  const batchZeros = analysis.candidates.filter(item => item.kind === "zero" && validForSave(item));
  const batchExtrema = analysis.candidates.filter(item => isExtremum(item) && validForSave(item));
  return <section className="graph2d-critical-points" data-testid="graph2d-critical-points"
    data-source-hash={document.identity.structuralHash} aria-label="Zeros extrema and inflections">
    <h3>{readOnlyPreview ? "Transient frame analysis" : "Numerical analysis"}</h3>
    {readOnlyPreview && <p role="status">Preview values only · 2,000 evaluation budget · results change with each settled frame. Apply the parameter value to create committed analysis evidence.</p>}
    <p className={analysis.status === "incomplete" ? "graph2d-critical-status-partial" : undefined}
      role="status" data-testid="graph2d-critical-scan-status">
      <strong>{analysis.quality === "incomplete" ? "Incomplete scan" : analysis.status === "unavailable" ?
        "Scan unavailable" : "Approximate enumeration"}</strong>
      {" "}· Interval [{analysis.interval.min.toPrecision(5)}, {analysis.interval.max.toPrecision(5)}]
      {" "}· {analysis.evaluations.toLocaleString()} evaluations
      {analysis.status === "incomplete" ? <>{" "}· {analysis.diagnostics.some(entry => entry.code === "evaluation-limit") ?
        "evaluation budget reached" : analysis.diagnostics.some(entry => entry.code === "candidate-limit") ?
          "candidate limit reached" : "refinement budget reached or cells unresolved"} · results not exhaustive</> :
        analysis.status === "complete" ? " · exhaustive coverage not certified" : null}
    </p>
    <Graph2DUnresolvedCoverage intervals={analysis.unresolvedIntervals} />
    <p className="graph2d-critical-quality-note">Refined means a bracket solver met residual tolerance 1e−7.
      Approximate means sampled or heuristic. Neither proves a unique root or complete enumeration;
      Certified and Symbolic are not claimed by this scan.</p>
    <Graph2DAnalysisQualityGuide />
    {!readOnlyPreview && <label className="graph2d-analysis-budget">Analysis evaluation budget
      <select aria-label="Analysis evaluation budget" value={analysisBudget}
        onChange={event => onAnalysisBudgetChange(Number(event.target.value))}>
        <option value={2000}>Quick · 2,000</option>
        <option value={6000}>Standard · 6,000</option>
        <option value={12000}>Thorough · 12,000</option>
      </select></label>}
    <dl className="graph2d-critical-summary">
      <div><dt>Zeros</dt><dd>{counts.zero}</dd></div>
      <div><dt>Extrema</dt><dd>{counts.extrema}</dd></div>
      <div><dt>Inflections</dt><dd>{counts.inflection}</dd></div>
    </dl>
    <Graph2DNumericalResultsTable resultKey={analysis.publication.resultId} tableLabel="Numerical analysis results"
      controlsLabel="Filter numerical results" searchLabel="Search numerical results" sortLabel="Sort results by x"
      items={analysis.candidates} filters={filters} columns={columns} getId={item => item.candidateId}
      getX={item => item.x} getKind={item => item.kind}
      getSearchText={item => `${item.kind} ${item.x} ${item.y} ${item.quality} ${item.method}`}
      onFocus={item => onSelectionCommit?.({ objectId: item.objectId,
        probe: { objectId: item.objectId, x: item.x, y: item.y } })}
      canFocus={item => !!onSelectionCommit && isGraph2DCriticalPointCurrent(item, document)}
      isActive={item => document.selection.probe?.objectId === item.objectId &&
        Math.abs(document.selection.probe.x - item.x) < 1e-8}
      canSave={item => analysis.status === "complete" && canSave([item]) && validForSave(item)}
      onSaveOne={readOnlyPreview ? undefined : item => save([item])}
      selectedIds={readOnlyPreview ? undefined : selectedIds}
      onSelectedIdsChange={readOnlyPreview ? undefined : setSelectedIds}
      onSaveSelected={readOnlyPreview ? undefined : save} canSaveSelected={canSave}
      exportCsv={readOnlyPreview ? undefined : exportCsv}
      exportJson={readOnlyPreview ? undefined : () => downloadGraph2DNumericalDataset(analysis)}
      extraActions={readOnlyPreview ? undefined : <>
        <button type="button" disabled={!canSave(batchZeros)} onClick={() => save(batchZeros)}>Save all validated zeros ({batchZeros.length})</button>
        <button type="button" disabled={!canSave(batchExtrema)} onClick={() => save(batchExtrema)}>Save all validated extrema ({batchExtrema.length})</button>
      </>}
      emptyText={analysis.status === "incomplete" ? "No candidates found in the scanned portion." :
        "No candidates found in the scanned interval."} />
    {!readOnlyPreview && <small>{available} of {GRAPH2D_MAX_CONSTRUCTIONS} construction slots available. Only validated numerical zeros and extrema from a finished bounded scan can be saved. Location error is estimated, not certified.</small>}
    {actionError && <p role="alert">{actionError}</p>}
    {analysis.diagnostics.length > 0 && <details className="graph2d-inspector-more"><summary>Analysis diagnostics</summary>
      <ul>{analysis.diagnostics.map(entry => <li key={entry.code}>{entry.message} ({entry.count})</li>)}</ul>
    </details>}
  </section>;
}
