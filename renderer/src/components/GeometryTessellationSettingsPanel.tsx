import React from "react";
import {
  GEOMETRY_TESSELLATION_PRESETS,
  type GeometryNormalStrategy,
  type GeometryTessellationPreset,
} from "../geometry/geometryMeshRelations";

type Props = {
  value: GeometryTessellationPreset;
  onChange: (value: GeometryTessellationPreset) => void;
};

export function GeometryTessellationSettingsPanel({ value, onChange }: Props) {
  const patch = (next: Partial<GeometryTessellationPreset>) => onChange({ ...value, ...next });
  const number = (key: "chordTolerance" | "angularTolerance" | "maximumEdgeLength" | "parameterDensity" | "weldTolerance", fallback: number) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (Number.isFinite(next) && next > 0) patch({ [key]: key === "parameterDensity" ? Math.round(next) : next } as Partial<GeometryTessellationPreset>);
      else patch({ [key]: fallback } as Partial<GeometryTessellationPreset>);
    };
  return (
    <div data-testid="geometry-tessellation-settings" style={{ border: "1px solid #dbeafe", borderRadius: 7, background: "#f8fbff", padding: 7, display: "grid", gap: 6 }}>
      <label style={{ display: "grid", gap: 3 }}>
        Tessellation preset
        <select value={value.id} onChange={(event) => {
          const preset = GEOMETRY_TESSELLATION_PRESETS.find((entry) => entry.id === event.target.value);
          if (preset) onChange({ ...preset });
        }}>
          {GEOMETRY_TESSELLATION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          {!GEOMETRY_TESSELLATION_PRESETS.some((preset) => preset.id === value.id) && <option value={value.id}>{value.label}</option>}
        </select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <label>Chord tolerance<input type="number" min="0.000001" step="0.001" value={value.chordTolerance} onChange={number("chordTolerance", 0.01)} style={{ width: "100%" }} /></label>
        <label>Angular tolerance<input type="number" min="0.000001" step="0.01" value={value.angularTolerance} onChange={number("angularTolerance", Math.PI / 18)} style={{ width: "100%" }} /></label>
        <label>Maximum edge<input type="number" min="0.000001" step="0.01" value={value.maximumEdgeLength} onChange={number("maximumEdgeLength", 0.25)} style={{ width: "100%" }} /></label>
        <label>Parameter density<input type="number" min="2" step="1" value={value.parameterDensity} onChange={number("parameterDensity", 32)} style={{ width: "100%" }} /></label>
        <label>Normal strategy<select value={value.normalStrategy} onChange={(event) => patch({ normalStrategy: event.target.value as GeometryNormalStrategy })} style={{ width: "100%" }}><option value="analytic">Analytic</option><option value="angle-weighted">Angle weighted</option><option value="area-weighted">Area weighted</option><option value="face">Face normals</option></select></label>
        <label>Weld tolerance<input type="number" min="0.000000001" step="0.000001" value={value.weldTolerance} disabled={!value.welding} onChange={number("weldTolerance", 1e-6)} style={{ width: "100%" }} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label><input type="checkbox" checked={value.welding} onChange={(event) => patch({ welding: event.target.checked })} /> Weld vertices</label>
        <label><input type="checkbox" checked={value.preserveBoundaries} onChange={(event) => patch({ preserveBoundaries: event.target.checked })} /> Preserve boundaries</label>
      </div>
    </div>
  );
}
