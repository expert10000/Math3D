import React from "react";
import type { CurveScalarPlotDomain, CurveScalarPlotRow } from "../curveAnalysis/scalarPlots";

export type CurveScalarPlotsProps = {
  rows: CurveScalarPlotRow[];
  domain: CurveScalarPlotDomain;
  activeParameter: number;
  onSelect: (normalizedParameter: number) => void;
};

const WIDTH = 300;
const HEIGHT = 78;
const PAD = 10;

export const CurveScalarPlots: React.FC<CurveScalarPlotsProps> = ({ rows, domain, activeParameter, onSelect }) => (
  <div data-testid="curve-scalar-plots" style={{ display: "grid", gap: 7 }}>
    {rows.map((row) => {
      const finite = row.values.filter((entry): entry is typeof entry & { value: number } => entry.value != null && Number.isFinite(entry.value));
      if (!finite.length) return (
        <div key={row.key} style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: 7, fontSize: 10 }}>
          <strong>{row.label}</strong> · unavailable for this representation
        </div>
      );
      const xMin = Math.min(...finite.map((entry) => entry.x));
      const xMax = Math.max(...finite.map((entry) => entry.x));
      const yMinRaw = Math.min(...finite.map((entry) => entry.value));
      const yMaxRaw = Math.max(...finite.map((entry) => entry.value));
      const yPad = Math.max(1e-9, (yMaxRaw - yMinRaw) * 0.08);
      const yMin = yMinRaw - yPad;
      const yMax = yMaxRaw + yPad;
      const x = (value: number) => PAD + (WIDTH - PAD * 2) * (value - xMin) / Math.max(1e-12, xMax - xMin);
      const y = (value: number) => HEIGHT - PAD - (HEIGHT - PAD * 2) * (value - yMin) / Math.max(1e-12, yMax - yMin);
      const path = finite.map((entry, index) => `${index ? "L" : "M"}${x(entry.x).toFixed(2)},${y(entry.value).toFixed(2)}`).join(" ");
      const selected = finite.reduce((best, entry) => Math.abs(entry.u - activeParameter) < Math.abs(best.u - activeParameter) ? entry : best);
      return (
        <div key={row.key} data-testid={`curve-plot-${row.key}`} style={{ border: "1px solid #d6deea", borderRadius: 7, padding: 7, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
            <strong>{row.label}</strong><span>{row.unit}</span>
          </div>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ display: "block", width: "100%", height: 78, cursor: "crosshair" }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const viewX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * WIDTH;
              const picked = finite.reduce((best, entry) => Math.abs(x(entry.x) - viewX) < Math.abs(x(best.x) - viewX) ? entry : best);
              onSelect(picked.u);
            }}
            aria-label={`${row.label} against ${domain === "parameter" ? "parameter" : "normalized arc length"}`}
          >
            <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#cbd5e1" />
            <path d={path} fill="none" stroke="#2563eb" strokeWidth="1.8" />
            <line x1={x(selected.x)} y1={PAD} x2={x(selected.x)} y2={HEIGHT - PAD} stroke="#f59e0b" strokeDasharray="3 2" />
            <circle cx={x(selected.x)} cy={y(selected.value)} r="3" fill="#f59e0b" />
          </svg>
          <div style={{ fontSize: 9, color: "#64748b" }}>selected {selected.value.toPrecision(5)} · click plot to move probe</div>
        </div>
      );
    })}
  </div>
);
