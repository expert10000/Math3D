import { useEffect, useMemo, useRef, useState } from "react";
import { VolumeViewer } from "./VolumeViewer";
import type { QuantumField } from "./QuantumFieldSlice";
import { adaptQuantumFieldVolume, type QuantumFieldVolume as VolumeArtifact } from "../volume/quantumFieldVolumeAdapter";
import { fitVisibleQuantumField } from "../volume/quantumFieldFit";

export function QuantumFieldVolume({ fingerprint, fields }: { fingerprint: string; fields: QuantumField[] }) {
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const field = fields.find(candidate => candidate.id === fieldId) ?? fields[0];
  const [quantity, setQuantity] = useState<VolumeArtifact["quantity"]>(field?.kind === "scalar-field" ? "real" : "density");
  const safeQuantity = field?.kind === "scalar-field" ? "real" : quantity;
  const [artifact, setArtifact] = useState<VolumeArtifact | null>(null);
  const [error, setError] = useState("");
  const [axis, setAxis] = useState<"x" | "y" | "z">("z");
  const [index, setIndex] = useState(() => Math.floor((fields[0]?.grid.shape[2] ?? 1) / 2));
  const [mode, setMode] = useState<"slice" | "isosurface">("slice");
  const [level, setLevel] = useState(0.1);
  const [fitCommand, setFitCommand] = useState<{ token: number; kind: "fit-volume" | "fit-mesh" | "fit-crop" } | null>(null);
  const generation = useRef(0);
  const maximumIndex = field ? field.grid.shape[{ x: 0, y: 1, z: 2 }[axis]] - 1 : 0;
  const safeIndex = Math.min(index, maximumIndex);
  const safeMode = safeQuantity === "phase" ? "slice" : mode;
  useEffect(() => {
    const current = ++generation.current;
    setArtifact(null); setError("");
    if (!field) return;
    const request = { fingerprint, fieldId: field.id, quantity: safeQuantity, requestId: crypto.randomUUID() };
    void window.quantumScenes!.fieldVolume(request).then(result => {
      if (current === generation.current) setArtifact(result);
    }).catch(cause => { if (current === generation.current) setError(String((cause as Error)?.message ?? cause)); });
    return () => { generation.current++; void window.quantumScenes?.cancelFieldVolume(request.requestId); };
  }, [fingerprint, field?.id, safeQuantity, axis, safeIndex, safeMode, level]);
  const adapted = useMemo(() => artifact ? adaptQuantumFieldVolume(artifact) : null, [artifact]);
  const visibleFit = useMemo(() => artifact && safeMode === "slice"
    ? fitVisibleQuantumField(artifact, { x: 0, y: 1, z: 2 }[axis] as 0 | 1 | 2, safeIndex) : null,
  [artifact, axis, safeIndex, safeMode]);
  const range = useMemo(() => {
    if (!artifact) return [0, 0] as const;
    let min = Infinity, max = -Infinity;
    for (const value of artifact.values) { min = Math.min(min, value); max = Math.max(max, value); }
    return [min, max] as const;
  }, [artifact]);
  const isoValue = range[0] + level * (range[1] - range[0]);
  if (!field) return <p>No verified grid is available.</p>;
  return <section data-testid="quantum-field-volume" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
    <div style={{ padding: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <label>Field <select aria-label="Volume field" value={field.id} onChange={event => {
        const next = fields.find(candidate => candidate.id === event.target.value)!;
        setFieldId(next.id); setQuantity(next.kind === "scalar-field" ? "real" : "density"); setMode("slice");
        setFitCommand(null);
        setIndex(Math.floor(next.grid.shape[{ x: 0, y: 1, z: 2 }[axis]] / 2));
      }}>{fields.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label>
      <label>Quantity <select aria-label="Volume quantity" value={safeQuantity} onChange={event => {
        setQuantity(event.target.value as VolumeArtifact["quantity"]); setMode("slice"); setFitCommand(null);
      }}>
        {(field.kind === "scalar-field" ? ["real"] : ["density", "real", "imaginary", "phase"]).map(candidate =>
          <option key={candidate} value={candidate}>{candidate === "density" ? "|ψ|²" : candidate}</option>)}</select></label>
      <label>View <select aria-label="Volume view" value={safeMode} onChange={event => {
        setMode(event.target.value as typeof mode); setFitCommand(null);
      }}>
        <option value="slice">Slice</option>{safeQuantity !== "phase" && <option value="isosurface">Isosurface</option>}</select></label>
      {safeMode === "slice" ? <>
        <label>Normal <select aria-label="Volume normal" value={axis} onChange={event => {
          const next = event.target.value as typeof axis; setAxis(next); setIndex(Math.floor((artifact?.shape[{ x: 0, y: 1, z: 2 }[next]] ?? 1) / 2));
        }}><option>x</option><option>y</option><option>z</option></select></label>
        <label>Slice <input aria-label="Volume slice" type="range" min={0} max={maximumIndex} value={safeIndex}
          onChange={event => setIndex(Number(event.target.value))} />{safeIndex}/{maximumIndex}</label>
      </> : <label>Threshold <select aria-label="Volume threshold" value={level} onChange={event => setLevel(Number(event.target.value))}>
        <option value={0.05}>5% of range</option><option value={0.1}>10% of range</option>
        <option value={0.2}>20% of range</option><option value={0.5}>50% of range</option>
      </select></label>}
      {safeMode === "slice" && <button type="button" aria-label="Fit visible field" disabled={!visibleFit}
        onClick={() => setFitCommand(previous => ({ token: (previous?.token ?? 0) + 1, kind: "fit-crop" }))}>
        Fit visible field
      </button>}
      <button type="button" aria-label={safeMode === "isosurface" ? "Fit volume isosurface" : "Fit volume grid"}
        disabled={!adapted} onClick={() => setFitCommand(previous => ({ token: (previous?.token ?? 0) + 1,
          kind: safeMode === "isosurface" ? "fit-mesh" : "fit-volume" }))}>
        {safeMode === "isosurface" ? "Fit isosurface" : "Fit grid"}
      </button>
    </div>
    <p style={{ margin: "0 8px 6px", fontSize: 12 }}>Volume uses the complete verified grid in source coordinates. Fit visible field frames the signal on this slice; Fit grid restores full context. Neither changes samples or units. An isosurface is a derived threshold.</p>
    <div style={{ minHeight: 0, flex: 1 }}>{adapted ? <VolumeViewer key={adapted.document.identity.id} dataset={adapted.dataset}
      axis={axis} index={safeIndex} opacity={0.9} renderMode={safeMode} showIsosurface={safeMode === "isosurface"}
      isoValue={isoValue} showPrimarySlice={safeMode === "slice"} cameraCommand={fitCommand ?? undefined}
      cropCenter={fitCommand?.kind === "fit-crop" ? visibleFit?.center : undefined}
      cropExtents={fitCommand?.kind === "fit-crop" ? visibleFit?.extents : undefined}
      autoFitIsosurface={fitCommand?.kind !== "fit-crop"} /> : <p role="status" style={{ padding: 16 }}>
      {error || "Converting verified grid for Math3D Volume…"}</p>}</div>
    {artifact && <div data-testid="quantum-volume-source" style={{ padding: 8, fontSize: 12 }}>
      Read-only Volume source {adapted?.document.identity.id} · {artifact.shape.join(" × ")} point grid · {artifact.layout} · {artifact.valueUnit}
      {safeMode === "isosurface" ? ` · threshold ${isoValue.toPrecision(5)} ${artifact.valueUnit}` : ""}<br />
      Coordinates {artifact.axes.map((name, i) => `${name}: ${artifact.coordinateUnits[i]}`).join(", ")} · source encoding {artifact.encoding}.
      {safeMode === "slice" && <><br /><span data-testid="quantum-volume-fit-details">{visibleFit
        ? `Visible-field framing: ${artifact.quantity === "density" ? "1% of the selected plane's maximum density" : "10% of the selected plane's maximum component magnitude"}; source-grid window u ${visibleFit.gridBounds[0]}–${visibleFit.gridBounds[2] - 1}, v ${visibleFit.gridBounds[1]}–${visibleFit.gridBounds[3] - 1}. Camera only; the full grid remains available.`
        : artifact.quantity === "phase" ? "Visible-field fit is unavailable for phase because phase alone does not measure amplitude; choose density or a component." : "No nonzero signal on this slice; use Fit grid."}</span></>}
      {artifact.quantity === "phase" && <> {artifact.undefinedNodeCount} near-zero nodes have undefined phase; the Volume slice uses a zero display placeholder and a separate node mask. Phase is not offered as an isosurface because that placeholder and the ±π wrap would produce misleading geometry.</>}
      <br />Derived float32 samples are transient; the compact source document records the verified dataset hashes, not grid samples.
    </div>}
  </section>;
}
