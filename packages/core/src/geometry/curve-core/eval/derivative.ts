import type { Vec2, Vec3 } from "../../../math";
import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { clampToDomain } from "../utils/reparameterization";
import { scalePoint, subPoint } from "../utils/vector";

type DerivativeOptions = {
  step?: number;
};

const numericDerivative = (curve: Curve2D | Curve3D, t: number, step: number): Vec2 | Vec3 => {
  const t0 = clampToDomain(curve, t - step);
  const t1 = clampToDomain(curve, t + step);
  if (Math.abs(t1 - t0) <= 1e-12) {
    const p = curve.eval(t0);
    return scalePoint(p, 0);
  }
  const p0 = curve.eval(t0);
  const p1 = curve.eval(t1);
  return scalePoint(subPoint(p1, p0), 1 / (t1 - t0));
};

export function derivative(curve: Curve2D, t: number, options?: DerivativeOptions): Vec2;
export function derivative(curve: Curve3D, t: number, options?: DerivativeOptions): Vec3;
export function derivative(curve: Curve2D | Curve3D, t: number, options: DerivativeOptions = {}): Vec2 | Vec3 {
  const tc = clampToDomain(curve, t);
  if (curve.derivative) return curve.derivative(tc);
  const span = Math.max(1e-9, curve.domain.tMax - curve.domain.tMin);
  const step = Math.max(1e-9, options.step ?? 1e-4 * span);
  return numericDerivative(curve, tc, step);
}

