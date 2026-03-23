import type { Vec2 } from "../../../math";
import type { CurveBase } from "./Curve";

export interface Curve2D extends CurveBase {
  dimension: 2;
  eval: (t: number) => Vec2;
  derivative?: (t: number) => Vec2;
  secondDerivative?: (t: number) => Vec2;
  arcLength?: (a: number, b: number) => number;
}

