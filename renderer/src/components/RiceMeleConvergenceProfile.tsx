import React, { useRef, useState } from "react";

type Note = { id: string; text: string; position: [number, number, number] };
type Scene = { provenance: { runId: string; resultSha256: string; parameters?: Record<string, number | string> };
  datasets: { id: string; count: number; components: number; unit: string }[];
  objects: { id: string; kind: string; positions: string; scalars?: string }[]; annotations: Note[] };
type Point = { index: number; x: number; charge: number; status: string; checks: string;
  runId: string; resultSha256: string; position: [number, number, number] };
type Series = { key: "periodic" | "chain"; title: string; xLabel: string; yLabel: string;
  unit: string; points: Point[] };
type ExactSample = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["scalarSample"]>>;
const numeric = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)";
const periodicPattern = new RegExp(`^Periodic · duration ${numeric} inverse hopping energy · charge ${numeric} electron charge / cell · (resolved|gap-closed|unresolved) · (.+)$`);
const chainPattern = new RegExp(`^Chain · width ${numeric} cells · central-bond charge ${numeric} electron charge · (resolved|unresolved|size-sensitive) · (.+)$`);
const sourcePattern = /^Run ([A-Za-z0-9_-]{1,100}) · result SHA-256 ([a-f0-9]{64})$/;

/** Producer annotations carry physical x values; scene coordinates are normalized display positions only. */
export function readRiceMeleConvergenceSeries(scene: Scene): Series[] {
  return (["periodic", "chain"] as const).map(key => {
    const object = scene.objects.find(item => item.id === `${key}-points`);
    const dataset = scene.datasets.find(item => item.id === `${key}-recorded-charge`);
    const unit = key === "periodic" ? "electron charge / cell" : "electron charge";
    if (!object || !dataset || object.kind !== "point-cloud" || object.scalars !== dataset.id ||
        dataset.components !== 1 || dataset.unit !== unit || dataset.count < 2 || dataset.count > 32)
      throw new Error(`Invalid ${key} convergence series`);
    const points = Array.from({ length: dataset.count }, (_, index) => {
      const note = scene.annotations.find(item => item.id === `${key}-${index}`);
      const source = scene.annotations.find(item => item.id === `${key}-${index}-source`);
      const fields = note?.text.match(key === "periodic" ? periodicPattern : chainPattern);
      const identity = source?.text.match(sourcePattern);
      if (!note || !fields || !identity || !Number.isFinite(Number(fields[1])) ||
          !Number.isFinite(Number(fields[2])) || (key === "chain" && !Number.isSafeInteger(Number(fields[1]))))
        throw new Error(`Invalid ${key} convergence annotation ${index}`);
      return { index, x: Number(fields[1]), charge: Number(fields[2]), status: fields[3], checks: fields[4],
        runId: identity[1], resultSha256: identity[2], position: note.position };
    });
    if (new Set(points.map(point => point.x)).size !== points.length ||
        points.some((point, index) => index > 0 && point.x <= points[index - 1].x))
      throw new Error(`Invalid ${key} convergence axis`);
    return { key, title: key === "periodic" ? "Periodic filled-band charge" : "Finite-chain central-bond charge",
      xLabel: key === "periodic" ? "Cycle duration (inverse hopping energy)" : "Open-chain width (cells)",
      yLabel: `Recorded charge (${unit})`, unit, points };
  });
}

function SeriesPlot({ series, onSelect, busy }: { series: Series; onSelect: (point: Point) => void; busy: boolean }) {
  const xs = series.points.map(point => point.x), ys = series.points.map(point => point.charge);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const ypad = Math.max((ymax - ymin) * .12, 1e-8), ylow = ymin - ypad, yhigh = ymax + ypad;
  const xpx = (x: number) => 58 + (x - xmin) / (xmax - xmin || 1) * 326;
  const ypx = (y: number) => 155 - (y - ylow) / (yhigh - ylow) * 124;
  const color = series.key === "periodic" ? "#208b74" : "#ad6522";
  return <section data-testid={`rice-convergence-${series.key}`} style={{ minWidth: 290, flex: "1 1 360px", border: "1px solid var(--border, #cbd5e1)", borderRadius: 8, padding: 12 }}>
    <h4 style={{ margin: "0 0 4px" }}>{series.title}</h4>
    <p style={{ margin: "0 0 8px" }}>{series.xLabel} · {series.yLabel}</p>
    <svg viewBox="0 0 420 200" role="img" aria-label={`${series.title}: charge versus ${series.xLabel}`} style={{ width: "100%", maxWidth: 550, height: "auto" }}>
      <line x1="58" y1="20" x2="58" y2="155" stroke="currentColor"/><line x1="58" y1="155" x2="395" y2="155" stroke="currentColor"/>
      <text x="58" y="176" fontSize="11" fill="currentColor">{xmin}</text><text x="364" y="176" fontSize="11" fill="currentColor">{xmax}</text>
      <text x="2" y="33" fontSize="10" fill="currentColor">{ymax.toPrecision(4)}</text><text x="2" y="151" fontSize="10" fill="currentColor">{ymin.toPrecision(4)}</text>
      <polyline fill="none" stroke={color} strokeWidth="2" points={series.points.map(point => `${xpx(point.x)},${ypx(point.charge)}`).join(" ")}/>
      {series.points.map(point => <circle key={point.index} cx={xpx(point.x)} cy={ypx(point.charge)} r="6" fill={color} stroke="white" strokeWidth="1"/>)}
    </svg>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {series.points.map(point => <button key={point.index} type="button" disabled={busy}
        aria-label={`Inspect ${series.key} point ${point.index + 1}, ${series.key === "periodic" ? "duration" : "width"} ${point.x}`}
        onClick={() => onSelect(point)}>{series.key === "periodic" ? "Duration" : "Width"} {point.x}</button>)}
    </div>
  </section>;
}

