import { useState } from "react";
import { analyzeGraph2DRegression, isGraph2DRegressionCurrent, type Graph2DRegression, type Graph2DRegressionModel, type Graph2DDocument } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
export function Graph2DRegressionPanel({ document, model, onModel, result, onResult }: { document: Graph2DDocument; model: Graph2DRegressionModel;
  onModel: (model: Graph2DRegressionModel) => void; result: Graph2DRegression | null; onResult: (result: Graph2DRegression | null) => void }) {
  const [error, setError] = useState(""), [offset, setOffset] = useState(0);
  const object = document.source.objects.find(o => o.id === document.selection.objectId), current = result && result.model === model &&
    result.objectId === object?.id && isGraph2DRegressionCurrent(result, document);
  return <section aria-label="Regression fitting" data-testid="graph2d-regression"><h3>Regression and uncertainty</h3>
    <label>Regression model<select aria-label="Regression model" value={model} onChange={e => { onModel(e.target.value as Graph2DRegressionModel); setOffset(0); }}>
      <option value="linear">Linear least squares</option><option value="quadratic">Quadratic least squares</option></select></label>
    <p>Uses original checksum-verified data, not displayed samples. Unweighted fit in world units; no extrapolation.</p>
    <button disabled={object?.kind !== "point-series"} onClick={() => { try { if (object?.kind !== "point-series") return;
      onResult(analyzeGraph2DRegression({ document, objectId: object.id, model, rows: pointTableStore.resolve(object.table) })); setError(""); setOffset(0);
    } catch (caught) { onResult(null); setError((caught as Error).message); } }}>Fit dataset</button>
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">{current ? "Current regression" : "Stale regression — source/model changed; fit again"}</p>
      <p>n={result.n} · excluded={result.excluded} · df={result.degreesOfFreedom} · residual SD={result.residualSD.toPrecision(6)} · R²={result.rSquared?.toPrecision(6) ?? "undefined"}</p>
      <p>z=(x−{result.center.toPrecision(8)})/{result.scale.toPrecision(8)}; y={result.coefficients.map((v, i) => `${v.toPrecision(8)}${i ? `·z${i === 2 ? "²" : ""}` : ""}`).join(" + ")}</p>
      <p>Brown: fitted curve. Purple dashed: 95% mean-response limits. Purple dotted: 95% prediction limits. Pointwise, not simultaneous; log axes omit non-positive parts.</p>
      <details><summary>Assumptions and dataset provenance</summary><ul>{result.publication.warnings.map(w => <li key={w}>{w}</li>)}</ul><code>{result.table.checksum}</code></details>
      <details><summary>Residuals ({result.residuals.length})</summary><div style={{ overflowX: "auto" }}><table><caption>Observed minus fitted, original row IDs; rows {offset + 1}–{Math.min(offset + 50, result.n)}</caption>
        <thead><tr>{["Row", "x", "Observed", "Fitted", "Residual"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{result.residuals.slice(offset, offset + 50).map(r => <tr key={r.rowId}><th scope="row">{r.rowId}</th>{[r.x, r.observed, r.fitted, r.residual].map((v, i) => <td key={i}>{v.toPrecision(6)}</td>)}</tr>)}</tbody></table></div>
        <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous residuals</button><button disabled={offset + 50 >= result.n} onClick={() => setOffset(offset + 50)}>Next residuals</button></details>
      <button onClick={() => onResult(null)}>Clear regression</button><p>Export includes a fit summary, 129 interval samples and the first 2,048 residuals; larger residual tables are explicitly truncated. Results are transient and must be fitted again after reopening.</p>
    </>}
  </section>;
}
