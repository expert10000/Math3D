import type { Vec2, Vec3 } from "../../../math";

export type CurvePoint = Vec2 | Vec3;

export type CurveEvalResult<TPoint extends CurvePoint = CurvePoint> = {
  t: number;
  point: TPoint;
  tangent?: TPoint;
  secondDerivative?: TPoint;
};

