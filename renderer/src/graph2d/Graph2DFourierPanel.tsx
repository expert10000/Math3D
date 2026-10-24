import { useEffect, useRef, useState } from "react";
import { graph2DFourierCsv, graph2DMultiChannelFourierCsv, isGraph2DMultiChannelFourierCurrent, type Graph2DDocument,
  type Graph2DFourierOptions, type Graph2DFourierResult, type Graph2DMultiChannelFourierResult,
  type Graph2DPointSeriesObject } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";
import { downloadGraph2DResultJson } from "./downloadGraph2DResultJson";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";
import { Graph2DAnalysisRowBudgetControl, type Graph2DAnalysisRowBudget } from "./Graph2DAnalysisBudgetControl";

type Bin = Graph2DFourierResult["bins"][number];
const columns: readonly Graph2DResultColumn<Bin>[] = [
  { id: "amplitude", label: "Amplitude", render: item => item.amplitude.toPrecision(7) },
  { id: "phase", label: "Phase (rad)", render: item => item.phaseRadians.toPrecision(7) },
];
const palette = ["#2563eb", "#d9467a", "#0f766e", "#a16207"];

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
  const [xUnit, setXUnit] = useState("s"), [result, setResult] = useState<Graph2DMultiChannelFourierResult | null>(null);
  const [rowBudget, setRowBudget] = useState<Graph2DAnalysisRowBudget>(10000);
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [selectedBinIndex, setSelectedBinIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const worker = useRef<Worker | null>(null), deadline = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const object = document.source.objects.find(item => item.id === document.selection.objectId);
  const candidates = document.source.objects.filter((item): item is Graph2DPointSeriesObject =>
    item.kind === "point-series" && item.id !== object?.id);
  const selectedOthers = candidates.filter(item => additionalIds.includes(item.id)).slice(0, 3);
  const chosen = object?.kind === "point-series" ? [object, ...selectedOthers] : [];
  const options: Graph2DFourierOptions = { window, normalization, detrend, xUnit };
  useEffect(() => { if (object?.kind === "point-series" && object.origin?.xUnit) setXUnit(object.origin.xUnit); },
    [object?.id, object?.kind === "point-series" ? object.origin?.xUnit : null]);
  useEffect(() => { setActiveChannelId(result?.channels[0]?.objectId ?? null); setSelectedBinIndex(null); }, [result?.resultId]);
  const requestKey = [document.identity.id, document.identity.revision, document.identity.structuralHash,
    ...chosen.map(item => `${item.id}:${item.table.checksum}`), window, normalization, detrend, xUnit, rowBudget].join("|");
  const latestKey = useRef(requestKey); latestKey.current = requestKey;
  const cancel = (announce = true) => { generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false);
    if (announce) setError("Fourier analysis cancelled."); };
  useEffect(() => { cancel(false); setResult(null); setError(""); return () => {
    generation.current++; worker.current?.terminate(); worker.current = null;
    if (deadline.current) clearTimeout(deadline.current); deadline.current = null;
  }; }, [requestKey]);
  const toggle = (id: string) => { setAdditionalIds(current => {
    const valid = current.filter(item => candidates.some(candidate => candidate.id === item));
    return valid.includes(id) ? valid.filter(item => item !== id) : valid.length < 3 ? [...valid, id] : valid;
  }); };
  const analyze = () => {
    if (object?.kind !== "point-series") return;
    const over = chosen.find(item => item.table.rowCount > rowBudget);
    if (over) { setError(`${over.label} needs ${over.table.rowCount.toLocaleString("en-US")} checked rows; increase the analysis row budget. No rows were omitted.`); return; }
    cancel(false); setError(""); setPending(true); const token = ++generation.current, key = requestKey;
    try {
      const task = new Worker(new URL("./graph2dFourierWorker.ts", import.meta.url), { type: "module" });
      worker.current = task;
      const finish = () => { task.terminate(); if (worker.current === task) worker.current = null;
        if (deadline.current) clearTimeout(deadline.current); deadline.current = null; setPending(false); };
      task.onmessage = (event: MessageEvent<{ result?: Graph2DMultiChannelFourierResult; error?: string }>) => {
        if (generation.current !== token || latestKey.current !== key) return;
        finish(); if (event.data.result) setResult(event.data.result);
        else { setResult(null); setError(event.data.error ?? "Fourier analysis failed."); }
      };
      task.onerror = event => { event.preventDefault(); if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError(event.message || "Fourier worker failed."); };
      deadline.current = setTimeout(() => { if (generation.current !== token || latestKey.current !== key) return;
        finish(); setError("Fourier analysis exceeded 15 seconds."); }, 15000);
      task.postMessage({ document, channels: chosen.map(item => ({ objectId: item.id,
        rows: pointTableStore.resolve(item.table) })), options, maxRows: rowBudget });
    } catch (caught) { cancel(false); setError((caught as Error).message); }
  };
  const current = result && isGraph2DMultiChannelFourierCurrent(result, document) &&
    result.channels.length === chosen.length && result.channels.every((channel, index) => channel.objectId === chosen[index]?.id) &&
    result.options.window === window &&
    result.options.normalization === normalization && result.options.detrend === detrend && result.options.xUnit === xUnit;
  const active = result?.channels.find(channel => channel.objectId === activeChannelId) ?? result?.channels[0];
  const spectrum = active?.spectrum;
  const strongest = spectrum?.bins.slice(1).sort((a, b) => b.amplitude - a.amplitude).slice(0, 12) ?? [];
  const strongestIds = new Set(strongest.map(bin => bin.index));
  const filters: readonly Graph2DResultFilter<Bin>[] = [
    { id: "all", label: "All", include: () => true },
    { id: "non-dc", label: "Non-DC", include: bin => bin.index > 0 },
    { id: "strongest", label: "Strongest 12", include: bin => strongestIds.has(bin.index) },
  ];
  const download = () => {
    if (!current || !result) return;
    const only = result.channels.length === 1 ? result.channels[0]!.spectrum : null;
    const url = URL.createObjectURL(new Blob([only ? graph2DFourierCsv(only) : graph2DMultiChannelFourierCsv(result)],
      { type: "text/csv;charset=utf-8" }));
    const link = globalThis.document.createElement("a"); link.href = url;
    link.download = only ? `graph-spectrum-${only.objectId}.csv` : `graph-spectrum-${result.channels.length}-channels.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Fourier spectrum" data-testid="graph2d-fourier">
    <h3>Fourier spectrum</h3>
    <p>Original checksum-checked samples only. Channels must have exactly matching x coordinates and declared units; no automatic interpolation.</p>
    <label>Window <select aria-label="Fourier window" value={window} onChange={event => setWindow(event.target.value as typeof window)}>
      <option value="rectangular">Rectangular</option><option value="hann">Hann</option></select></label>
    <label>Amplitude normalization <select aria-label="Fourier normalization" value={normalization}
      onChange={event => setNormalization(event.target.value as typeof normalization)}>
      <option value="peak">One-sided peak amplitude</option><option value="rms">One-sided RMS amplitude</option></select></label>
    <label>Detrend <select aria-label="Fourier detrend" value={detrend} onChange={event => setDetrend(event.target.value as typeof detrend)}>
      <option value="mean">Remove mean</option><option value="none">Keep mean</option></select></label>
    <label>X unit <input aria-label="Fourier x unit" value={xUnit} maxLength={24} onChange={event => setXUnit(event.target.value)} /></label>
    <Graph2DAnalysisRowBudgetControl label="Fourier analysis row budget" value={rowBudget}
      onChange={value => { setRowBudget(value); setResult(null); setError(""); }} />
    {object?.kind === "point-series" && <small>Selected dataset: {object.table.rowCount.toLocaleString("en-US")} checked rows. Each FFT uses every row or declines the job.</small>}
    {!!candidates.length && <fieldset aria-label="Additional Fourier channels"><legend>Compare up to three more channels</legend>
      {candidates.map(item => <label key={item.id}><input type="checkbox" checked={selectedOthers.some(selected => selected.id === item.id)}
        disabled={!additionalIds.includes(item.id) && selectedOthers.length >= 3}
        onChange={() => toggle(item.id)} />{item.label} · {item.table.rowCount.toLocaleString("en-US")} rows{item.origin ? ` · ${item.origin.xUnit}, ${item.origin.yUnit}` : " · units not declared"}</label>)}
    </fieldset>}
    <button type="button" disabled={pending} onClick={analyze}>Analyze spectrum</button>
    {pending && <><button type="button" onClick={() => cancel()}>Cancel spectrum</button><p aria-live="polite">Analyzing checked samples…</p></>}
    {error && <p role="alert">{error}</p>}
    {result && spectrum && active && <><p role="status">{current ? "Current spectrum" : "Stale spectrum — source or options changed"}</p>
      <p>{result.n} samples · Δx={result.sampleInterval.toPrecision(6)} {result.options.xUnit} · Nyquist {result.nyquist.toPrecision(6)} {result.frequencyUnit} · {result.fftLength}-point FFT · {result.channels.length} {result.channels.length === 1 ? "channel" : "channels"}.</p>
      {result.channels.map((channel, index) => <div key={channel.objectId}>
        <h4>{channel.label} · {channel.yUnit} · peak displayed {Math.max(...channel.spectrum.bins.map(bin => bin.amplitude)).toPrecision(5)} {channel.yUnit}</h4>
        <svg data-testid={channel.objectId === active.objectId ? "graph2d-fourier-plot" : `graph2d-fourier-plot-${channel.objectId}`}
          role="img" aria-label={`${channel.label} amplitude spectrum from 0 to ${result.nyquist.toPrecision(6)} ${result.frequencyUnit}`}
          viewBox="0 0 384 120" preserveAspectRatio="none" style={{ width: "100%", height: 120, background: "#f6f9fc" }}>
          <path d={spectrumPath(channel.spectrum)} fill="none" stroke={palette[index]} strokeWidth="1.5" />
          {selectedBinIndex !== null && channel.objectId === active.objectId && <line data-testid="graph2d-fourier-selected-bin"
            x1={selectedBinIndex * 384 / Math.max(1, spectrum.bins.length - 1)}
            x2={selectedBinIndex * 384 / Math.max(1, spectrum.bins.length - 1)}
            y1={0} y2={120} stroke="#e11d48" strokeWidth={1.5} />}</svg>
      </div>)}
      <p>Amplitude is in each channel’s y units; phase is in radians. Zero padding does not increase physical resolution. Phase near zero amplitude is unstable.</p>
      {result.channels.length > 1 && <label>Inspect channel <select aria-label="Fourier channel to inspect"
        value={active.objectId} onChange={event => { setActiveChannelId(event.target.value); setSelectedBinIndex(null); }}>
        {result.channels.map(channel => <option key={channel.objectId} value={channel.objectId}>{channel.label}</option>)}
      </select></label>}
      <dl className="graph2d-critical-summary">
        <div><dt>Frequency bins</dt><dd>{spectrum.bins.length}</dd></div>
        <div><dt>Strongest non-DC</dt><dd>{strongest[0]?.frequency.toPrecision(5) ?? "—"}</dd></div>
        <div><dt>Nyquist</dt><dd>{result.nyquist.toPrecision(5)}</dd></div>
      </dl>
      <Graph2DNumericalResultsTable resultKey={`${result.resultId}:${active.objectId}`} tableLabel="Fourier numerical results"
        controlsLabel="Filter frequency bins" searchLabel="Search frequency bins" sortLabel="Sort bins by frequency"
        items={spectrum.bins} filters={filters} columns={columns} getId={bin => String(bin.index)}
        getX={bin => bin.frequency} getKind={bin => `Bin ${bin.index}`}
        getSearchText={bin => `${bin.index} ${bin.frequency} ${bin.amplitude} ${bin.phaseRadians}`}
        xLabel={`Frequency (${result.frequencyUnit})`}
        onFocus={bin => setSelectedBinIndex(bin.index)} canFocus={() => !!current}
        focusLabel={bin => `Highlight frequency bin ${bin.index}`}
        isActive={bin => selectedBinIndex === bin.index}
        exportCsv={current ? download : undefined}
        exportJson={current ? () => result.channels.length === 1 ?
          downloadGraph2DResultJson(`graph-spectrum-${spectrum.objectId}.json`, {
            format: "math3d.graph2d-fourier.v1", ...spectrum }) :
          downloadGraph2DResultJson(`graph-spectrum-${result.channels.length}-channels.json`, {
            format: "math3d.graph2d-fourier-multichannel.v1", ...result }) : undefined}
        emptyText="No frequency bins available." />
      <small>Spectrum bins can be highlighted and exported. They are not graph construction candidates.</small>
      <details><summary>Sources and method</summary><ul>
        {result.channels.map(channel => <li key={channel.objectId}>{channel.label}: {channel.spectrum.table.checksum} · x {channel.xUnit} · y {channel.yUnit}{channel.origin ? ` · ${channel.origin.sceneId}/${channel.origin.datasetId}/${channel.origin.component ?? "scalar"}` : ""}</li>)}
        {result.publication.warnings.map(warning => <li key={warning}>{warning}</li>)}
      </ul></details>
    </>}
  </section>;
}
