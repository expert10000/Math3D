import { useEffect, useMemo, useRef, useState } from "react";
import type { GeometryScene } from "../geometry/types";
import { GeometryViewer } from "./GeometryViewer";
import type { QuantumField } from "./QuantumFieldSlice";

export type FieldSurfaceRequest = { fingerprint: string; fieldId: string; level: 0.01 | 0.05 | 0.1 | 0.2 };
export type FieldSurface = { fieldId: string; level: number; threshold: number; maximum: number;
  unit: string; coordinateUnits: [string, string, string]; sampledShape: [number, number, number];
  positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangleCount: number;
  phaseBins: Uint8Array; realSignBins: Uint8Array };
type Vector3 = { x: number; y: number; z: number };
const EMPTY_SCENE: GeometryScene = { points: [], segments: [], triangles: [] };
const PHASE_COLORS = [0xef4444, 0xdb3ad5, 0x8b5cf6, 0x3b82f6, 0x06b6d4, 0x22c55e, 0xeab308, 0xf97316, 0x94a3b8];
const SIGN_COLORS = [0x3b82f6, 0xf59e0b, 0x94a3b8];
type SurfaceColor = "density" | "phase" | "real-sign";

export function QuantumFieldSurface({ fingerprint, resultSha256, fields, camera }: {
  fingerprint: string; resultSha256: string; fields: QuantumField[];
  camera: { position: Vector3; target: Vector3; up: Vector3 } | undefined;
}) {
  const available = fields.filter(field => field.kind === "complex-field");
  const [fieldId, setFieldId] = useState(available[0]?.id ?? "");
  const field = available.find(entry => entry.id === fieldId) ?? available[0];
  const [level, setLevel] = useState<FieldSurfaceRequest["level"]>(0.1);
  const [color, setColor] = useState<SurfaceColor>("density");
  const [surface, setSurface] = useState<FieldSurface | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setSurface(null); setError("");
    if (!field || !window.quantumScenes?.fieldSurface) return;
    void window.quantumScenes.fieldSurface({ fingerprint, fieldId: field.id, level }).then(result => {
      if (generation.current === current) setSurface(result);
    }).catch(cause => {
      if (generation.current === current) setError(String((cause as Error)?.message ?? cause));
    });
    return () => { generation.current += 1; };
  }, [fingerprint, field?.id, level]);
  const mesh = useMemo(() => {
    if (!surface) return [];
    const source = { kind: "quantumSceneField" as const, fieldId: surface.fieldId, level: surface.level, resultSha256 };
    if (color === "density") return [{ id: `quantum:${surface.fieldId}:density`,
      label: `${field?.label ?? surface.fieldId} density`, positions: surface.positions,
      normals: surface.normals, indices: surface.indices, source,
      color: 0x53b9d0, opacity: 0.82, flatShading: true }];
    const bins = color === "phase" ? surface.phaseBins : surface.realSignBins;
    const palette = color === "phase" ? PHASE_COLORS : SIGN_COLORS;
    const positions = Array.from({ length: palette.length }, () => [] as number[]);
    const normals = Array.from({ length: palette.length }, () => [] as number[]);
    for (let triangle = 0; triangle < surface.triangleCount; triangle++) {
      const bin = bins[triangle];
      if (bin >= palette.length) continue;
      for (let offset = triangle * 9; offset < triangle * 9 + 9; offset++) {
        positions[bin].push(surface.positions[offset]);
        normals[bin].push(surface.normals[offset]);
      }
    }
    return positions.flatMap((values, bin) => values.length ? [{
      id: `quantum:${surface.fieldId}:${color}:${bin}`, label: `${field?.label ?? surface.fieldId} ${color} ${bin}`,
      positions: Float32Array.from(values), normals: Float32Array.from(normals[bin]), indices: null,
      source, color: palette[bin], opacity: 0.9, flatShading: true,
    }] : []);
  }, [surface, field?.label, resultSha256, color]);
  if (!field) return <p>No complex field is available for a density surface.</p>;
  return <section data-testid="quantum-field-surface" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
    <div style={{ padding: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Field <select aria-label="Quantum surface field" value={field.id} onChange={event => setFieldId(event.target.value)}>
        {available.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label>
      <label>Density threshold <select aria-label="Quantum surface threshold" value={level}
        onChange={event => setLevel(Number(event.target.value) as FieldSurfaceRequest["level"])}>
        <option value={0.01}>1% of sampled maximum</option><option value={0.05}>5% of sampled maximum</option><option value={0.1}>10% of sampled maximum</option>
        <option value={0.2}>20% of sampled maximum</option>
      </select></label>
      <label>Color <select aria-label="Quantum surface color" value={color}
        onChange={event => setColor(event.target.value as SurfaceColor)}>
        <option value="density">Density surface</option><option value="phase">Complex phase</option>
        <option value="real-sign">Sign of Re ψ</option>
      </select></label>
    </div>
    <div style={{ minHeight: 0, flex: 1 }}>
      {surface?.triangleCount ? <GeometryViewer scene={EMPTY_SCENE} meshOverrides={mesh} showPlanes={false}
        cameraOverride={camera ?? null} /> : <div style={{ padding: 16 }} role="status">
        {error || (surface ? "No surface crosses this threshold in the supplied grid." : "Deriving bounded surface from verified amplitudes…")}
      </div>}
    </div>
    {surface && <div data-testid="quantum-surface-legend" style={{ padding: 8, fontSize: 12 }}>
      Derived |ψ|² isosurface · {surface.triangleCount.toLocaleString()} triangles · threshold {surface.threshold.toPrecision(5)} {surface.unit}
      {" · "}{(surface.level * 100).toFixed(0)}% of sampled maximum · extraction grid {surface.sampledShape.join(" × ")}
      {" · "}coordinates {surface.coordinateUnits.join(", ")}. {color === "density" ? "Uniform color: geometry is a density threshold, not a signed amplitude." :
        color === "phase" ? "Colors bin arg ψ from interpolated supplied amplitudes; grey means undefined near a node. −π and +π join cyclically." :
          "Blue: Re ψ < 0; amber: Re ψ > 0; grey: Re ψ near zero. This is a component sign, not probability density sign."}
      {color !== "density" && <div data-testid="quantum-surface-color-counts">
        {new Set(color === "phase" ? surface.phaseBins : surface.realSignBins).size} {color === "phase" ? "phase" : "real-sign"} color bins present on this surface.
      </div>}
      {color !== "density" && <div data-testid="quantum-surface-colors" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {(color === "phase" ? PHASE_COLORS : SIGN_COLORS).map((value, bin) => <span key={bin}
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 12, height: 12, background: `#${value.toString(16).padStart(6, "0")}`, display: "inline-block" }} />
          {color === "phase" ? bin === 8 ? "undefined" : `${-180 + bin * 45}°` : ["negative", "positive", "near zero"][bin]}
        </span>)}
      </div>}
    </div>}
  </section>;
}
