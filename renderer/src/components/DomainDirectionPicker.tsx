// src/components/DomainDirectionPicker.tsx
import { useMemo, useRef, useState } from "react";

type Props = {
  u: number; v: number; // probe uv in [0,1]
  du: number; dv: number; // direction
  size?: number;
  onChangeDir: (du: number, dv: number) => void;
};

export default function DomainDirectionPicker({
  u, v, du, dv, size = 160, onChangeDir,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const origin = useMemo(() => {
    const ox = u * size;
    const oy = (1 - v) * size;
    return { ox, oy };
  }, [u, v, size]);

  const tip = useMemo(() => {
    const len = Math.hypot(du, dv) || 1;
    const ndU = du / len;
    const ndV = dv / len;
    const L = 45; // px arrow length
    // dv positive means +v (up in math), but SVG y grows downward => subtract
    const tx = origin.ox + ndU * L;
    const ty = origin.oy - ndV * L;
    return { tx, ty };
  }, [origin, du, dv]);

  const setFromPointer = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;

    const dxPx = x - origin.ox;
    const dyPx = y - origin.oy;

    // convert px delta to uv-ish delta (just for direction)
    let ndu = dxPx / size;
    let ndv = -dyPx / size;
    const L = Math.hypot(ndu, ndv);
    if (L < 1e-6) return;
    ndu /= L;
    ndv /= L;
    onChangeDir(ndu, ndv);
  };

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      style={{ border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8 }}
      onPointerMove={(e) => dragging && setFromPointer(e.clientX, e.clientY)}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      {/* origin */}
      <circle cx={origin.ox} cy={origin.oy} r={4} />
      {/* arrow */}
      <line x1={origin.ox} y1={origin.oy} x2={tip.tx} y2={tip.ty} strokeWidth={2} />
      {/* draggable tip */}
      <circle
        cx={tip.tx}
        cy={tip.ty}
        r={7}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFromPointer(e.clientX, e.clientY);
        }}
      />
    </svg>
  );
}
