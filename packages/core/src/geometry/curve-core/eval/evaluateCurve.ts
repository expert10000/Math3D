import type { CurveEvalResult } from "../model";
import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { clampToDomain } from "../utils/reparameterization";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";

export type EvaluateCurveOptions = {
  clampToDomain?: boolean;
  includeDerivative?: boolean;
  includeSecondDerivative?: boolean;
};

export function evaluateCurve(curve: Curve2D, t: number, options?: EvaluateCurveOptions): CurveEvalResult;
export function evaluateCurve(curve: Curve3D, t: number, options?: EvaluateCurveOptions): CurveEvalResult;
export function evaluateCurve(
  curve: Curve2D | Curve3D,
  t: number,
  options: EvaluateCurveOptions = {}
): CurveEvalResult {
  const tc = options.clampToDomain === false ? t : clampToDomain(curve, t);
  const point = curve.eval(tc);
  const out: CurveEvalResult = { t: tc, point };
  if (options.includeDerivative) out.tangent = derivative(curve as never, tc);
  if (options.includeSecondDerivative) out.secondDerivative = secondDerivative(curve as never, tc);
  return out;
}