export function RiceMeleConvergenceProfile({ scene, fingerprint }: { scene: Scene; fingerprint: string }) {
  const [selection, setSelection] = useState<{ series: Series; point: Point; sample: ExactSample } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingRun, setOpeningRun] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const generation = useRef(0);
  const launchGeneration = useRef(0);
  let series: Series[];
  try { series = readRiceMeleConvergenceSeries(scene); }
  catch (reason) { return <section data-testid="rice-convergence-profile"><p role="alert">Convergence view unavailable: {String((reason as Error).message)}</p></section>; }
  const inspect = async (chosen: Series, point: Point) => {
    const current = ++generation.current;
    launchGeneration.current++;
    setSelection(null); setError(""); setRunStatus(""); setOpeningRun(false); setBusy(true);
    try {
      if (!window.quantumScenes?.scalarSample) throw new Error("Verified source reader is unavailable");
      const sample = await window.quantumScenes.scalarSample({ fingerprint, objectId: `${chosen.key}-points`, sampleIndex: point.index });
      if (current !== generation.current) return;
      if (sample.fingerprint !== fingerprint || sample.runId !== scene.provenance.runId ||
          sample.resultSha256 !== scene.provenance.resultSha256 || sample.valueDatasetId !== `${chosen.key}-recorded-charge` ||
          sample.valueUnit !== chosen.unit || sample.value !== point.charge ||
          sample.position.some((value, index) => Math.abs(value - point.position[index]) > 1e-12))
        throw new Error("Exact point differs from verified source metadata");
      setSelection({ series: chosen, point, sample });
    } catch (reason) { if (current === generation.current) setError(`Selection refused: ${String((reason as Error).message ?? reason)}`); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const openSelectedRun = async () => {
    if (!selection || openingRun || !window.quantumScenes?.openStudySourceRun) return;
    const current = ++launchGeneration.current;
    const selected = selection;
    setOpeningRun(true); setRunStatus("");
    try {
      const result = await window.quantumScenes.openStudySourceRun({ fingerprint, series: selected.series.key,
        sampleIndex: selected.point.index, runId: selected.point.runId,
        resultSha256: selected.point.resultSha256 });
      if (current === launchGeneration.current) setRunStatus(result.ok
        ? `Theory Lab launch requested for ${result.runId}; Lab will verify the exact saved result before opening it.`
        : result.canceled ? "Theory Lab selection canceled." : `Selected source run unavailable: ${result.error}`);
    } catch (reason) {
      if (current === launchGeneration.current) setRunStatus(`Selected source run unavailable: ${String((reason as Error).message ?? reason)}`);
    } finally { if (current === launchGeneration.current) setOpeningRun(false); }
  };
  return <section data-testid="rice-convergence-profile" style={{ padding: 10, marginBottom: 14, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8 }}>
    <h3 style={{ margin: 0 }}>Rice–Mele · saved-run convergence evidence</h3>
    <p>Study <code>{scene.provenance.runId}</code> · study SHA-256 <code style={{ overflowWrap: "anywhere" }}>{scene.provenance.resultSha256}</code> · {scene.provenance.parameters?.sourceCount} distinct verified Lab runs.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{series.map(item => <SeriesPlot key={item.key} series={item} busy={busy} onSelect={point => inspect(item, point)}/>)}</div>
    {busy && <p>Verifying selected source sample…</p>}{error && <p role="alert">{error}</p>}
    {selection && <div data-testid="rice-convergence-selection">
      <h4>Exact saved point · {selection.series.title}</h4>
      <p>{selection.series.xLabel}: {selection.point.x}. {selection.series.yLabel}: {selection.sample.value.toPrecision(12)} {selection.sample.valueUnit}.</p>
      <p>Status: {selection.point.status}. Diagnostics: {selection.point.checks}.</p>
      <p>Source run <code>{selection.point.runId}</code> · result SHA-256 <code style={{ overflowWrap: "anywhere" }}>{selection.point.resultSha256}</code>.</p>
      <p>Dataset {selection.sample.valueDatasetId}, exact sample index {selection.sample.sampleIndex}. Source bytes reverified on selection.</p>
      <button type="button" data-testid="rice-convergence-open-selected-run" disabled={openingRun}
        onClick={() => void openSelectedRun()}>{openingRun ? "Re-verifying selected run…" : "Open selected run in Theory Lab"}</button>
      {runStatus && <p role="status" data-testid="rice-convergence-run-status">{runStatus}</p>}
    </div>}
    <p>The two charges have different units and physical definitions. The 3D source layout uses normalized display coordinates only. These plots connect recorded points; they do not fit, extrapolate, or claim a shared limit. Math3D performs no pump calculation.</p>
  </section>;
}
