import React from "react";

import type { VolumeSliceReport } from "../scene/volume/sliceVolume";

type Props = {
  stats: VolumeSliceReport | null;
  width?: number;
  height?: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const VolumeSliceHistogram: React.FC<Props> = ({ stats, width = 180, height = 70 }) => {
  if (!stats) return null;
  const counts = stats.histogram;
  if (!counts || counts.length === 0) return null;
  const maxCount = Math.max(1, ...Array.from(counts));
  const bins = counts.length;
  const span = stats.histMax - stats.histMin;

  const toX = (i: number) => (bins > 1 ? (i / (bins - 1)) * width : 0);
  const toY = (c: number) => height - (c / maxCount) * height;

  let d = `M 0 ${height}`;
  for (let i = 0; i < bins; i++) {
    const x = toX(i);
    const y = toY(counts[i]);
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  d += ` L ${width} ${height} Z`;

  const windowLow = stats.window.low;
  const windowHigh = stats.window.high;
  const lowT = span > 1e-12 ? clamp01((windowLow - stats.histMin) / span) : 0;
  const highT = span > 1e-12 ? clamp01((windowHigh - stats.histMin) / span) : 1;
  const lowX = lowT * width;
  const highX = highT * width;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} fill="#f5f7fa" stroke="#e1e5ec" />
      <path d={d} fill="#9fb3d1" stroke="#4a5e7a" strokeWidth={1} opacity={0.9} />
      <line x1={lowX} y1={0} x2={lowX} y2={height} stroke="#e1563b" strokeWidth={1} />
      <line x1={highX} y1={0} x2={highX} y2={height} stroke="#e1563b" strokeWidth={1} />
    </svg>
  );
};
