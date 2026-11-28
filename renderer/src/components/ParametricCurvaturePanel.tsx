import React, { useEffect, useRef, useState } from "react";
import type { ParametricCurvatureParameters,
  ParametricSurfaceSource } from "../surfaceAnalysis/parametricCurvatureOperation";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";

type Summary = Readonly<{
  sampleCount: number;
  gaussianRange: readonly [number, number] | null;
  meanGaussian: number | null;
  validation: Readonly<{ finiteValues: boolean; domainCoverage: number;
    referenceStatus: "passed" | "failed" | "unavailable";
    referenceRmse: number | null; referenceMaximumAbsoluteError: number | null;
    referenceComparedCount: number }>;
  heatmap: readonly (number | null)[];
  heatmapSide: number;
}>;

const initialSurface: ParametricSurfaceSource = {
  kind: "parametric", expressions: { x: "u", y: "v", z: "0" },
  domain: { u: { min: -2, max: 2 }, v: { min: -2, max: 2 } },
  lengthUnit: "scene-unit", orientationSign: 1, referencePresetId: "plane",
};

export function ParametricCurvaturePanel() {
  const [surface, setSurface] = useState(initialSurface);
  const [resolutionU, setResolutionU] = useState(128);
  const [resolutionV, setResolutionV] = useState(128);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  const setExpression = (axis: "x" | "y" | "z", value: string) =>
    setSurface(current => { const { referencePresetId: _reference, ...source } = current;
      return { ...source, expressions: { ...current.expressions, [axis]: value } }; });
  const setBound = (axis: "u" | "v", end: "min" | "max", value: number) =>
    setSurface(current => { const { referencePresetId: _reference, ...source } = current;
      return { ...source,
        domain: { ...current.domain, [axis]: { ...current.domain[axis], [end]: value } } }; });
  const setPeriodic = (axis: "u" | "v", periodic: boolean) =>
    setSurface(current => { const { referencePresetId: _reference, ...source } = current;
      return { ...source, domain: { ...current.domain,
        [axis]: { ...current.domain[axis], periodic } } }; });
  const setPreset = (id: string) => {
    if (!id) {
      setSurface(current => { const { referencePresetId: _reference, ...source } = current;
        return source; });
      return;
    }
    const preset = getGeometryExactSurfacePreset(id);
    setSurface({ kind: "parametric",
      expressions: { x: preset.formula[0], y: preset.formula[1], z: preset.formula[2] },
      domain: { u: { min: preset.domain.u.min, max: preset.domain.u.max,
        periodic: preset.domain.u.periodic },
        v: { min: preset.domain.v.min, max: preset.domain.v.max,
          periodic: preset.domain.v.periodic } },
      lengthUnit: preset.units.position, orientationSign: preset.orientation.sign,
      referencePresetId: id });
  };
  const compute = () => {
    workerRef.current?.terminate();
    setBusy(true);
    setError(null);
    setSummary(null);
    const worker = new Worker(new URL("../surfaceAnalysis/parametricCurvatureWorker.ts",
      import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ ok: true; summary: Summary } | { ok: false; error: string }>) => {
      setBusy(false);
      if (event.data.ok) setSummary(event.data.summary);
      else setError(event.data.error);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.onerror = event => {
      setBusy(false);
      setError(event.message || "Surface calculation failed.");
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    const parameters: ParametricCurvatureParameters = { resolutionU, resolutionV };
    worker.postMessage({ surface, parameters });
  };
  return <div data-testid="parametric-curvature-panel" style={{ display: "grid", gap: 8,
    border: "1px solid #a9c7e8", padding: 10, borderRadius: 8 }}>
    <strong>Parametric Surface curvature</strong>
    <small>Enter x(u,v), y(u,v), z(u,v), then compute a Gaussian curvature field.</small>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["x", "y", "z"] as const).map(axis =>
        <label key={axis}>{axis}(u,v) <input aria-label={`${axis} expression`}
          value={surface.expressions[axis]} onChange={event => setExpression(axis, event.target.value)} /></label>)}
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["u", "v"] as const).flatMap(axis => (["min", "max"] as const).map(end =>
        <label key={`${axis}-${end}`}>{axis} {end} <input type="number" step="any"
          aria-label={`${axis} ${end}`} value={surface.domain[axis][end]}
          onChange={event => setBound(axis, end, Number(event.target.value))} /></label>))}
      {(["u", "v"] as const).map(axis => <label key={`${axis}-periodic`}>
        <input type="checkbox" checked={Boolean(surface.domain[axis].periodic)}
          onChange={event => setPeriodic(axis, event.target.checked)} />{axis} periodic</label>)}
      <label>Length unit <input aria-label="Length unit" value={surface.lengthUnit ?? "unit"}
        onChange={event => setSurface(current => { const { referencePresetId: _reference, ...source } = current;
          return { ...source, lengthUnit: event.target.value }; })} /></label>
      <label>Orientation <select aria-label="Orientation" value={surface.orientationSign ?? 1}
        onChange={event => setSurface(current => { const { referencePresetId: _reference, ...source } = current;
          return { ...source, orientationSign: Number(event.target.value) as 1 | -1 }; })}>
        <option value={1}>Parameter cross</option><option value={-1}>Reversed</option>
      </select></label>
      <label>U samples <input type="number" min={2} max={256} value={resolutionU}
        onChange={event => setResolutionU(Number(event.target.value))} /></label>
      <label>V samples <input type="number" min={2} max={256} value={resolutionV}
        onChange={event => setResolutionV(Number(event.target.value))} /></label>
      <label>Exact reference <select aria-label="Exact reference"
        value={surface.referencePresetId ?? ""}
        onChange={event => setPreset(event.target.value)}>
        <option value="">No exact reference</option><option value="plane">Plane</option>
        <option value="saddle">Saddle</option><option value="sphere">Sphere</option>
        <option value="cylinder">Cylinder</option><option value="torus">Torus</option>
      </select></label>
    </div>
    <div><button type="button" disabled={busy} onClick={compute}>Compute curvature</button>
      {busy && <span role="status"> Computing in background…</span>}</div>
    {error && <div role="alert">{error}</div>}
    {summary && <div role="status" style={{ display: "grid", gap: 5 }}>
      <span>{summary.sampleCount} samples · coverage {(100 * summary.validation.domainCoverage).toFixed(1)}% ·
        reference {summary.validation.referenceStatus}</span>
      <span>Gaussian K: {summary.gaussianRange
        ? `${summary.gaussianRange[0].toPrecision(4)} to ${summary.gaussianRange[1].toPrecision(4)}`
        : "no valid samples"}{summary.validation.referenceRmse === null ? ""
        : ` · reference RMSE ${summary.validation.referenceRmse.toPrecision(4)}`}</span>
      <svg role="img" aria-label="Gaussian curvature field" width={256} height={256}
        viewBox={`0 0 ${summary.heatmapSide} ${summary.heatmapSide}`}>
        {summary.heatmap.map((value, index) => {
          const maximum = Math.max(1e-12, Math.abs(summary.gaussianRange?.[0] ?? 0),
            Math.abs(summary.gaussianRange?.[1] ?? 0));
          const normalized = value === null ? 0 : Math.max(-1, Math.min(1, value / maximum));
          return <rect key={index} x={index % summary.heatmapSide}
            y={Math.floor(index / summary.heatmapSide)} width={1} height={1}
            fill={value === null ? "#94a3b8" : normalized < 0
              ? `rgb(${Math.round(230 + 25 * normalized)},${Math.round(240 + 110 * normalized)},255)`
              : `rgb(255,${Math.round(240 - 130 * normalized)},${Math.round(230 - 190 * normalized)})`} />;
        })}
      </svg>
    </div>}
  </div>;
}
