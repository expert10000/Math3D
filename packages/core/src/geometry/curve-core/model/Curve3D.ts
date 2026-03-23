import type { Vec3 } from "../../../math";
import type { CurveBase } from "./Curve";

export interface Curve3D extends CurveBase {
  dimension: 3;
  eval: (t: number) => Vec3;
  derivative?: (t: number) => Vec3;
  secondDerivative?: (t: number) => Vec3;
  arcLength?: (a: number, b: number) => number;
}

