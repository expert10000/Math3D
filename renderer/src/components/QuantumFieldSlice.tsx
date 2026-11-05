import { useEffect, useRef, useState, type MouseEvent } from "react";
import { projectSpatialCursor, scientificCursorBus } from "./scientificCursor";
import type { QuantumFieldDocument } from "@math3d/core";

export type FieldQuantity = "density" | "amplitude" | "real" | "imaginary" | "phase";
export type FieldSliceRequest = { fingerprint: string; fieldId: string; axis: 0 | 1 | 2; index: number; quantity: FieldQuantity };
export type FieldSampleRequest = FieldSliceRequest & { u: number; v: number };
export type FieldSlice = FieldSliceRequest & { width: number; height: number; rgba: Uint8Array;
  range: [number, number]; unit: string; planeAxes: [number, number]; fitBounds: [number, number, number, number] | null };
export type FieldSample = { grid: [number, number, number]; position: [number, number, number];
  value: number | null; unit: string; undefinedNearNode: boolean };
export type QuantumField = { id: string; label: string; kind: "scalar-field" | "complex-field";
  grid: { shape: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number]; order: "xyz-z-fastest" } };

export function QuantumFieldSlice({ fingerprint, fields, axes, units, runId, resultSha256, coordinateSystemId,
  initialView, onViewChange }: {
  fingerprint: string; fields: QuantumField[]; axes: [string, string, string]; units: [string, string, string];
  runId: string; resultSha256: string; coordinateSystemId: string;
  initialView?: QuantumFieldDocument["view"]; onViewChange?: (view: QuantumFieldDocument["view"]) => void;
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const field = fields.find(entry => entry.id === fieldId) ?? fields[0];
  const [axis, setAxis] = useState<0 | 1 | 2>(initialView?.normalAxis ?? 2);
  const [index, setIndex] = useState(() => initialView?.fixedIndex ?? Math.floor((fields[0]?.grid.shape[2] ?? 1) / 2));
  const [quantity, setQuantity] = useState<FieldQuantity>(initialView?.quantity ?? (field?.kind === "scalar-field" ? "real" : "density"));
  const [slice, setSlice] = useState<Omit<FieldSlice, "rgba"> | null>(null);
  const [sample, setSample] = useState<FieldSample | null>(null);
  const [cursorGrid, setCursorGrid] = useState<[number, number, number] | null>(null);
  const [cursorStatus, setCursorStatus] = useState("");
  const [error, setError] = useState("");
  const [fitToField, setFitToField] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sourcePixels = useRef<Uint8Array | null>(null);
  const generation = useRef(0);
  const safeIndex = field ? Math.min(index, field.grid.shape[axis] - 1) : 0;
  const safeQuantity = field?.kind === "scalar-field" ? "real" : quantity;

  useEffect(() => scientificCursorBus.subscribe(cursor => {
    if (!cursor.spatialPoint || !field) return;
    const projected = projectSpatialCursor(cursor, { runId, resultSha256, coordinateSystemId,
      shape: field.grid.shape, origin: field.grid.origin, spacing: field.grid.spacing });
    if (projected.status === "matched") {
      setCursorGrid(projected.value); setIndex(projected.value[axis]);
      setCursorStatus("Spatial cursor matched an exact verified field sample.");
    } else if (cursor.runId === runId && cursor.resultSha256 === resultSha256) {
      setCursorGrid(null); setCursorStatus(`Cursor withheld: ${projected.reason}`);
    }
  }), [fingerprint, field?.id, axis, runId, resultSha256, coordinateSystemId]);

  useEffect(() => {
    const current = ++generation.current;
    setSlice(null); setSample(null); setError(""); sourcePixels.current = null;
    if (!field || !window.quantumScenes?.fieldSlice) return;
    const request: FieldSliceRequest = { fingerprint, fieldId: field.id, axis, index: safeIndex, quantity: safeQuantity };
    void window.quantumScenes.fieldSlice(request).then(result => {
      if (generation.current !== current) return;
      if (result.rgba.length !== result.width * result.height * 4) throw new Error("Invalid bounded field image");
      sourcePixels.current = result.rgba;
      const { rgba: _pixels, ...metadata } = result;
      setSlice(metadata);
    }).catch(cause => { if (generation.current === current) setError(String((cause as Error)?.message ?? cause)); });
    return () => { generation.current += 1; };
  }, [fingerprint, field?.id, axis, safeIndex, safeQuantity]);

  useEffect(() => {
    if (!cursorGrid || !slice || !field || slice.index !== cursorGrid[axis] ||
        slice.fieldId !== field.id || !window.quantumScenes?.fieldSample) return;
    const plane = [0, 1, 2].filter(candidate => candidate !== axis);
    const current = generation.current;
    void window.quantumScenes.fieldSample({ fingerprint, fieldId: field.id, axis, index: cursorGrid[axis],
      quantity: safeQuantity, u: cursorGrid[plane[0]], v: cursorGrid[plane[1]] }).then(result => {
      if (generation.current === current) setSample(result);
    }).catch(error => { if (generation.current === current) setCursorStatus(`Cursor withheld: ${String((error as Error).message)}`); });
  }, [cursorGrid, slice, field?.id, axis, safeQuantity, fingerprint]);

  const viewport: [number, number, number, number] | null = slice && fitToField ? slice.fitBounds : null;
  const visible: [number, number, number, number] | null = slice
    ? viewport ?? [0, 0, slice.width, slice.height] : null;
  useEffect(() => {
    const target = canvas.current, pixels = sourcePixels.current;
    if (!target || !slice || !pixels || !visible) return;
    const [minU, minV, maxU, maxV] = visible;
    target.width = maxU - minU; target.height = maxV - minV;
    const context = target.getContext("2d");
    if (!context) { setError("Field slice canvas unavailable"); return; }
    const image = context.createImageData(target.width, target.height);
    for (let row = 0; row < target.height; row++) {
      const sourceOffset = ((slice.height - maxV + row) * slice.width + minU) * 4;
      image.data.set(pixels.subarray(sourceOffset, sourceOffset + target.width * 4), row * target.width * 4);
    }
    context.putImageData(image, 0, 0);
  }, [slice, fitToField]);

  if (!field) return <p>No field in this verified scene.</p>;
  const plane = [0, 1, 2].filter(candidate => candidate !== axis);
  const selectPixel = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!slice || !visible || !window.quantumScenes?.fieldSample) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const [minU, minV, maxU, maxV] = visible;
    const u = Math.min(maxU - 1, Math.max(minU, minU + Math.floor((event.clientX - bounds.left) / bounds.width * (maxU - minU))));
    const v = Math.min(maxV - 1, Math.max(minV, minV + Math.floor((1 - (event.clientY - bounds.top) / bounds.height) * (maxV - minV))));
    const request: FieldSampleRequest = { fingerprint, fieldId: field.id, axis, index: safeIndex, quantity: safeQuantity, u, v };
    const current = generation.current;
    setCursorGrid(null);
    void window.quantumScenes.fieldSample(request).then(result => {
      if (generation.current === current) {
        setSample(result);
        scientificCursorBus.publish({ runId, resultSha256, datasetId: field.id,
          spatialPoint: { xyz: result.position, coordinateSystemId }, originViewId: `${fingerprint}:${field.id}:slice` });
      }
    }).catch(cause => { if (generation.current === current) setError(String((cause as Error)?.message ?? cause)); });
  };
  return <section data-testid="quantum-field-slice" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 12,
    alignItems: "center", justifyContent: "center", padding: 18, overflow: "auto", boxSizing: "border-box" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <label>Field <select aria-label="Quantum field" value={field.id} onChange={event => {
        const next = fields.find(entry => entry.id === event.target.value)!;
        setFieldId(next.id); setQuantity(next.kind === "scalar-field" ? "real" : "density");
        setIndex(Math.floor(next.grid.shape[axis] / 2));
      }}>{fields.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label>Quantity <select aria-label="Quantum field quantity" value={safeQuantity} onChange={event => {
        const next = event.target.value as FieldQuantity; setQuantity(next);
        onViewChange?.({ normalAxis: axis, fixedIndex: safeIndex, quantity: next });
      }}>
        {(field.kind === "scalar-field" ? ["real"] : ["density", "amplitude", "real", "imaginary", "phase"]).map(value =>
          <option key={value} value={value}>{value === "density" ? "|ψ|² density (derived)" : value === "amplitude" ? "|ψ| amplitude (derived)" : value === "phase" ? "Phase (derived)" : value === "real" ? "Signed real amplitude" : "Signed imaginary amplitude"}</option>)}</select></label>
      <label>Normal <select aria-label="Quantum slice normal" value={axis} onChange={event => {
        const next = Number(event.target.value) as 0 | 1 | 2;
        const nextIndex = Math.floor(field.grid.shape[next] / 2);
        setAxis(next); setIndex(nextIndex);
        onViewChange?.({ normalAxis: next, fixedIndex: nextIndex, quantity: safeQuantity });
      }}>{axes.map((label, value) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Slice {safeIndex} <input aria-label="Quantum slice index" type="range" min={0} max={field.grid.shape[axis] - 1}
        value={safeIndex} onChange={event => { const next = Number(event.target.value); setIndex(next);
          onViewChange?.({ normalAxis: axis, fixedIndex: next, quantity: safeQuantity }); }} /></label>
      <button type="button" aria-label="Fit to field" aria-pressed={Boolean(viewport)} disabled={!slice?.fitBounds}
        onClick={() => { setFitToField(true); setSample(null); }}>Fit to field</button>
      <button type="button" aria-label="Show full grid" aria-pressed={!viewport} onClick={() => { setFitToField(false); setSample(null); }}>Full grid</button>
    </div>
    <canvas ref={canvas} data-testid="quantum-field-canvas" aria-label="Verified quantum field slice" onClick={selectPixel}
      style={{ width: "min(58vh, 70vw, 480px)", height: "min(58vh, 70vw, 480px)", maxHeight: "70%", objectFit: "contain",
        imageRendering: "pixelated", background: "#0b1728", border: "1px solid #587080", cursor: "crosshair" }} />
    {error ? <p role="alert">{error}</p> : slice ? <div style={{ fontSize: 12, textAlign: "center" }}>
      <span data-testid="quantum-field-legend">{axes[plane[0]]} → · {axes[plane[1]]} ↑ · {slice.range[0].toPrecision(5)} to {slice.range[1].toPrecision(5)} {slice.unit}</span>
      <div>{safeQuantity === "phase" ? "Cyclic hue: −π and +π match; transparent pixels are phase-undefined nodes"
        : safeQuantity === "density" || safeQuantity === "amplitude" ? "Dark → bright: low → high sampled magnitude"
          : "Blue → white → red: negative → zero → positive component"}</div>
      <div>Verified {field.grid.order} grid · {safeQuantity === "density" || safeQuantity === "amplitude" || safeQuantity === "phase" ? "display quantity derived from supplied amplitudes" : "supplied component"}</div>
      {field.kind === "complex-field" && <div>Absolute phase and signed components depend on arbitrary global phase. Phase is undefined at complex nodes.</div>}
      <div data-testid="quantum-field-viewport">{viewport ? `Fit to field: source-grid window u ${viewport[0]}–${viewport[2] - 1}, v ${viewport[1]}–${viewport[3] - 1}` : "Full source grid"} · display-only framing; source coordinates and samples are unchanged. Click to inspect an exact stored grid point.</div>
      <div>Grid {field.grid.shape.join(" × ")} · origin [{field.grid.origin.map(value => value.toPrecision(5)).join(", ")}] · spacing [{field.grid.spacing.map(value => value.toPrecision(5)).join(", ")}]</div>
      {sample && <div data-testid="quantum-field-sample">Grid [{sample.grid.join(", ")}] · {sample.position.map((value, coordinate) =>
        `${axes[coordinate]}=${value.toPrecision(5)} ${units[coordinate]}`).join(" · ")} · {safeQuantity} = {
          sample.undefinedNearNode ? "undefined near a node" : sample.value?.toPrecision(7)} {sample.unit}</div>}
      {cursorStatus && <div data-testid="quantum-spatial-cursor-status" role="status">{cursorStatus}</div>}
    </div> : <div role="status">Preparing verified field slice…</div>}
  </section>;
}
