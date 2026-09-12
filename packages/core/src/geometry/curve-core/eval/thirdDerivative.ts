import type { Vec2, Vec3 } from "../../../math";
import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { clampToDomain } from "../utils/reparameterization";
import { scalePoint, subPoint } from "../utils/vector";
import { secondDerivative } from "./secondDerivative";

export type ThirdDerivativeOptions = { step?: number };

export function thirdDerivative(curve: Curve2D, t: number, options?: ThirdDerivativeOptions): Vec2;
export function thirdDerivative(curve: Curve3D, t: number, options?: ThirdDerivativeOptions): Vec3;
export function thirdDerivative(
  curve: Curve2D | Curve3D,
  t: number,
  options: ThirdDerivativeOptions = {}
): Vec2 | Vec3 {
  const tc = clampToDomain(curve, t);
  if (curve.thirdDerivative) return curve.thirdDerivative(tc);
  const span = Math.max(1e-9, curve.domain.tMax - curve.domain.tMin);
  const step = Math.max(1e-7, options.step ?? 8e-4 * span);
  const t0 = clampToDomain(curve, tc - step);
  const t1 = clampToDomain(curve, tc + step);
  const h = t1 - t0;
  if (Math.abs(h) <= 1e-12) return scalePoint(secondDerivative(curve as never, tc) as never, 0) as Vec2 | Vec3;
  return scalePoint(
    subPoint(secondDerivative(curve as never, t1) as never, secondDerivative(curve as never, t0) as never),
    1 / h
  ) as Vec2 | Vec3;
}
