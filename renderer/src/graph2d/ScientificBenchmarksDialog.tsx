import { useEffect, useId, useRef, useState } from "react";
import type { Graph2DPreset } from "@math3d/core";
import { benchmarkPreset, scientificBenchmarks, type BenchmarkId, type BenchmarkResult } from "./scientificBenchmarks";
import "./scientificBenchmarks.css";

type Props = { onClose: () => void; onOpenPreset?: (preset: Graph2DPreset) => void };
type State = BenchmarkResult | { status: "running"; detail: string };

export function ScientificBenchmarksDialog({ onClose, onOpenPreset }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<BenchmarkId[]>([]);
  const titleId = useId();
  const [results, setResults] = useState<Partial<Record<BenchmarkId, State>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const startNext = () => {
    if (timer.current) clearTimeout(timer.current);
    const id = queue.current.shift();
    if (!id) { setBusy(false); return; }
    setResults(previous => ({ ...previous, [id]: { status: "running", detail: "Checking sampled geometry…" } }));
    timer.current = setTimeout(() => {
      worker.current?.terminate(); worker.current = null;
      setResults(previous => ({ ...previous, [id]: { status: "fail", detail: "Check exceeded the 10-second limit." } }));
      queue.current = []; setBusy(false); setError("Benchmark worker timed out. Reopen the helper to run another check.");
    }, 10000);
    worker.current?.postMessage({ id });
  };
  useEffect(() => {
    ref.current?.showModal();
    const instance = new Worker(new URL("./scientificBenchmarksWorker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<{ id: BenchmarkId; result: BenchmarkResult }>) => {
      setResults(previous => ({ ...previous, [event.data.id]: event.data.result }));
      startNext();
    };
    instance.onerror = () => {
      setError("Benchmark worker failed. Reopen the helper and try again.");
      setBusy(false);
      if (timer.current) clearTimeout(timer.current);
    };
    return () => { if (timer.current) clearTimeout(timer.current); instance.terminate(); worker.current = null; ref.current?.close(); };
  }, []);
  const run = (ids: BenchmarkId[]) => {
    if (busy || !worker.current) return;
    setError(""); setBusy(true); queue.current = ids; startNext();
  };
  const open = (id: BenchmarkId) => {
    const preset = benchmarkPreset(id);
    if (!preset || !onOpenPreset) return;
    try { onOpenPreset(preset); onClose(); }
    catch (cause) { setError((cause as Error).message); }
  };
  return <dialog ref={ref} className="scientific-benchmarks-dialog" aria-labelledby={titleId}
    data-testid="scientific-benchmarks" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id={titleId}>Scientific benchmarks</h2>
      <p>Canonical scenes with mathematical reference results. Automated checks use Math3D's Graphs sampler and integral engine; guided cases stay unverified until checked in their own workspace.</p></div>
      <button type="button" onClick={onClose} aria-label="Close scientific benchmarks">×</button></header>
    <div className="scientific-benchmarks-actions">
      <button type="button" disabled={busy} onClick={() => run(scientificBenchmarks.filter(item => item.automated).map(item => item.id))}>Run six Graphs checks</button>
      <span aria-live="polite">{busy ? "Running checks…" : `${Object.values(results).filter(item => item?.status === "pass").length} passed · ${Object.values(results).filter(item => item?.status === "fail").length} failed`}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="scientific-benchmarks-list">
      {scientificBenchmarks.map(item => { const result = results[item.id]; return <article key={item.id} data-testid={`scientific-benchmark-${item.id}`}>
        <div className="scientific-benchmarks-heading"><h3>{item.title}</h3><span className="scientific-benchmarks-status" data-status={result?.status ?? (item.automated ? "ready" : "guided")}>
          {result?.status ?? (item.automated ? "Ready" : "Guided")}</span></div>
        <p><strong>Expected:</strong> {item.expected}</p><p><strong>Check:</strong> {item.method}</p>
        {result && <p role="status">{result.detail}</p>}
        <div className="scientific-benchmarks-case-actions">
          {item.automated && <button type="button" disabled={busy} onClick={() => run([item.id])}>Run check</button>}
          {benchmarkPreset(item.id) && <button type="button" disabled={!onOpenPreset} onClick={() => open(item.id)}>Open editable scene</button>}
          <small>{item.workspace}</small>
        </div>
      </article>; })}
    </div>
    <footer>Numerical sampling uses finite resolution and stated tolerances. A pass is evidence for this case, not a proof of exact geometry.</footer>
  </dialog>;
}
