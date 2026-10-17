import { useEffect, useRef, useState } from "react";
import { isGraph2DRegressionCurrent, type Graph2DRegression, type Graph2DRegressionModel, type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
export function Graph2DRegressionPanel({ document, model, onModel, result, onResult }: { document: Graph2DDocument; model: Graph2DRegressionModel;
  onModel: (model: Graph2DRegressionModel) => void; result: Graph2DRegression | null; onResult: (result: Graph2DRegression | null) => void }) {
  const [error, setError] = useState(""), [offset, setOffset] = useState(0), [pending, setPending] = useState(false);
  const [smoothing, setSmoothing] = useState("0.001");
  const worker = useRef<Worker | null>(null), deadline = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const object = document.source.objects.find(o => o.id === document.selection.objectId), current = result && result.model === model &&
    result.objectId === object?.id && isGraph2DRegressionCurrent(result, document) &&
    (result.model !== "spline" || result.spline.lambda === Number(smoothing));
  const fitKey = [document.identity.id, document.identity.revision, document.identity.structuralHash, object?.id,
    object?.kind === "point-series" ? object.table.checksum : "", model, model === "spline" ? smoothing : ""].join("|");
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
    cancel(false); setError(""); setPending(true); const token = ++generation.current, key = fitKey;
    try {
      const task = new Worker(new URL("./graph2dRegressionWorker.ts", import.meta.url), { type: "module" }); worker.current = task;
      const finish = () => { task.terminate(); if (worker.current === task) worker.current = null;
        if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false); };
      task.onmessage = (event: MessageEvent<{ result?: Graph2DRegression; error?: string }>) => {
        if (generation.current !== token || latestKey.current !== key) return;
        finish(); if (event.data.result) { onResult(event.data.result); setOffset(0); }
        else { onResult(null); setError(event.data.error ?? "Regression failed."); }
      };
      task.onerror = event => { event.preventDefault(); if (generation.current !== token || latestKey.current !== key) return;
        finish(); onResult(null); setError(event.message || "Regression worker failed."); };
      task.onmessageerror = () => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); onResult(null); setError("Regression response could not be read."); };
      deadline.current = setTimeout(() => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError("Regression exceeded 15 seconds. Reduce the point series and retry."); }, 15000);
      task.postMessage({ document, objectId: object.id, model, smoothing: model === "spline" ? Number(smoothing) : undefined,
        rows: pointTableStore.resolve(object.table) });
    } catch (caught) { cancel(false); onResult(null); setError((caught as Error).message); }
  };
  return <section aria-label="Regression fitting" data-testid="graph2d-regression"><h3>Regression and uncertainty</h3>
    <label>Regression model<select aria-label="Regression model" value={model} onChange={e => { onModel(e.target.value as Graph2DRegressionModel); setOffset(0); }}>
      <option value="linear">Linear least squares</option><option value="quadratic">Quadratic least squares</option><option value="cubic">Cubic least squares</option><option value="quartic">Quartic least squares</option>
      <option value="spline">Cubic smoothing spline</option></select></label>
    {model === "spline" && <label>Smoothness λ (0–1)<input aria-label="Spline smoothness" type="number" min="0" max="1" step="any"
      value={smoothing} onChange={e => { setSmoothing(e.target.value); onResult(null); }} /></label>}
    <p>Uses original checksum-verified data, not displayed samples. Unweighted fit in world units; no extrapolation.</p>
    <button disabled={object?.kind !== "point-series" || pending} onClick={fit}>Fit dataset</button>
    {pending && <><button onClick={() => cancel()}>Cancel fit</button><p aria-live="polite">Fitting checked point series…</p></>}
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">{current ? "Current regression" : "Stale regression — source/model changed; fit again"}</p>
      <p>n={result.n} · excluded={result.excluded} · {result.model === "spline" ? "descriptive RMSE" : `df=${result.degreesOfFreedom} · residual SD`}={result.residualSD.toPrecision(6)} · R²={result.rSquared?.toPrecision(6) ?? "undefined"}</p>
      {result.model === "spline" ? <><p>Cubic B-spline · {result.spline.controlPoints} control points · λ={result.spline.lambda}.</p>
        <p>Brown: fitted curve. No confidence or prediction intervals are provided for this regularized model.</p></> : <>
        <p>z=(x−{result.center.toPrecision(8)})/{result.scale.toPrecision(8)}; y={result.coefficients.map((v, i) => `${v.toPrecision(8)}${i ? `·z${["", "", "²", "³", "⁴"][i]}` : ""}`).join(" + ")}</p>
        <p>Brown: fitted curve. Purple dashed: 95% mean-response limits. Purple dotted: 95% prediction limits. Pointwise, not simultaneous; log axes omit non-positive parts.</p></>}
      <details><summary>Assumptions and dataset provenance</summary><ul>{result.publication.warnings.map(w => <li key={w}>{w}</li>)}</ul><code>{result.table.checksum}</code></details>
      <details><summary>Residuals ({result.residuals.length})</summary><div style={{ overflowX: "auto" }}><table><caption>Observed minus fitted, original row IDs; rows {offset + 1}–{Math.min(offset + 50, result.n)}</caption>
        <thead><tr>{["Row", "x", "Observed", "Fitted", "Residual"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{result.residuals.slice(offset, offset + 50).map(r => <tr key={r.rowId}><th scope="row">{r.rowId}</th>{[r.x, r.observed, r.fitted, r.residual].map((v, i) => <td key={i}>{v.toPrecision(6)}</td>)}</tr>)}</tbody></table></div>
        <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous residuals</button><button disabled={offset + 50 >= result.n} onClick={() => setOffset(offset + 50)}>Next residuals</button></details>
      <button onClick={() => onResult(null)}>Clear regression</button><p>Export includes a fit summary, 129 fitted samples{result.model === "spline" ? "" : " with pointwise intervals"} and the first 2,048 residuals; larger residual tables are explicitly truncated. Results are transient and must be fitted again after reopening.</p>
    </>}
  </section>;
}
