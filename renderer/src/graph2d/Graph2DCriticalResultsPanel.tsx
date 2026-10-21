import { graph2DConstructionActionsFromCandidates, isGraph2DCriticalCandidateAlreadySaved,
  isGraph2DCriticalPointCurrent,
  GRAPH2D_MAX_CONSTRUCTIONS, type Graph2DCriticalPoint, type Graph2DCriticalPointAnalysis,
  GRAPH2D_ANALYSIS_QUALITY_MEANINGS, type Graph2DConstructionAction,
  type Graph2DDocument, type Graph2DSelection } from "@math3d/core";
import { useEffect, useMemo, useState } from "react";
import { Graph2DAnalysisQualityGuide } from "./Graph2DAnalysisQualityGuide";
import { downloadGraph2DNumericalDataset } from "./downloadGraph2DNumericalDataset";

type Filter = "all" | "zero" | "extrema" | "inflection";
type Props = Readonly<{
  analysis: Graph2DCriticalPointAnalysis;
  document: Graph2DDocument;
  analysisBudget: number;
  onAnalysisBudgetChange: (budget: number) => void;
  onSelectionCommit?: (selection: Graph2DSelection) => void;
  onConstructionBatchCommit?: (actions: readonly Graph2DConstructionAction[]) => void;
}>;

const isExtremum = (item: Graph2DCriticalPoint) => item.kind === "minimum" || item.kind === "maximum";
const format = (value: number) => Number.isFinite(value) ? value.toPrecision(7) : "—";

