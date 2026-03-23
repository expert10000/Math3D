import type { AnyCurve } from "../model";
import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { derivative } from "./derivative";

export type ArcLengthOptions = {
  segments?: number;
};

const simpsonIntegrate = (f: (t: number) => number, a: number, b: number, segments: number): number => {
  const n = Math.max(2, segments + (segments % 2));
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i += 1) {
    const t = a + i * h;
    sum += f(t) * (i % 2 === 0 ? 2 : 4);
  }
  return (h / 3) * sum;
};

export const arcLength = (curve: AnyCurve, a?: number, b?: number, options: ArcLengthOptions = {}): number => {
  const a0 = a ?? curve.domain.tMin;
  const b0 = b ?? curve.domain.tMax;
  const lo = Math.max(curve.domain.tMin, Math.min(curve.domain.tMax, a0));
  const hi = Math.max(curve.domain.tMin, Math.min(curve.domain.tMax, b0));
  if (Math.abs(hi - lo) <= 1e-12) return 0;
  if (curve.arcLength) return curve.arcLength(lo, hi);
  const segments = Math.max(16, Math.floor(options.segments ?? 256));
  const speed = (t: number): number => {
    if (curve.dimension === 2) {
      const d = derivative(curve as Curve2D, t);
      return Math.hypot(d.x, d.y);
    }
    const d = derivative(curve as Curve3D, t);
    return Math.hypot(d.x, d.y, d.z);
  };
  return simpsonIntegrate(speed, lo, hi, segments);
};
