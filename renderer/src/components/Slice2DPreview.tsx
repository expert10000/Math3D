// src/components/Slice2DPreview.tsx
import React from "react";

type SlicePoint = { s: number; t: number };
type SlicePolyline = SlicePoint[];

type Props = {
  enabled: boolean;
  planeSize: number;
  polylines: SlicePolyline[];
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const Slice2DPreview: React.FC<Props> = ({ enabled, planeSize, polylines }) => {
  if (!enabled) return null;

  const size = 150;
  const pad = 12;
  const plot = size - pad * 2;
  const half = Math.max(1e-6, Math.abs(planeSize));

  const toSvg = (p: SlicePoint) => {
    const nx = (p.s + half) / (2 * half);
    const ny = (p.t + half) / (2 * half);
    const x = pad + clamp(nx, 0, 1) * plot;
    const y = pad + (1 - clamp(ny, 0, 1)) * plot;
    return { x, y };
  };

  const pathFor = (line: SlicePolyline) => {
    if (line.length === 0) return "";
    const pts = line.map(toSvg);
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    }
    return d;
  };

  const center = pad + plot * 0.5;

  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 8,
        border: "1px solid #d9dee6",
        background: "#ffffff",
        padding: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Slice preview (s,t)</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect x={pad} y={pad} width={plot} height={plot} fill="#fafbfc" stroke="#e6e9ef" />
        <line x1={center} y1={pad} x2={center} y2={pad + plot} stroke="#c6ccd6" strokeWidth={1} />
        <line x1={pad} y1={center} x2={pad + plot} y2={center} stroke="#c6ccd6" strokeWidth={1} />
        {polylines.map((line, i) => (
          <path key={i} d={pathFor(line)} fill="none" stroke="#1f3556" strokeWidth={1.4} />
        ))}
        <text x={pad + plot - 4} y={center - 4} fontSize={10} textAnchor="end" fill="#64748b">
          s
        </text>
        <text x={center + 4} y={pad + 10} fontSize={10} fill="#64748b">
          t
        </text>
      </svg>
    </div>
  );
};
