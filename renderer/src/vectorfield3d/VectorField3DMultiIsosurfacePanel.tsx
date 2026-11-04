import { useEffect, useRef, useState } from "react";
import type { VectorField3DDocument, VectorField3DIsosurface } from "@math3d/core";
import { runBoundedMultiIsosurfaces, type MultiIsosurfaceResult } from
  "./runBoundedMultiIsosurfaces";

export function VectorField3DMultiIsosurfacePanel({ document, onPromote }: {
  document: VectorField3DDocument;
  onPromote?: (document: VectorField3DDocument, surface: VectorField3DIsosurface) => void }) {
  const [levelsText, setLevelsText] = useState("0.5, 1, 2");
  const [triangleBudget, setTriangleBudget] = useState(40_000);
  const [timeBudgetMs, setTimeBudgetMs] = useState(5000);
  const [result, setResult] = useState<MultiIsosurfaceResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => { abortRef.current?.abort(); abortRef.current = null;
    setResult(null); setBusy(false); }, [document.identity.structuralHash]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const compute = async () => { const controller = new AbortController(); try {
    const levels = levelsText.split(/[\s,]+/).filter(Boolean).map(Number);
    abortRef.current = controller;
    setBusy(true); setResult(null); setMessage("Verifying source and extracting levels…");
    const next = await runBoundedMultiIsosurfaces(document, { levels,
      clipBounds: document.workspace?.clipBounds ?? [
        [document.source.axes[0].min, document.source.axes[0].max],
        [document.source.axes[1].min, document.source.axes[1].max],
        [document.source.axes[2].min, document.source.axes[2].max]],
      triangleBudget, timeBudgetMs },
    { signal: controller.signal, onProgress: (completed, total) =>
      setMessage(`${completed}/${total} levels extracted within the shared budget.`) });
    if (abortRef.current !== controller || controller.signal.aborted) return;
    setResult(next); setMessage(next.complete ? "All levels complete." :
      `Stopped at ${next.reason}; saved levels remain inspectable.`);
  } catch (cause) { setMessage(String((cause as Error).message ?? cause)); }
  finally { if (abortRef.current === controller) {
    abortRef.current = null; setBusy(false); } } };
  return <section aria-label="Multi-level speed isosurfaces" data-testid="gf14-multi-isosurface">
    <h5>Multi-level speed isosurfaces</h5>
    <label>Ascending levels <input value={levelsText}
      onChange={event => setLevelsText(event.target.value)} /></label>
    <label>Total triangle budget <input type="number" min={1} max={100000}
      value={triangleBudget} onChange={event => setTriangleBudget(Number(event.target.value))} /></label>
    <label>Total time budget (ms) <input type="number" min={1} max={30000}
      value={timeBudgetMs} onChange={event => setTimeBudgetMs(Number(event.target.value))} /></label>
    <button type="button" disabled={busy} onClick={() => void compute()}>Extract bounded levels</button>
    {busy && <button type="button" onClick={() => { abortRef.current?.abort();
      setMessage("Multi-level extraction cancelled."); }}>Cancel levels</button>}
    {result && <div role="status">{result.surfaces.map(surface =>
      <div key={surface.level}>Level {surface.level} {surface.unit}: {surface.triangleCount} triangles;
        {" "}{surface.complete ? "complete" : "triangle budget reached"}.
        <button type="button" disabled={!onPromote || surface.triangleCount < 1}
          onClick={() => { try { onPromote?.(document, surface);
            setMessage(`Level ${surface.level} promoted with source lineage.`); }
          catch (cause) { setMessage(String((cause as Error).message ?? cause)); } }}>
          Promote level to Mesh</button>
      </div>)}</div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
