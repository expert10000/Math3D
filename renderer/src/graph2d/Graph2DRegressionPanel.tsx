import { useEffect, useRef, useState } from "react";
import { isGraph2DRegressionCurrent, type Graph2DRegression, type Graph2DRegressionModel,
  type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { downloadGraph2DResultJson } from "./downloadGraph2DResultJson";
import { downloadGraph2DResultsCsv } from "./downloadGraph2DResultsCsv";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

type Residual = Graph2DRegression["residuals"][number];
const columns: readonly Graph2DResultColumn<Residual>[] = [
  { id: "observed", label: "Observed", render: item => item.observed.toPrecision(6) },
  { id: "fitted", label: "Fitted", render: item => item.fitted.toPrecision(6) },
  { id: "residual", label: "Residual", render: item => item.residual.toPrecision(6) },
];
export function Graph2DRegressionPanel({ document, model, onModel, result, onResult, onResidualFocus }: { document: Graph2DDocument; model: Graph2DRegressionModel;
  onModel: (model: Graph2DRegressionModel) => void; result: Graph2DRegression | null;
  onResult: (result: Graph2DRegression | null) => void;
  onResidualFocus?: (row: Residual, result: Graph2DRegression) => void }) {
  const [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [residualsOpen, setResidualsOpen] = useState(false);
  const [focusedResidualId, setFocusedResidualId] = useState<string | null>(null);
  useEffect(() => setFocusedResidualId(null), [result?.publication.resultId]);
  const [smoothing, setSmoothing] = useState("0.001");
  const [initialAmplitude, setInitialAmplitude] = useState("1"), [initialRate, setInitialRate] = useState("1");
  const [initialCapacity, setInitialCapacity] = useState("1"), [initialGrowthRate, setInitialGrowthRate] = useState("1"),
    [initialMidpoint, setInitialMidpoint] = useState("0");
  const worker = useRef<Worker | null>(null), deadline = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const object = document.source.objects.find(o => o.id === document.selection.objectId), current = result && result.model === model &&
    result.objectId === object?.id && isGraph2DRegressionCurrent(result, document) &&
    (result.model !== "spline" || result.spline.lambda === Number(smoothing)) &&
    (result.model !== "exponential-decay" || result.initial.amplitude === Number(initialAmplitude) &&
      result.initial.rate === Number(initialRate)) &&
    (result.model !== "logistic-growth" || result.initial.capacity === Number(initialCapacity) &&
      result.initial.rate === Number(initialGrowthRate) && result.initial.midpoint === Number(initialMidpoint));
  const fitKey = [document.identity.id, document.identity.revision, document.identity.structuralHash, object?.id,
    object?.kind === "point-series" ? object.table.checksum : "", model,
    model === "spline" ? smoothing : model === "exponential-decay" ? `${initialAmplitude}|${initialRate}` :
      model === "logistic-growth" ? `${initialCapacity}|${initialGrowthRate}|${initialMidpoint}` : ""].join("|");
  const latestKey = useRef(fitKey); latestKey.current = fitKey;
  const cancel = (announce = true) => { generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false);
    if (announce) setError("Fit cancelled. No new result was published."); };
  useEffect(() => { cancel(false); setError(""); return () => { generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null; }; }, [fitKey]);
  const fit = () => {
    if (object?.kind !== "point-series") return;
    if (model === "spline" && (!smoothing.trim() || !Number.isFinite(Number(smoothing)) || Number(smoothing) < 0 || Number(smoothing) > 1)) {
      setError("Spline smoothness λ must be between 0 and 1."); return;
    }
    if (model === "exponential-decay" && (!initialAmplitude.trim() || !initialRate.trim() ||
        !Number.isFinite(Number(initialAmplitude)) || !Number.isFinite(Number(initialRate)))) {
      setError("Enter finite initial amplitude and rate."); return;
    }
    if (model === "logistic-growth" && (![initialCapacity, initialGrowthRate, initialMidpoint].every(text =>
        text.trim() && Number.isFinite(Number(text))))) {
      setError("Enter finite initial capacity, growth rate and midpoint."); return;
    }
    cancel(false); setError(""); setPending(true); const token = ++generation.current, key = fitKey;
    try {
      const task = new Worker(new URL("./graph2dRegressionWorker.ts", import.meta.url), { type: "module" }); worker.current = task;
      const finish = () => { task.terminate(); if (worker.current === task) worker.current = null;
        if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false); };
      task.onmessage = (event: MessageEvent<{ result?: Graph2DRegression; error?: string }>) => {
        if (generation.current !== token || latestKey.current !== key) return;
        finish(); if (event.data.result) { onResult(event.data.result); }
        else { onResult(null); setError(event.data.error ?? "Regression failed."); }
      };
      task.onerror = event => { event.preventDefault(); if (generation.current !== token || latestKey.current !== key) return;
        finish(); onResult(null); setError(event.message || "Regression worker failed."); };
      task.onmessageerror = () => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); onResult(null); setError("Regression response could not be read."); };
      deadline.current = setTimeout(() => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError("Regression exceeded 15 seconds. Reduce the point series and retry."); }, 15000);
      task.postMessage({ document, objectId: object.id, model, smoothing: model === "spline" ? Number(smoothing) : undefined,
        initial: model === "exponential-decay" ? { amplitude: Number(initialAmplitude), rate: Number(initialRate) } :
          model === "logistic-growth" ? { capacity: Number(initialCapacity), rate: Number(initialGrowthRate),
            midpoint: Number(initialMidpoint) } : undefined,
        rows: pointTableStore.resolve(object.table) });
    } catch (caught) { cancel(false); onResult(null); setError((caught as Error).message); }
  };
  return <section aria-label="Regression fitting" data-testid="graph2d-regression"><h3>Regression and uncertainty</h3>
    <label>Regression model<select aria-label="Regression model" value={model} onChange={e => { onModel(e.target.value as Graph2DRegressionModel); }}>
      <option value="linear">Linear least squares</option><option value="quadratic">Quadratic least squares</option><option value="cubic">Cubic least squares</option><option value="quartic">Quartic least squares</option>
      <option value="spline">Cubic smoothing spline</option>
      <option value="exponential-decay">Exponential decay · y = a exp(−k(x−x₀))</option>
      <option value="logistic-growth">Logistic growth · y = L/(1+exp(−k(x−m)))</option></select></label>
    {model === "spline" && <label>Smoothness λ (0–1)<input aria-label="Spline smoothness" type="number" min="0" max="1" step="any"
      value={smoothing} onChange={e => { setSmoothing(e.target.value); onResult(null); }} /></label>}
    {model === "exponential-decay" && <>
      <p>Named model: y = amplitude × exp(−rate × (x−x₀)), where x₀ is the smallest included x. Baseline is fixed at zero.</p>
      <label>Initial amplitude <input aria-label="Initial exponential amplitude" type="number" step="any" value={initialAmplitude}
        onChange={e => { setInitialAmplitude(e.target.value); onResult(null); }} /></label>
      <label>Initial rate per x unit <input aria-label="Initial exponential rate" type="number" min="0" step="any" value={initialRate}
        onChange={e => { setInitialRate(e.target.value); onResult(null); }} /></label>
      <button type="button" disabled={object?.kind !== "point-series"} onClick={() => {
        if (object?.kind !== "point-series") return;
        const rows = pointTableStore.resolve(object.table)?.filter(row => row.y !== null && row.x >= object.domain.min && row.x <= object.domain.max &&
          (object.domain.includeMin || row.x !== object.domain.min) && (object.domain.includeMax || row.x !== object.domain.max));
        if (!rows?.length) return;
        const atMinimum = rows.reduce((first, row) => row.x < first.x ? row : first, rows[0]!);
        const span = Math.max(...rows.map(row => row.x)) - atMinimum.x;
        setInitialAmplitude(String(atMinimum.y)); setInitialRate(String(span > 0 ? 1 / span : 1)); onResult(null);
      }}>Estimate initial values from data</button>
      <p>Local bounded solver; convergence does not establish a global optimum. No parameter uncertainty or intervals are reported.</p>
    </>}
    {model === "logistic-growth" && <>
      <p>Named model: y = capacity / (1 + exp(−rate × (x−midpoint))). Capacity and rate are positive; midpoint stays inside the observed x extent.</p>
      <label>Initial capacity <input aria-label="Initial logistic capacity" type="number" min="0" step="any" value={initialCapacity}
        onChange={e => { setInitialCapacity(e.target.value); onResult(null); }} /></label>
      <label>Initial growth rate per x unit <input aria-label="Initial logistic rate" type="number" min="0" step="any" value={initialGrowthRate}
        onChange={e => { setInitialGrowthRate(e.target.value); onResult(null); }} /></label>
      <label>Initial midpoint x <input aria-label="Initial logistic midpoint" type="number" step="any" value={initialMidpoint}
        onChange={e => { setInitialMidpoint(e.target.value); onResult(null); }} /></label>
      <button type="button" disabled={object?.kind !== "point-series"} onClick={() => {
        if (object?.kind !== "point-series") return;
        const rows = pointTableStore.resolve(object.table)?.filter(row => row.y !== null && row.x >= object.domain.min && row.x <= object.domain.max &&
          (object.domain.includeMin || row.x !== object.domain.min) && (object.domain.includeMax || row.x !== object.domain.max));
        if (!rows?.length) return;
        const min = Math.min(...rows.map(row => row.x)), max = Math.max(...rows.map(row => row.x));
        const capacity = Math.max(...rows.map(row => row.y!)) * 1.1;
        if (!(capacity > 0) || !(max > min)) { setError("Logistic initialization needs positive observations at distinct x coordinates."); return; }
        setInitialCapacity(String(capacity)); setInitialGrowthRate(String(4 / (max - min)));
        setInitialMidpoint(String((min + max) / 2)); setError(""); onResult(null);
      }}>Estimate logistic initial values from data</button>
      <p>Local bounded solver; convergence does not establish a global optimum. No parameter uncertainty or intervals are reported.</p>
    </>}
    <p>Uses original checksum-verified data, not displayed samples. Unweighted fit in world units; no extrapolation.</p>
    <button disabled={object?.kind !== "point-series" || pending} onClick={fit}>Fit dataset</button>
    {pending && <><button onClick={() => cancel()}>Cancel fit</button><p aria-live="polite">Fitting checked point series…</p></>}
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">{current ? "Current regression" : "Stale regression — source/model changed; fit again"}</p>
      <p>n={result.n} · excluded={result.excluded} · {result.model === "spline" ? "descriptive RMSE" : `df=${result.degreesOfFreedom} · residual SD`}={result.residualSD.toPrecision(6)} · R²={result.rSquared?.toPrecision(6) ?? "undefined"}</p>
      {result.model === "spline" ? <><p>Cubic B-spline · {result.spline.controlPoints} control points · λ={result.spline.lambda}.</p>
        <p>Brown: fitted curve. No confidence or prediction intervals are provided for this regularized model.</p></> : <>
        {result.model === "exponential-decay" ? <><p>y = {result.parameters.amplitude.toPrecision(8)} × exp(−{result.parameters.rate.toPrecision(8)} × (x−{result.parameters.anchor.toPrecision(8)}))</p>
          <p>{result.solver.method}: {result.solver.status} in {result.solver.iterations} iterations; {result.solver.rejectedSteps} rejected steps; relative gradient {result.solver.relativeGradient.toExponential(2)}.</p>
          <p>Brown: fitted curve. No uncertainty bands are claimed for this nonlinear model.</p></> :
          result.model === "logistic-growth" ? <><p>y = {result.parameters.capacity.toPrecision(8)} / (1 + exp(−{result.parameters.rate.toPrecision(8)} × (x−{result.parameters.midpoint.toPrecision(8)})))</p>
            <p>{result.solver.method}: {result.solver.status} in {result.solver.iterations} iterations; {result.solver.rejectedSteps} rejected steps; relative gradient {result.solver.relativeGradient.toExponential(2)}.</p>
            <p>Brown: fitted curve. No uncertainty bands are claimed for this nonlinear model.</p></> : <>
          <p>z=(x−{result.center.toPrecision(8)})/{result.scale.toPrecision(8)}; y={result.coefficients.map((v, i) => `${v.toPrecision(8)}${i ? `·z${["", "", "²", "³", "⁴"][i]}` : ""}`).join(" + ")}</p>
          <p>Brown: fitted curve. Purple dashed: 95% mean-response limits. Purple dotted: 95% prediction limits. Pointwise, not simultaneous; log axes omit non-positive parts.</p></>}</>}
      <details><summary>Assumptions and dataset provenance</summary><ul>{result.publication.warnings.map(w => <li key={w}>{w}</li>)}</ul><code>{result.table.checksum}</code></details>
      <details onToggle={event => setResidualsOpen(event.currentTarget.open)}>
        <summary>Residuals ({result.residuals.length})</summary>
        {residualsOpen && <>
        <dl className="graph2d-critical-summary">
          <div><dt>Positive</dt><dd>{result.residuals.filter(row => row.residual > 0).length}</dd></div>
          <div><dt>Negative</dt><dd>{result.residuals.filter(row => row.residual < 0).length}</dd></div>
          <div><dt>Large |residual|</dt><dd>{result.residuals.filter(row => Math.abs(row.residual) > 2 * result.residualSD).length}</dd></div>
        </dl>
        <Graph2DNumericalResultsTable resultKey={result.publication.resultId}
          tableLabel="Regression residual numerical results" controlsLabel="Filter regression residuals"
          searchLabel="Search regression residuals" sortLabel="Sort residuals by x"
          items={result.residuals} columns={columns}
          filters={[
            { id: "all", label: "All", include: () => true },
            { id: "positive", label: "Positive", include: (row: Residual) => row.residual > 0 },
            { id: "negative", label: "Negative", include: (row: Residual) => row.residual < 0 },
            { id: "large", label: "Large", include: (row: Residual) => Math.abs(row.residual) > 2 * result.residualSD },
          ] satisfies readonly Graph2DResultFilter<Residual>[]}
          getId={row => row.rowId} getX={row => row.x} getKind={row => row.rowId}
          getSearchText={row => `${row.rowId} ${row.x} ${row.observed} ${row.fitted} ${row.residual}`}
          onFocus={row => { setFocusedResidualId(row.rowId); onResidualFocus?.(row, result); }}
          canFocus={() => !!current && !!onResidualFocus}
          focusLabel={row => `Highlight residual row ${row.rowId}`}
          isActive={row => focusedResidualId === row.rowId}
          exportCsv={current ? () => downloadGraph2DResultsCsv(`graph-residuals-${result.objectId}.csv`,
            ["row_id", "x", "observed", "fitted", "residual", "model", "source_document", "source_revision", "dataset_checksum"],
            result.residuals.map(row => [row.rowId, row.x, row.observed, row.fitted, row.residual,
              result.model, result.source.documentId, result.source.revision, result.table.checksum])) : undefined}
          exportJson={current ? () => downloadGraph2DResultJson(`graph-residuals-${result.objectId}.json`, {
            format: "math3d.graph2d-regression-residuals.v1", resultId: result.publication.resultId,
            source: result.source, model: result.model, table: result.table, residuals: result.residuals,
            publication: result.publication }) : undefined}
          emptyText="No residual rows available." />
        <small>Residual rows can be highlighted and exported. They are not construction candidates.</small>
        </>}
      </details>
      <button onClick={() => onResult(null)}>Clear regression</button><p>Export includes a fit summary, 129 fitted samples{result.model === "spline" || result.model === "exponential-decay" || result.model === "logistic-growth" ? "" : " with pointwise intervals"} and the first 2,048 residuals; larger residual tables are explicitly truncated. Results are transient and must be fitted again after reopening.</p>
    </>}
  </section>;
}
