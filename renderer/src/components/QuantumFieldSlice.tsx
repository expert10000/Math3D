import { useEffect, useRef, useState, type MouseEvent } from "react";

export type FieldQuantity = "density" | "real" | "imaginary" | "phase";
export type FieldSliceRequest = { fingerprint: string; fieldId: string; axis: 0 | 1 | 2; index: number; quantity: FieldQuantity };
export type FieldSampleRequest = FieldSliceRequest & { u: number; v: number };
export type FieldSlice = FieldSliceRequest & { width: number; height: number; rgba: Uint8Array;
  range: [number, number]; unit: string; planeAxes: [number, number] };
export type FieldSample = { grid: [number, number, number]; position: [number, number, number];
  value: number | null; unit: string; undefinedNearNode: boolean };
export type QuantumField = { id: string; label: string; kind: "scalar-field" | "complex-field";
  grid: { shape: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number]; order: "xyz-z-fastest" } };

export function QuantumFieldSlice({ fingerprint, fields, axes, units }: {
  fingerprint: string; fields: QuantumField[]; axes: [string, string, string]; units: [string, string, string];
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const field = fields.find(entry => entry.id === fieldId) ?? fields[0];
  const [axis, setAxis] = useState<0 | 1 | 2>(2);
  const [index, setIndex] = useState(() => Math.floor((fields[0]?.grid.shape[2] ?? 1) / 2));
  const [quantity, setQuantity] = useState<FieldQuantity>(field?.kind === "scalar-field" ? "real" : "density");
  const [slice, setSlice] = useState<Omit<FieldSlice, "rgba"> | null>(null);
  const [sample, setSample] = useState<FieldSample | null>(null);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const generation = useRef(0);
  const safeIndex = field ? Math.min(index, field.grid.shape[axis] - 1) : 0;
  const safeQuantity = field?.kind === "scalar-field" ? "real" : quantity;

  useEffect(() => {
    const current = ++generation.current;
    setSlice(null); setSample(null); setError("");
    if (!field || !window.quantumScenes?.fieldSlice) return;
    const request: FieldSliceRequest = { fingerprint, fieldId: field.id, axis, index: safeIndex, quantity: safeQuantity };
    void window.quantumScenes.fieldSlice(request).then(result => {
      if (generation.current !== current) return;
      const target = canvas.current;
      if (!target || result.rgba.length !== result.width * result.height * 4) throw new Error("Invalid bounded field image");
      target.width = result.width; target.height = result.height;
      const context = target.getContext("2d");
      if (!context) throw new Error("Field slice canvas unavailable");
      const image = context.createImageData(result.width, result.height);
      image.data.set(result.rgba);
      context.putImageData(image, 0, 0);
      const { rgba: _pixels, ...metadata } = result;
      setSlice(metadata);
    }).catch(cause => { if (generation.current === current) setError(String((cause as Error)?.message ?? cause)); });
    return () => { generation.current += 1; };
  }, [fingerprint, field?.id, axis, safeIndex, safeQuantity]);

  if (!field) return <p>No field in this verified scene.</p>;
  const plane = [0, 1, 2].filter(candidate => candidate !== axis);
  const selectPixel = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!slice || !window.quantumScenes?.fieldSample) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const u = Math.min(slice.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * slice.width)));
    const v = Math.min(slice.height - 1, Math.max(0, Math.floor((1 - (event.clientY - bounds.top) / bounds.height) * slice.height)));
    const request: FieldSampleRequest = { fingerprint, fieldId: field.id, axis, index: safeIndex, quantity: safeQuantity, u, v };
    const current = generation.current;
    void window.quantumScenes.fieldSample(request).then(result => {
      if (generation.current === current) setSample(result);
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
      <label>Quantity <select aria-label="Quantum field quantity" value={safeQuantity} onChange={event => setQuantity(event.target.value as FieldQuantity)}>
        {(field.kind === "scalar-field" ? ["real"] : ["density", "real", "imaginary", "phase"]).map(value =>
          <option key={value} value={value}>{value === "density" ? "|ψ|² density (derived)" : value === "phase" ? "Phase (derived)" : value}</option>)}</select></label>
      <label>Normal <select aria-label="Quantum slice normal" value={axis} onChange={event => {
        const next = Number(event.target.value) as 0 | 1 | 2; setAxis(next); setIndex(Math.floor(field.grid.shape[next] / 2));
      }}>{axes.map((label, value) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Slice {safeIndex} <input aria-label="Quantum slice index" type="range" min={0} max={field.grid.shape[axis] - 1}
        value={safeIndex} onChange={event => setIndex(Number(event.target.value))} /></label>
    </div>
    <canvas ref={canvas} data-testid="quantum-field-canvas" aria-label="Verified quantum field slice" onClick={selectPixel}
      style={{ width: "min(58vh, 70vw, 480px)", height: "min(58vh, 70vw, 480px)", maxHeight: "70%", objectFit: "contain",
        imageRendering: "pixelated", background: "#0b1728", border: "1px solid #587080", cursor: "crosshair" }} />
    {error ? <p role="alert">{error}</p> : slice ? <div style={{ fontSize: 12, textAlign: "center" }}>
      <span data-testid="quantum-field-legend">{axes[plane[0]]} → · {axes[plane[1]]} ↑ · {slice.range[0].toPrecision(5)} to {slice.range[1].toPrecision(5)} {slice.unit}</span>
      <div>{safeQuantity === "phase" ? "Cyclic hue: −π and +π match; transparent pixels are phase-undefined nodes"
        : safeQuantity === "density" ? "Dark → bright: low → high sampled density"
          : "Blue → white → red: negative → zero → positive component"}</div>
      <div>Verified {field.grid.order} grid · {safeQuantity === "density" || safeQuantity === "phase" ? "display quantity derived from supplied amplitudes" : "supplied component"}</div>
      <div>Grid {field.grid.shape.join(" × ")} · origin [{field.grid.origin.map(value => value.toPrecision(5)).join(", ")}] · spacing [{field.grid.spacing.map(value => value.toPrecision(5)).join(", ")}]</div>
      {sample && <div data-testid="quantum-field-sample">Grid [{sample.grid.join(", ")}] · {sample.position.map((value, coordinate) =>
        `${axes[coordinate]}=${value.toPrecision(5)} ${units[coordinate]}`).join(" · ")} · {safeQuantity} = {
          sample.undefinedNearNode ? "undefined near a node" : sample.value?.toPrecision(7)} {sample.unit}</div>}
    </div> : <div role="status">Preparing verified field slice…</div>}
  </section>;
}
