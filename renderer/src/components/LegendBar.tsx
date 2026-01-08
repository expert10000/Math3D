// src/components/LegendBar.tsx
import React from "react";
import type { PaletteId, ValueRange } from "../math/colorMaps";
import { colorFromPalette } from "../math/colorMaps";

function cssColor(palette: PaletteId, v: number, range: ValueRange) {
  const col = colorFromPalette(palette, v, range);
  const r = Math.round(col.r * 255);
  const g = Math.round(col.g * 255);
  const b = Math.round(col.b * 255);
  return `rgb(${r},${g},${b})`;
}

export function LegendBar(props: {
  palette: PaletteId;
  range: ValueRange;
  label?: string;
  currentValue?: number | null; // optional probe readout
}) {
  const { palette, range, label = "curvature", currentValue } = props;

  const stops = 9;
  const gradStops = Array.from({ length: stops }, (_, i) => {
    const t = i / (stops - 1);
    const v = range.min + (range.max - range.min) * t;
    return `${cssColor(palette, v, range)} ${Math.round(t * 100)}%`;
  }).join(", ");

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.9 }}>
        <span>{label}</span>
        <span>
          {currentValue == null ? "" : `value: ${currentValue.toPrecision(4)}`}
        </span>
      </div>

      <div
        style={{
          height: 14,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.18)",
          background: `linear-gradient(to right, ${gradStops})`,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
        <span>{range.min.toPrecision(4)}</span>
        <span>{range.max.toPrecision(4)}</span>
      </div>
    </div>
  );
}
