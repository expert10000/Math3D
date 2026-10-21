import { useEffect, useRef, useState } from "react";
import { graph2DFourierCsv, isGraph2DFourierCurrent, type Graph2DDocument,
  type Graph2DFourierOptions, type Graph2DFourierResult } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { downloadGraph2DResultJson } from "./downloadGraph2DResultJson";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

type Bin = Graph2DFourierResult["bins"][number];
const columns: readonly Graph2DResultColumn<Bin>[] = [
  { id: "amplitude", label: "Amplitude", render: item => item.amplitude.toPrecision(7) },
  { id: "phase", label: "Phase (rad)", render: item => item.phaseRadians.toPrecision(7) },
];

const spectrumPath = (result: Graph2DFourierResult) => {
  const columns = 384, peaks = Array.from({ length: columns }, () => 0);
  result.bins.forEach((bin, index) => {
    const column = Math.min(columns - 1, Math.floor(index * columns / result.bins.length));
    peaks[column] = Math.max(peaks[column]!, bin.amplitude);
  });
  const max = Math.max(...peaks, Number.EPSILON);
  return peaks.map((value, index) => `${index ? "L" : "M"}${index},${(112 - 104 * value / max).toFixed(2)}`).join(" ");
};

export function Graph2DFourierPanel({ document }: { document: Graph2DDocument }) {
  const [window, setWindow] = useState<Graph2DFourierOptions["window"]>("hann");
  const [normalization, setNormalization] = useState<Graph2DFourierOptions["normalization"]>("peak");
  const [detrend, setDetrend] = useState<Graph2DFourierOptions["detrend"]>("mean");
  const [xUnit, setXUnit] = useState("s"), [result, setResult] = useState<Graph2DFourierResult | null>(null);
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => setSelectedBinIndex(null), [result?.resultId]);
  const worker = useRef<Worker | null>(null), deadline = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const object = document.source.objects.find(item => item.id === document.selection.objectId);
  const options: Graph2DFourierOptions = { window, normalization, detrend, xUnit };
  const requestKey = [document.identity.id, document.identity.revision, document.identity.structuralHash,
    object?.id, object?.kind === "point-series" ? object.table.checksum : "", window, normalization, detrend, xUnit].join("|");
  const latestKey = useRef(requestKey); latestKey.current = requestKey;
  const cancel = (announce = true) => { generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false);
    if (announce) setError("Fourier analysis cancelled."); };
  useEffect(() => { cancel(false); setResult(null); setError(""); return () => {
    generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null;
  }; }, [requestKey]);
  const analyze = () => {
    if (object?.kind !== "point-series") return;
    cancel(false); setError(""); setPending(true); const token = ++generation.current, key = requestKey;
    try {
      const task = new Worker(new URL("./graph2dFourierWorker.ts", import.meta.url), { type: "module" });
      worker.current = task;
      const finish = () => { task.terminate(); if (worker.current === task) worker.current = null;
        if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false); };
      task.onmessage = (event: MessageEvent<{ result?: Graph2DFourierResult; error?: string }>) => {
        if (generation.current !== token || latestKey.current !== key) return;
        finish(); if (event.data.result) setResult(event.data.result);
        else { setResult(null); setError(event.data.error ?? "Fourier analysis failed."); }
      };
      task.onerror = event => { event.preventDefault(); if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError(event.message || "Fourier worker failed."); };
      deadline.current = setTimeout(() => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError("Fourier analysis exceeded 15 seconds."); }, 15000);
      task.postMessage({ document, objectId: object.id, rows: pointTableStore.resolve(object.table), options });
    } catch (caught) { cancel(false); setError((caught as Error).message); }
  };
  const current = result && isGraph2DFourierCurrent(result, document) &&
    result.objectId === object?.id && result.options.window === window &&
    result.options.normalization === normalization && result.options.detrend === detrend && result.options.xUnit === xUnit;
  const strongest = result?.bins.slice(1).sort((a, b) => b.amplitude - a.amplitude).slice(0, 12) ?? [];
  const strongestIds = new Set(strongest.map(bin => bin.index));
  const filters: readonly Graph2DResultFilter<Bin>[] = [
    { id: "all", label: "All", include: () => true },
    { id: "non-dc", label: "Non-DC", include: bin => bin.index > 0 },
    { id: "strongest", label: "Strongest 12", include: bin => strongestIds.has(bin.index) },
  ];
  const download = () => {
    if (!current || !result) return;
    const url = URL.createObjectURL(new Blob([graph2DFourierCsv(result)], { type: "text/csv;charset=utf-8" }));
    const link = globalThis.document.createElement("a"); link.href = url; link.download = `graph-spectrum-${result.objectId}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Fourier spectrum" data-testid="graph2d-fourier">
    <h3>Fourier spectrum</h3>
    <p>Original checksum-checked samples only. Requires a complete, uniformly spaced x grid; no automatic interpolation.</p>
    <label>Window <select aria-label="Fourier window" value={window} onChange={event => setWindow(event.target.value as typeof window)}>
      <option value="rectangular">Rectangular</option><option value="hann">Hann</option></select></label>
    <label>Amplitude normalization <select aria-label="Fourier normalization" value={normalization}
      onChange={event => setNormalization(event.target.value as typeof normalization)}>
      <option value="peak">One-sided peak amplitude</option><option value="rms">One-sided RMS amplitude</option></select></label>
    <label>Detrend <select aria-label="Fourier detrend" value={detrend} onChange={event => setDetrend(event.target.value as typeof detrend)}>
      <option value="mean">Remove mean</option><option value="none">Keep mean</option></select></label>
    <label>X unit <input aria-label="Fourier x unit" value={xUnit} maxLength={24} onChange={event => setXUnit(event.target.value)} /></label>
    <button type="button" disabled={pending} onClick={analyze}>Analyze spectrum</button>
    {pending && <><button type="button" onClick={() => cancel()}>Cancel spectrum</button><p aria-live="polite">Analyzing checked samples…</p></>}
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">{current ? "Current spectrum" : "Stale spectrum — source or options changed"}</p>
      <p>{result.n} samples · Δx={result.sampleInterval.toPrecision(6)} {result.options.xUnit} · Nyquist {result.nyquist.toPrecision(6)} {result.frequencyUnit} · {result.fftLength}-point FFT.</p>
      <svg data-testid="graph2d-fourier-plot" role="img" aria-label={`Amplitude spectrum from 0 to ${result.nyquist.toPrecision(6)} ${result.frequencyUnit}`}
        viewBox="0 0 384 120" preserveAspectRatio="none" style={{ width: "100%", height: 120, background: "#f6f9fc" }}>
        <path d={spectrumPath(result)} fill="none" stroke="#2563eb" strokeWidth="1.5" />
        {selectedBinIndex !== null && <line data-testid="graph2d-fourier-selected-bin"
          x1={selectedBinIndex * 384 / Math.max(1, result.bins.length - 1)}
          x2={selectedBinIndex * 384 / Math.max(1, result.bins.length - 1)}
          y1={0} y2={120} stroke="#e11d48" strokeWidth={1.5} />}</svg>
      <p>Amplitude is in y units; phase is in radians. Zero padding does not increase physical resolution. Phase near zero amplitude is unstable.</p>
      <dl className="graph2d-critical-summary">
        <div><dt>Frequency bins</dt><dd>{result.bins.length}</dd></div>
        <div><dt>Strongest non-DC</dt><dd>{strongest[0]?.frequency.toPrecision(5) ?? "—"}</dd></div>
        <div><dt>Nyquist</dt><dd>{result.nyquist.toPrecision(5)}</dd></div>
      </dl>
      <Graph2DNumericalResultsTable resultKey={result.resultId} tableLabel="Fourier numerical results"
        controlsLabel="Filter frequency bins" searchLabel="Search frequency bins" sortLabel="Sort bins by frequency"
        items={result.bins} filters={filters} columns={columns} getId={bin => String(bin.index)}
        getX={bin => bin.frequency} getKind={bin => `Bin ${bin.index}`}
        getSearchText={bin => `${bin.index} ${bin.frequency} ${bin.amplitude} ${bin.phaseRadians}`}
        xLabel={`Frequency (${result.frequencyUnit})`}
        onFocus={bin => setSelectedBinIndex(bin.index)} canFocus={() => !!current}
        focusLabel={bin => `Highlight frequency bin ${bin.index}`}
        isActive={bin => selectedBinIndex === bin.index}
        exportCsv={current ? download : undefined}
        exportJson={current ? () => downloadGraph2DResultJson(`graph-spectrum-${result.objectId}.json`, {
          format: "math3d.graph2d-fourier.v1", ...result }) : undefined}
        emptyText="No frequency bins available." />
      <small>Spectrum bins can be highlighted and exported. They are not graph construction candidates.</small>
      <details><summary>Source and method</summary><code>{result.table.checksum}</code>
        <ul>{result.publication.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
    </>}
  </section>;
}