export function Graph2DCriticalResultsPanel({ analysis, document, analysisBudget, onAnalysisBudgetChange,
  onSelectionCommit, onConstructionBatchCommit }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [actionError, setActionError] = useState("");
  useEffect(() => { setSelectedIds([]); setActionError(""); }, [analysis.publication.resultId]);
  const counts = useMemo(() => ({
    zero: analysis.candidates.filter(item => item.kind === "zero").length,
    extrema: analysis.candidates.filter(isExtremum).length,
    inflection: analysis.candidates.filter(item => item.kind === "inflection").length,
  }), [analysis]);
  const rows = useMemo(() => analysis.candidates.filter(item =>
    (filter === "all" || filter === "extrema" && isExtremum(item) || item.kind === filter) &&
    (!query.trim() || `${item.kind} ${item.x} ${item.y} ${item.quality}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => descending ? b.x - a.x : a.x - b.x), [analysis, filter, query, descending]);
  const validForSave = (item: Graph2DCriticalPoint) => item.kind !== "inflection" && item.confidence === "numerical" &&
    !isGraph2DCriticalCandidateAlreadySaved(document, item) && isGraph2DCriticalPointCurrent(item, document);
  const available = GRAPH2D_MAX_CONSTRUCTIONS - (document.source.constructions?.objects.length ?? 0);
  const selected = analysis.candidates.filter(item => selectedIds.includes(item.candidateId) && validForSave(item));
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
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = ["kind,x,y,residual,quality,confidence,method,source_document,source_revision,scan_status,scan_quality,interval_min,interval_max",
      ...analysis.candidates.map(item => [item.kind, item.x, item.y, item.residual, item.quality, item.confidence, item.method,
        item.source.documentId, item.source.revision, analysis.status, analysis.quality ?? "unavailable",
        analysis.interval.min, analysis.interval.max]
        .map(quote).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = globalThis.document.createElement("a");
    link.href = url;
    link.download = `graph-analysis-${analysis.objectId}.csv`;
    globalThis.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const batchZeros = analysis.candidates.filter(item => item.kind === "zero" && validForSave(item));
  const batchExtrema = analysis.candidates.filter(item => isExtremum(item) && validForSave(item));
  return <section className="graph2d-critical-points" data-testid="graph2d-critical-points" aria-label="Zeros extrema and inflections">
    <h3>Numerical analysis</h3>
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
    <p className="graph2d-critical-quality-note">Refined means a bracket solver met residual tolerance 1e−7.
      Approximate means sampled or heuristic. Neither proves a unique root or complete enumeration;
      Certified and Symbolic are not claimed by this scan.</p>
    <Graph2DAnalysisQualityGuide />
    <label className="graph2d-analysis-budget">Analysis evaluation budget
      <select aria-label="Analysis evaluation budget" value={analysisBudget}
        onChange={event => onAnalysisBudgetChange(Number(event.target.value))}>
        <option value={2000}>Quick · 2,000</option>
        <option value={6000}>Standard · 6,000</option>
        <option value={12000}>Thorough · 12,000</option>
      </select></label>
    <dl className="graph2d-critical-summary">
      <div><dt>Zeros</dt><dd>{counts.zero}</dd></div>
      <div><dt>Extrema</dt><dd>{counts.extrema}</dd></div>
      <div><dt>Inflections</dt><dd>{counts.inflection}</dd></div>
    </dl>
    <div className="graph2d-critical-controls">
      <div role="group" aria-label="Filter numerical results">
        {(["all", "zero", "extrema", "inflection"] as const).map(value => <button key={value} type="button"
          aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" :
            value === "zero" ? "Zeros" : value === "extrema" ? "Extrema" : "Inflections"}</button>)}
      </div>
      <label>Search results <input aria-label="Search numerical results" value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="graph2d-critical-table-wrap"><table aria-label="Numerical analysis results">
      <thead><tr><th scope="col">Select</th><th scope="col">Kind</th><th scope="col"><button type="button" aria-label="Sort results by x"
        onClick={() => setDescending(value => !value)}>x {descending ? "↓" : "↑"}</button></th><th scope="col">y</th><th scope="col">Residual</th><th scope="col">Quality</th><th scope="col">Save</th></tr></thead>
      <tbody>{rows.map(candidate => {
        const probe = document.selection.probe;
        const active = probe?.objectId === candidate.objectId && Math.abs(probe.x - candidate.x) < 1e-8;
        return <tr key={candidate.candidateId} className={active ? "graph2d-critical-active" : undefined}>
          <td><input type="checkbox" aria-label={`Select ${candidate.kind} at x ${format(candidate.x)} for saving`}
            checked={selectedIds.includes(candidate.candidateId)} disabled={!validForSave(candidate) || analysis.status !== "complete"}
            onChange={event => setSelectedIds(current => event.target.checked ? [...current, candidate.candidateId] :
              current.filter(id => id !== candidate.candidateId))} /></td>
          <td><button type="button" aria-label={`Select ${candidate.kind} at x ${format(candidate.x)}`}
            disabled={!isGraph2DCriticalPointCurrent(candidate, document)}
            title={`${candidate.confidence} · ${candidate.method} · residual ${candidate.residual.toExponential(2)}`}
            onClick={() => onSelectionCommit?.({ objectId: candidate.objectId,
              probe: { objectId: candidate.objectId, x: candidate.x, y: candidate.y } })}>{candidate.kind}</button></td>
          <td>{format(candidate.x)}</td><td>{format(candidate.y)}</td><td>{candidate.residual.toExponential(1)}</td>
          <td><span className={`graph2d-analysis-quality graph2d-analysis-quality-${candidate.quality}`}
            title={`${GRAPH2D_ANALYSIS_QUALITY_MEANINGS[candidate.quality]} Method: ${candidate.method}; residual: ${candidate.residual.toExponential(2)}`}>
            {candidate.quality === "refined" ? "Refined" : "Approximate"}</span></td>
          <td>{candidate.kind !== "inflection" && <button type="button" aria-label={`Save ${candidate.kind} at x ${format(candidate.x)} as construction`}
            disabled={!canSave([candidate]) || !validForSave(candidate)} onClick={() => save([candidate])}>Save</button>}</td>
        </tr>;
      })}</tbody>
    </table>{!rows.length && <p>{analysis.candidates.length ? "No matching results." :
      analysis.status === "incomplete" ? "No candidates found in the scanned portion." : "No candidates found in the scanned interval."}</p>}</div>
    <div className="graph2d-critical-actions">
      <button type="button" disabled={!canSave(selected)} onClick={() => save(selected)}>Save selected ({selected.length})</button>
      <button type="button" disabled={!canSave(batchZeros)} onClick={() => save(batchZeros)}>Save all validated zeros ({batchZeros.length})</button>
      <button type="button" disabled={!canSave(batchExtrema)} onClick={() => save(batchExtrema)}>Save all validated extrema ({batchExtrema.length})</button>
      <button type="button" onClick={exportCsv}>Export results</button>
      <button type="button" onClick={() => downloadGraph2DNumericalDataset(analysis)}>Export numerical JSON</button>
    </div>
    <small>{available} of {GRAPH2D_MAX_CONSTRUCTIONS} construction slots available. Only validated numerical zeros and extrema from a finished bounded scan can be saved. Location error is estimated, not certified.</small>
    {actionError && <p role="alert">{actionError}</p>}
    {analysis.diagnostics.length > 0 && <details className="graph2d-inspector-more"><summary>Analysis diagnostics</summary>
      <ul>{analysis.diagnostics.map(entry => <li key={entry.code}>{entry.message} ({entry.count})</li>)}</ul>
    </details>}
  </section>;
}
