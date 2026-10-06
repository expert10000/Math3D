import { useEffect, useMemo, useRef, useState } from "react";
import type { GeometryScene } from "../geometry/types";
import { GeometryViewer } from "./GeometryViewer";
import type { QuantumField } from "./QuantumFieldSlice";

export type FieldSurfaceRequest = { fingerprint: string; fieldId: string; level: 0.05 | 0.1 | 0.2 };
export type FieldSurface = { fieldId: string; level: number; threshold: number; maximum: number;
  unit: string; coordinateUnits: [string, string, string]; sampledShape: [number, number, number];
  positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangleCount: number };
type Vector3 = { x: number; y: number; z: number };
const EMPTY_SCENE: GeometryScene = { points: [], segments: [], triangles: [] };

export function QuantumFieldSurface({ fingerprint, resultSha256, fields, camera }: {
  fingerprint: string; resultSha256: string; fields: QuantumField[];
  camera: { position: Vector3; target: Vector3; up: Vector3 } | undefined;
}) {
  const available = fields.filter(field => field.kind === "complex-field");
  const [fieldId, setFieldId] = useState(available[0]?.id ?? "");
  const field = available.find(entry => entry.id === fieldId) ?? available[0];
  const [level, setLevel] = useState<FieldSurfaceRequest["level"]>(0.1);
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
  const mesh = useMemo(() => surface ? [{
    id: `quantum:${surface.fieldId}:density`, label: `${field?.label ?? surface.fieldId} density`,
    positions: surface.positions, normals: surface.normals, indices: surface.indices,
    source: { kind: "quantumSceneField" as const, fieldId: surface.fieldId, level: surface.level, resultSha256 },
    color: 0x53b9d0, opacity: 0.82, flatShading: true,
  }] : [], [surface, field?.label, resultSha256]);
  if (!field) return <p>No complex field is available for a density surface.</p>;
  return <section data-testid="quantum-field-surface" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
    <div style={{ padding: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Field <select aria-label="Quantum surface field" value={field.id} onChange={event => setFieldId(event.target.value)}>
        {available.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select></label>
      <label>Density threshold <select aria-label="Quantum surface threshold" value={level}
        onChange={event => setLevel(Number(event.target.value) as FieldSurfaceRequest["level"])}>
        <option value={0.05}>5% of sampled maximum</option><option value={0.1}>10% of sampled maximum</option>
        <option value={0.2}>20% of sampled maximum</option>
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
      {" · "}coordinates {surface.coordinateUnits.join(", ")}. No phase or lobe-sign coloring is claimed.
    </div>}
  </section>;
}
