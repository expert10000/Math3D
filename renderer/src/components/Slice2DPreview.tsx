// src/components/Slice2DPreview.tsx
import React, { useRef, useState } from "react";

type SlicePoint = { s: number; t: number };
type SlicePolyline = SlicePoint[];

type Props = {
  enabled: boolean;
  planeSize: number;
  polylines: SlicePolyline[];
  onHover?: (pt: SlicePoint | null) => void;
  onClickST?: (pt: SlicePoint) => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

type SliceSvgOptions = {
  polylines: SlicePolyline[];
  planeSize: number;
  width?: number;
  height?: number;
  pad?: number;
};

export function buildSliceSvgString(opts: SliceSvgOptions): string {
  const width = Math.max(1, Math.floor(opts.width ?? 150));
  const height = Math.max(1, Math.floor(opts.height ?? 150));
  const pad = Math.max(0, Math.floor(opts.pad ?? 12));
  const plotW = Math.max(1, width - pad * 2);
  const plotH = Math.max(1, height - pad * 2);
  const half = Math.max(1e-6, Math.abs(opts.planeSize));

  const toSvg = (p: SlicePoint) => {
    const nx = (p.s + half) / (2 * half);
    const ny = (p.t + half) / (2 * half);
    const x = pad + clamp(nx, 0, 1) * plotW;
    const y = pad + (1 - clamp(ny, 0, 1)) * plotH;
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

  const centerX = pad + plotW * 0.5;
  const centerY = pad + plotH * 0.5;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  lines.push(`  <rect x="${pad}" y="${pad}" width="${plotW}" height="${plotH}" fill="#fafbfc" stroke="#e6e9ef" />`);
  lines.push(`  <line x1="${centerX.toFixed(2)}" y1="${pad}" x2="${centerX.toFixed(2)}" y2="${pad + plotH}" stroke="#c6ccd6" stroke-width="1" />`);
  lines.push(`  <line x1="${pad}" y1="${centerY.toFixed(2)}" x2="${pad + plotW}" y2="${centerY.toFixed(2)}" stroke="#c6ccd6" stroke-width="1" />`);
  for (const line of opts.polylines) {
    if (line.length < 2) continue;
    const d = pathFor(line);
    if (!d) continue;
    lines.push(`  <path d="${d}" fill="none" stroke="#1f3556" stroke-width="1.4" />`);
  }
  lines.push(`  <text x="${(pad + plotW - 4).toFixed(2)}" y="${(centerY - 4).toFixed(2)}" font-size="10" text-anchor="end" fill="#64748b">s</text>`);
  lines.push(`  <text x="${(centerX + 4).toFixed(2)}" y="${(pad + 10).toFixed(2)}" font-size="10" fill="#64748b">t</text>`);
  lines.push(`</svg>`);

  return lines.join("\n");
}

export const Slice2DPreview: React.FC<Props> = ({ enabled, planeSize, polylines, onHover, onClickST }) => {
  if (!enabled) return null;

  const size = 150;
  const pad = 12;
  const plot = size - pad * 2;
  const half = Math.max(1e-6, Math.abs(planeSize));
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverPt, setHoverPt] = useState<SlicePoint | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef<SlicePoint | null>(null);

  const toSvg = (p: SlicePoint) => {
    const nx = (p.s + half) / (2 * half);
    const ny = (p.t + half) / (2 * half);
    const x = pad + clamp(nx, 0, 1) * plot;
    const y = pad + (1 - clamp(ny, 0, 1)) * plot;
    return { x, y };
  };

  const toST = (clientX: number, clientY: number): SlicePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < pad || x > pad + plot || y < pad || y > pad + plot) return null;
    const nx = (x - pad) / plot;
    const ny = 1 - (y - pad) / plot;
    const s = nx * 2 * half - half;
    const t = ny * 2 * half - half;
    return { s, t };
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
  const hoverSvg = hoverPt ? toSvg(hoverPt) : null;
  const eps = Math.max(1e-4, half * 0.003);

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
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onMouseMove={(e) => {
          pendingRef.current = { x: e.clientX, y: e.clientY };
          if (rafRef.current !== null) return;
          rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            const pending = pendingRef.current;
            if (!pending) return;
            const pt = toST(pending.x, pending.y);
            setHoverPt(pt);
            if (onHover) {
              const last = lastEmitRef.current;
              const dx = last && pt ? Math.abs(pt.s - last.s) : Infinity;
              const dy = last && pt ? Math.abs(pt.t - last.t) : Infinity;
              if (!pt || !last || dx > eps || dy > eps) {
                onHover(pt);
                lastEmitRef.current = pt;
              }
            }
          });
        }}
        onMouseLeave={() => {
          setHoverPt(null);
          pendingRef.current = null;
          if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          if (onHover) onHover(null);
        }}
        onClick={(e) => {
          const pt = toST(e.clientX, e.clientY);
          if (pt && onClickST) onClickST(pt);
        }}
        style={{ cursor: "crosshair" }}
      >
        <rect x={pad} y={pad} width={plot} height={plot} fill="#fafbfc" stroke="#e6e9ef" />
        <line x1={center} y1={pad} x2={center} y2={pad + plot} stroke="#c6ccd6" strokeWidth={1} />
        <line x1={pad} y1={center} x2={pad + plot} y2={center} stroke="#c6ccd6" strokeWidth={1} />
        {polylines.map((line, i) => (
          <path key={i} d={pathFor(line)} fill="none" stroke="#1f3556" strokeWidth={1.4} />
        ))}
        {hoverSvg && (
          <circle cx={hoverSvg.x} cy={hoverSvg.y} r={2.6} fill="#e1563b" stroke="#ffffff" strokeWidth={1} />
        )}
        <text x={pad + plot - 4} y={center - 4} fontSize={10} textAnchor="end" fill="#64748b">
          s
        </text>
        <text x={center + 4} y={pad + 10} fontSize={10} fill="#64748b">
          t
        </text>
      </svg>
      <div style={{ marginTop: 6, fontSize: 10, color: "#5c6775" }}>
        Hover: read (s,t). Click: move plane offset.
      </div>
    </div>
  );
};
