import type { Vec2, Vec3 } from "../../../math";
import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { clampToDomain } from "../utils/reparameterization";
import { addPoint, scalePoint, subPoint } from "../utils/vector";

type SecondDerivativeOptions = {
  step?: number;
};

const numericSecondDerivative = (curve: Curve2D | Curve3D, t: number, step: number): Vec2 | Vec3 => {
  const t0 = clampToDomain(curve, t - step);
  const t1 = clampToDomain(curve, t);
  const t2 = clampToDomain(curve, t + step);
  const h = Math.max(1e-12, 0.5 * (t2 - t0));
  const p0 = curve.eval(t0);
  const p1 = curve.eval(t1);
  const p2 = curve.eval(t2);
  return scalePoint(addPoint(subPoint(p2, scalePoint(p1, 2)), p0), 1 / (h * h));
};

export function secondDerivative(curve: Curve2D, t: number, options?: SecondDerivativeOptions): Vec2;
export function secondDerivative(curve: Curve3D, t: number, options?: SecondDerivativeOptions): Vec3;
export function secondDerivative(
  curve: Curve2D | Curve3D,
  t: number,
  options: SecondDerivativeOptions = {}
): Vec2 | Vec3 {
  const tc = clampToDomain(curve, t);
  if (curve.secondDerivative) return curve.secondDerivative(tc);
  const span = Math.max(1e-9, curve.domain.tMax - curve.domain.tMin);
  const step = Math.max(1e-8, options.step ?? 2e-4 * span);
  return numericSecondDerivative(curve, tc, step);
}

